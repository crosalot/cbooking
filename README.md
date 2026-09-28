# CBooking — ตัวช่วยจองคอร์ท Crystal Sports ล่วงหน้า

เว็บแอป (mobile-first, ติดตั้งเป็น PWA ได้) ที่ให้ผู้ใช้ **login ด้วยบัญชี Crystal Sports เดิม (OTP)**
เลือกวัน/เวลา/สนามที่ต้องการใส่ตะกร้าล่วงหน้า แล้วระบบจะ **ยิงจองให้เองตอนเที่ยงคืน** ที่วันนั้นเข้ามาอยู่ในหน้าต่างการจอง
จ่ายด้วย Wallet ทันทีถ้ายอดพอ ไม่พอจะออก QR แล้ว **push แจ้งเตือน** ให้มาสแกนภายใน 15 นาที
รวมถึงดูประวัติ / ยกเลิก / เติม Wallet ได้ครบในที่เดียว

> คู่มือกฎ-ข้อจำกัดของระบบต้นทางอยู่ในแอปที่หน้า `/manual` (และสรุปด้านล่าง)

## สถาปัตยกรรม

```
Next.js 16 (App Router, TypeScript, Tailwind)  ──►  Postgres (Neon/Supabase/ฯลฯ)
   │  /api/*  ── proxy + business logic ──►  crystalsports-booking.kegroup.co.th/api_helper.php
   │  /api/cron/fire   ← cron 23:58 ไทย → รอจนถึง 00:00:00.2 → ยิงจอง + retry
   │  /api/cron/tick   ← cron ทุก 5 นาที → เช็คจ่าย QR / catch-up / sync หน้าต่าง
   └─ Web Push (VAPID) + service worker (public/sw.js)
```

โฟลเดอร์สำคัญ

| ที่ | หน้าที่ |
|---|---|
| `src/lib/upstream.ts` | client ของระบบต้นทาง (ทุก action ที่ reverse มาได้ พร้อม type) |
| `src/lib/queue.ts` | ตะกร้า/คิว, ตัวยิงจอง (`fireUserItems`, `fireDue`), poll การจ่าย, learn หน้าต่าง |
| `src/lib/users.ts` | เก็บ session ต้นทาง (เข้ารหัส AES-GCM), sync `maxBookdate` / wallet |
| `src/lib/time.ts` | เวลาไทย, เที่ยงคืนถัดไป, `openAtFor(date, windowDays)` |
| `src/app/api/**` | REST endpoints ที่หน้าเว็บใช้ |
| `src/app/(pages)` | `/login` `/` `/book` `/cart` `/pay/[id]` `/bookings` `/wallet` `/manual` `/settings` |
| `scripts/mock-upstream.mjs` | mock ระบบต้นทางสำหรับ dev/test (OTP = `123456`) |
| `scripts/smoke.sh` | ทดสอบ end-to-end กับ mock |

## Deploy บน Vercel (แนะนำ)

1. **สร้าง Postgres** — ใน Vercel: Storage → Create → Neon (free) แล้วเชื่อมกับโปรเจกต์ จะได้ `DATABASE_URL`
   (หรือใช้ Supabase/Railway/Neon ตรง ๆ ก็ได้ ขอแค่ connection string)
2. **สร้าง secrets**
   ```bash
   openssl rand -hex 32          # → APP_SECRET
   openssl rand -hex 32          # → CRON_SECRET
   npx web-push generate-vapid-keys   # → NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
   ```
3. **ตั้ง Environment Variables** ใน Vercel ตาม `.env.example` (อย่างน้อย `DATABASE_URL`, `APP_SECRET`, `CRON_SECRET`, VAPID 2 ตัว, `VAPID_SUBJECT`)
4. `vercel deploy` (หรือ push ขึ้น GitHub แล้ว import) — `vercel.json` มี cron 2 ตัวอยู่แล้ว
5. **สร้างตารางครั้งแรก**: เปิด `https://<app>/api/admin/migrate?secret=<CRON_SECRET>` → `{"ok":true}`
6. เปิดแอป → login OTP → ⚙️ ตั้งค่า → เปิดการแจ้งเตือน

### เรื่อง cron ที่ต้องรู้

* `vercel.json` ตั้ง `/api/cron/fire` ที่ `58 16 * * *` (UTC) = **23:58 ไทย** และ `/api/cron/tick` วันละครั้ง 00:10 ไทย (Hobby ให้ cron ได้แค่รายวัน — tick ถี่ ๆ ใช้ cron-job.org ด้านล่าง)
  Vercel ส่ง `Authorization: Bearer $CRON_SECRET` ให้เองเมื่อตั้ง env `CRON_SECRET`
