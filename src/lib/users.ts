import { sql, type UserRow } from "./db";
import { decrypt, encrypt } from "./crypto";
import { Upstream, csAuthExpiry, type CookieJar, type MemberInfo } from "./upstream";
import { diffDaysYmd, todayBkk } from "./time";

export async function getUser(id: number): Promise<UserRow | null> {
  const rows = await sql<UserRow[]>`select * from users where id = ${id}`;
  return rows[0] ?? null;
}

export async function getUserByMobile(mobile: string): Promise<UserRow | null> {
  const rows = await sql<UserRow[]>`select * from users where mobile = ${mobile}`;
  return rows[0] ?? null;
}

export function jarOf(user: UserRow): CookieJar {
  if (!user.cookies_enc) return {};
  try {
    return JSON.parse(decrypt(user.cookies_enc)) as CookieJar;
  } catch {
    return {};
  }
}

export function upstreamFor(user: UserRow): Upstream {
  return new Upstream(jarOf(user));
}

export function hasUpstreamSession(user: UserRow): boolean {
  const jar = jarOf(user);
  if (!jar.cs_auth) return false;
  const exp = csAuthExpiry(jar);
  return !exp || exp.getTime() > Date.now();
}

/** บันทึก cookie ของต้นทางหลัง verifyOTP สำเร็จ */
export async function upsertUserSession(mobile: string, jar: CookieJar, info: MemberInfo | null) {
  const enc = encrypt(JSON.stringify(jar));
  const exp = csAuthExpiry(jar);
  const rows = await sql<UserRow[]>`
    insert into users (mobile, member_id, name, nick_name, cookies_enc, cookie_expires_at)
    values (${mobile}, ${info?.memberId ?? null}, ${info ? `${info.name} ${info.surname}`.trim() : null},
            ${info?.nickName ?? null}, ${enc}, ${exp})
    on conflict (mobile) do update set
      member_id = coalesce(excluded.member_id, users.member_id),
      name = coalesce(excluded.name, users.name),
      nick_name = coalesce(excluded.nick_name, users.nick_name),
      cookies_enc = excluded.cookies_enc,
      cookie_expires_at = excluded.cookie_expires_at
    returning *`;
  const user = rows[0];
  if (info) await applyMemberInfo(user, info);
  return user;
}

/**
 * อัปเดต wallet / maxBookdate / หน้าต่างการจอง จาก getMemberInfo
 * และเก็บ observation ไว้ให้ระบบ "เรียนรู้" ว่าหน้าต่างของแต่ละคนกว้างกี่วัน และเลื่อนตอนไหน
 */
export async function applyMemberInfo(user: UserRow, info: MemberInfo) {
  const today = todayBkk();
  const windowDays = info.maxBookdate ? diffDaysYmd(info.maxBookdate, today) : null;
  await sql`
    update users set
      member_id = ${info.memberId},
      name = ${`${info.name} ${info.surname}`.trim()},
      nick_name = ${info.nickName},
      wallet_balance = ${Number(info.walletBalance || 0)},
      max_bookdate = ${info.maxBookdate || null},
      window_days = ${windowDays},
      last_synced_at = now()
    where id = ${user.id}`;
  if (info.maxBookdate && windowDays !== null) {
    // เก็บเฉพาะเมื่อค่าเปลี่ยนจากครั้งล่าสุด (ไม่ให้ตารางบวม)
    const last = await sql<{ max_bookdate: string; window_days: number }[]>`
      select max_bookdate, window_days from window_observations
      where user_id = ${user.id} order by observed_at desc limit 1`;
    if (!last[0] || last[0].max_bookdate !== info.maxBookdate || last[0].window_days !== windowDays) {
      await sql`insert into window_observations (user_id, today_bkk, max_bookdate, window_days)
                values (${user.id}, ${today}, ${info.maxBookdate}, ${windowDays})`;
    }
  }
  user.max_bookdate = info.maxBookdate || null;
  user.window_days = windowDays;
  user.wallet_balance = String(Number(info.walletBalance || 0));
}

/** ดึงข้อมูลสมาชิกสดจากต้นทางแล้วบันทึก (คืน null ถ้า session ต้นทางหลุด) */
export async function syncMember(user: UserRow): Promise<MemberInfo | null> {
  const up = upstreamFor(user);
  const info = await up.memberInfo(user.mobile);
  if (!info || !info.memberId) return null;
  await applyMemberInfo(user, info);
  return info;
}

/** ค่าประมาณ "หน้าต่างกี่วัน" ของผู้ใช้ — ถ้ายังไม่เคยเห็น ใช้ 14 (ค่าที่พบในบัญชีทั่วไป) */
export function windowDaysOf(user: UserRow): number {
  return user.window_days ?? 14;
}

export async function markUpstreamLoggedOut(userId: number) {
  await sql`update users set cookies_enc = null, cookie_expires_at = null where id = ${userId}`;
}
