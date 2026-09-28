/**
 * Client สำหรับระบบต้นทาง crystalsports-booking.kegroup.co.th
 * ทุก action อยู่ที่ /api_helper.php?action=<name> รับ/ส่ง JSON
 * auth = cookie PHPSESSID + cs_auth (ได้จาก verifyOTP)
 */
import { env } from "./env";

export type CookieJar = Record<string, string>;

export class UpstreamError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: unknown,
  ) {
    super(message);
  }
}

export class UnauthorizedError extends UpstreamError {
  constructor() {
    super("upstream unauthorized (session หมดอายุ ต้อง login ใหม่)", 401);
  }
}

// ---------- types ----------
export type MemberInfo = {
  memberId: string;
  memberTypeId: string;
  name: string;
  surname: string;
  nickName: string;
  mobile: string;
  email: string | null;
  walletBalance: string; // "0.00"
  topupDays: string | null;
  maxBookdate: string; // "YYYY-MM-DD"
};
export type Location = { locId: string; locName: string };
export type Stadium = {
  stadiumId: string;
  stadiumName: string;
  locId: string;
  locName: string;
  stadiumSort: number;
};
export type TimePrice = {
  stadiumtimeId: number;
  stadiumId: number;
  timeId: number;
  stadiumName: string;
  timeName: string;
  stadiumtimePrice: string;
  stadiumtimeStatus: string;
  locId: string;
  locName: string;
};
export type AvailableSlot = {
  stadiumtimeId: number;
  stadiumId: number;
  timeId: number;
  timeStart: string;
  timeEnd: string;
  stadiumName: string;
  timeName: string;
  stadiumtimePrice: string;
  reservestatus: "0" | "1";
  locName: string;
  locId: string;
};
export type BookingTxn = {
  transactionCode: "COURT" | "COACH";
  coachMemberId: number;
  stadiumtimeId: string;
  bookingDate: string;
  amount: string; // "500.00"
};
export type BookingResult = {
  statusCode: string; // "00" ok, "10" wallet ไม่พอ, "99" ทำรายการไม่ได้
  message: string;
  bookingRef: string | null;
  paymentRef: string | null;
  amount: string | null;
  paymentLink: string | null;
};
export type HistoryRow = {
  bookingRef: string;
  memberMobile: string;
  bookingId: number;
  bookingDetailId: number;
  bookingDate: string;
  stadiumTimeId: number;
  stadiumName: string;
  timeName: string;
  transactionCode: string;
  coachName: string;
  coachMemberId: string;
  paymentType: string;
  paymentReferenceNo: string;
  paymentStatus: string;
  transactionAmount: number;
  transactionStatus: "WAITING" | "SUCCESS" | "CANCEL" | "EXPIRED" | string;
  createdDate: string;
  bookingExpired: string | null;
  canCancel: "0" | "1";
};
export type WaitingPayment = {
  bookingRef: string;
  paymentType: string;
  paymentStatus: string;
  amount: number | string;
  paymentReferenceNo: string;
  transaction: {
    transactionCode: string;
    coachId: string;
    stadiumTimeId: number;
    bookingDate: string;
    transactionAmount: number;
    stadiumName?: string;
    timeName?: string;
  }[];
};
export type WalletHistoryRow = {
  status: string;
  amount: number | string;
  reference: string;
  paymentType: string;
  [k: string]: unknown;
};
export type QrCheck = { resultCode: string; txn: { status: string } | null };
export type TopupResult = {
  statusCode: string;
  message: string;
  topupReference?: string;
  paymentLink?: string | null;
};

