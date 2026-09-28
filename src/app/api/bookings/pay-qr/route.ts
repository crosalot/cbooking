import { z } from "zod";
import { err, json, withUser } from "@/lib/api";
import { upstreamFor } from "@/lib/users";

export const dynamic = "force-dynamic";

const Body = z.object({ bookingRef: z.string(), paymentRef: z.string(), amount: z.union([z.string(), z.number()]) });

/** ขอ QR ใหม่สำหรับรายการรอชำระ (WAITING/QR) ที่ต้นทาง + เช็คสถานะ */
export const POST = withUser(async (user, req: Request) => {
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return err("bad request");
  const up = upstreamFor(user);
  const amount = Number(p.data.amount).toFixed(2);
  const check = await up.checkQRPayment(p.data.paymentRef).catch(() => null);
  if (check?.resultCode === "00" && check.txn?.status === "S") return json({ paid: true });
  const png = await up.genQRpayment(p.data.paymentRef, p.data.bookingRef, amount);
  return json({ paid: false, qrPng: png, amount });
});
