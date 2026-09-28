import { sql, type QueueItemRow, type UserRow } from "./db";
import { env } from "./env";
import { pushToUser } from "./push";
import { addDaysYmd, fmtThaiDate, openAtFor, sleep, todayBkk } from "./time";
import { UnauthorizedError, type BookingTxn } from "./upstream";
import { getUser, syncMember, upstreamFor, windowDaysOf } from "./users";

export const QR_TTL_MS = 15 * 60 * 1000;

// ---------------- queries ----------------
export async function listQueue(userId: number): Promise<QueueItemRow[]> {
  return sql<QueueItemRow[]>`
    select * from queue_items where user_id = ${userId}
      and status not in ('cancelled')
    order by booking_date, time_name`;
}

export async function getQueueItem(userId: number, id: number): Promise<QueueItemRow | null> {
  const r = await sql<QueueItemRow[]>`select * from queue_items where id = ${id} and user_id = ${userId}`;
  return r[0] ?? null;
}

export type NewQueueItem = {
  locId: string;
  locName: string;
  stadiumId: string;
  stadiumName: string;
  stadiumtimeId: string;
  timeName: string;
  bookingDate: string;
  amount: string;
};

/** เพิ่มรายการเข้าตะกร้า/คิว คืนรายการที่เพิ่ม (ข้ามที่ซ้ำ) */
export async function addToQueue(user: UserRow, items: NewQueueItem[]) {
  const wd = windowDaysOf(user);
  const out: QueueItemRow[] = [];
  for (const it of items) {
    const openNow = user.max_bookdate ? it.bookingDate <= user.max_bookdate : false;
    const openAt = openNow ? new Date() : openAtFor(it.bookingDate, wd);
    const rows = await sql<QueueItemRow[]>`
      insert into queue_items (user_id, loc_id, loc_name, stadium_id, stadium_name, stadiumtime_id,
                               time_name, booking_date, amount, status, open_at)
      values (${user.id}, ${it.locId}, ${it.locName}, ${it.stadiumId}, ${it.stadiumName}, ${it.stadiumtimeId},
              ${it.timeName}, ${it.bookingDate}, ${Number(it.amount)}, 'queued', ${openAt})
      on conflict (user_id, booking_date, stadiumtime_id) do update set
        status = case when queue_items.status in ('cancelled','failed','expired') then 'queued' else queue_items.status end,
        open_at = excluded.open_at, attempts = 0, last_error = null,
        booking_ref = null, payment_ref = null, qr_png = null, qr_expires_at = null, updated_at = now()
      returning *`;
    out.push(rows[0]);
  }
  return out;
}

export async function removeQueueItem(userId: number, id: number) {
  await sql`update queue_items set status = 'cancelled', updated_at = now()
            where id = ${id} and user_id = ${userId} and status in ('queued','failed','expired','pending_payment')`;
}

/** คำนวณ open_at ใหม่ทั้งคิวของผู้ใช้ เมื่อเราเรียนรู้หน้าต่างใหม่ */
export async function recomputeOpenAt(user: UserRow) {
  const wd = windowDaysOf(user);
  const items = await sql<QueueItemRow[]>`select * from queue_items where user_id = ${user.id} and status = 'queued'`;
  for (const it of items) {
    const openNow = user.max_bookdate ? it.booking_date <= user.max_bookdate : false;
    const openAt = openNow ? new Date() : openAtFor(it.booking_date, wd);
    await sql`update queue_items set open_at = ${openAt}, updated_at = now() where id = ${it.id}`;
  }
}

// ---------------- firing ----------------
type FireOutcome = {
  ok: number;
  pendingQr: number;
  pendingWallet: number;
  failed: number;
  notOpen: number;
};

async function setItem(id: number, patch: Record<string, unknown>) {
  await sql`update queue_items set ${sql(patch)}, updated_at = now() where id = ${id}`;
}

/**
 * ยิงจองรายการของผู้ใช้ 1 คน (รายการที่ส่งมาต้องเป็น status queued)
 * - จัดกลุ่มตามวัน → 1 call ต่อวัน (ได้ QR เดียวจ่ายทีเดียว) ถ้ากลุ่มล้มเหลวจะลองทีละรายการ
 * - Wallet ก่อนถ้ายอดพอ ไม่พอค่อย QR
 * - statusCode 99 = ต้นทางไม่ให้ทำรายการ → เช็คว่า "ยังไม่เปิดหน้าต่าง" หรือ "ช่องถูกจองแล้ว"
 */
