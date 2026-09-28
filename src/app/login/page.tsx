"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/client";
import { ErrorBox } from "@/components/ui";

function LoginInner() {
  const router = useRouter();
  const q = useSearchParams();
  const reason = q.get("reason");
  const next = q.get("next") || "/";
  const [mobile, setMobile] = useState("");
  const [state, setState] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [regUrl, setRegUrl] = useState<string | null>(null);

  const sendOtp = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ state: string }>("/api/auth/otp/send", { method: "POST", json: { mobile } });
      setState(r.state);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api("/api/auth/otp/verify", { method: "POST", json: { state, pin } });
      router.replace(next);
    } catch (e) {
      const ae = e as ApiError;
      setErr(ae.message);
      if (ae.code === "not_registered") setRegUrl(ae.extra?.registerUrl as string);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-5 pt-14 pb-10 flex flex-col gap-5">
      <div className="text-center">
        <div className="text-5xl">🎾</div>
        <h1 className="text-2xl font-bold mt-2">CBooking</h1>
        <p className="muted text-sm mt-1">จองคอร์ท Crystal Sports ล่วงหน้า ไม่ต้องตื่นมาแย่งตอนเที่ยงคืน</p>
      </div>

      {reason === "upstream_expired" && (
        <div className="card p-3 text-sm" style={{ borderColor: "var(--warn)" }}>
          session ของระบบจองต้นทางหมดอายุ (อยู่ได้ ~90 วัน) กรุณายืนยัน OTP ใหม่ — คิวที่ตั้งไว้ยังอยู่ครบ
        </div>
      )}

      <div className="card p-4 flex flex-col gap-3">
        <p className="text-sm muted">
          ใช้เบอร์เดียวกับที่สมัครสมาชิก Crystal Sports — ระบบจะส่ง OTP ทาง SMS จากระบบต้นทาง
          (ขอได้สูงสุด <b>3 ครั้ง/ชั่วโมง</b> ต่อเบอร์)
        </p>
        {!state ? (
          <>
            <input
              className="input mono text-lg tracking-widest"
              inputMode="numeric"
              placeholder="08xxxxxxxx"
              value={mobile}
              maxLength={10}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
            />
            <button className="btn btn-primary" disabled={mobile.length !== 10 || busy} onClick={sendOtp}>
              {busy ? "กำลังขอ OTP…" : "ขอรหัส OTP"}
            </button>
          </>
        ) : (
          <>
            <div className="text-sm">
              ส่ง OTP ไปที่ <b className="mono">{mobile}</b> แล้ว (มีอายุ 5 นาที)
            </div>
            <input
              className="input mono text-2xl tracking-[.5em] text-center"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="••••••"
              value={pin}
              maxLength={6}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <button className="btn btn-primary" disabled={pin.length !== 6 || busy} onClick={verify}>
              {busy ? "กำลังตรวจสอบ…" : "ยืนยัน OTP"}
            </button>
            <button className="btn btn-ghost text-sm" onClick={() => { setState(null); setPin(""); }}>
              เปลี่ยนเบอร์ / ขอใหม่
            </button>
          </>
        )}
        <ErrorBox msg={err} />
        {regUrl && (
          <a className="btn btn-ghost" href={regUrl} target="_blank" rel="noreferrer">
            ไปสมัครสมาชิกที่เว็บต้นทาง ↗
          </a>
        )}
      </div>

      <p className="muted text-xs text-center leading-relaxed">
        ระบบนี้เป็นตัวช่วยจองส่วนตัว ไม่ใช่ของ Crystal Sports / KE Group — เราเก็บ session ของคุณเพื่อจองแทนตามคิวที่คุณตั้ง
        ไม่เห็นรหัส OTP หรือข้อมูลบัตรใด ๆ
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
