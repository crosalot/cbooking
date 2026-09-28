import { json, withUser } from "@/lib/api";
import { sql } from "@/lib/db";
import { recomputeOpenAt } from "@/lib/queue";
import { todayBkk } from "@/lib/time";
import { syncMember, windowDaysOf } from "@/lib/users";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** ข้อมูลผู้ใช้ + wallet + หน้าต่างการจอง (sync กับต้นทางถ้าเก่ากว่า 60 วิ หรือ ?fresh=1) */
export const GET = withUser(async (user, req: Request) => {
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  const stale = !user.last_synced_at || Date.now() - new Date(user.last_synced_at).getTime() > 60_000;
  if (fresh || stale) {
    const before = user.window_days;
    await syncMember(user);
    if (before !== user.window_days) await recomputeOpenAt(user);
  }
  const obs = await sql<{ observed_at: Date; today_bkk: string; max_bookdate: string; window_days: number }[]>`
    select observed_at, today_bkk, max_bookdate, window_days from window_observations
    where user_id = ${user.id} order by observed_at desc limit 10`;
  const pushCount = await sql<{ n: number }[]>`select count(*)::int as n from push_subscriptions where user_id = ${user.id}`;
  return json({
    id: user.id,
    mobile: user.mobile,
    name: user.name,
    nickName: user.nick_name,
    walletBalance: Number(user.wallet_balance),
    maxBookdate: user.max_bookdate,
    windowDays: windowDaysOf(user),
    today: todayBkk(),
    lastSyncedAt: user.last_synced_at,
    cookieExpiresAt: user.cookie_expires_at,
    observations: obs,
    pushSubscriptions: pushCount[0]?.n ?? 0,
    vapidPublicKey: env.VAPID_PUBLIC_KEY,
  });
});
