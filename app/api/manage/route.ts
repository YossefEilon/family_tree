import { NextResponse } from "next/server";
import { z } from "zod";
import { COOKIE_NAME, createManageToken, MAX_AGE_SECONDS } from "@/lib/manage-auth";

export async function POST(request: Request) {
  const parsed = z.object({ password: z.string() }).safeParse(await request.json());
  if (!parsed.success || !process.env.MANAGE_PASSWORD || parsed.data.password !== process.env.MANAGE_PASSWORD) {
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
