import webpush from "web-push";
import { sql } from "./db";
import { env } from "./env";

let configured = false;
function ensure() {
  if (configured) return true;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

/** ส่ง push ไปทุกอุปกรณ์ของผู้ใช้ (ลบ subscription ที่ตายแล้วอัตโนมัติ) */
export async function pushToUser(userId: number, payload: PushPayload) {
  if (!ensure()) return { sent: 0, skipped: "vapid-not-configured" };
  const subs = await sql<{ id: number; endpoint: string; p256dh: string; auth: string }[]>`
    select id, endpoint, p256dh, auth from push_subscriptions where user_id = ${userId}`;
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 30, urgency: "high" },
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await sql`delete from push_subscriptions where id = ${s.id}`;
        }
      }
    }),
  );
  return { sent };
}
