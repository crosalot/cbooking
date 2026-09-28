import { NextResponse } from "next/server";
import type { UserRow } from "./db";
import { getSessionUserId } from "./session";
import { UnauthorizedError, UpstreamError } from "./upstream";
import { getUser, hasUpstreamSession, markUpstreamLoggedOut } from "./users";
import { env } from "./env";

export const json = (data: unknown, init?: ResponseInit) => NextResponse.json(data, init);
export const err = (message: string, status = 400, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error: message, ...extra }, { status });

/** ห่อ handler ที่ต้อง login ของเรา + มี session ต้นทาง */
export function withUser<T extends unknown[]>(
  fn: (user: UserRow, ...rest: T) => Promise<Response>,
) {
  return async (...rest: T): Promise<Response> => {
    const uid = await getSessionUserId();
    if (!uid) return err("กรุณาเข้าสู่ระบบ", 401, { code: "no_session" });
    const user = await getUser(uid);
    if (!user) return err("กรุณาเข้าสู่ระบบ", 401, { code: "no_session" });
    if (!hasUpstreamSession(user))
      return err("session ระบบจองต้นทางหมดอายุ กรุณา login ด้วย OTP ใหม่", 401, { code: "upstream_expired" });
    try {
      return await fn(user, ...rest);
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        await markUpstreamLoggedOut(user.id);
        return err("session ระบบจองต้นทางหมดอายุ กรุณา login ด้วย OTP ใหม่", 401, { code: "upstream_expired" });
      }
      if (e instanceof UpstreamError) return err(`ระบบต้นทางขัดข้อง: ${e.message}`, 502);
      console.error(e);
      return err(e instanceof Error ? e.message : "server error", 500);
    }
  };
}

/** ตรวจ secret ของ cron: Authorization: Bearer <CRON_SECRET> หรือ ?secret= */
export function checkCron(req: Request): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const url = new URL(req.url);
  const s = url.searchParams.get("secret");
  return auth === `Bearer ${env.CRON_SECRET}` || s === env.CRON_SECRET;
}
