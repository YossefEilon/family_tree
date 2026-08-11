import { z } from "zod";

export const personSchema = z.object({
  id: z.string().min(1), familyId: z.string().default("default"), name: z.string().min(1),
  previousLastName: z.string().optional(), role: z.string().optional(), birthYear: z.number().int().optional(),
  hebrewBirthDate: z.string().optional(), deathYear: z.number().int().optional(), hebrewDeathDate: z.string().optional(),
  isAlive: z.boolean().default(true), gender: z.enum(["male", "female", "neutral"]).default("neutral"),
  birthCountry: z.string().optional(), lifeStory: z.string().optional(),
  profileImageUrl: z.string().refine(value => {
    if (value.startsWith("data:image/")) return /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value);
    try { return new URL(value).protocol === "https:" || new URL(value).protocol === "http:"; } catch { return false; }
  }, "Invalid profile image URL").optional(),
});
export const relationshipSchema = z.object({ id: z.string().optional(), familyId: z.string().default("default"), sourceId: z.string(), targetId: z.string(), type: z.enum(["parent", "spouse"]) });
export const graphSchema = z.object({ people: z.array(personSchema), relationships: z.array(relationshipSchema) });
export type Person = z.infer<typeof personSchema>;
export type Relationship = z.infer<typeof relationshipSchema>;
export type FamilyGraph = z.infer<typeof graphSchema>;

export function descendants(graph: FamilyGraph, rootId: string): Set<string> {
  const result = new Set<string>();
  const visit = (id: string) => { if (result.has(id)) return; result.add(id); graph.relationships.filter(r => r.type === "parent" && r.sourceId === id).forEach(r => visit(r.targetId)); };
  visit(rootId); return result;
}
export function spouses(graph: FamilyGraph, id: string): Set<string> {
  return new Set(graph.relationships.filter(r => r.type === "spouse" && (r.sourceId === id || r.targetId === id)).map(r => r.sourceId === id ? r.targetId : r.sourceId));
}
export function childrenOf(graph: FamilyGraph, id: string): Set<string> {
  return new Set(graph.relationships.filter(r => r.type === "parent" && r.sourceId === id).map(r => r.targetId));
}
export function ageOf(person: Person, year = new Date().getFullYear()): number | undefined {
  if (person.birthYear === undefined) return undefined;
  return Math.max(0, (person.deathYear ?? year) - person.birthYear);
}

export const demoGraph: FamilyGraph = {
  people: [
    { id: "1", familyId: "default", name: "אברהם כהן", role: "אב", birthYear: 1930, deathYear: 2010, isAlive: false, gender: "male", birthCountry: "מרוקו" },
    { id: "10", familyId: "default", name: "שרה כהן", role: "אם", birthYear: 1932, deathYear: 2015, isAlive: false, gender: "female", birthCountry: "מרוקו", previousLastName: "לוי" },
    { id: "2", familyId: "default", name: "דוד כהן", role: "בן", birthYear: 1955, isAlive: true, gender: "male", birthCountry: "ישראל" },
    { id: "3", familyId: "default", name: "רחל ישראלי", role: "בת", birthYear: 1958, isAlive: true, gender: "female", birthCountry: "ישראל", previousLastName: "כהן" },
    { id: "4", familyId: "default", name: "יוסף כהן", role: "נכד", birthYear: 1982, isAlive: true, gender: "male", birthCountry: "ישראל" },
    { id: "5", familyId: "default", name: "שירה לוי", role: "נכדה", birthYear: 1985, isAlive: true, gender: "female", birthCountry: "ישראל", previousLastName: "כהן" },
    { id: "6", familyId: "default", name: "רועי ישראלי", role: "בן זוג", birthYear: 1956, isAlive: true, gender: "male", birthCountry: "ישראל" },
  ],
  relationships: [
    { familyId: "default", sourceId: "1", targetId: "10", type: "spouse" }, { familyId: "default", sourceId: "1", targetId: "2", type: "parent" },
    { familyId: "default", sourceId: "10", targetId: "2", type: "parent" }, { familyId: "default", sourceId: "1", targetId: "3", type: "parent" },
    { familyId: "default", sourceId: "10", targetId: "3", type: "parent" }, { familyId: "default", sourceId: "2", targetId: "4", type: "parent" },
    { familyId: "default", sourceId: "2", targetId: "5", type: "parent" }, { familyId: "default", sourceId: "6", targetId: "3", type: "spouse" },
  ],
};