export async function fireUserItems(user: UserRow, items: QueueItemRow[]): Promise<FireOutcome> {
  const out: FireOutcome = { ok: 0, pendingQr: 0, pendingWallet: 0, failed: 0, notOpen: 0 };
  if (!items.length) return out;
  const up = upstreamFor(user);

  let info;
  try {
    info = await syncMember(user);
  } catch (e) {
    if (e instanceof UnauthorizedError) info = null;
    else throw e;
  }
  if (!info) {
    for (const it of items) await setItem(it.id, { status: "failed", last_error: "session ต้นทางหมดอายุ ต้อง login ใหม่" });
    out.failed += items.length;
    await pushToUser(user.id, {
      title: "จองไม่สำเร็จ — ต้อง login ใหม่",
      body: "session ของระบบจองต้นทางหมดอายุ กรุณาเข้าสู่ระบบด้วย OTP อีกครั้ง",
      url: "/login",
    });
    return out;
  }
  let wallet = Number(info.walletBalance || 0);

  // จัดกลุ่มตามวัน
  const byDate = new Map<string, QueueItemRow[]>();
  for (const it of items) byDate.set(it.booking_date, [...(byDate.get(it.booking_date) ?? []), it]);

  /**
   * รายการที่ยังไม่เปิดหน้าต่าง:
   * - ถ้าเป็นวันถัดจาก maxBookdate พอดี (คือ "ควรจะเปิดตอนเที่ยงคืนนี้") → คงไว้ให้ loop นอก retry
   * - ถ้าไกลกว่านั้น แปลว่าเราประมาณหน้าต่างผิด → คำนวณ open_at ใหม่จากค่าจริงที่เพิ่งเห็น
   */
  const markNotOpen = async (x: QueueItemRow) => {
    out.notOpen++;
    if (user.max_bookdate && x.booking_date > addDaysYmd(user.max_bookdate, 1)) {
      const openAt = openAtFor(x.booking_date, windowDaysOf(user));
      await setItem(x.id, { status: "queued", open_at: openAt, last_error: `หน้าต่างจริงของบัญชีนี้ = ${windowDaysOf(user)} วัน เลื่อนเวลาจองใหม่` });
    }
  };

  for (const [date, group] of byDate) {
    // ยังไม่เปิดหน้าต่างของคนนี้ → ข้าม (ให้ loop ข้างนอก retry)
    if (user.max_bookdate && date > user.max_bookdate) {
      for (const x of group) await markNotOpen(x);
      continue;
    }
    const tryGroup = async (g: QueueItemRow[]): Promise<boolean> => {
      const total = g.reduce((s, x) => s + Number(x.amount), 0);
      const txns: BookingTxn[] = g.map((x) => ({
        transactionCode: "COURT",
        coachMemberId: 0,
        stadiumtimeId: String(x.stadiumtime_id),
        bookingDate: x.booking_date,
        amount: Number(x.amount).toFixed(2),
      }));
      const ids = g.map((x) => x.id);
      await sql`update queue_items set status = 'firing', attempts = attempts + 1, fired_at = now(), updated_at = now()
                where id in ${sql(ids)}`;

      const useWallet = wallet >= total && total > 0;
      const res = await up.book(user.mobile, useWallet ? "WALLET" : "QR", txns);

      if (res.statusCode === "00") {
        if (useWallet) {
          wallet -= total;
          for (const x of g)
            await setItem(x.id, { status: "booked_paid", booking_ref: res.bookingRef, payment_ref: res.paymentRef, payment_type: "WALLET", last_error: null });
          out.ok += g.length;
        } else {
          let png: string | null = null;
          try {
            png = await up.genQRpayment(res.paymentRef!, res.bookingRef!, total.toFixed(2));
          } catch (e) {
            png = null;
            console.error("genQR failed", e);
          }
          const exp = new Date(Date.now() + QR_TTL_MS);
          for (const x of g)
            await setItem(x.id, { status: "pending_payment", booking_ref: res.bookingRef, payment_ref: res.paymentRef, payment_type: "QR", qr_png: png, qr_expires_at: exp, last_error: null });
          out.pendingQr += g.length;
        }
        return true;
      }
      if (res.statusCode === "10") {
        // wallet ไม่พอ (ไม่ควรเกิดเพราะเช็คก่อน แต่กันไว้) — ต้นทางสร้างรายการรอชำระแบบ WALLET ไว้แล้ว
        for (const x of g)
          await setItem(x.id, { status: "pending_payment", booking_ref: res.bookingRef, payment_ref: res.paymentRef, payment_type: "WALLET", last_error: res.message });
        out.pendingWallet += g.length;
        return true;
      }
      // 99 หรืออื่น ๆ
      for (const x of g) await setItem(x.id, { status: "queued", last_error: `${res.statusCode} ${res.message}` });
      return false;
    };

    let done = await tryGroup(group);
    if (!done && group.length > 1) {
      // ลองทีละรายการ (เผื่อบางช่องถูกแย่งไปแล้ว)
      done = true;
      for (const x of group) {
        const ok = await tryGroup([x]);
        if (!ok) done = false;
      }
    }
    if (!done) {
      // วิเคราะห์สาเหตุ: ช่องถูกจองไปแล้ว หรือหน้าต่างยังไม่เปิด
      let avail: Awaited<ReturnType<typeof up.available>> | null = null;
      try {
        avail = await up.available(date, group[0].stadium_id, group[0].loc_id);
      } catch {
        avail = null;
      }
      for (const x of group) {
        const fresh = await sql<QueueItemRow[]>`select * from queue_items where id = ${x.id}`;
        if (fresh[0]?.status !== "queued") continue; // สำเร็จไปแล้วตอนลองทีละรายการ
        const slot = avail?.find((s) => String(s.stadiumtimeId) === String(x.stadiumtime_id));
        if (slot && slot.reservestatus === "1") {
          await setItem(x.id, { status: "failed", last_error: "ช่องนี้ถูกจองไปแล้ว (มีคนได้ก่อน)" });
          out.failed++;
        } else {
          await markNotOpen(x); // ให้ loop นอก retry ต่อ ถ้าหมดเวลาจะถูก mark failed
        }
      }
    }
  }
  return out;
}

