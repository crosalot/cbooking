"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";

export type Me = {
  id: number;
  mobile: string;
  name: string | null;
  nickName: string | null;
  walletBalance: number;
  maxBookdate: string | null;
  windowDays: number;
  today: string;
  lastSyncedAt: string | null;
  cookieExpiresAt: string | null;
  observations: { observed_at: string; today_bkk: string; max_bookdate: string; window_days: number }[];
  pushSubscriptions: number;
  vapidPublicKey: string;
};

export function useMe(fresh = false) {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = async (f = fresh) => {
    try {
      setMe(await api<Me>(`/api/me${f ? "?fresh=1" : ""}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { me, error, reload };
}

/** นับถอยหลังถึงเวลาที่กำหนด (แสดง วัน ชม. นาที วิ) */
export function Countdown({ to, done = "ถึงเวลาแล้ว" }: { to: string | Date; done?: string }) {
  const target = typeof to === "string" ? new Date(to).getTime() : to.getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = target - now;
  if (ms <= 0) return <span className="mono">{done}</span>;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className="mono">
      {d > 0 && <>{d} วัน </>}
      {pad(h)}:{pad(m)}:{pad(sec)}
    </span>
  );
}

export function QrImage({ png, size = 260 }: { png: string; size?: number }) {
  const src = `data:image/png;base64,${png}`;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="bg-white p-3 rounded-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="QR ชำระเงิน" width={size} height={size} style={{ width: size, height: size }} />
      </div>
      <a href={src} download="qr-payment.png" className="btn btn-ghost text-sm">
        ⬇️ บันทึกรูป QR
      </a>
    </div>
  );
}

export function Spinner({ label = "กำลังโหลด…" }: { label?: string }) {
  return <div className="muted text-center py-8 pulse">{label}</div>;
}

export function ErrorBox({ msg, kind = "error" }: { msg: string | null; kind?: "error" | "info" }) {
  if (!msg) return null;
  const color = kind === "error" ? "var(--danger)" : "var(--accent)";
  return (
    <div className="card p-3 text-sm" style={{ borderColor: color, color }}>
      {msg}
    </div>
  );
}

export function Header({ title, sub, right }: { title: string; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h1 className="text-xl font-bold">{title}</h1>
        {sub && <div className="muted text-sm mt-0.5">{sub}</div>}
      </div>
      {right}
    </div>
  );
}