* handler `/fire` จะ **รอในตัวเอง** จนถึง 00:00:00 + `FIRE_OFFSET_MS` แล้วยิง จากนั้น retry ทุก 2.5 วิ ถ้าต้นทางยังไม่เปิดหน้าต่าง (สูงสุด `FIRE_RETRY_SECONDS`) — route ตั้ง `maxDuration = 300` จึงต้องเปิด **Fluid Compute** (default ของโปรเจกต์ใหม่) หรืออยู่บน Pro
* ⚠️ **Vercel Hobby**: cron ยิงได้แค่วันละครั้งและ **เวลาไม่แม่น (อาจคลาดได้ถึง ~1 ชม.)** และ cron ทุก 5 นาทีใช้ไม่ได้
  ทางแก้ที่ฟรีและแม่น: ใช้ [cron-job.org](https://cron-job.org) (ตั้งเวลาระดับวินาทีได้) ยิง
  * `GET https://<app>/api/cron/fire?secret=<CRON_SECRET>` ทุกวัน **23:58:30 Asia/Bangkok**
  * `GET https://<app>/api/cron/tick?secret=<CRON_SECRET>` ทุก 5 นาที
  (ตั้ง timeout ของ job ให้ ≥ 5 นาที) — จะใช้ทั้ง Vercel cron และ cron-job.org พร้อมกันก็ได้ ระบบกันซ้ำให้
* ถ้าจะรันเป็น server ปกติ (Railway/Fly/Docker) ก็ได้: `npm run build && npm start` แล้วใช้ crontab/cron-job.org ยิง 2 URL ข้างบนเหมือนกัน

## รัน local

```bash
cp .env.example .env.local   # เติมค่า; ถ้าจะทดสอบกับ mock ให้ตั้ง UPSTREAM_BASE=http://127.0.0.1:4010 และ COOKIE_SECURE=0
node scripts/mock-upstream.mjs &   # mock ต้นทาง (ไม่บังคับ)
npm run dev
# สร้างตาราง: curl "http://localhost:3000/api/admin/migrate?secret=$CRON_SECRET"
# ทดสอบ e2e: B=http://localhost:3000 bash scripts/smoke.sh
```

## กลไกหน้าต่างการจอง (สิ่งที่ค้นพบจากระบบต้นทาง)

* ต้นทางให้แต่ละบัญชีมี `maxBookdate` (จาก `getMemberInfo`) — บัญชีทั่วไป = วันนี้ + 14 วัน (`topupDays: 14`) เลื่อนวันละ 1 วัน
* Server **บล็อกจริง** เมื่อจองเกิน `maxBookdate` (`statusCode 99 "ไม่สามารถทำรายการได้"`) — ทดสอบแล้ว
* มีสมาชิกที่จองได้ไกลกว่านั้น (ช่องถูกจองล่วงหน้า ~30 วัน) — ระบบไม่เดา แต่ **อ่านค่าจริงของแต่ละบัญชี** ทุกครั้งที่ sync
  แล้วคำนวณ `open_at = 00:00 ของ (วันที่จอง − windowDays)` และเก็บ `window_observations` ไว้ดูย้อนหลังที่หน้าตั้งค่า
* ตอนยิง ถ้าต้นทางตอบ 99: เช็ค `getAvailableStadiums` → ถ้าช่อง `reservestatus=1` = โดนแย่ง (failed) / ถ้ายังว่างแต่วันเกิน `maxBookdate` ที่เพิ่ง sync = ยังไม่เปิด → retry (ถ้าเป็นวันถัดจาก maxBookdate พอดี) หรือคำนวณ `open_at` ใหม่ (ถ้าไกลกว่านั้น = เราประมาณผิด)

## API ต้นทางที่ใช้ (สรุป)

`sendOTP` `verifyOTP` `getMemberInfo` `getLocations` `getStadiums` `getStadiumTimePrice` `getAvailableStadiums`
`bookingTransactions` (QR/WALLET) `genQRpayment` `checkQRPayment` `confirmWalletBooking` `adminBookingHistory`
`getHistory` (WAITING) `cancelBooking` `walletTopup` `genQRtopup` `walletHistory`
รายละเอียด payload/response อยู่ใน `src/lib/upstream.ts`

## กฎ/ข้อจำกัดของต้นทางที่ระบบเคารพ (UI จะไม่ให้ทำสิ่งที่ทำไม่ได้)

* OTP 3 ครั้ง/ชม./เบอร์ · OTP อายุ 5 นาที · session ต้นทาง ~90 วัน (เก็บเข้ารหัสใน DB เพื่อจองแทน)
* ราคา 500 บาท/ชม. (ใช้ค่าที่ต้นทางส่ง) · 18 ช่อง 06:00–23:00 · 17 คอร์ท 2 สาขา
* QR ต้องจ่ายใน 15 นาที ไม่งั้น EXPIRED · Wallet ตัดทันที · เติมขั้นต่ำ 100 · ไม่คืนเงินสด
* ยกเลิกได้เฉพาะ SUCCESS + `canCancel=1` + ล่วงหน้า ≥ 24 ชม. + ต้องใส่เหตุผล → คืนเข้า Wallet
* ไม่ทำ: จองเกินหน้าต่าง, จองย้อนหลัง, จองพร้อมโค้ช, บัตร/Alipay/WeChat, ยกเลิกรายการรอชำระ, เปลี่ยนวันเวลา

## ความปลอดภัย

* cookie ต้นทาง (`cs_auth`, `PHPSESSID`) เก็บใน DB แบบเข้ารหัส AES-256-GCM ด้วย `APP_SECRET` — เปลี่ยน `APP_SECRET` = ทุกคนต้อง login ใหม่
* session ของแอปเป็น JWT (HS256) ใน httpOnly cookie · endpoint cron/migrate ต้องมี `CRON_SECRET`
* ระบบไม่เห็น OTP/รหัสบัตร และเรียกต้นทางเท่าที่จำเป็น (memberInfo + 1 call ต่อวันต่อคน ตอนยิง, retry 2.5 วิ ไม่เกิน 4 นาที)
