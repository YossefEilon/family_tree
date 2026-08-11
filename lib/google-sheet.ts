import { graphSchema, type FamilyGraph, type Person } from "./domain";

const API_URL = "/api/google-sheet";

type SheetPerson = Record<string, unknown>;

function yearFrom(value: unknown): number | undefined {
  const match = String(value ?? "").match(/\b(\d{4})\b/);
  return match ? Number(match[1]) : undefined;
}

function toPerson(raw: SheetPerson): Person {
  return {
    id: String(raw.id), familyId: String(raw.familyId ?? "default"), name: String(raw.name ?? ""),
    previousLastName: String(raw.previousLastName ?? "") || undefined, role: String(raw.role ?? "") || undefined,
    birthYear: yearFrom(raw.birthYear ?? raw.birth), hebrewBirthDate: String(raw.hebrewBirthDate ?? "") || undefined,
    deathYear: yearFrom(raw.deathYear ?? raw.death), hebrewDeathDate: String(raw.hebrewDeathDate ?? "") || undefined,
    isAlive: raw.isAlive === undefined ? !raw.death : Boolean(raw.isAlive),
    gender: raw.gender === "male" || raw.gender === "female" ? raw.gender : "neutral",
    birthCountry: String(raw.birthCountry ?? "") || undefined, lifeStory: String(raw.lifeStory ?? "") || undefined,
    profileImageUrl: typeof (raw.profileImageUrl ?? raw.profilePic ?? raw.image) === "string" ? String(raw.profileImageUrl ?? raw.profilePic ?? raw.image) || undefined : undefined,
  };
}

export async function fetchGoogleSheetGraph(): Promise<FamilyGraph> {
  const response = await fetch(API_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Google Sheets request failed (${response.status})`);
  const data = await response.json() as { nodes?: SheetPerson[]; links?: Record<string, unknown>[] };
  const graph = {
    people: (data.nodes ?? []).map(toPerson),
    relationships: (data.links ?? []).map(link => ({
      familyId: String(link.familyId ?? "default"), sourceId: String(typeof link.source === "object" ? (link.source as SheetPerson).id : link.source),
      targetId: String(typeof link.target === "object" ? (link.target as SheetPerson).id : link.target), type: link.type === "spouse" ? "spouse" : "parent",
    })),
  };
  const parsed = graphSchema.parse(graph);
  const relationships = [...parsed.relationships];
  const hasRelationship = (sourceId: string, targetId: string, type: "parent" | "spouse") => relationships.some(link => link.sourceId === sourceId && link.targetId === targetId && link.type === type);
  for (const spouse of parsed.relationships.filter(link => link.type === "spouse")) {
    const sharedChildren = relationships.filter(link => link.type === "parent" && link.sourceId === spouse.sourceId).map(link => link.targetId);
    for (const childId of sharedChildren) if (!hasRelationship(spouse.targetId, childId, "parent")) relationships.push({ familyId: spouse.familyId, sourceId: spouse.targetId, targetId: childId, type: "parent" });
    const reverseChildren = relationships.filter(link => link.type === "parent" && link.sourceId === spouse.targetId).map(link => link.targetId);
    for (const childId of reverseChildren) if (!hasRelationship(spouse.sourceId, childId, "parent")) relationships.push({ familyId: spouse.familyId, sourceId: spouse.sourceId, targetId: childId, type: "parent" });
  }
  return { ...parsed, relationships };
}

export async function saveGoogleSheetGraph(graph: FamilyGraph): Promise<void> {
  const nodes = graph.people.map(person => ({
    id: person.id, name: person.name, previousLastName: person.previousLastName ?? "", role: person.role ?? "",
    birth: person.birthYear?.toString() ?? "", death: person.deathYear?.toString() ?? "", isAlive: person.isAlive,
    gender: person.gender, birthCountry: person.birthCountry ?? "", lifeStory: person.lifeStory ?? "", profilePic: person.profileImageUrl ?? "", profileImageUrl: person.profileImageUrl ?? "", level: 0,
  }));
  const links = graph.relationships.map(link => ({ source: link.sourceId, target: link.targetId, type: link.type }));
  const response = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nodes, links }) });
  if (!response.ok) throw new Error(`Google Sheets save failed (${response.status})`);
}
