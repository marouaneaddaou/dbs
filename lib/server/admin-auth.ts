import { randomBytes, createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "dbs_admin_session";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.trim().length > 0) return secret.trim();
  // Fallback for local dev - not secure for production
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required in production");
  }
  return "dev-only-insecure-secret-change-me";
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  return Buffer.from(padded, "base64");
}

interface SessionPayload {
  v: 1;
  exp: number;
  nonce: string;
}

export function createAdminSessionToken(): string {
  const secret = getAuthSecret();
  const payload: SessionPayload = {
    v: 1,
    exp: Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE_SECONDS,
    nonce: base64UrlEncode(randomBytes(16)),
  };
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(payloadB64).digest();
  return `${payloadB64}.${base64UrlEncode(sig)}`;
}

export function verifyAdminSessionToken(token: string): boolean {
  try {
    const secret = getAuthSecret();
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const [payloadB64, sigB64] = parts;
    const expected = createHmac("sha256", secret).update(payloadB64).digest();
    const got = base64UrlDecode(sigB64);
    if (got.length !== expected.length) return false;
    try {
      if (!timingSafeEqual(got, expected)) return false;
    } catch {
      if (got.toString("hex") !== expected.toString("hex")) return false;
    }
    const payload = JSON.parse(base64UrlDecode(payloadB64).toString("utf8")) as SessionPayload;
    if (payload.v !== 1) return false;
    if (typeof payload.exp !== "number") return false;
    if (payload.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}

export function getAdminCookieName(): string {
  return COOKIE_NAME;
}

export function getAdminCookieMaxAge(): number {
  return COOKIE_MAX_AGE_SECONDS;
}

export function getAdminPassword(): string {
  const pwd = process.env.ADMIN_PASSWORD;
  if (pwd && pwd.trim().length > 0) return pwd.trim();
  return "123456";
}
