import { z } from "zod";
import { err, json } from "@/lib/api";
import { Upstream, UpstreamError } from "@/lib/upstream";
import { encrypt } from "@/lib/crypto";

const Body = z.object({ mobile: z.string().regex(/^\d{10}$/, "เบอร์ต้อง 10 หลัก") });

/**
 * ขอ OTP จากระบบต้นทาง — ต้นทางจำกัด 3 ครั้ง/ชั่วโมง/เบอร์
 * คืน token ที่ต้องส่งกลับตอน verify (เก็บไว้ที่ client ชั่วคราว)
 */
export async function POST(req: Request) {
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return err(p.error.issues[0].message);
  const up = new Upstream();
  try {
    const r = await up.sendOTP(p.data.mobile);
    if (r.status === "success" && r.token) {
      // state = token + cookie ที่ต้นทางตั้งตอนขอ OTP (เข้ารหัส ให้ client ถือไว้ส่งกลับตอน verify)
      const state = encrypt(JSON.stringify({ token: r.token, jar: up.jar, mobile: p.data.mobile, at: Date.now() }));
      return json({ ok: true, state });
    }
    return err(r.message || r.detail || r.title || r.status || "ขอ OTP ไม่สำเร็จ", 400);
  } catch (e) {
    if (e instanceof UpstreamError) {
      const body = typeof e.body === "string" ? e.body : "";
      let msg = "ขอ OTP ไม่สำเร็จ";
      try {
        const j = JSON.parse(body) as { message?: string; errors?: Record<string, string[]> };
        msg = j.message ?? (j.errors ? Object.values(j.errors).flat().join(" ") : msg);
      } catch {
        /* ignore */
      }
      return err(msg, 400);
    }
    throw e;
  }
}
