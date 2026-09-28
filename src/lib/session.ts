import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { env } from "./env";

const COOKIE = "cb_session";

function secret() {
  return new TextEncoder().encode(env.APP_SECRET);
}

export async function createSession(userId: number) {
  const jwt = await new SignJWT({ uid: Number(userId) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${env.SESSION_DAYS}d`)
    .sign(secret());
  const store = await cookies();
  store.set(COOKIE, jwt, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "0",
    path: "/",
    maxAge: env.SESSION_DAYS * 86400,
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function getSessionUserId(): Promise<number | null> {
  const store = await cookies();
  const tok = store.get(COOKIE)?.value;
  if (!tok) return null;
  try {
    const { payload } = await jwtVerify(tok, secret());
    const uid = Number(payload.uid);
    return Number.isFinite(uid) && uid > 0 ? uid : null;
  } catch {
    return null;
  }
}
