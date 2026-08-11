import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/prisma";
import { graphSchema } from "@/lib/domain";

export async function GET(_: Request, context: { params: Promise<{ familyId: string }> }) {
  const { familyId } = await context.params;
  const family = await db.family.findUnique({ where: { id: familyId }, include: { people: true, relationships: true } });
  if (!family) return NextResponse.json({ error: "המשפחה לא נמצאה" }, { status: 404 });
  return NextResponse.json({ people: family.people, relationships: family.relationships.map((r) => ({ ...r, sourceId: r.sourceId, targetId: r.targetId })) });
}

export async function PUT(request: Request, context: { params: Promise<{ familyId: string }> }) {
  const session = await auth(); if (!session?.user?.role) return NextResponse.json({ error: "נדרשת הרשאה" }, { status: 401 });
  const { familyId } = await context.params; const parsed = graphSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "נתוני המשפחה אינם תקינים", details: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;
  await db.$transaction(async (tx) => { await tx.person.deleteMany({ where: { familyId } }); await tx.person.createMany({ data: data.people.map(({ id: _, ...p }) => ({ ...p, familyId })) }); await tx.relationship.createMany({ data: data.relationships.map(({ id: _, ...r }) => ({ ...r, familyId })) }); });
  return NextResponse.json({ ok: true });
}
