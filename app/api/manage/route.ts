import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { COOKIE_NAME, createManageToken, MAX_AGE_SECONDS } from "@/lib/manage-auth";

// Lightweight in-memory rate limiting for the manage-login endpoint. On
// serverless platforms each instance keeps its own counters, so this raises
// the cost of brute force rather than providing a hard guarantee.
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now >= entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  // Opportunistic cleanup so the map can't grow without bound.
  if (loginAttempts.size > 2000) {
    loginAttempts.forEach((value, key) => {
      if (value.resetAt <= now) loginAttempts.delete(key);
    });
  }
  return entry.count > RATE_LIMIT_MAX_ATTEMPTS;
}

function passwordsMatch(supplied: string, expected: string): boolean {
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(suppliedBuffer, expectedBuffer);
}

export async function POST(request: Request) {
  const parsed = z.object({ password: z.string() }).safeParse(await request.json());
  if (isRateLimited(getClientIp(request))) {
    return NextResponse.json({ error: "יותר מדי ניסיונות. נסו שוב מאוחר יותר." }, { status: 429 });
  }
  if (!parsed.success || !process.env.MANAGE_PASSWORD || !passwordsMatch(parsed.data.password, process.env.MANAGE_PASSWORD)) {
    return NextResponse.json({ error: "הסיסמה שגויה" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, createManageToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, "", { httpOnly: true, maxAge: 0, path: "/" });
  return response;
}
