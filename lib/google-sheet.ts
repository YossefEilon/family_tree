import { personSchema, relationshipSchema, type FamilyGraph, type Person, type Relationship } from "./domain";

const API_URL = "/api/google-sheet";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

export class GoogleSheetRequestError extends Error {
  constructor(public readonly status?: number) {
    super(status ? `Google Sheets request failed (${status})` : "Google Sheets request failed");
    this.name = "GoogleSheetRequestError";
  }
}

type SheetPerson = Record<string, unknown>;

function uniqueRelationships(relationships: FamilyGraph["relationships"]): FamilyGraph["relationships"] {
  const seen = new Set<string>();
  return relationships.filter(link => {
    const key = `${link.familyId}|${link.sourceId}|${link.targetId}|${link.type}|${link.hebrewMarriageDate ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function yearFrom(value: unknown): number | undefined {
  const match = String(value ?? "").match(/\b(\d{4})\b/);
  return match ? Number(match[1]) : undefined;
}

function birthDateFrom(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : undefined;
}

function birthDateForStorage(value: string | undefined): string {
  if (!value) return "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function significantDatesFrom(value: unknown): Person["significantDates"] {
  if (Array.isArray(value)) return value as Person["significantDates"];
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as Person["significantDates"] : [];
  } catch {
    return [];
  }
}

function toPerson(raw: SheetPerson): Person {
  const birthDate = birthDateFrom(raw.birthDate ?? raw.birth);
  return {
    id: String(raw.id), familyId: String(raw.familyId ?? "default"), name: String(raw.name ?? ""),
    previousLastName: String(raw.previousLastName ?? "") || undefined, role: String(raw.role ?? "") || undefined,
    birthDate, birthYear: yearFrom(raw.birthYear ?? birthDate ?? raw.birth), hebrewBirthDate: String(raw.hebrewBirthDate ?? "") || undefined,
    deathYear: yearFrom(raw.deathYear ?? raw.death), hebrewDeathDate: String(raw.hebrewDeathDate ?? "") || undefined,
    significantDates: significantDatesFrom(raw.significantDates),
    isAlive: raw.isAlive === undefined ? !raw.death : Boolean(raw.isAlive),
    gender: raw.gender === "male" || raw.gender === "female" ? raw.gender : "neutral",
    birthCountry: String(raw.birthCountry ?? "") || undefined, burialPlace: String(raw.burialPlace ?? "") || undefined, lifeStory: String(raw.lifeStory ?? "") || undefined,
    profileImageUrl: typeof (raw.profileImageUrl ?? raw.profilePic ?? raw.image) === "string" ? String(raw.profileImageUrl ?? raw.profilePic ?? raw.image) || undefined : undefined,
  };
}

let memoryCachedGraph: FamilyGraph | null = null;

export function getCachedGoogleSheetGraph(): FamilyGraph | null {
  if (memoryCachedGraph) return memoryCachedGraph;
  if (typeof window !== "undefined") {
    try {
      const stored = sessionStorage.getItem("family_tree_cached_graph");
      if (stored) {
        memoryCachedGraph = JSON.parse(stored) as FamilyGraph;
        return memoryCachedGraph;
      }
    } catch {
      // sessionStorage unavailable
    }
  }
  return null;
}

export function setCachedGoogleSheetGraph(graph: FamilyGraph): void {
  memoryCachedGraph = graph;
  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem("family_tree_cached_graph", JSON.stringify(graph));
    } catch {
      // sessionStorage unavailable
    }
  }
}

export async function fetchGoogleSheetGraph(): Promise<FamilyGraph> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(API_URL, { cache: "no-store" });
      if (response.ok) {
        const data = await response.json() as { nodes?: SheetPerson[]; links?: Record<string, unknown>[] };
        const parsed = parseGoogleSheetGraph(data);
        setCachedGoogleSheetGraph(parsed);
        return parsed;
      }
      lastError = new GoogleSheetRequestError(response.status);
    } catch (error) {
      lastError = error;
    }
    if (attempt < MAX_RETRIES) await new Promise(resolve => window.setTimeout(resolve, RETRY_DELAY_MS * 2 ** attempt));
  }
  throw lastError instanceof Error ? lastError : new GoogleSheetRequestError();
}

function toRelationship(link: Record<string, unknown>): Relationship {
  return {
    familyId: String(link.familyId ?? "default"),
    sourceId: String(typeof link.source === "object" ? (link.source as SheetPerson).id : link.source),
    targetId: String(typeof link.target === "object" ? (link.target as SheetPerson).id : link.target),
    type: (link.type === "spouse" ? "spouse" : "parent") as "parent" | "spouse",
    hebrewMarriageDate: String(link.hebrewMarriageDate ?? "") || undefined,
  };
}

export function parseGoogleSheetGraph(data: { nodes?: SheetPerson[]; links?: Record<string, unknown>[] }): FamilyGraph {
  // Google Sheets commonly includes empty rows in the exported range.
  // They are not family members and must not be passed to the strict schema.
  const nodes = (data.nodes ?? []).filter(raw => String(raw.id ?? "").trim() && String(raw.name ?? "").trim());
  // Validate each row on its own: a single malformed row (bad date, bad image
  // URL, duplicate id) must never take down the whole tree.
  const people: Person[] = [];
  const seenIds = new Set<string>();
  let skippedPeople = 0;
  for (const raw of nodes) {
    const parsed = personSchema.safeParse(toPerson(raw));
    if (!parsed.success || seenIds.has(parsed.data.id)) {
      skippedPeople += 1;
      continue;
    }
    seenIds.add(parsed.data.id);
    people.push(parsed.data);
  }
  const validIds = new Set(people.map(person => person.id));
  const relationships: Relationship[] = [];
  let skippedRelationships = 0;
  for (const link of uniqueRelationships((data.links ?? []).map(toRelationship))) {
    const parsed = relationshipSchema.safeParse(link);
    if (!parsed.success || !validIds.has(parsed.data.sourceId) || !validIds.has(parsed.data.targetId)) {
      skippedRelationships += 1;
      continue;
    }
    relationships.push(parsed.data);
  }
  if (people.length === 0) {
    // Preserve the previous behavior when nothing usable remains: the UI shows its error screen.
    throw new Error(`Could not parse any people from the sheet data (${skippedPeople} rows skipped)`);
  }
  if (skippedPeople > 0 || skippedRelationships > 0) {
    console.warn(`[family-tree] skipped ${skippedPeople} invalid people and ${skippedRelationships} invalid relationships from the sheet data`);
  }
  const allRelationships = [...relationships];
  const hasRelationship = (sourceId: string, targetId: string, type: "parent" | "spouse") => allRelationships.some(link => link.sourceId === sourceId && link.targetId === targetId && link.type === type);
  for (const spouse of relationships.filter(link => link.type === "spouse")) {
    const sharedChildren = allRelationships.filter(link => link.type === "parent" && link.sourceId === spouse.sourceId).map(link => link.targetId);
    for (const childId of sharedChildren) if (!hasRelationship(spouse.targetId, childId, "parent")) allRelationships.push({ familyId: spouse.familyId, sourceId: spouse.targetId, targetId: childId, type: "parent" });
    const reverseChildren = allRelationships.filter(link => link.type === "parent" && link.sourceId === spouse.targetId).map(link => link.targetId);
    for (const childId of reverseChildren) if (!hasRelationship(spouse.sourceId, childId, "parent")) allRelationships.push({ familyId: spouse.sourceId, sourceId: spouse.sourceId, targetId: childId, type: "parent" });
  }
  return { people, relationships: uniqueRelationships(allRelationships) };
}

export async function saveGoogleSheetGraph(graph: FamilyGraph): Promise<void> {
  setCachedGoogleSheetGraph(graph);
  const nodes = graph.people.map(person => ({
    id: person.id, name: person.name, previousLastName: person.previousLastName ?? "", role: person.role ?? "",
    birth: birthDateForStorage(person.birthDate) || String(person.birthYear ?? ""), birthDate: birthDateForStorage(person.birthDate), hebrewBirthDate: person.hebrewBirthDate ?? "", hebrewDeathDate: person.hebrewDeathDate ?? "", significantDates: person.significantDates, death: person.deathYear?.toString() ?? "", isAlive: person.isAlive,
    gender: person.gender, birthCountry: person.birthCountry ?? "", burialPlace: person.burialPlace ?? "", lifeStory: person.lifeStory ?? "", profilePic: person.profileImageUrl ?? "", profileImageUrl: person.profileImageUrl ?? "", level: 0,
  }));
  const links = uniqueRelationships(graph.relationships).map(link => ({ source: link.sourceId, target: link.targetId, type: link.type, hebrewMarriageDate: link.hebrewMarriageDate ?? "" }));
  const response = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nodes, links }) });
  if (!response.ok) throw new Error(`Google Sheets save failed (${response.status})`);
}
