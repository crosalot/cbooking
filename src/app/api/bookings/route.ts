import { json, withUser } from "@/lib/api";
import { upstreamFor } from "@/lib/users";

export const dynamic = "force-dynamic";

/** ประวัติการจองจากต้นทาง + รายการรอชำระ */
export const GET = withUser(async (user) => {
  const up = upstreamFor(user);
  const [history, waiting] = await Promise.all([up.history(user.mobile), up.waitingPayments(user.mobile)]);
  const now = Date.now();
  const rows = (history ?? []).map((h) => {
    // ยกเลิกได้: ต้นทางบอก canCancel=1 และ SUCCESS; เราเสริมกฎ 24 ชม. ให้เห็นชัด
    const start = new Date(`${h.bookingDate.slice(0, 10)}T${h.timeName}:00+07:00`).getTime();
    const hoursLeft = (start - now) / 3600_000;
    return {
      ...h,
      bookingDate: h.bookingDate.slice(0, 10),
      canCancelNow: h.canCancel === "1" && h.transactionStatus === "SUCCESS" && hoursLeft >= 24,
      hoursLeft: Math.round(hoursLeft),
    };
  });
  return json({ history: rows, waiting: waiting ?? [] });
});
