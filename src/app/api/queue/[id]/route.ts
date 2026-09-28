import { err, json, withUser } from "@/lib/api";
import { getQueueItem, removeQueueItem } from "@/lib/queue";
import { sql, type QueueItemRow } from "@/lib/db";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** รายละเอียดรายการ (รวม QR ถ้ามี) + รายการอื่นที่จ่ายด้วย QR เดียวกัน */
export const GET = withUser(async (user, _req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const item = await getQueueItem(user.id, Number(id));
  if (!item) return err("ไม่พบรายการ", 404);
  const siblings = item.payment_ref
    ? await sql<QueueItemRow[]>`select * from queue_items where user_id = ${user.id} and payment_ref = ${item.payment_ref} order by booking_date, time_name`
    : [item];
  return json({
    item,
    group: siblings.map(({ qr_png, ...r }) => ({ ...r, hasQr: !!qr_png })),
    total: siblings.reduce((s, x) => s + Number(x.amount), 0),
  });
});

export const DELETE = withUser(async (user, _req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  await removeQueueItem(user.id, Number(id));
  return json({ ok: true });
});
