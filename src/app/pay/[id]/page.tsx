"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Countdown, ErrorBox, Header, QrImage, Spinner } from "@/components/ui";
import { api, baht, fmtThaiDate } from "@/lib/client";
import type { QueueItem } from "@/lib/types";

type Detail = { item: QueueItem & { qr_png: string | null }; group: QueueItem[]; total: number };

export default function PayPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [d, setD] = useState<Detail | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setD(await api<Detail>(`/api/queue/${id}`));
    } catch (e) {
      setMsg((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  // poll สถานะจ่ายทุก 8 วิ ระหว่างรอ
  useEffect(() => {
    if (!d || d.item.status !== "pending_payment") return;
    const t = setInterval(async () => {
      try {
        const r = await api<{ status: string }>(`/api/queue/${id}/check`, { method: "POST" });
        if (r.status !== "pending_payment") load();
      } catch {
        /* ignore */
      }
    }, 8000);
    return () => clearInterval(t);
  }, [d, id, load]);

  const payWallet = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/api/queue/${id}/pay-wallet`, { method: "POST" });
      load();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!d) return msg ? <ErrorBox msg={msg} /> : <Spinner />;
  const it = d.item;

  return (
    <div className="flex flex-col gap-4">
      <Header title="ชำระเงิน" sub={it.booking_ref ? <span className="mono">Ref {it.booking_ref}</span> : undefined} right={<button className="btn btn-ghost text-sm" onClick={() => router.push("/cart")}>← คิว</button>} />

      <div className="card p-3">
        {d.group.map((g) => (
          <div key={g.id} className="flex justify-between text-sm py-1">
            <span>{fmtThaiDate(g.booking_date)} {g.time_name} · {g.stadium_name}</span>
            <span className="mono">{baht(g.amount)}</span>
          </div>
        ))}
        <div className="flex justify-between font-bold border-t pt-2 mt-1" style={{ borderColor: "var(--line)" }}>
          <span>รวม</span>
          <span className="mono">{baht(d.total)}</span>
        </div>
      </div>

      {it.status === "booked_paid" && (
        <div className="card p-6 text-center" style={{ borderColor: "var(--ok)" }}>
          <div className="text-4xl">✅</div>
          <div className="font-bold mt-2" style={{ color: "var(--ok)" }}>จองสำเร็จ ชำระเงินแล้ว</div>
          <Link href="/bookings" className="btn btn-ghost mt-4 text-sm">ดูรายการจอง</Link>
        </div>
      )}

      {it.status === "pending_payment" && it.payment_type === "QR" && (
        <div className="card p-4 flex flex-col items-center gap-3">
          <div className="text-center">
            <div className="text-sm muted">สแกนจ่ายภายใน</div>
            <div className="text-3xl font-bold" style={{ color: "var(--danger)" }}>
              {it.qr_expires_at ? <Countdown to={it.qr_expires_at} done="หมดเวลา" /> : "15:00"}
            </div>
            <div className="text-xs muted">ถ้าเลยเวลา ต้นทางจะยกเลิกรายการและปล่อยช่องให้คนอื่น</div>
          </div>
          {it.qr_png ? <QrImage png={it.qr_png} /> : <ErrorBox msg="ไม่มีรูป QR (ต้นทางสร้างไม่สำเร็จ) — ไปจ่ายที่หน้า 'รายการรอชำระ' ของเว็บต้นทางได้" />}
          <div className="text-xs muted text-center">เปิดแอปธนาคาร → สแกน QR → หน้านี้จะอัปเดตเองเมื่อจ่ายสำเร็จ</div>
          <button className="btn btn-ghost text-sm" onClick={async () => { const r = await api<{ status: string }>(`/api/queue/${id}/check`, { method: "POST" }); if (r.status !== "pending_payment") load(); else setMsg("ยังไม่พบการชำระ"); }}>
            เช็คสถานะตอนนี้
          </button>
        </div>
      )}

      {it.status === "pending_payment" && it.payment_type === "WALLET" && (
        <div className="card p-4 flex flex-col gap-3">
          <div className="text-sm">
            ต้นทางรับจองไว้แล้วแต่ยอด Wallet ไม่พอ — <Link href="/wallet" className="underline" style={{ color: "var(--accent)" }}>เติมเงิน</Link> ให้พอ {baht(d.total)} แล้วกดชำระ
          </div>
          <button className="btn btn-primary" disabled={busy} onClick={payWallet}>👛 ชำระด้วย Wallet</button>
        </div>
      )}

      {["expired", "failed", "cancelled"].includes(it.status) && (
        <div className="card p-4 text-center" style={{ borderColor: "var(--danger)" }}>
          <div className="font-bold" style={{ color: "var(--danger)" }}>รายการนี้{it.status === "expired" ? "หมดอายุ" : "ไม่สำเร็จ"}</div>
          <div className="text-sm muted mt-1">{it.last_error}</div>
          <Link href="/book" className="btn btn-ghost mt-3 text-sm">จองใหม่</Link>
        </div>
      )}

      <ErrorBox msg={msg} />
    </div>
  );
}