/**
 * ยิงทุกรายการที่ถึงเวลา (open_at <= now) ของทุกคน
 * มี retry loop สำหรับกรณีต้นทางเลื่อนหน้าต่างช้ากว่าเที่ยงคืนนิดหน่อย
 */
export async function fireDue(kind: "midnight" | "now" | "tick", deadlineMs: number) {
  const run = await sql<{ id: number }[]>`insert into fire_runs (kind, target_at) values (${kind}, now()) returning id`;
  const runId = run[0].id;
  const t0 = Date.now();
  const totals = { total: 0, ok: 0 };
  const touchedUsers = new Set<number>();

  let round = 0;
  while (true) {
    round++;
    const due = await sql<QueueItemRow[]>`
      select * from queue_items where status = 'queued' and open_at <= now()
      order by user_id, booking_date, time_name`;
    if (!due.length) break;
    const byUser = new Map<number, QueueItemRow[]>();
    for (const it of due) byUser.set(it.user_id, [...(byUser.get(it.user_id) ?? []), it]);
    if (round === 1) totals.total = due.length;

    let anyNotOpen = false;
    await Promise.all(
      [...byUser].map(async ([uid, items]) => {
        const user = await getUser(uid);
        if (!user) return;
        touchedUsers.add(uid);
        try {
          const o = await fireUserItems(user, items);
          totals.ok += o.ok + o.pendingQr + o.pendingWallet;
          if (o.notOpen > 0) anyNotOpen = true;
        } catch (e) {
          console.error("fire user failed", uid, e);
          anyNotOpen = true;
        }
      }),
    );
    if (!anyNotOpen) break;
    if (Date.now() - t0 > deadlineMs) {
      // หมดเวลา: รายการที่ยังค้าง queued และ open_at ผ่านไปแล้วนาน → mark failed ให้ user รู้
      await sql`update queue_items set status = 'failed',
                  last_error = coalesce(last_error, '') || ' | หมดเวลารอ (หน้าต่างต้นทางยังไม่เปิดหรือทำรายการไม่ได้)',
                  updated_at = now()
                where status = 'queued' and open_at <= now() - interval '10 minutes'`;
      break;
    }
    await sleep(env.FIRE_RETRY_INTERVAL_MS);
  }

  // แจ้งเตือนสรุปต่อคน
  for (const uid of touchedUsers) await notifyUserSummary(uid);

  await sql`update fire_runs set finished_at = now(), items_total = ${totals.total}, items_ok = ${totals.ok},
            note = ${`rounds=${round}`} where id = ${runId}`;
  return { runId, ...totals, rounds: round, ms: Date.now() - t0 };
}

