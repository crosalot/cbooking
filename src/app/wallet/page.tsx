"use client";

import { useCallback, useEffect, useState } from "react";
import { Countdown, ErrorBox, Header, QrImage, Spinner } from "@/components/ui";
import { api, baht } from "@/lib/client";

type WalletData = { balance: number; history: { status: string; amount: number | string; reference: string; paymentType: string; [k: string]: unknown }[] };

export default function WalletPage() {
  const [w, setW] = useState<WalletData | null>(null);
  const [amount, setAmount] = useState(500);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [qr, setQr] = useState<{ reference: string; amount: string; qrPng: string; expiresAt: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setW(await api<WalletData>("/api/wallet"));
    } catch (e) {
      setMsg((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // poll ตอนมี QR เติมเงินค้างอยู่
  useEffect(() => {
    if (!qr) return;
    const t = setInterval(async () => {
      try {
        const r = await api<{ paid: boolean; balance?: number }>("/api/wallet/topup/check", { method: "POST", json: { reference: qr.reference } });
        if (r.paid) {
          setQr(null);
          setMsg(`เติมเงินสำเร็จ ยอดใหม่ ${baht(r.balance ?? 0)}`);
          load();
        }
      } catch {
        /* ignore */
      }
    }, 8000);
    return () => clearInterval(t);
  }, [qr, load]);

  const topup = async () => {
    if (amount < 100) return setMsg("ยอดเติมขั้นต่ำ 100 บาท");
    if (!confirm(`ยืนยันเติมเงิน ${baht(amount)} ?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      setQr(await api("/api/wallet/topup", { method: "POST", json: { amount } }));
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!w) return msg ? <ErrorBox msg={msg} /> : <Spinner />;

  return (
    <div className="flex flex-col gap-4">
      <Header title="Wallet" sub="ยอดเงินในระบบต้นทาง" right={<button className="btn btn-ghost text-sm" onClick={load}>↻</button>} />
      <div className="card p-5 text-center">
        <div className="muted text-xs">ยอดคงเหลือ</div>
        <div className="text-4xl font-bold mono" style={{ color: "var(--accent)" }}>{baht(w.balance)}</div>
        <div className="text-xs muted mt-2">มีเงินใน Wallet พอ = ตอนคิวถึงเวลา ระบบตัดเงินจองให้ทันที ไม่ต้องตื่นมาสแกน QR</div>
      </div>
      <ErrorBox msg={msg} />

      {qr ? (
        <div className="card p-4 flex flex-col items-center gap-3">
          <div className="text-sm">สแกนจ่าย <b>{baht(qr.amount)}</b> ภายใน <b style={{ color: "var(--danger)" }}><Countdown to={qr.expiresAt} done="หมดเวลา" /></b></div>
          <QrImage png={qr.qrPng} />
          <div className="text-xs muted mono">Ref {qr.reference}</div>
          <button className="btn btn-ghost text-sm" onClick={() => { setQr(null); load(); }}>ปิด</button>
        </div>
      ) : (
        <div className="card p-4 flex flex-col gap-3">
          <div className="font-semibold">เติมเงิน (QR PromptPay)</div>
          <div className="text-xs muted">ขั้นต่ำ 100 บาท · จ่ายภายใน 15 นาที · ต้นทางไม่คืนเงินสดทุกกรณี (ใช้จองได้อย่างเดียว)</div>
          <input className="input mono text-2xl text-center" inputMode="numeric" value={amount} onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, "")) || 0)} />
          <div className="grid grid-cols-4 gap-2">
            {[500, 1000, 2000, 5000].map((v) => (
              <button key={v} className="btn btn-ghost text-sm" onClick={() => setAmount(v)}>{v.toLocaleString()}</button>
            ))}
          </div>
          <button className="btn btn-primary" disabled={busy || amount < 100} onClick={topup}>สร้าง QR เติมเงิน {baht(amount)}</button>
        </div>
      )}

      {w.history.length > 0 && (
        <div className="card p-3">
          <div className="font-semibold text-sm mb-2">ประวัติการเติม</div>
          {w.history.slice(0, 20).map((h, i) => (
            <div key={i} className="flex justify-between text-sm py-1 border-t" style={{ borderColor: "var(--line)" }}>
              <span className="mono text-xs muted">{h.reference} · {h.paymentType}</span>
              <span>
                {baht(h.amount)} <span className={`badge ${h.status === "SUCCESS" ? "badge-ok" : h.status === "WAITING" ? "badge-warn" : "badge-muted"}`}>{h.status}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
