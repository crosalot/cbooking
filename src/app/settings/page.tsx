"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorBox, Header, Spinner, useMe } from "@/components/ui";
import { api, fmtThaiDate } from "@/lib/client";

function b64ToU8(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function SettingsPage() {
  const router = useRouter();
  const { me, reload } = useMe();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isIos = typeof navigator !== "undefined" && /iPhone|iPad/.test(navigator.userAgent);
  const standalone = typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);

  useEffect(() => {
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(ok);
    if (ok) navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then((s) => setSubscribed(!!s));
  }, []);

  const enable = async () => {
    if (!me?.vapidPublicKey) return setMsg("เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า VAPID key (ดู README)");
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("ไม่ได้รับอนุญาตให้แจ้งเตือน");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(me.vapidPublicKey) });
      await api("/api/push", { method: "POST", json: sub.toJSON() });
      setSubscribed(true);
      await reload(true);
      setMsg("เปิดการแจ้งเตือนแล้ว — กดปุ่มทดสอบได้");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const disable = async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await api("/api/push", { method: "DELETE", json: { endpoint: sub.endpoint } });
      await sub.unsubscribe();
    }
    setSubscribed(false);
    reload(true);
  };
  const test = async () => {
    const r = await api<{ sent?: number; skipped?: string }>("/api/push", { method: "PUT" });
    setMsg(r.skipped ? `ส่งไม่ได้: ${r.skipped}` : `ส่งแล้ว ${r.sent} อุปกรณ์`);
  };
  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  };

  if (!me) return <Spinner />;

  return (
    <div className="flex flex-col gap-4">
      <Header title="ตั้งค่า" />
      <div className="card p-4 text-sm flex flex-col gap-1">
        <div><span className="muted">ชื่อ:</span> {me.name} ({me.nickName})</div>
        <div><span className="muted">เบอร์:</span> <span className="mono">{me.mobile}</span></div>
        <div><span className="muted">session ต้นทางหมดอายุ:</span> {me.cookieExpiresAt ? new Date(me.cookieExpiresAt).toLocaleDateString("th-TH") : "-"}</div>
        <div><span className="muted">หน้าต่างการจอง:</span> {me.windowDays} วัน (ถึง {me.maxBookdate ? fmtThaiDate(me.maxBookdate) : "-"})</div>
        <button className="text-xs underline self-start muted" onClick={() => reload(true)}>ซิงค์กับต้นทางตอนนี้</button>
      </div>

      <div className="card p-4 flex flex-col gap-3">
        <div className="font-semibold">🔔 การแจ้งเตือน (Push)</div>
        {supported === false ? (
          <div className="text-sm muted">
            เบราว์เซอร์นี้ไม่รองรับ push{isIos && !standalone ? " — บน iPhone ให้กด แชร์ → เพิ่มไปยังหน้าจอโฮม แล้วเปิดจากไอคอนนั้น" : ""}
          </div>
        ) : subscribed ? (
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-ghost text-sm" onClick={test}>ส่งทดสอบ</button>
            <button className="btn btn-danger text-sm" onClick={disable}>ปิดบนเครื่องนี้</button>
          </div>
        ) : (
          <button className="btn btn-primary" disabled={busy} onClick={enable}>เปิดการแจ้งเตือนบนเครื่องนี้</button>
        )}
        <div className="text-xs muted">อุปกรณ์ที่เปิดไว้ทั้งหมด: {me.pushSubscriptions}{isIos && !standalone ? " · iPhone ต้องติดตั้งเป็นแอป (Add to Home Screen) ก่อน" : ""}</div>
      </div>

      {me.observations.length > 0 && (
        <div className="card p-4">
          <div className="font-semibold text-sm mb-2">📈 ค่าหน้าต่างที่ระบบเรียนรู้ได้</div>
          {me.observations.map((o, i) => (
            <div key={i} className="text-xs muted flex justify-between gap-3 flex-wrap">
              <span>{new Date(o.observed_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</span>
              <span className="mono">{o.today_bkk} → {o.max_bookdate} ({o.window_days} วัน)</span>
            </div>
          ))}
        </div>
      )}

      <ErrorBox msg={msg} />
      <button className="btn btn-ghost" onClick={logout}>ออกจากระบบ (คิวยังทำงานต่อ)</button>
    </div>
  );
}
