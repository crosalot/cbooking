"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Countdown, ErrorBox, Header, Spinner, useMe } from "@/components/ui";
import { api, baht, fmtThaiDate, STATUS_TH } from "@/lib/client";
import type { QueueItem } from "@/lib/types";

export default function HomePage() {
  const { me, error } = useMe();
  const [items, setItems] = useState<QueueItem[] | null>(null);
  useEffect(() => {
    api<{ items: QueueItem[] }>("/api/queue").then((r) => setItems(r.items)).catch(() => setItems([]));
  }, []);

  if (error) return <ErrorBox msg={error} />;
  if (!me) return <Spinner />;

  const nextMidnight = (() => {
    const now = new Date();
    const bkk = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
    const offset = now.getTime() - bkk.getTime();
    const m = new Date(bkk.getFullYear(), bkk.getMonth(), bkk.getDate() + 1, 0, 0, 0);
    return new Date(m.getTime() + offset);
  })();

  const queued = (items ?? []).filter((i) => i.status === "queued");
  const pending = (items ?? []).filter((i) => i.status === "pending_payment");
  const nextOpen = queued.filter((i) => i.open_at).sort((a, b) => a.open_at!.localeCompare(b.open_at!))[0];

  return (
    <div className="flex flex-col gap-4">
      <Header
        title={`สวัสดี ${me.nickName || me.name || me.mobile}`}
        sub={<span className="mono">{me.mobile}</span>}
        right={<Link href="/settings" className="btn btn-ghost text-sm">⚙️</Link>}
      />

      {pending.length > 0 && (
        <Link href={`/pay/${pending[0].id}`} className="card p-4 block" style={{ borderColor: "var(--danger)" }}>
          <div className="font-bold" style={{ color: "var(--danger)" }}>💳 มี {pending.length} รายการรอชำระเงิน</div>
          <div className="text-sm muted mt-1">
            {pending[0].payment_type === "QR" ? "สแกน QR ภายใน 15 นาที ไม่งั้นช่องจะหลุด" : "เติม Wallet แล้วกดชำระ"} → แตะเพื่อไปจ่าย
          </div>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <div className="muted text-xs">Wallet</div>
          <div className="text-2xl font-bold mono">{baht(me.walletBalance)}</div>
          <Link href="/wallet" className="text-xs" style={{ color: "var(--accent)" }}>เติมเงิน →</Link>
        </div>
        <div className="card p-4">
          <div className="muted text-xs">จองล่วงหน้าได้ถึง</div>
          <div className="text-lg font-bold">{me.maxBookdate ? fmtThaiDate(me.maxBookdate) : "-"}</div>
          <div className="text-xs muted">หน้าต่าง {me.windowDays} วัน</div>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex justify-between items-center">
          <div className="font-semibold">🕛 หน้าต่างเลื่อนครั้งถัดไป</div>
          <div className="text-lg font-bold" style={{ color: "var(--accent)" }}><Countdown to={nextMidnight} /></div>
        </div>
        <div className="text-xs muted mt-1">
          ทุกเที่ยงคืน ระบบต้นทางจะเปิดให้จองเพิ่มอีก 1 วัน — คิวของคุณจะถูกยิงอัตโนมัติทันทีที่เปิด
        </div>
      </div>

      <div className="card p-4">
        <div className="flex justify-between items-center mb-2">
          <div className="font-semibold">🧺 คิวที่รออยู่ ({queued.length})</div>
          <Link href="/cart" className="text-sm" style={{ color: "var(--accent)" }}>ดูทั้งหมด →</Link>
        </div>
        {items === null ? (
          <Spinner />
        ) : queued.length === 0 ? (
          <div className="muted text-sm">
            ยังไม่มีคิว — <Link href="/book" className="underline">ไปเลือกวัน/เวลาที่อยากจอง</Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {queued.slice(0, 5).map((i) => (
              <li key={i.id} className="flex justify-between text-sm">
                <span>{fmtThaiDate(i.booking_date)} {i.time_name} · {i.stadium_name}</span>
                <span className={`badge ${STATUS_TH[i.status].cls}`}>
                  {i.open_at ? <Countdown to={i.open_at} done="ถึงเวลา" /> : STATUS_TH[i.status].label}
                </span>
              </li>
            ))}
          </ul>
        )}
        {nextOpen && (
          <div className="text-xs muted mt-2">
            คิวถัดไปจะจองตอน {new Date(nextOpen.open_at!).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/book" className="btn btn-primary">🎾 จองคอร์ท</Link>
        <Link href="/manual" className="btn btn-ghost">📖 คู่มือ / กฎ</Link>
      </div>
    </div>
  );
}
