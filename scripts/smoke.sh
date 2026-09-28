#!/usr/bin/env bash
# Smoke test แบบ end-to-end กับ mock upstream (scripts/mock-upstream.mjs) — ใช้ตอน dev
set -u
B=${B:-http://localhost:3005}; M=${M:-http://127.0.0.1:4010}; J=/tmp/cj.txt; rm -f $J
py() { python3 -c "import sys,json;d=json.load(sys.stdin);$1"; }
D=$(date -u -d '+7 hours' +%F); D3=$(date -u -d '+7 hours +3 days' +%F); D15=$(date -u -d '+7 hours +15 days' +%F); D20=$(date -u -d '+7 hours +20 days' +%F)

echo "== login"
STATE=$(curl -s -c $J -b $J -X POST $B/api/auth/otp/send -H 'content-type: application/json' -d '{"mobile":"0805088183"}' | py 'print(d["state"])')
curl -s -c $J -b $J -X POST $B/api/auth/otp/verify -H 'content-type: application/json' -d "{\"state\":\"$STATE\",\"pin\":\"123456\"}"; echo
echo "== me"; curl -s -b $J $B/api/me | py 'print(d["mobile"],d["walletBalance"],d["maxBookdate"],d["windowDays"])'
echo "== availability $D20 (closed day, some reserved by others)"; curl -s -b $J "$B/api/availability?date=$D20&stadiumId=1&locId=LOC001" | py 'print("openNow",d["openNow"],[ (s["timeName"],s["reserved"]) for s in d["slots"][:6]])'
item() { echo "{\"locId\":\"LOC001\",\"locName\":\"Crystal Sports\",\"stadiumId\":\"1\",\"stadiumName\":\"North-1\",\"stadiumtimeId\":\"$1\",\"timeName\":\"$2\",\"bookingDate\":\"$3\",\"amount\":\"500.00\"}"; }
echo "== add: $D3 x2 (open→QR since wallet=0) + $D15 x1 (closed→queued), bookNow"
curl -s -b $J -X POST $B/api/queue -H 'content-type: application/json' -d "{\"bookNow\":true,\"items\":[$(item 101 06:00 $D3),$(item 102 07:00 $D3),$(item 103 08:00 $D15)]}" \
 | py 'print("fired",d["fired"]); [print(" ",i["id"],i["booking_date"],i["time_name"],i["status"],i["payment_type"],"qr" if i["hasQr"] else "-",i["open_at"],i["last_error"] or "") for i in d["items"]]'
PAYREF=$(curl -s "$M/__state" | py 'print([b for b in d["bookings"] if b["status"]=="WAITING"][0]["paymentRef"])')
QID=$(curl -s -b $J $B/api/queue | py 'print([i for i in d["items"] if i["status"]=="pending_payment"][0]["id"])')
echo "== pay page detail id=$QID"; curl -s -b $J $B/api/queue/$QID | py 'print("total",d["total"],"group",len(d["group"]),"qr",bool(d["item"]["qr_png"]))'
echo "== simulate scan pay $PAYREF"; curl -s -X POST $M/__pay -H 'content-type: application/json' -d "{\"referenceNo\":\"$PAYREF\"}"; echo
echo "== check"; curl -s -b $J -X POST $B/api/queue/$QID/check; echo
echo "== bookings (upstream)"; curl -s -b $J $B/api/bookings | py 'print([(h["bookingDate"],h["timeName"],h["transactionStatus"],h["canCancelNow"]) for h in d["history"]])'
echo "== topup 1000"; TOP=$(curl -s -b $J -X POST $B/api/wallet/topup -H 'content-type: application/json' -d '{"amount":1000}'); echo "$TOP" | py 'print(d["reference"],d["amount"],"qr",bool(d["qrPng"]))'
REF=$(echo "$TOP" | py 'print(d["reference"])'); curl -s -X POST $M/__pay -H 'content-type: application/json' -d "{\"referenceNo\":\"$REF\"}" >/dev/null
curl -s -b $J -X POST $B/api/wallet/topup/check -H 'content-type: application/json' -d "{\"reference\":\"$REF\"}"; echo
echo "== cron tick (nothing due yet)"; curl -s "$B/api/cron/tick?secret=testsecret"; echo
echo "== roll upstream window (+1 day) so $D15 opens, then fire?wait=0"
curl -s -X POST $M/__roll >/dev/null
# บังคับให้ open_at ของรายการ D15 เป็น 'ตอนนี้' (จำลองว่าเที่ยงคืนมาถึงแล้ว)
psql -h /tmp/pg -p 5433 -U postgres -d cbooking -qc "update queue_items set open_at = now() where status='queued'"
curl -s "$B/api/cron/fire?secret=testsecret&wait=0"; echo
curl -s -b $J $B/api/queue | py '[print(" ",i["id"],i["booking_date"],i["time_name"],i["status"],i["payment_type"],i["last_error"] or "") for i in d["items"]]'
echo "== me after wallet booking"; curl -s -b $J "$B/api/me?fresh=1" | py 'print("wallet",d["walletBalance"],"maxBookdate",d["maxBookdate"],"windowDays",d["windowDays"],"obs",len(d["observations"]))'
echo "== cancel first SUCCESS booking"; ROW=$(curl -s -b $J $B/api/bookings | py 'r=[h for h in d["history"] if h["canCancelNow"]][0];print(r["bookingRef"],r["bookingDetailId"])'); set -- $ROW
curl -s -b $J -X POST $B/api/bookings/cancel -H 'content-type: application/json' -d "{\"bookingRef\":\"$1\",\"bookingDetailId\":\"$2\",\"remark\":\"ทดสอบ\"}"; echo
echo "== not-open case: queue $D20 and fire now → should stay queued (not open) and recompute open_at"
curl -s -b $J -X POST $B/api/queue -H 'content-type: application/json' -d "{\"items\":[$(item 104 09:00 $D20)]}" >/dev/null
psql -h /tmp/pg -p 5433 -U postgres -d cbooking -qc "update queue_items set open_at = now() where status='queued' and booking_date='$D20'"
curl -s "$B/api/cron/fire?secret=testsecret&wait=0"; echo
curl -s -b $J $B/api/queue | py '[print(" ",i["id"],i["booking_date"],i["time_name"],i["status"],i["open_at"],i["last_error"] or "") for i in d["items"] if i["status"]=="queued"]'
echo "== fire_runs"; psql -h /tmp/pg -p 5433 -U postgres -d cbooking -c "select kind, items_total, items_ok, note from fire_runs order by id"
