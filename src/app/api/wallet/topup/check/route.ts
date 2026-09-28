import { z } from "zod";
import { err, json, withUser } from "@/lib/api";
import { syncMember, upstreamFor } from "@/lib/users";

export const dynamic = "force-dynamic";

export const POST = withUser(async (user, req: Request) => {
  const p = z.object({ reference: z.string() }).safeParse(await req.json().catch(() => ({})));
  if (!p.success) return err("bad request");
  const up = upstreamFor(user);
  const c = await up.checkQRPayment(p.data.reference);
  const paid = c?.resultCode === "00" && c.txn?.status === "S";
  if (paid) {
    const info = await syncMember(user);
    return json({ paid: true, balance: Number(info?.walletBalance ?? 0) });
  }
  return json({ paid: false });
});
