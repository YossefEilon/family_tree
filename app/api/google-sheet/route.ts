import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasManageAccess } from "@/lib/manage-auth";

const API_URL = process.env.GOOGLE_SHEETS_API_URL;
function unavailable() {
  return NextResponse.json({ error: "Google Sheets integration is not configured" }, { status: 503 });
}

export async function GET() {
  if (!API_URL) return unavailable();
  try {
    const response = await fetch(API_URL, { cache: "no-store" });
    const body = await response.text();
    return new NextResponse(body, { status: response.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Google Sheets request failed" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.role && !(await hasManageAccess())) return NextResponse.json({ error: "נדרשת הרשאה" }, { status: 401 });
  if (!API_URL) return unavailable();
  try {
    const response = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: await request.text() });
    return new NextResponse(await response.text(), { status: response.status, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Google Sheets save failed" }, { status: 502 });
  }
}
