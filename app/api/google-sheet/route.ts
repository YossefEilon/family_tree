import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasManageAccess } from "@/lib/manage-auth";

const API_URL = process.env.GOOGLE_SHEETS_API_URL;
// Google Apps Script web apps can take several seconds to cold-start.
// Keep the request alive long enough for writes to finish instead of
// reporting a failed save while the script is still processing it.
const UPSTREAM_TIMEOUT_MS = 30_000;

function unavailable() {
  return NextResponse.json({ error: "Google Sheets integration is not configured" }, { status: 503 });
}

function jsonResponse(body: string, status: number, cacheControl = "no-store") {
  return new NextResponse(body, { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": cacheControl } });
}

export async function GET() {
  if (!API_URL) return unavailable();
  try {
    const response = await fetch(API_URL, { cache: "no-store", signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    const body = await response.text();
    return jsonResponse(body, response.status, "no-store");
  } catch (error) {
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
    return jsonResponse(body, response.status);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Google Sheets save failed" }, { status: 502 });
  }
}
