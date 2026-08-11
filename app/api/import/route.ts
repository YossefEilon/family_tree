import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { graphSchema } from "@/lib/domain";
export async function POST(request: Request) { const session = await auth(); if (!session?.user?.role) return NextResponse.json({ error: "נדרשת הרשאה" }, { status: 401 }); const parsed = graphSchema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "קובץ הייבוא אינו תקין", details: parsed.error.flatten() }, { status: 400 }); return NextResponse.json({ valid: true, graph: parsed.data }); }
