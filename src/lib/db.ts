import postgres from "postgres";
import { env } from "./env";

type Sql = ReturnType<typeof postgres>;

declare global {
  var __sql: Sql | undefined;
}

function create(): Sql {
  return postgres(env.DATABASE_URL, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false, // เผื่อ pooler (pgbouncer/neon) โหมด transaction
    types: {
      // ให้คอลัมน์ date คงเป็นสตริง "YYYY-MM-DD" ไม่แปลงเป็น Date (กัน timezone เพี้ยน)
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
    },
  });
}

function instance(): Sql {
  if (!globalThis.__sql) globalThis.__sql = create();
  return globalThis.__sql;
}

/** postgres client แบบ lazy — ไม่เปิด connection ตอน build/import */
export const sql: Sql = new Proxy(function () {} as unknown as Sql, {
  apply: (_t, _this, args) => (instance() as unknown as (...a: unknown[]) => unknown)(...args),
  get: (_t, prop) => (instance() as unknown as Record<string | symbol, unknown>)[prop],
}) as Sql;

export const SCHEMA_SQL = `
create table if not exists users (
  id            bigserial primary key,
  mobile        text unique not null,
  member_id     text,
  name          text,
  nick_name     text,
  cookies_enc   text,                 -- cookie ของระบบต้นทาง (เข้ารหัส)
  cookie_expires_at timestamptz,
  window_days   int,                  -- maxBookdate - today ที่สังเกตได้ล่าสุด
  max_bookdate  date,
  wallet_balance numeric(12,2) default 0,
  last_synced_at timestamptz,
  created_at    timestamptz default now()
);

create table if not exists window_observations (
  id            bigserial primary key,
  user_id       bigint references users(id) on delete cascade,
  observed_at   timestamptz default now(),
  today_bkk     date not null,
  max_bookdate  date not null,
  window_days   int not null
);
create index if not exists window_obs_user_idx on window_observations(user_id, observed_at desc);

create table if not exists queue_items (
  id            bigserial primary key,
  user_id       bigint not null references users(id) on delete cascade,
  loc_id        text not null,
  loc_name      text,
  stadium_id    text not null,
  stadium_name  text,
  stadiumtime_id text not null,
  time_name     text not null,
  booking_date  date not null,
  amount        numeric(12,2) not null,
  status        text not null default 'queued',
  -- queued | firing | booked_paid | pending_payment | failed | cancelled | expired
  open_at       timestamptz,          -- ประมาณการเวลาที่ช่องนี้จะเปิดให้จอง
  attempts      int default 0,
  last_error    text,
  booking_ref   text,
  payment_ref   text,
  payment_type  text,                 -- WALLET | QR
  qr_png        text,                 -- base64 PNG
  qr_expires_at timestamptz,
  fired_at      timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (user_id, booking_date, stadiumtime_id)
);
create index if not exists queue_items_status_idx on queue_items(status, open_at);

create table if not exists push_subscriptions (
  id          bigserial primary key,
  user_id     bigint not null references users(id) on delete cascade,
  endpoint    text unique not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz default now()
);

create table if not exists fire_runs (
  id           bigserial primary key,
  kind         text not null,          -- midnight | now | tick
  started_at   timestamptz default now(),
  finished_at  timestamptz,
  target_at    timestamptz,
  items_total  int default 0,
  items_ok     int default 0,
  note         text
);
`;

export async function migrate() {
  await sql.unsafe(SCHEMA_SQL);
}

export type UserRow = {
  id: number;
  mobile: string;
  member_id: string | null;
  name: string | null;
  nick_name: string | null;
  cookies_enc: string | null;
  cookie_expires_at: Date | null;
  window_days: number | null;
  max_bookdate: string | null; // yyyy-mm-dd (postgres date → string ผ่าน transform ด้านล่าง)
  wallet_balance: string;
  last_synced_at: Date | null;
};

export type QueueStatus =
  | "queued"
  | "firing"
  | "booked_paid"
  | "pending_payment"
  | "failed"
  | "cancelled"
  | "expired";

export type QueueItemRow = {
  id: number;
  user_id: number;
  loc_id: string;
  loc_name: string | null;
  stadium_id: string;
  stadium_name: string | null;
  stadiumtime_id: string;
  time_name: string;
  booking_date: string;
  amount: string;
  status: QueueStatus;
  open_at: Date | null;
  attempts: number;
  last_error: string | null;
  booking_ref: string | null;
  payment_ref: string | null;
  payment_type: string | null;
  qr_png: string | null;
  qr_expires_at: Date | null;
  fired_at: Date | null;
  created_at: Date;
  updated_at: Date;
};
