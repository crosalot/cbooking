"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Countdown, ErrorBox, Header, Spinner, useMe } from "@/components/ui";
import { addDays, api, baht, fmtThaiDate } from "@/lib/client";
import type { QueueItem } from "@/lib/types";

type Catalog = {
  locations: { locId: string; locName: string }[];
  stadiums: { stadiumId: string; stadiumName: string; locId: string; stadiumSort: number }[];
};
type Slot = { stadiumtimeId: string; timeName: string; price: number; reserved: boolean; past: boolean; openNow: boolean };
type Pick = {
  key: string;
  locId: string;
  locName: string;
  stadiumId: string;
  stadiumName: string;
  stadiumtimeId: string;
  timeName: string;
  bookingDate: string;
  amount: string;
};

const LOOKAHEAD = 45;

export default function BookPage() {
  const router = useRouter();
  const { me, error } = useMe();
  const [cat, setCat] = useState<Catalog | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [date, setDate] = useState<string>("");
  const [locId, setLocId] = useState<string>("");
  const [stadiumId, setStadiumId] = useState<string>("");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api<Catalog>("/api/catalog").then((c) => {
      setCat(c);
      setLocId(c.locations[0]?.locId ?? "");
    }).catch((e) => setMsg(e.message));
    api<{ items: QueueItem[] }>("/api/queue").then((r) => setQueue(r.items)).catch(() => {});
  }, []);
  useEffect(() => {
    if (me && !date) setDate(me.today);
  }, [me, date]);

  const courts = useMemo(() => (cat?.stadiums ?? []).filter((s) => s.locId === locId), [cat, locId]);
  useEffect(() => {
    if (courts.length && !courts.find((c) => c.stadiumId === stadiumId)) setStadiumId(courts[0].stadiumId);
  }, [courts, stadiumId]);

  const loadSlots = useCallback(async () => {
    if (!date || !stadiumId || !locId) return;
    setSlots(null);
    try {
      const r = await api<{ slots: Slot[] }>(`/api/availability?date=${date}&stadiumId=${stadiumId}&locId=${locId}`);
      setSlots(r.slots);
    } catch (e) {
      setMsg((e as Error).message);
      setSlots([]);
    }
  }, [date, stadiumId, locId]);
  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  if (error) return <ErrorBox msg={error} />;
  if (!me || !cat) return <Spinner />;

  const dates = Array.from({ length: LOOKAHEAD + 1 }, (_, i) => addDays(me.today, i));
  const isOpen = (d: string) => !!me.maxBookdate && d <= me.maxBookdate;
  const openAtOf = (d: string) => {
    // เที่ยงคืนไทยของวัน (d - windowDays)
    const ymd = addDays(d, -me.windowDays);
    return new Date(`${ymd}T00:00:00+07:00`);
  };
  const loc = cat.locations.find((l) => l.locId === locId);
  const court = courts.find((c) => c.stadiumId === stadiumId);
  const keyOf = (d: string, id: string) => `${d}:${id}`;
  const queuedKeys = new Set(queue.filter((q) => ["queued", "firing", "pending_payment", "booked_paid"].includes(q.status)).map((q) => keyOf(q.booking_date, q.stadiumtime_id)));

  const toggle = (s: Slot) => {
    const key = keyOf(date, s.stadiumtimeId);
    if (picks.find((p) => p.key === key)) setPicks(picks.filter((p) => p.key !== key));
    else
      setPicks([
        ...picks,
        { key, locId, locName: loc?.locName ?? "", stadiumId, stadiumName: court?.stadiumName ?? "", stadiumtimeId: s.stadiumtimeId, timeName: s.timeName, bookingDate: date, amount: s.price.toFixed(2) },
      ]);
  };

  const submit = async (bookNow: boolean) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ added: number; fired: unknown }>("/api/queue", { method: "POST", json: { items: picks.map(({ key, ...p }) => { void key; return p; }), bookNow } });
      setPicks([]);
      router.push(r.fired ? "/cart?fired=1" : "/cart");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const total = picks.reduce((s, p) => s + Number(p.amount), 0);
  const anyOpenPick = picks.some((p) => isOpen(p.bookingDate));
  const allOpenPick = picks.length > 0 && picks.every((p) => isOpen(p.bookingDate));

  return (
    <div className="flex flex-col gap-4">
      <Header title="จองคอร์ท" sub={`จองได้ทันทีถึง ${me.maxBookdate ? fmtThaiDate(me.maxBookdate) : "-"} · วันถัดไปตั้งคิวรอได้`} />

      {/* date strip */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1" style={{ scrollbarWidth: "none" }}>
        {dates.map((d, i) => {
          const open = isOpen(d);
          const active = d === date;
          const [, m, dd] = d.split("-");
          const dayName = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"][new Date(`${d}T00:00:00`).getDay()];
          return (
            <button
              key={d}
              onClick={() => setDate(d)}
              className="shrink-0 rounded-xl px-2.5 py-2 text-center border"
              style={{
                minWidth: 58,
                background: active ? "var(--accent)" : "var(--panel)",
                color: active ? "var(--accent-ink)" : open ? "var(--text)" : "var(--muted)",
                borderColor: active ? "var(--accent)" : open ? "var(--line)" : "transparent",
                borderStyle: open ? "solid" : "dashed",
              }}
            >
              <div className="text-[10px]">{i === 0 ? "วันนี้" : dayName}</div>
              <div className="text-lg font-bold leading-tight">{Number(dd)}</div>
              <div className="text-[10px]">{["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."][Number(m) - 1]}</div>
              <div className="text-[9px] mt-0.5">{open ? "จองได้" : "ตั้งคิว"}</div>
            </button>
          );
        })}
      </div>

      {/* status of selected date */}
      <div className="card p-3 text-sm flex items-center justify-between">
        <div>
          <b>{fmtThaiDate(date)}</b>{" "}
          {isOpen(date) ? (
            <span className="badge badge-ok ml-1">จองได้ทันที</span>
          ) : (
            <span className="badge badge-warn ml-1">ยังไม่เปิด · เปิดใน <Countdown to={openAtOf(date)} /></span>
          )}
        </div>
        <button className="text-xs muted underline" onClick={loadSlots}>รีเฟรช</button>
      </div>
      {!isOpen(date) && (
        <div className="text-xs muted -mt-2 px-1">
          ช่องที่ขีดฆ่า = มีคนที่จองล่วงหน้าได้ไกลกว่าคุณจองไปแล้ว · ช่องว่างจะถูกจองให้อัตโนมัติเมื่อหน้าต่างของคุณเปิด (ประมาณ{" "}
          {openAtOf(date).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" })})
        </div>
      )}

      {/* location + court */}
      <div className="flex gap-2">
        {cat.locations.map((l) => (
          <button key={l.locId} onClick={() => setLocId(l.locId)} className={`btn flex-1 text-sm ${l.locId === locId ? "btn-primary" : "btn-ghost"}`}>
            {l.locName}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {courts.map((c) => (
          <button key={c.stadiumId} onClick={() => setStadiumId(c.stadiumId)} className={`slot ${c.stadiumId === stadiumId ? "picked" : "free"}`}>
            {c.stadiumName}
          </button>
        ))}
      </div>

      {/* slots */}
      {slots === null ? (
        <Spinner label="กำลังโหลดช่องเวลา…" />
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {slots.map((s) => {
            const key = keyOf(date, s.stadiumtimeId);
            const picked = !!picks.find((p) => p.key === key);
            const inQueue = queuedKeys.has(key);
            const cls = s.reserved ? "reserved" : s.past ? "past" : picked ? "picked" : inQueue ? "queued" : "free";
            return (
              <button key={s.stadiumtimeId} disabled={s.reserved || s.past || inQueue} onClick={() => toggle(s)} className={`slot ${cls}`}>
                <div>{s.timeName}</div>
                <div className="text-[10px] font-normal opacity-80">{inQueue ? "อยู่ในคิว" : s.reserved ? "เต็ม" : baht(s.price)}</div>
              </button>
            );
          })}
        </div>
      )}

      <ErrorBox msg={msg} />

      {/* picks bar */}
      {picks.length > 0 && (
        <div className="fixed bottom-[68px] left-1/2 -translate-x-1/2 w-full max-w-md px-4">
          <div className="card p-3 shadow-xl" style={{ background: "var(--panel-2)" }}>
            <div className="flex justify-between text-sm mb-2">
              <span>เลือกแล้ว {picks.length} ช่อง</span>
              <b className="mono">{baht(total)}</b>
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              {picks.map((p) => (
                <span key={p.key} className="badge badge-accent" onClick={() => setPicks(picks.filter((x) => x.key !== p.key))}>
                  {fmtThaiDate(p.bookingDate)} {p.timeName} {p.stadiumName} ✕
                </span>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn btn-ghost" disabled={busy} onClick={() => submit(false)}>
                🧺 ใส่ตะกร้า/ตั้งคิว
              </button>
              <button className="btn btn-primary" disabled={busy || !anyOpenPick} onClick={() => submit(true)} title={allOpenPick ? "" : "บางรายการยังไม่เปิด จะตั้งคิวไว้ให้"}>
                ⚡ จองเลย{!allOpenPick && anyOpenPick ? " (ที่เปิดแล้ว)" : ""}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
