import { checkCron, err, json } from "@/lib/api";
import { migrate } from "@/lib/db";

export const dynamic = "force-dynamic";

/** สร้างตารางใน DB (เรียกครั้งแรกหลัง deploy): GET /api/admin/migrate?secret=CRON_SECRET */
export async function GET(req: Request) {
  if (!checkCron(req)) return err("unauthorized", 401);
  await migrate();
  return json({ ok: true });
}
