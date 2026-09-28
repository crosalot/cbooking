import { json } from "@/lib/api";
import { clearSession } from "@/lib/session";

/** ออกจากระบบของเราเท่านั้น — ไม่ logout ต้นทาง เพื่อให้คิวที่ตั้งไว้ยังจองได้อยู่ */
export async function POST() {
  await clearSession();
  return json({ ok: true });
}