// ---------- cookie helpers ----------
export function jarToHeader(jar: CookieJar): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function absorbSetCookie(jar: CookieJar, res: Response) {
  const list: string[] =
    typeof (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : [];
  for (const line of list) {
    const first = line.split(";")[0];
    const i = first.indexOf("=");
    if (i > 0) jar[first.slice(0, i).trim()] = first.slice(i + 1).trim();
  }
}

/** cs_auth = base64("mobile|expiryEpoch").hmac → อ่านวันหมดอายุออกมาได้ */
export function csAuthExpiry(jar: CookieJar): Date | null {
  const v = jar["cs_auth"];
  if (!v) return null;
  try {
    const payload = Buffer.from(v.split(".")[0], "base64").toString("utf8");
    const epoch = Number(payload.split("|")[1]);
    return Number.isFinite(epoch) ? new Date(epoch * 1000) : null;
  } catch {
    return null;
  }
}

// ---------- client ----------
export class Upstream {
  constructor(public jar: CookieJar = {}) {}

  private async call<T>(
    action: string,
    body?: unknown,
    opts: { method?: "GET" | "POST"; raw?: boolean; timeoutMs?: number } = {},
  ): Promise<T> {
    const method = opts.method ?? (body === undefined ? "GET" : "POST");
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 15000);
    let res: Response;
    try {
      res = await fetch(`${env.UPSTREAM_BASE}/api_helper.php?action=${action}`, {
        method,
        headers: {
          accept: "*/*",
          "content-type": "application/json; charset=UTF-8",
          "x-requested-with": "XMLHttpRequest",
          origin: env.UPSTREAM_BASE,
          referer: `${env.UPSTREAM_BASE}/home.php`,
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
          ...(Object.keys(this.jar).length ? { cookie: jarToHeader(this.jar) } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctl.signal,
        cache: "no-store",
        redirect: "manual",
      });
    } finally {
      clearTimeout(t);
    }
    absorbSetCookie(this.jar, res);
    const text = await res.text();
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) throw new UpstreamError(`upstream ${action} HTTP ${res.status}`, res.status, text);
    if (opts.raw) return text as unknown as T;
    if (!text.trim()) return null as unknown as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new UpstreamError(`upstream ${action}: non-JSON response`, res.status, text.slice(0, 300));
    }
  }

  // --- auth ---
  sendOTP(mobileNo: string) {
    return this.call<{ status: string; token?: string; message?: string; title?: string; detail?: string }>(
      "sendOTP",
      { mobileNo },
    );
  }
  verifyOTP(mobileNo: string, token: string, pin: string) {
    return this.call<{ status: string; message?: string }>("verifyOTP", { mobileNo, token, pin });
  }
  logout() {
    return this.call<unknown>("logout");
  }
  memberInfo(memberMobile: string) {
    return this.call<MemberInfo | null>("getMemberInfo", { memberMobile });
  }

  // --- catalog ---
  locations() {
    return this.call<Location[]>("getLocations");
  }
  stadiums() {
    return this.call<Stadium[]>("getStadiums");
  }
  timePrices() {
    return this.call<TimePrice[]>("getStadiumTimePrice");
  }
  available(date: string, stadiumId: string, locId: string) {
    return this.call<AvailableSlot[]>("getAvailableStadiums", { date, stadiumId, locId });
  }

  // --- booking ---
  book(customer: string, paymentType: "QR" | "WALLET", transaction: BookingTxn[]) {
    return this.call<BookingResult>(
      "bookingTransactions",
      { customer, createdBy: customer, paymentType, transaction },
      { timeoutMs: 20000 },
    );
  }
  /** คืน base64 PNG (ต้นทางส่งเป็น string ดิบ หรือ {response}) */
  async genQRpayment(referenceNo: string, bookingNo: string, amount: string): Promise<string> {
    const r = await this.call<string>("genQRpayment", { referenceNo, bookingNo, amount }, { raw: true });
    const s = r.trim();
    if (s.startsWith("{")) {
      const j = JSON.parse(s) as { response?: string };
      return (j.response ?? "").replace(/^data:image\/\w+;base64,/, "");
    }
    return s.replace(/^"|"$/g, "").replace(/^data:image\/\w+;base64,/, "");
  }
  checkQRPayment(referenceNo: string) {
    return this.call<QrCheck>("checkQRPayment", { referenceNo });
  }
  confirmWalletBooking(memberMobile: string, bookingRef: string) {
    // ต้นทางสะกด key ว่า bookingReferene (ตามโค้ดหน้าเว็บเดิม)
    return this.call<{ statusCode: string; message: string }>("confirmWalletBooking", {
      memberMobile,
      bookingReferene: bookingRef,
    });
  }
  history(memberMobile: string) {
    return this.call<HistoryRow[]>("adminBookingHistory", { memberMobile });
  }
  waitingPayments(memberMobile: string) {
    return this.call<WaitingPayment[]>("getHistory", { memberMobile, paymentStatus: "WAITING" });
  }
  cancelBooking(customer: string, bookingRef: string, bookingDetailId: number | string, remark: string) {
    return this.call<{ statusCode: string; message: string }>("cancelBooking", [
      { bookingRef, bookingDetailId, remark, createdBy: customer },
    ]);
  }

  // --- wallet ---
  walletHistory(memberMobile: string) {
    return this.call<WalletHistoryRow[]>("walletHistory", { memberMobile });
  }
  walletTopup(customer: string, amount: string) {
    return this.call<TopupResult>("walletTopup", {
      customer,
      createby: customer,
      packageCode: "Top Up Pack",
      amount,
      paymentType: "QR",
    });
  }
  async genQRtopup(topupReference: string, amount: string): Promise<string> {
    const r = await this.call<string>(
      "genQRtopup",
      { topupReference, packageCode: "Top Up Pack", amount },
      { raw: true },
    );
    const s = r.trim();
    if (s.startsWith("{")) {
      const j = JSON.parse(s) as { response?: string };
      return (j.response ?? "").replace(/^data:image\/\w+;base64,/, "");
    }
    return s.replace(/^"|"$/g, "").replace(/^data:image\/\w+;base64,/, "");
  }
}
