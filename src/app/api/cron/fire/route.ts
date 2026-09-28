import { checkCron, err, json } from "@/lib/api";
import { env } from "@/lib/env";
import { fireDue } from "@/lib/queue";
import { nextMidnightBkk, sleep } from "@/lib/time";

export const dynamic = "force-dynamic";
/** ต้องพอสำหรับ: รอจนเที่ยงคืน (สูงสุด ~2 นาที) + retry (FIRE_RETRY_SECONDS) */
export const maxDuration = 300;

/**
 * ตัวยิงจองตอนเที่ยงคืน
 * ให้ cron ปลุกก่อนเที่ยงคืนไทยเล็กน้อย (แนะนำ 23:58) → handler นี้จะ "ค้าง" รอจนถึง 00:00:00.000 + FIRE_OFFSET_MS
 * แล้วยิงทุกรายการที่ open_at ถึงเวลา พร้อม retry ถ้าต้นทางเลื่อนหน้าต่างช้ากว่าเรา
 *
 * ถ้าถูกเรียกตอนอื่น (ไม่ใกล้เที่ยงคืน) จะยิงรายการที่ถึงเวลาแล้วทันที (ใช้เป็น catch-up ได้)
 * ?wait=0 บังคับไม่รอ
 */
export async function GET(req: Request) {
  if (!checkCron(req)) return err("unauthorized", 401);
  const url = new URL(req.url);
  const wait = url.searchParams.get("wait") !== "0";
  const t0 = Date.now();
  const midnight = nextMidnightBkk();
  const msToMidnight = midnight.getTime() - Date.now();
  let waited = 0;
  let kind: "midnight" | "now" = "now";

  // ถ้าอยู่ในช่วง 4 นาทีก่อนเที่ยงคืน → รอให้ถึงเที่ยงคืนพอดี
  if (wait && msToMidnight > 0 && msToMidnight < 4 * 60_000) {
    kind = "midnight";
    const target = midnight.getTime() + env.FIRE_OFFSET_MS;
    // รอแบบหยาบก่อน แล้วค่อยรอละเอียดช่วงท้ายให้แม่นระดับ ms
    while (Date.now() < target - 50) await sleep(Math.min(1000, target - 50 - Date.now()));
    while (Date.now() < target) {
      /* spin ช่วงสุดท้าย */
    }
    waited = Date.now() - t0;
  }
  const budget = Math.max(10_000, Math.min(env.FIRE_RETRY_SECONDS * 1000, maxDuration * 1000 - waited - 15_000));
  const r = await fireDue(kind, budget);
  return json({ kind, waitedMs: waited, firedAt: new Date().toISOString(), ...r });
}
