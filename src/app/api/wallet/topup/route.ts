import { z } from "zod";
import { err, json, withUser } from "@/lib/api";
import { upstreamFor } from "@/lib/users";

export const dynamic = "force-dynamic";

/** เติมเงิน wallet ด้วย QR (ขั้นต่ำ 100 บาท ตามกฎต้นทาง) → คืน reference + QR PNG (จ่ายใน 15 นาที) */
export const POST = withUser(async (user, req: Request) => {
  const p = z.object({ amount: z.number().min(100).max(100000) }).safeParse(await req.json().catch(() => ({})));
  if (!p.success) return err("ยอดเติมขั้นต่ำ 100 บาท");
  const amount = p.data.amount.toFixed(2);
  const up = upstreamFor(user);
  const r = await up.walletTopup(user.mobile, amount);
  if (r.statusCode !== "00" || !r.topupReference) return err(r.message || "ทำรายการเติมเงินไม่สำเร็จ");
  const png = await up.genQRtopup(r.topupReference, amount);
  return json({ reference: r.topupReference, amount, qrPng: png, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() });
});
