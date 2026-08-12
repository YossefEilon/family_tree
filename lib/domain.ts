import { z } from "zod";

const hebrewDateMonths = ["תשרי", "חשוון", "כסלו", "טבת", "שבט", "אדר א׳", "אדר ב׳", "אדר", "ניסן", "אייר", "סיוון", "תמוז", "אב", "אלול"];

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

function isValidHebrewBirthDate(value: string): boolean {
  const match = value.match(/^(.+?) ב(.+?) (.+)$/);
  if (!match || !hebrewDateMonths.includes(match[2])) return false;
  const day = match[1].replace(/[״׳'"\s]/g, "");
  const year = match[3].replace(/[״׳'"\s]/g, "");
  const hasHebrewNumerals = (part: string) => /^[אבגדהוזחטיכלמנסעפצקרשתךםןףץ]+$/.test(part);
  const validDay = /^\d{1,2}$/.test(day) ? Number(day) >= 1 && Number(day) <= 30 : hasHebrewNumerals(day);
  const validYear = /^\d{4}$/.test(year) ? Number(year) >= 5000 && Number(year) <= 6000 : hasHebrewNumerals(year);
  return validDay && validYear;
}

export const personSchema = z.object({
  id: z.string().min(1), familyId: z.string().default("default"), name: z.string().min(1),
  previousLastName: z.string().optional(), role: z.string().optional(), birthDate: z.string().refine(isValidIsoDate, "תאריך לידה לועזי אינו תקין").optional(), birthYear: z.number().int().optional(),
  hebrewBirthDate: z.string().refine(isValidHebrewBirthDate, "תאריך לידה עברי אינו תקין").optional(), deathYear: z.number().int().optional(), hebrewDeathDate: z.string().optional(),
  isAlive: z.boolean().default(true), gender: z.enum(["male", "female", "neutral"]).default("neutral"),
  birthCountry: z.string().optional(), lifeStory: z.string().optional(),
  profileImageUrl: z.string().refine(value => {
    if (value.startsWith("data:image/")) return /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value);
    try { return new URL(value).protocol === "https:" || new URL(value).protocol === "http:"; } catch { return false; }
  }, "Invalid profile image URL").optional(),
});
export const relationshipSchema = z.object({
  id: z.string().optional(), familyId: z.string().default("default"), sourceId: z.string(), targetId: z.string(),
  type: z.enum(["parent", "spouse"]), hebrewMarriageDate: z.string().optional(),
});
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
  return Math.floor(Math.max(0, (person.deathYear ?? year) - person.birthYear));
}

export function ageLabel(person: Person, date = new Date()): string | undefined {
  const age = ageOf(person, date.getFullYear());
  if (age === undefined) return undefined;
  if (age > 0) return `${age} שנים`;

  const endMonth = person.deathYear === undefined ? date.getMonth() : 11;
  const months = Math.max(0, (date.getFullYear() - person.birthYear!) * 12 + endMonth);
  return `${months} חודשים`;
}

const hebrewMonths = ["תשרי", "חשוון", "כסלו", "טבת", "שבט", "אדר ב׳", "אדר א׳", "אדר", "ניסן", "אייר", "סיוון", "תמוז", "אב", "אלול"];

function normalizeHebrewDate(value: string): string {
  return value.replace(/[״“”\"׳’']/g, "").replace(/\s+/g, " ").trim();
}

export function currentHebrewMonth(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("he-u-ca-hebrew", { month: "long" }).formatToParts(date);
  return parts.find(part => part.type === "month")?.value ?? "";
}

export function hebrewMonthOf(dateValue: string | undefined): string | undefined {
  if (!dateValue) return undefined;
  const normalized = normalizeHebrewDate(dateValue);
  return hebrewMonths.find(month => normalized.includes(normalizeHebrewDate(month)));
}

export function isBirthdayInCurrentHebrewMonth(person: Person, date = new Date()): boolean {
  const birthMonth = hebrewMonthOf(person.hebrewBirthDate);
  return Boolean(birthMonth && birthMonth === currentHebrewMonth(date));
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
