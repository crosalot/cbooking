import { err, json, withUser } from "@/lib/api";
import { sql } from "@/lib/db";
import { getQueueItem } from "@/lib/queue";
import { upstreamFor } from "@/lib/users";

export const dynamic = "force-dynamic";

/** เช็คสถานะการจ่าย QR ของรายการ (client poll ทุก ~10 วิ ตอนเปิดหน้า QR) */
export const POST = withUser(async (user, _req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const item = await getQueueItem(user.id, Number(id));
  if (!item) return err("ไม่พบรายการ", 404);
  if (item.status !== "pending_payment" || !item.payment_ref) return json({ status: item.status });
  const up = upstreamFor(user);
  const c = await up.checkQRPayment(item.payment_ref);
  const paid = c?.resultCode === "00" && c.txn?.status === "S";
  if (paid) {
    await sql`update queue_items set status = 'booked_paid', qr_png = null, updated_at = now() where payment_ref = ${item.payment_ref}`;
    return json({ status: "booked_paid" });
  }
  if (item.qr_expires_at && item.qr_expires_at.getTime() < Date.now() - 60_000) {
    await sql`update queue_items set status = 'expired', qr_png = null, last_error = 'ไม่ได้ชำระภายใน 15 นาที', updated_at = now() where payment_ref = ${item.payment_ref}`;
    return json({ status: "expired" });
  }
  return json({ status: "pending_payment" });
});
