"use client";

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

/** fetch wrapper: JSON in/out, โยน ApiError, ถ้า 401 → พาไปหน้า login */
export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: "no-store",
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text.slice(0, 200) };
  }
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !location.pathname.startsWith("/login")) {
      const code = (data.code as string) ?? "";
      location.href = `/login?reason=${encodeURIComponent(code)}&next=${encodeURIComponent(location.pathname)}`;
    }
    throw new ApiError((data.error as string) ?? `HTTP ${res.status}`, res.status, data.code as string, data);
  }
  return data as T;
}

export const baht = (n: number | string) =>
  Number(n).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " ฿";

export const STATUS_TH: Record<string, { label: string; cls: string }> = {
  queued: { label: "รอถึงเวลาจอง", cls: "badge-warn" },
  firing: { label: "กำลังจอง…", cls: "badge-accent pulse" },
  booked_paid: { label: "จองสำเร็จ", cls: "badge-ok" },
  pending_payment: { label: "รอชำระเงิน", cls: "badge-danger pulse" },
  failed: { label: "ไม่สำเร็จ", cls: "badge-danger" },
  cancelled: { label: "ยกเลิก", cls: "badge-muted" },
  expired: { label: "หมดอายุ", cls: "badge-muted" },
};

export function fmtThaiDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const days = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
  const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${days[dt.getDay()]} ${d} ${months[m - 1]}`;
}

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
