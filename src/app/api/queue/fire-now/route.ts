import { z } from "zod";
import { err, json, withUser } from "@/lib/api";
import { fireNowForUser, listQueue } from "@/lib/queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** ยิงจองทันทีสำหรับรายการในตะกร้าที่หน้าต่างเปิดแล้ว (หรือระบุ ids) */
export const POST = withUser(async (user, req: Request) => {
  const p = z.object({ ids: z.array(z.number()).optional() }).safeParse(await req.json().catch(() => ({})));
  if (!p.success) return err("bad request");
  const outcome = await fireNowForUser(user, p.data.ids);
  const items = await listQueue(user.id);
  return json({ outcome, items: items.map(({ qr_png, ...r }) => ({ ...r, hasQr: !!qr_png })) });
});
