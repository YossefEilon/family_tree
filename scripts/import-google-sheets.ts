import { writeFile } from "node:fs/promises";
import { graphSchema } from "../lib/domain";

const apiUrl = process.argv[2];
const output = process.argv[3] ?? "family-import.json";
if (!apiUrl) throw new Error("Usage: npx tsx scripts/import-google-sheets.ts <apps-script-url> [output-file]");

const response = await fetch(apiUrl);
if (!response.ok) throw new Error(`Apps Script request failed: ${response.status} ${response.statusText}`);
const source = await response.json() as { nodes?: unknown[]; links?: unknown[]; people?: unknown[]; relationships?: unknown[] };
const parsed = graphSchema.safeParse({ people: source.people ?? source.nodes ?? [], relationships: source.relationships ?? (source.links ?? []).map((link: any) => ({ familyId: "default", sourceId: typeof link.source === "object" ? link.source.id : link.source, targetId: typeof link.target === "object" ? link.target.id : link.target, type: link.type ?? "parent" })) });
if (!parsed.success) { console.error(parsed.error.format()); process.exit(1); }
await writeFile(output, JSON.stringify(parsed.data, null, 2), "utf8");
console.log(`Validated ${parsed.data.people.length} people and ${parsed.data.relationships.length} relationships into ${output}`);
