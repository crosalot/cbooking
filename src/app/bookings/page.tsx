"use client";

import { useCallback, useEffect, useState } from "react";
import { Countdown, ErrorBox, Header, QrImage, Spinner } from "@/components/ui";
import { api, baht, fmtThaiDate } from "@/lib/client";

type Row = {
  bookingRef: string;
  bookingDetailId: number;
  bookingDate: string;
  stadiumName: string;
  timeName: string;
  transactionCode: string;
  paymentType: string;
  paymentReferenceNo: string;
  transactionAmount: number;
  transactionStatus: string;
  canCancel: "0" | "1";
  canCancelNow: boolean;
  hoursLeft: number;
};
type Waiting = {
  bookingRef: string;
  paymentType: string;
  paymentStatus: string;
  amount: number | string;
  paymentReferenceNo: string;
  transaction: { bookingDate: string; stadiumName?: string; timeName?: string; transactionAmount: number }[];
};

const inMinutes = (m: number) => new Date(Date.now() + m * 60_000);
const BADGE: Record<string, string> = { SUCCESS: "badge-ok", WAITING: "badge-warn", CANCEL: "badge-muted", EXPIRED: "badge-muted" };

export default function BookingsPage() {
  const [data, setData] = useState<{ history: Row[]; waiting: Waiting[] } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<"upcoming" | "all">("upcoming");
  const [cancelRow, setCancelRow] = useState<Row | null>(null);
  const [remark, setRemark] = useState("");
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<{ ref: string; png: string; amount: string; exp: Date } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api("/api/bookings"));
    } catch (e) {
      setMsg((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const doCancel = async () => {
    if (!cancelRow) return;
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/bookings/cancel", { method: "POST", json: { bookingRef: cancelRow.bookingRef, bookingDetailId: cancelRow.bookingDetailId, remark } });
      setCancelRow(null);
      setRemark("");
      setMsg("ยกเลิกสำเร็จ — เงินจะคืนเข้า Wallet ตามเงื่อนไขของสนาม");
      load();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const payQr = async (w: Waiting) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ paid: boolean; qrPng?: string; amount?: string }>("/api/bookings/pay-qr", { method: "POST", json: { bookingRef: w.bookingRef, paymentRef: w.paymentReferenceNo, amount: w.amount } });
      if (r.paid) {
        setMsg("รายการนี้จ่ายแล้ว");
        load();
      } else setQr({ ref: w.paymentReferenceNo, png: r.qrPng!, amount: r.amount!, exp: inMinutes(15) });
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return msg ? <ErrorBox msg={msg} /> : <Spinner />;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
  const rows = data.history
    .filter((r) => (filter === "all" ? true : r.bookingDate >= today && r.transactionStatus === "SUCCESS"))
    .sort((a, b) => (filter === "all" ? b.bookingDate.localeCompare(a.bookingDate) : a.bookingDate.localeCompare(b.bookingDate)) || a.timeName.localeCompare(b.timeName));

  return (
    <div className="flex flex-col gap-4">
      <Header title="รายการจอง" sub="ข้อมูลจริงจากระบบต้นทาง" right={<button className="btn btn-ghost text-sm" onClick={load}>↻</button>} />
      <ErrorBox msg={msg} />

      {data.waiting.length > 0 && (
        <div className="card p-3" style={{ borderColor: "var(--danger)" }}>
          <div className="font-semibold mb-2" style={{ color: "var(--danger)" }}>รอชำระที่ต้นทาง ({data.waiting.length})</div>
          {data.waiting.map((w) => (
            <div key={w.bookingRef} className="flex justify-between items-center text-sm py-1.5 border-t" style={{ borderColor: "var(--line)" }}>
              <div>
                <div className="mono text-xs muted">{w.bookingRef} · {w.paymentType}</div>
                <div>{w.transaction.map((t) => `${fmtThaiDate(t.bookingDate.slice(0, 10))} ${t.timeName ?? ""}`).join(", ")}</div>
              </div>
              {w.paymentType === "QR" ? (
                <button className="btn btn-primary text-xs" disabled={busy} onClick={() => payQr(w)}>QR {baht(w.amount)}</button>
              ) : (
                <span className="badge badge-warn">{w.paymentType}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {qr && (
        <div className="card p-4 flex flex-col items-center gap-2">
          <div className="text-sm">จ่าย {baht(qr.amount)} ภายใน <b style={{ color: "var(--danger)" }}><Countdown to={qr.exp} /></b></div>
          <QrImage png={qr.png} />
          <button className="btn btn-ghost text-sm" onClick={() => { setQr(null); load(); }}>ปิด / จ่ายแล้ว</button>
        </div>
      )}

      <div className="flex gap-2">
        <button className={`btn flex-1 text-sm ${filter === "upcoming" ? "btn-primary" : "btn-ghost"}`} onClick={() => setFilter("upcoming")}>ที่จะถึง</button>
        <button className={`btn flex-1 text-sm ${filter === "all" ? "btn-primary" : "btn-ghost"}`} onClick={() => setFilter("all")}>ทั้งหมด</button>
      </div>

      {rows.length === 0 && <div className="muted text-center py-6">ไม่มีรายการ</div>}
      {rows.map((r) => (
        <div key={`${r.bookingRef}-${r.bookingDetailId}`} className="card p-3 flex justify-between items-center gap-2">
          <div>
            <div className="font-semibold">{fmtThaiDate(r.bookingDate)} · {r.timeName}</div>
            <div className="text-xs muted">{r.stadiumName} · {r.paymentType} · {baht(r.transactionAmount)}</div>
            <div className="text-[11px] muted mono">{r.bookingRef}</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={`badge ${BADGE[r.transactionStatus] ?? "badge-muted"}`}>{r.transactionStatus}</span>
            {r.transactionStatus === "SUCCESS" && r.bookingDate >= today && (
              r.canCancelNow ? (
                <button className="btn btn-danger text-xs py-1 px-2" onClick={() => setCancelRow(r)}>ยกเลิก</button>
              ) : (
                <span className="text-[10px] muted text-right">ยกเลิกไม่ได้<br />{r.hoursLeft < 24 ? "(น้อยกว่า 24 ชม.)" : "(ต้นทางไม่อนุญาต)"}</span>
              )
            )}
          </div>
        </div>
      ))}

      {cancelRow && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50" onClick={() => setCancelRow(null)}>
          <div className="card p-4 w-full max-w-md m-3 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <div className="font-bold">ยกเลิก {fmtThaiDate(cancelRow.bookingDate)} {cancelRow.timeName} · {cancelRow.stadiumName}?</div>
            <div className="text-xs muted">ต้นทางกำหนดให้ระบุเหตุผล และคืนเงินเข้า Wallet เท่านั้น (ไม่คืนเป็นเงินสด)</div>
            <input className="input" placeholder="เหตุผลการยกเลิก *" value={remark} onChange={(e) => setRemark(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <button className="btn btn-ghost" onClick={() => setCancelRow(null)}>กลับ</button>
              <button className="btn btn-danger" disabled={!remark.trim() || busy} onClick={doCancel}>ยืนยันยกเลิก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
