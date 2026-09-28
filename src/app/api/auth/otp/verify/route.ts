import { z } from "zod";
import { err, json } from "@/lib/api";
import { decrypt } from "@/lib/crypto";
import { createSession } from "@/lib/session";
import { Upstream, type CookieJar } from "@/lib/upstream";
import { upsertUserSession } from "@/lib/users";
import { recomputeOpenAt } from "@/lib/queue";

const Body = z.object({
  state: z.string().min(10),
  pin: z.string().regex(/^\d{6}$/, "OTP ต้อง 6 หลัก"),
});

export async function POST(req: Request) {
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return err(p.error.issues[0].message);
  let st: { token: string; jar: CookieJar; mobile: string; at: number };
  try {
    st = JSON.parse(decrypt(p.data.state));
  } catch {
    return err("state ไม่ถูกต้อง กรุณาขอ OTP ใหม่");
  }
  if (Date.now() - st.at > 10 * 60 * 1000) return err("OTP หมดอายุ (5 นาที) กรุณาขอใหม่");

  const up = new Upstream(st.jar);
  const r = await up.verifyOTP(st.mobile, st.token, p.data.pin);
  if (r.status !== "success") return err(r.status || r.message || "รหัส OTP ไม่ถูกต้อง", 400);
  if (!up.jar.cs_auth) return err("ต้นทางไม่ส่ง cookie เข้าสู่ระบบกลับมา ลองใหม่อีกครั้ง", 502);

  const info = await up.memberInfo(st.mobile);
  if (!info || !info.memberId) {
    // ยังไม่เคยสมัครสมาชิกที่ต้นทาง
    return err("เบอร์นี้ยังไม่ได้สมัครสมาชิกกับ Crystal Sports กรุณาสมัครที่เว็บต้นทางก่อน", 403, {
      code: "not_registered",
      registerUrl: `https://crystalsports-booking.kegroup.co.th/register/?mobile=${st.mobile}`,
    });
  }
  const user = await upsertUserSession(st.mobile, up.jar, info);
  await recomputeOpenAt(user);
  await createSession(user.id);
  return json({ ok: true, name: info.name, nickName: info.nickName, maxBookdate: info.maxBookdate });
}
