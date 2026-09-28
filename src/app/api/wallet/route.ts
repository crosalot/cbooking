import { json, withUser } from "@/lib/api";
import { syncMember, upstreamFor } from "@/lib/users";

export const dynamic = "force-dynamic";

/** ยอด wallet (สด) + ประวัติการเติม */
export const GET = withUser(async (user) => {
  const info = await syncMember(user);
  const up = upstreamFor(user);
  const history = await up.walletHistory(user.mobile).catch(() => []);
  return json({ balance: Number(info?.walletBalance ?? user.wallet_balance ?? 0), history: history ?? [] });
});
