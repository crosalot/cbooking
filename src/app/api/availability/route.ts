import { z } from "zod";
import { err, json, withUser } from "@/lib/api";
import { maxSelectableDate } from "@/lib/queue";
import { nowHourBkk, todayBkk } from "@/lib/time";
import { upstreamFor } from "@/lib/users";

export const dynamic = "force-dynamic";

const Q = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  stadiumId: z.string().min(1),
  locId: z.string().min(1),
});

/**
 * ช่องว่างของสนามในวันที่เลือก — ต้นทางตอบทุกวันแม้เกินหน้าต่าง (แต่จองไม่ได้จนกว่าจะเปิด)
 * เพิ่ม field: past (ผ่านไปแล้ว), openNow (จองได้ทันที), reserved
 */
export const GET = withUser(async (user, req: Request) => {
  const u = new URL(req.url);
  const p = Q.safeParse(Object.fromEntries(u.searchParams));
  if (!p.success) return err("พารามิเตอร์ไม่ถูกต้อง");
  const { date, stadiumId, locId } = p.data;
  const today = todayBkk();
  if (date < today) return err("เลือกวันที่ผ่านมาแล้วไม่ได้");
  if (date > maxSelectableDate()) return err("เลือกล่วงหน้าไกลเกินไป");
  const up = upstreamFor(user);
  const rows = await up.available(date, stadiumId, locId);
  const nowH = nowHourBkk();
  const openNow = !!user.max_bookdate && date <= user.max_bookdate;
  const slots = rows
    .filter((r) => String(r.stadiumId) === String(stadiumId))
    .map((r) => ({
      stadiumtimeId: String(r.stadiumtimeId),
      timeName: r.timeName,
      price: Number(r.stadiumtimePrice),
      reserved: r.reservestatus === "1",
      past: date === today && r.timeName < nowH,
      openNow,
    }));
  return json({ date, stadiumId, locId, openNow, maxBookdate: user.max_bookdate, slots });
});
