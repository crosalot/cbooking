import { z } from "zod";
import { err, json, withUser } from "@/lib/api";
import { sql } from "@/lib/db";
import { pushToUser } from "@/lib/push";

export const dynamic = "force-dynamic";

const Sub = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

/** บันทึก push subscription ของอุปกรณ์นี้ */
export const POST = withUser(async (user, req: Request) => {
  const p = Sub.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return err("subscription ไม่ถูกต้อง");
  await sql`
    insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
    values (${user.id}, ${p.data.endpoint}, ${p.data.keys.p256dh}, ${p.data.keys.auth}, ${req.headers.get("user-agent")})
    on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`;
  return json({ ok: true });
});

export const DELETE = withUser(async (user, req: Request) => {
  const p = z.object({ endpoint: z.string() }).safeParse(await req.json().catch(() => ({})));
  if (!p.success) return err("bad request");
  await sql`delete from push_subscriptions where user_id = ${user.id} and endpoint = ${p.data.endpoint}`;
  return json({ ok: true });
});

/** ส่งทดสอบ */
export const PUT = withUser(async (user) => {
  const r = await pushToUser(user.id, { title: "ทดสอบการแจ้งเตือน", body: "ถ้าเห็นข้อความนี้ แปลว่าพร้อมรับแจ้งเตือนตอนจองได้แล้ว", url: "/cart" });
  return json(r);
});
