function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export const env = {
  get DATABASE_URL() {
    return req("DATABASE_URL");
  },
  /** ใช้เซ็น session cookie ของเราและเข้ารหัส cookie ของระบบต้นทางที่เก็บใน DB */
  get APP_SECRET() {
    return req("APP_SECRET");
  },
  /** ใช้ป้องกัน endpoint /api/cron/* */
  get CRON_SECRET() {
    return req("CRON_SECRET");
  },
  UPSTREAM_BASE:
    process.env.UPSTREAM_BASE ?? "https://crystalsports-booking.kegroup.co.th",
  VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY ?? "",
  VAPID_SUBJECT: process.env.VAPID_SUBJECT ?? "mailto:admin@example.com",
  /** หน่วงหลังเที่ยงคืนกี่ ms ก่อนยิง (กันนาฬิกา server ต้นทางช้ากว่าเรา) */
  FIRE_OFFSET_MS: Number(process.env.FIRE_OFFSET_MS ?? 200),
  /** ถ้ายิงแล้วต้นทางยังบอกว่าเกินหน้าต่าง จะ retry ต่อไปนานสุดกี่วินาที */
  FIRE_RETRY_SECONDS: Number(process.env.FIRE_RETRY_SECONDS ?? 240),
  /** ห่างระหว่าง retry (ms) */
  FIRE_RETRY_INTERVAL_MS: Number(process.env.FIRE_RETRY_INTERVAL_MS ?? 2500),
  /** จำนวนวันสูงสุดที่ให้เลือกวันล่วงหน้าในตะกร้า */
  MAX_LOOKAHEAD_DAYS: Number(process.env.MAX_LOOKAHEAD_DAYS ?? 60),
  /** อายุ session ของเรา (วัน) */
  SESSION_DAYS: Number(process.env.SESSION_DAYS ?? 60),
};
