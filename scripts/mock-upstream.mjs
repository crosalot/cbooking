/**
 * Mock ของ crystalsports-booking api_helper.php สำหรับทดสอบ local
 * จำลอง: OTP (pin = 123456), maxBookdate = today+14 (เลื่อนตอนเที่ยงคืนไทย หรือสั่ง POST /__roll),
 * จอง/QR/เช็คจ่าย (POST /__pay {referenceNo}), wallet, cancel, topup
 * รัน: node scripts/mock-upstream.mjs  (port 4010)
 */
import http from "node:http";

const PORT = Number(process.env.MOCK_PORT || 4010);
const todayBkk = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
const addDays = (ymd, n) => new Date(Date.UTC(...ymd.split("-").map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))) ) + n * 864e5).toISOString().slice(0, 10);
let rollOffset = 0; // เพิ่มเพื่อจำลองว่าหน้าต่างเลื่อนแล้ว
const state = {
  members: { "0805088183": { memberId: "25173", name: "Panudate", surname: "V", nickName: "Aof", walletBalance: 0, windowDays: 14 } },
  sessions: {}, // cs_auth -> mobile
  otps: {},
  reserved: new Set(), // `${date}:${stadiumtimeId}`
  bookings: [], // {bookingRef,paymentRef,mobile,paymentType,status,txns,createdAt}
  topups: {},
  seq: 1,
};
const locations = [{ locId: "LOC001", locName: "Crystal Sports" }, { locId: "LOC002", locName: "Crystal Sports G" }];
const stadiums = [];
["North-1", "North-2", "North-3", "Center-1", "Center-2", "South-1", "South-2", "South-3"].forEach((n, i) => stadiums.push({ stadiumId: String(i + 1), stadiumName: n, locId: "LOC001", locName: "Crystal Sports", stadiumSort: i + 1 }));
["G North-1", "G North-2", "G Center-1"].forEach((n, i) => stadiums.push({ stadiumId: String(18 + i), stadiumName: n, locId: "LOC002", locName: "Crystal Sports G", stadiumSort: i + 1 }));
const times = Array.from({ length: 18 }, (_, i) => ({ timeId: i + 1, timeName: `${String(6 + i).padStart(2, "0")}:00` }));
const stadiumTimes = [];
stadiums.forEach((s) => times.forEach((t) => stadiumTimes.push({ stadiumtimeId: Number(s.stadiumId) * 100 + t.timeId, stadiumId: Number(s.stadiumId), timeId: t.timeId, stadiumName: s.stadiumName, timeName: t.timeName, locId: s.locId, locName: s.locName })));
// จำลองคนอื่นจองบางช่องล่วงหน้า
for (const st of stadiumTimes) if (st.timeId % 5 === 0) state.reserved.add(`${addDays(todayBkk(), 20)}:${st.stadiumtimeId}`);