async function notifyUserSummary(userId: number) {
  const recent = await sql<QueueItemRow[]>`
    select * from queue_items where user_id = ${userId} and fired_at > now() - interval '15 minutes'
      and status in ('booked_paid','pending_payment','failed') order by booking_date, time_name`;
  if (!recent.length) return;
  const paid = recent.filter((x) => x.status === "booked_paid");
  const qr = recent.filter((x) => x.status === "pending_payment" && x.payment_type === "QR");
  const wal = recent.filter((x) => x.status === "pending_payment" && x.payment_type === "WALLET");
  const failed = recent.filter((x) => x.status === "failed");
  const line = (x: QueueItemRow) => `${fmtThaiDate(x.booking_date)} ${x.time_name} ${x.stadium_name}`;

  if (qr.length) {
    await pushToUser(userId, {
      title: `จองได้แล้ว ${qr.length} ช่อง — สแกนจ่ายภายใน 15 นาที!`,
      body: qr.map(line).join(", "),
      url: `/pay/${qr[0].id}`,
      tag: "pay",
    });
  }
  if (wal.length) {
    await pushToUser(userId, {
      title: `จองได้ ${wal.length} ช่อง แต่ Wallet ไม่พอ`,
      body: "เติมเงินแล้วกดชำระด้วย Wallet ในหน้ารายการจอง",
      url: "/wallet",
      tag: "pay",
    });
  }
  if (paid.length) {
    await pushToUser(userId, {
      title: `จองสำเร็จ ${paid.length} ช่อง (ตัด Wallet แล้ว)`,
      body: paid.map(line).join(", "),
      url: "/bookings",
      tag: "ok",
    });
  }
  if (failed.length) {
    await pushToUser(userId, {
      title: `จองไม่สำเร็จ ${failed.length} ช่อง`,
      body: failed.map((x) => `${line(x)}: ${x.last_error ?? ""}`).join("; "),
      url: "/cart",
      tag: "fail",
    });
  }
}

/** เช็ครายการรอจ่าย QR: จ่ายแล้ว → booked_paid, หมดเวลา → expired */
export async function pollPendingPayments() {
  const rows = await sql<QueueItemRow[]>`
    select * from queue_items where status = 'pending_payment' and payment_type = 'QR' and payment_ref is not null`;
  const byUser = new Map<number, QueueItemRow[]>();
  for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);
  let paid = 0, expired = 0;
  for (const [uid, items] of byUser) {
    const user = await getUser(uid);
    if (!user) continue;
    const up = upstreamFor(user);
    const refs = new Map<string, QueueItemRow[]>();
    for (const it of items) refs.set(it.payment_ref!, [...(refs.get(it.payment_ref!) ?? []), it]);
    for (const [ref, its] of refs) {
      let isPaid = false;
      try {
        const c = await up.checkQRPayment(ref);
        isPaid = c?.resultCode === "00" && c.txn?.status === "S";
      } catch {
        isPaid = false;
      }
      if (isPaid) {
        await sql`update queue_items set status = 'booked_paid', qr_png = null, updated_at = now() where payment_ref = ${ref}`;
        paid += its.length;
        await pushToUser(uid, { title: "ชำระเงินสำเร็จ", body: `จองสำเร็จ ${its.length} ช่อง`, url: "/bookings", tag: "ok" });
      } else if (its[0].qr_expires_at && its[0].qr_expires_at.getTime() < Date.now() - 60_000) {
        await sql`update queue_items set status = 'expired', qr_png = null, last_error = 'ไม่ได้ชำระภายใน 15 นาที รายการหมดอายุ', updated_at = now() where payment_ref = ${ref}`;
        expired += its.length;
        await pushToUser(uid, { title: "รายการหมดอายุ", body: `ไม่ได้สแกนจ่ายทัน ${its.length} ช่อง (จองใหม่ได้ถ้ายังว่าง)`, url: "/cart", tag: "fail" });
      }
    }
  }
  return { paid, expired };
}

/** ยิงจองทันทีสำหรับรายการของผู้ใช้ที่หน้าต่างเปิดอยู่แล้ว */
export async function fireNowForUser(user: UserRow, ids?: number[]) {
  const items = ids?.length
    ? await sql<QueueItemRow[]>`select * from queue_items where user_id = ${user.id} and status = 'queued' and id in ${sql(ids)}`
    : await sql<QueueItemRow[]>`select * from queue_items where user_id = ${user.id} and status = 'queued' and open_at <= now()`;
  const o = await fireUserItems(user, items);
  await notifyUserSummary(user.id);
  return o;
}

/** วันสุดท้ายที่ให้เลือกในตะกร้า */
export function maxSelectableDate(): string {
  return addDaysYmd(todayBkk(), env.MAX_LOOKAHEAD_DAYS);
}
