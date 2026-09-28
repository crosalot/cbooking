import { TZDate } from "@date-fns/tz";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

export const TZ = "Asia/Bangkok";

/** วันที่วันนี้ตามเวลาไทย เป็น "YYYY-MM-DD" */
export function todayBkk(now: Date = new Date()): string {
  return format(new TZDate(now, TZ), "yyyy-MM-dd");
}

/** เที่ยงคืนถัดไปตามเวลาไทย (instant) */
export function nextMidnightBkk(now: Date = new Date()): Date {
  const d = new TZDate(now, TZ);
  const m = new TZDate(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0, TZ);
  return new Date(m.getTime());
}

/** เที่ยงคืน (00:00 ไทย) ของวันที่ระบุ */
export function midnightOfBkk(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(new TZDate(y, m - 1, d, 0, 0, 0, 0, TZ).getTime());
}

export function addDaysYmd(ymd: string, days: number): string {
  return format(addDays(parseISO(ymd), days), "yyyy-MM-dd");
}

export function diffDaysYmd(a: string, b: string): number {
  return differenceInCalendarDays(parseISO(a), parseISO(b));
}

/**
 * วันที่ "จองได้" จะเข้ามาอยู่ในหน้าต่างเมื่อไหร่
 * หน้าต่าง = วันนี้ + windowDays (รวมวันสุดท้าย) และเลื่อนตอนเที่ยงคืน
 * → วันที่ D เปิดจองตอน 00:00 ของวัน (D - windowDays)
 */
export function openAtFor(bookingDate: string, windowDays: number): Date {
  return midnightOfBkk(addDaysYmd(bookingDate, -windowDays));
}

export function isOpenNow(bookingDate: string, maxBookdate: string | null): boolean {
  if (!maxBookdate) return false;
  return bookingDate <= maxBookdate && bookingDate >= todayBkk();
}

/** ชั่วโมงปัจจุบันตามเวลาไทย "HH:00" ไว้ซ่อนช่องที่ผ่านไปแล้วของวันนี้ */
export function nowHourBkk(now: Date = new Date()): string {
  return format(new TZDate(now, TZ), "HH:00");
}

export function fmtThaiDate(ymd: string): string {
  const d = parseISO(ymd);
  const days = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
  const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
