import { z } from "zod";
import { err, json, withUser } from "@/lib/api";
import { addToQueue, listQueue, maxSelectableDate, fireNowForUser } from "@/lib/queue";
import { todayBkk } from "@/lib/time";

export const dynamic = "force-dynamic";

export const GET = withUser(async (user) => {
  const items = await listQueue(user.id);
  return json({ items: items.map(({ qr_png, ...rest }) => ({ ...rest, hasQr: !!qr_png })) });
});

const Body = z.object({
  items: z
    .array(
      z.object({
        locId: z.string(),
        locName: z.string(),
        stadiumId: z.string(),
        stadiumName: z.string(),
        stadiumtimeId: z.string(),
        timeName: z.string(),
        bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        amount: z.string(),
      }),
    )
    .min(1)
    .max(20),
  /** ถ้า true และรายการอยู่ในหน้าต่างแล้ว จะยิงจองทันที */
  bookNow: z.boolean().optional(),
});

/** เพิ่มเข้าตะกร้า (คิว) — รายการที่หน้าต่างเปิดอยู่แล้วจะจองทันทีถ้า bookNow */
export const POST = withUser(async (user, req: Request) => {
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return err(p.error.issues[0].message);
  const today = todayBkk();
  const maxSel = maxSelectableDate();
  for (const it of p.data.items) {
    if (it.bookingDate < today) return err("เลือกวันที่ผ่านมาแล้วไม่ได้");
    if (it.bookingDate > maxSel) return err("เลือกล่วงหน้าไกลเกินไป");
  }
  const added = await addToQueue(user, p.data.items);
  let fired = null;
  if (p.data.bookNow) {
    const openIds = added.filter((a) => a.status === "queued" && a.open_at && a.open_at.getTime() <= Date.now()).map((a) => a.id);
    if (openIds.length) fired = await fireNowForUser(user, openIds);
  }
  const items = await listQueue(user.id);
  return json({ added: added.length, fired, items: items.map(({ qr_png, ...rest }) => ({ ...rest, hasQr: !!qr_png })) });
});
