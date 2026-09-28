import { err, json, withUser } from "@/lib/api";
import { sql } from "@/lib/db";
import { getQueueItem } from "@/lib/queue";
import { syncMember, upstreamFor } from "@/lib/users";

export const dynamic = "force-dynamic";

/** ชำระรายการรอชำระแบบ WALLET (หลังเติมเงิน) ด้วย confirmWalletBooking */
export const POST = withUser(async (user, _req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const item = await getQueueItem(user.id, Number(id));
  if (!item || !item.booking_ref) return err("ไม่พบรายการ", 404);
  if (item.status !== "pending_payment" || item.payment_type !== "WALLET")
    return err("รายการนี้ไม่ใช่รายการรอชำระด้วย Wallet");
  const up = upstreamFor(user);
  const r = await up.confirmWalletBooking(user.mobile, item.booking_ref);
  if (r.statusCode === "00") {
    await sql`update queue_items set status = 'booked_paid', updated_at = now() where booking_ref = ${item.booking_ref}`;
    await syncMember(user);
    return json({ ok: true });
  }
  if (r.statusCode === "10") return err("ยอด Wallet ยังไม่พอ กรุณาเติมเงินก่อน", 400, { code: "insufficient" });
  return err(r.message || "ชำระไม่สำเร็จ");
});
