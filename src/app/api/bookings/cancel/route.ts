import { z } from "zod";
import { err, json, withUser } from "@/lib/api";
import { sql } from "@/lib/db";
import { syncMember, upstreamFor } from "@/lib/users";

export const dynamic = "force-dynamic";

const Body = z.object({
  bookingRef: z.string().min(1),
  bookingDetailId: z.union([z.string(), z.number()]),
  remark: z.string().trim().min(1, "ต้องระบุเหตุผลการยกเลิก"),
});

/** ยกเลิกรายการที่จองสำเร็จแล้ว (ต้นทางคืนเงินเข้า wallet เมื่อยกเลิกล่วงหน้า ≥ 24 ชม.) */
export const POST = withUser(async (user, req: Request) => {
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return err(p.error.issues[0].message);
  // ตรวจสิทธิ์จากข้อมูลจริงของต้นทางก่อน
  const up = upstreamFor(user);
  const hist = await up.history(user.mobile);
  const row = hist.find((h) => h.bookingRef === p.data.bookingRef && String(h.bookingDetailId) === String(p.data.bookingDetailId));
  if (!row) return err("ไม่พบรายการนี้ในประวัติ", 404);
  if (row.canCancel !== "1" || row.transactionStatus !== "SUCCESS") return err("รายการนี้ยกเลิกไม่ได้แล้ว (ต้นทางไม่อนุญาต)");
  const start = new Date(`${row.bookingDate.slice(0, 10)}T${row.timeName}:00+07:00`).getTime();
  if (start - Date.now() < 24 * 3600_000) return err("ต้องยกเลิกล่วงหน้าอย่างน้อย 24 ชั่วโมง");

  const r = await up.cancelBooking(user.mobile, p.data.bookingRef, p.data.bookingDetailId, p.data.remark);
  if (r.statusCode !== "00") return err(r.message || "ยกเลิกไม่สำเร็จ");
  await sql`update queue_items set status = 'cancelled', updated_at = now()
            where user_id = ${user.id} and booking_ref = ${p.data.bookingRef} and stadiumtime_id = ${String(row.stadiumTimeId)} and booking_date = ${row.bookingDate.slice(0, 10)}`;
  await syncMember(user);
  return json({ ok: true });
});
