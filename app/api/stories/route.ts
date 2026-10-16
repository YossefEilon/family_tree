import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { hasManageAccess } from "@/lib/manage-auth";
import { initialStoriesData, storiesDataSchema } from "@/lib/stories-data";

const DATA_DIR = path.join(process.cwd(), "data");
const STORIES_FILE = path.join(DATA_DIR, "stories.json");

async function loadPersistedStories() {
  try {
    const raw = await fs.readFile(STORIES_FILE, "utf-8");
    const parsed = storiesDataSchema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    // File not found or read error, fallback to initial data
  }
  return initialStoriesData;
}

export async function GET() {
  const data = await loadPersistedStories();
  return NextResponse.json(data);
}

export async function PUT(request: Request) {
  const authorized = await hasManageAccess();
  if (!authorized) {
    return NextResponse.json({ error: "נדרשת הרשאת מנהל לעריכת הסיפורים" }, { status: 401 });
  }

  try {
    const body: unknown = await request.json();
    const parsed = storiesDataSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "מבנה נתוני הסיפורים אינו תקין", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(STORIES_FILE, JSON.stringify(parsed.data, null, 2), "utf-8");
    } catch (fsErr) {
      console.warn("[stories-api] Could not write to filesystem (read-only environment):", fsErr);
      // In serverless read-only environments, return success so client-side sync still works
    }

    return NextResponse.json({ ok: true, data: parsed.data });
  } catch {
    return NextResponse.json({ error: "שגיאה בעיבוד הנתונים" }, { status: 500 });
  }
}

export async function DELETE() {
  const authorized = await hasManageAccess();
  if (!authorized) {
    return NextResponse.json({ error: "נדרשת הרשאת מנהל" }, { status: 401 });
  }

  try {
    await fs.unlink(STORIES_FILE);
  } catch {
    // ignore if not present
  }
  return NextResponse.json({ ok: true, data: initialStoriesData });
}
