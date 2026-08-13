import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasManageAccess } from "@/lib/manage-auth";

const API_URL = process.env.GOOGLE_SHEETS_API_URL;
const CACHE_TTL_MS = 60_000;
const UPSTREAM_TIMEOUT_MS = 8_000;
let cachedPayload: { body: string; status: number; expiresAt: number } | null = null;

function unavailable() {
  return NextResponse.json({ error: "Google Sheets integration is not configured" }, { status: 503 });
}

function jsonResponse(body: string, status: number, cacheControl = "no-store") {
  return new NextResponse(body, { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": cacheControl } });
}

export async function GET() {
  if (!API_URL) return unavailable();
  if (cachedPayload && cachedPayload.expiresAt > Date.now()) {
    return jsonResponse(cachedPayload.body, cachedPayload.status, "private, max-age=60");
  }
  try {
    const response = await fetch(API_URL, { cache: "no-store", signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    const body = await response.text();
    if (response.ok) cachedPayload = { body, status: response.status, expiresAt: Date.now() + CACHE_TTL_MS };
    return jsonResponse(body, response.status, response.ok ? "private, max-age=60" : "no-store");
  } catch (error) {
    if (cachedPayload) return jsonResponse(cachedPayload.body, cachedPayload.status, "private, max-age=60");
    return NextResponse.json({ error: error instanceof Error ? error.message : "Google Sheets request failed" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.role && !(await hasManageAccess())) return NextResponse.json({ error: "נדרשת הרשאה" }, { status: 401 });
  if (!API_URL) return unavailable();
  try {
    const response = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: await request.text(), signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    const body = await response.text();
    if (response.ok) cachedPayload = null;
    return jsonResponse(body, response.status);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Google Sheets save failed" }, { status: 502 });
  }
}
