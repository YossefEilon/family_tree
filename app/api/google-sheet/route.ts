import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasManageAccess } from "@/lib/manage-auth";

const API_URL = process.env.GOOGLE_SHEETS_API_URL;
const CACHE_TTL_MS = 60_000;
let cachedPayload: { body: string; status: number; expiresAt: number } | null = null;

function unavailable() {
  return NextResponse.json({ error: "Google Sheets integration is not configured" }, { status: 503 });
}

export async function GET() {
  if (!API_URL) return unavailable();
  if (cachedPayload && cachedPayload.expiresAt > Date.now()) {
    return new NextResponse(cachedPayload.body, { status: cachedPayload.status, headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=60" } });
  }
  try {
    const response = await fetch(API_URL, { next: { revalidate: 60 } });
    const body = await response.text();
    cachedPayload = { body, status: response.status, expiresAt: Date.now() + CACHE_TTL_MS };
    return new NextResponse(body, { status: response.status, headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=60" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Google Sheets request failed" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.role && !(await hasManageAccess())) return NextResponse.json({ error: "נדרשת הרשאה" }, { status: 401 });
  if (!API_URL) return unavailable();
  try {
    cachedPayload = null;
    const response = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: await request.text() });
    return new NextResponse(await response.text(), { status: response.status, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Google Sheets save failed" }, { status: 502 });
  }
}
