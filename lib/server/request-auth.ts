import type { NextRequest } from "next/server";
import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/server/admin-auth";

export function isAdminRequest(req: NextRequest): boolean {
  const token = req.cookies.get(getAdminCookieName())?.value;
  if (!token) return false;
  return verifyAdminSessionToken(token);
}

export function isCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === "production") return false;
    return isAdminRequest(req);
  }
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
