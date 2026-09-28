"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Countdown, ErrorBox, Header, Spinner, useMe } from "@/components/ui";
import { api, baht, fmtThaiDate, STATUS_TH } from "@/lib/client";
import type { QueueItem } from "@/lib/types";


function CartInner() {
  const q = useSearchParams();
  const { me } = useMe();
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(q.get("fired") ? "ส่งคำขอจองรายการที่เปิดแล้ว — ดูสถานะด้านล่าง" : null);
  const [msgKind, setMsgKind] = useState<"error" | "info">("info");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await api<{ items: QueueItem[] }>("/api/queue");
      setItems(r.items);
    } catch (e) {
      setMsg((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const remove = async (id: number) => {
    if (!confirm("เอารายการนี้ออกจากคิว?")) return;
    await api(`/api/queue/${id}`, { method: "DELETE" });
    load();
  };
  const fireNow = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ outcome: { ok: number; pendingQr: number; pendingWallet: number; failed: number; notOpen: number } }>("/api/queue/fire-now", { method: "POST", json: {} });
      const o = r.outcome;
      setMsgKind("info");
      setMsg(`ผล: สำเร็จ ${o.ok} · รอจ่าย QR ${o.pendingQr} · รอเติม Wallet ${o.pendingWallet} · ไม่สำเร็จ ${o.failed} · ยังไม่เปิด ${o.notOpen}`);
      load();
    } catch (e) {
      setMsgKind("error");
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!items || !me) return <Spinner />;

  const live = items.filter((i) => ["queued", "firing", "pending_payment"].includes(i.status));
  const done = items.filter((i) => !["queued", "firing", "pending_payment"].includes(i.status));
  const openNow = live.filter((i) => i.status === "queued" && i.open_at && new Date(i.open_at).getTime() <= now);
  const total = live.filter((i) => i.status !== "pending_payment").reduce((s, i) => s + Number(i.amount), 0);

  const Row = ({ i }: { i: QueueItem }) => {
    const st = STATUS_TH[i.status];
    const opened = i.open_at ? new Date(i.open_at).getTime() <= now : false;
    return (
      <div className="card p-3 flex flex-col gap-1.5">
        <div className="flex justify-between items-start gap-2">
          <div>
            <div className="font-semibold">
              {fmtThaiDate(i.booking_date)} · {i.time_name}
            </div>
            <div className="text-xs muted">{i.loc_name} · {i.stadium_name} · {baht(i.amount)}</div>
          </div>
          <span className={`badge ${st.cls}`}>{st.label}</span>
        </div>

        {i.status === "queued" && i.open_at && (
          <div className="text-sm flex items-center justify-between">
            <span className="muted">{opened ? "ถึงเวลาแล้ว รอระบบยิง/กดจองเลย" : "จะจองให้ใน"}</span>
            <b style={{ color: opened ? "var(--accent)" : "var(--warn)" }}>
              <Countdown to={i.open_at} done="พร้อมจอง" />
            </b>
          </div>
        )}
        {i.status === "pending_payment" && (
          <Link href={`/pay/${i.id}`} className="btn btn-primary text-sm">
            {i.payment_type === "QR" ? (
              <>💳 สแกนจ่าย — เหลือ {i.qr_expires_at && <Countdown to={i.qr_expires_at} done="หมดเวลา" />}</>
            ) : (
              "👛 เติมเงินแล้วชำระด้วย Wallet"
            )}
          </Link>
        )}
        {i.last_error && i.status !== "booked_paid" && <div className="text-xs" style={{ color: "var(--danger)" }}>{i.last_error}</div>}
        {i.booking_ref && <div className="text-[11px] muted mono">Ref {i.booking_ref}</div>}
        {["queued", "failed", "expired", "pending_payment"].includes(i.status) && (
          <button className="text-xs self-end muted underline" onClick={() => remove(i.id)}>เอาออก</button>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Header title="ตะกร้า / คิวจอง" sub={`${live.length} รายการที่รอ · รวม ${baht(total)}`} right={<Link href="/book" className="btn btn-ghost text-sm">+ เพิ่ม</Link>} />
      <ErrorBox msg={msg} kind={msgKind} />

      <div className="card p-3 text-xs muted leading-relaxed">
        รายการที่ <b>ยังไม่เปิด</b> จะถูกยิงจองอัตโนมัติตอนเที่ยงคืนของวันที่หน้าต่างเปิด (นับถอยหลังด้านล่าง) — จ่ายด้วย
        Wallet ก่อนถ้ายอดพอ ({baht(me.walletBalance)}) ไม่พอจะออก QR แล้วแจ้งเตือนให้มาสแกนภายใน 15 นาที
      </div>

      {openNow.length > 0 && (
        <button className="btn btn-primary" disabled={busy} onClick={fireNow}>
          ⚡ จองเลย {openNow.length} รายการที่เปิดแล้ว
        </button>
      )}

      {live.length === 0 && <div className="muted text-center py-6">ยังไม่มีรายการในคิว</div>}
      {live.map((i) => <Row key={i.id} i={i} />)}

      {done.length > 0 && (
        <>
          <h2 className="font-semibold mt-2 muted text-sm">ประวัติในระบบนี้</h2>
          {done.slice(0, 30).map((i) => <Row key={i.id} i={i} />)}
        </>
      )}
    </div>
  );
}

export default function CartPage() {
  return (
    <Suspense>
      <CartInner />
    </Suspense>
  );
}
