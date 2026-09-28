# Crystal Sports booking — reverse-engineered API notes (2026-09-28)

Base: https://crystalsports-booking.kegroup.co.th/api_helper.php?action=<ACTION>
All JSON, content-type application/json. Auth = cookies PHPSESSID + cs_auth (cs_auth = base64("mobile|expiryEpoch").hmac; user's expires 2026-12-27 ≈ 90 days).
Unauthed → 401 {"error":"Unauthorized"}. Bad action → 400 {"error":"Invalid Action"}.

## Auth
- POST sendOTP {mobileNo} → {status:"success", token} (else {status, message} / ProblemDetails {title,status,detail}). Rate limit: 3 OTP per mobile per hour. Turnstile currently disabled (commented out) but code exists (cfToken).
- POST verifyOTP {mobileNo, token, pin} → {status:"success"} + sets cs_auth cookie. OTP timer 5 min on UI.
- GET logout
- POST getMemberInfo {memberMobile} → {memberId, memberTypeId(1=member,2=coach), name, surname, nickName, mobile, birthday, email, walletBalance:"0.00", topupDays:"14", maxBookdate:"2026-10-12", ...}. No memberId → new user → register/?mobile= (POST memberRegister).
- POST getCoachInfo {coachMobile}

## Catalog
- GET getLocations → [{locId:"LOC001",locName:"Crystal Sports"},{locId:"LOC002",locName:"Crystal Sports G"}]
- GET getStadiums → [{stadiumId,stadiumName,locId,locName,stadiumSort}] — LOC001: North-1..3, Center-1..2, South-1..3 (8 courts); LOC002: G North-1..3, G Center-1..3, G South-1..3 (9 courts)
- GET getStadiumTimePrice → [{stadiumtimeId, stadiumId, timeId, stadiumName, timeName:"06:00", stadiumtimePrice:"500.00", stadiumtimeExtraprice, stadiumtimeStatus, locId, locName}] (66KB, all courts × 18 slots)
- POST getAvailableStadiums {date:"YYYY-MM-DD", stadiumId, locId} → [{stadiumtimeId, stadiumId, timeId, timeStart, timeEnd, stadiumName, timeName, stadiumtimePrice:"500.0000", reservestatus:"0"|"1", locName, locId}] — 18 slots 06:00–23:00, 1h each, 500 THB flat. Returns data for ANY date (even > maxBookdate) — slots beyond user's window are mostly already reserved by others up to ~30 days out; 2026-11-15 fully free.
- UI hides: past hours today (timeName < now HH:00), reservestatus=1, dates before today; date strip goes today..maxBookdate.
- UI hardcodes amount 500 for 2026 dates.

## Booking
- POST bookingTransactions {customer:mobile, createdBy:mobile, paymentType:"QR"|"WALLET", transaction:[{transactionCode:"COURT", coachMemberId:0, stadiumtimeId, bookingDate, amount:"500.00"}]}
  → {message:"Success", statusCode:"00", paymentRef, bookingRef, paymentLink?} ; WALLET insufficient → statusCode:"10" (booking created WAITING, pay later via confirmWalletBooking) ; other → {message}
- POST bookingV1 same body with paymentType CREDITCARD|ALIPAY|WECHAT → paymentLink (paycfbooking2.php)
- POST genQRpayment {referenceNo:paymentRef, bookingNo:bookingRef, amount} → base64 jpeg (or {response:base64}). Pay within 15 min (900s) else booking EXPIRED.
- POST checkQRPayment {referenceNo} → {txn:{status:"S"}, resultCode:"00"} when paid.
- POST confirmWalletBooking {memberMobile, bookingReferene(sic): bookingRef} → statusCode 00 / 10 insufficient
- POST paymentDetail {referenceNo, bookingNo} → {paymentLink}
- POST getHistoryByBooking {memberMobile, bookingReference} → [{transaction:[{transactionCode, coachId, stadiumTimeId, bookingDate, transactionAmount}]}]
- POST adminBookingHistory {memberMobile} → [{bookingRef:"SPORTS-2026...", bookingId, bookingDetailId, bookingDate, stadiumTimeId, stadiumName, timeName, transactionCode, coachName, coachMemberId, paymentType, paymentReferenceNo, paymentStatus, transactionAmount, transactionStatus: WAITING|SUCCESS|CANCEL|EXPIRED, createdDate, bookingExpired, canCancel:"0"|"1"}]
- POST getHistory {memberMobile, paymentStatus:"WAITING"} → [{bookingRef, paymentType, paymentStatus, amount, paymentReferenceNo, transaction:[...]}]
- POST cancelBooking [{bookingRef, bookingDetailId, remark, createdBy:mobile}] → {message:"Success", statusCode:"00"}. UI allows only canCancel=="1" && transactionStatus=="SUCCESS". Remark required.

## Wallet
- POST walletTopup {customer, createby, packageCode:"Top Up Pack", amount:"100.00", paymentType:"QR"|CREDITCARD|ALIPAY|WECHAT} → {message:"Success", statusCode:"00", topupReference, paymentLink?}. Min 100 THB.
- POST genQRtopup {topupReference, packageCode, amount} → base64 QR; 15 min; checkQRPayment {referenceNo: topupReference}
- POST walletHistory {memberMobile} → [{status WAITING|SUCCESS|EXPIRED|CANCEL, amount, reference, paymentType}]

## Rules shown on original site
- ชำระเงินภายใน 15 นาที (QR/card) มิฉะนั้นรายการ EXPIRED และสล็อตถูกปล่อย
- ยกเลิก/เปลี่ยนวัน-เวลา ต้องแจ้งล่วงหน้าไม่ต่ำกว่า 24 ชม. → คืนเงินเข้า wallet; ต่ำกว่า 24 ชม. สนามตัดชั่วโมง
- บริษัทสงวนสิทธิ์ไม่คืนเงิน (เงินสด) ทุกกรณี — คืนเป็น wallet เท่านั้น
- เติม wallet ขั้นต่ำ 100 บาท
- OTP 3 ครั้ง/ชม./เบอร์
- จองล่วงหน้าได้ถึง maxBookdate (per-member; user: today+14 days, topupDays 14). Other members evidently book ~30 days out.
- ราคาคอร์ท 500 บาท/ชม. ทุกสนาม ทุกช่วงเวลา (06:00–23:00)
- Coach booking (bookingCoach.php) transactionCode COACH with coachMemberId

## Live test 2026-09-28 17:20 (+07)
- bookingTransactions for 2026-11-15 and 2026-10-13 (maxBookdate+1) → {"statusCode":"99","message":"ไม่สามารถทำรายการได้"} in ~30ms → server ENFORCES maxBookdate (inclusive).
- bookingTransactions 2026-10-12 slot 54 QR → {"statusCode":"00","message":"Success","bookingRef":"SPORTS-20269196070","paymentRef":"20260928172036E2","amount":"500","paymentLink":null} 149ms
- genQRpayment → raw base64 PNG string (iVBORw0...) as body
- checkQRPayment unpaid → {"resultCode":"99","txn":null}
