import { checkCron, err, json } from "@/lib/api";
import { sql, type UserRow } from "@/lib/db";
import { fireDue, pollPendingPayments, recomputeOpenAt } from "@/lib/queue";
import { syncMember } from "@/lib/users";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * งานประจำ (แนะนำทุก 1–5 นาที):
 * 1. เช็ครายการรอจ่าย QR → จ่ายแล้ว/หมดอายุ
 * 2. catch-up: ยิงรายการที่ถึงเวลาแล้วแต่ยังค้าง (เผื่อ /fire พลาด)
 * 3. sync maxBookdate ของผู้ใช้ที่มีคิว (ไม่เกิน 1 ครั้ง/ชม./คน) เพื่อเรียนรู้หน้าต่างการจอง
 */
export async function GET(req: Request) {
  if (!checkCron(req)) return err("unauthorized", 401);
  const payments = await pollPendingPayments();
  const fire = await fireDue("tick", 20_000);

  const users = await sql<UserRow[]>`
    select u.* from users u
    where u.cookies_enc is not null
      and (u.last_synced_at is null or u.last_synced_at < now() - interval '1 hour')
      and exists (select 1 from queue_items q where q.user_id = u.id and q.status = 'queued')
    limit 20`;
  let synced = 0;
  for (const u of users) {
    try {
      const before = u.window_days;
      const info = await syncMember(u);
      if (info) {
        synced++;
        if (before !== u.window_days) await recomputeOpenAt(u);
      }
    } catch (e) {
      console.error("sync failed", u.mobile, e);
    }
  }
  return json({ payments, fire, synced });
}