const maxBookdate = (m) => addDays(todayBkk(), m.windowDays + rollOffset);
const parseCookies = (h = "") => Object.fromEntries(h.split(";").map((s) => s.trim().split("=")).filter((a) => a.length === 2));
const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};
const PNG1x1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    let raw = "";
    for await (const c of req) raw += c;
    const body = raw ? JSON.parse(raw) : undefined;
    const cookies = parseCookies(req.headers.cookie);
    const mobileOf = () => state.sessions[cookies.cs_auth];

    if (url.pathname === "/__roll") { rollOffset++; return send(res, 200, { rollOffset }); }
    if (url.pathname === "/__pay") { const b = state.bookings.find((x) => x.paymentRef === body.referenceNo); if (b) b.status = "SUCCESS"; if (state.topups[body.referenceNo]) { state.topups[body.referenceNo].status = "SUCCESS"; state.members[state.topups[body.referenceNo].mobile].walletBalance += Number(state.topups[body.referenceNo].amount); } return send(res, 200, { ok: !!b }); }
    if (url.pathname === "/__state") return send(res, 200, { rollOffset, bookings: state.bookings, members: state.members, reserved: [...state.reserved] });
    if (url.pathname !== "/api_helper.php") return send(res, 404, "nf");

    const action = url.searchParams.get("action");
    // หมดอายุ QR ที่ค้างเกิน 15 นาที
    for (const b of state.bookings) if (b.status === "WAITING" && b.paymentType === "QR" && Date.now() - b.createdAt > 15 * 60e3) { b.status = "EXPIRED"; b.txns.forEach((t) => state.reserved.delete(`${t.bookingDate}:${t.stadiumtimeId}`)); }

    switch (action) {
      case "sendOTP": { const token = "tok" + state.seq++; state.otps[token] = body.mobileNo; return send(res, 200, { status: "success", token }); }
      case "verifyOTP": {
        if (body.pin !== "123456" || state.otps[body.token] !== body.mobileNo) return send(res, 200, { status: "รหัส OTP ไม่ถูกต้อง" });
        const exp = Math.floor(Date.now() / 1000) + 90 * 86400;
        const cs = Buffer.from(`${body.mobileNo}|${exp}`).toString("base64") + ".sig";
        state.sessions[cs] = body.mobileNo;
        return send(res, 200, { status: "success" }, { "set-cookie": [`cs_auth=${cs}; path=/; HttpOnly`, "PHPSESSID=mock; path=/"] });
      }
      case "logout": return send(res, 200, {});
    }
    const mobile = mobileOf();
    if (!mobile) return send(res, 401, { error: "Unauthorized" });
    const m = state.members[mobile];
    switch (action) {
      case "getMemberInfo": return send(res, 200, m ? { memberId: m.memberId, memberTypeId: "1", name: m.name, surname: m.surname, nickName: m.nickName, mobile, email: null, walletBalance: m.walletBalance.toFixed(2), topupDays: String(m.windowDays), maxBookdate: maxBookdate(m) } : null);
      case "getLocations": return send(res, 200, locations);
      case "getStadiums": return send(res, 200, stadiums);
      case "getStadiumTimePrice": return send(res, 200, stadiumTimes.map((s) => ({ ...s, stadiumtimePrice: "500.00", stadiumtimeExtraprice: null, stadiumtimeStatus: "1" })));
      case "getAvailableStadiums": return send(res, 200, stadiumTimes.filter((s) => String(s.stadiumId) === String(body.stadiumId)).map((s) => ({ ...s, timeStart: s.timeName + ":00", timeEnd: s.timeName + ":00", stadiumtimePrice: "500.0000", reservestatus: state.reserved.has(`${body.date}:${s.stadiumtimeId}`) ? "1" : "0" })));
      case "bookingTransactions": {
        const max = maxBookdate(m);
        const txns = body.transaction;
        if (txns.some((t) => t.bookingDate > max || t.bookingDate < todayBkk())) return send(res, 200, { statusCode: "99", message: "ไม่สามารถทำรายการได้", bookingRef: null, paymentRef: null, amount: null, paymentLink: null });
        if (txns.some((t) => state.reserved.has(`${t.bookingDate}:${t.stadiumtimeId}`))) return send(res, 200, { statusCode: "99", message: "ไม่สามารถทำรายการได้", bookingRef: null, paymentRef: null, amount: null, paymentLink: null });
        const total = txns.reduce((s, t) => s + Number(t.amount), 0);
        const bookingRef = `SPORTS-MOCK${state.seq++}`, paymentRef = `PAY${Date.now()}`;
        txns.forEach((t) => state.reserved.add(`${t.bookingDate}:${t.stadiumtimeId}`));
        const b = { bookingRef, paymentRef, mobile, paymentType: body.paymentType, status: "WAITING", txns, total, createdAt: Date.now() };
        state.bookings.push(b);
        if (body.paymentType === "WALLET") {
          if (m.walletBalance >= total) { m.walletBalance -= total; b.status = "SUCCESS"; return send(res, 200, { statusCode: "00", message: "Success", bookingRef, paymentRef, amount: String(total), paymentLink: null }); }
          return send(res, 200, { statusCode: "10", message: "Wallet ไม่พอ", bookingRef, paymentRef, amount: String(total), paymentLink: null });
        }
        return send(res, 200, { statusCode: "00", message: "Success", bookingRef, paymentRef, amount: String(total), paymentLink: null });
      }
      case "genQRpayment": return send(res, 200, PNG1x1);
      case "checkQRPayment": { const b = state.bookings.find((x) => x.paymentRef === body.referenceNo); const t = state.topups[body.referenceNo]; const ok = (b && b.status === "SUCCESS") || (t && t.status === "SUCCESS"); return send(res, 200, ok ? { resultCode: "00", txn: { status: "S" } } : { resultCode: "99", txn: null }); }
      case "confirmWalletBooking": { const b = state.bookings.find((x) => x.bookingRef === body.bookingReferene); if (!b) return send(res, 200, { statusCode: "99", message: "no" }); if (m.walletBalance < b.total) return send(res, 200, { statusCode: "10", message: "ไม่พอ" }); m.walletBalance -= b.total; b.status = "SUCCESS"; return send(res, 200, { statusCode: "00", message: "Success" }); }
      case "adminBookingHistory": return send(res, 200, state.bookings.filter((b) => b.mobile === mobile).flatMap((b, i) => b.txns.map((t, j) => { const st = stadiumTimes.find((s) => String(s.stadiumtimeId) === String(t.stadiumtimeId)); return { bookingRef: b.bookingRef, memberMobile: mobile, bookingId: i, bookingDetailId: i * 10 + j, bookingDate: t.bookingDate, stadiumTimeId: Number(t.stadiumtimeId), stadiumName: st?.stadiumName, timeName: st?.timeName, transactionCode: "COURT", coachName: "", coachMemberId: "0", paymentType: b.paymentType, paymentReferenceNo: b.paymentRef, paymentStatus: b.status, transactionAmount: Number(t.amount), transactionStatus: b.status, createdDate: todayBkk() + " 00:00:00", bookingExpired: null, canCancel: b.status === "SUCCESS" ? "1" : "0" }; })));
      case "getHistory": return send(res, 200, state.bookings.filter((b) => b.mobile === mobile && b.status === "WAITING").map((b) => ({ bookingRef: b.bookingRef, paymentType: b.paymentType, paymentStatus: b.status, amount: b.total, paymentReferenceNo: b.paymentRef, transaction: b.txns.map((t) => ({ transactionCode: "COURT", coachId: "0", stadiumTimeId: Number(t.stadiumtimeId), bookingDate: t.bookingDate, transactionAmount: Number(t.amount) })) })));
      case "cancelBooking": { const [c] = body; const b = state.bookings.find((x) => x.bookingRef === c.bookingRef); if (!b || b.status !== "SUCCESS") return send(res, 200, { statusCode: "99", message: "ยกเลิกไม่ได้" }); b.status = "CANCEL"; m.walletBalance += b.total; b.txns.forEach((t) => state.reserved.delete(`${t.bookingDate}:${t.stadiumtimeId}`)); return send(res, 200, { statusCode: "00", message: "Success" }); }
      case "walletHistory": return send(res, 200, Object.values(state.topups).filter((t) => t.mobile === mobile).map((t) => ({ status: t.status, amount: t.amount, reference: t.reference, paymentType: "QR" })));
      case "walletTopup": { const reference = `TOP${Date.now()}`; state.topups[reference] = { reference, mobile, amount: body.amount, status: "WAITING" }; return send(res, 200, { statusCode: "00", message: "Success", topupReference: reference, paymentLink: null }); }
      case "genQRtopup": return send(res, 200, PNG1x1);
      default: return send(res, 400, { error: "Invalid Action" });
    }
  })
  .listen(PORT, () => console.log("mock upstream on", PORT));
