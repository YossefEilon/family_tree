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

const significantDateSchema = z.object({ label: z.string().min(1), date: z.string().refine(isValidHebrewBirthDate, "תאריך עברי אינו תקין") });

export const personSchema = z.object({
  id: z.string().min(1), familyId: z.string().default("default"), name: z.string().min(1),
  previousLastName: z.string().optional(), role: z.string().optional(), birthDate: z.string().refine(isValidIsoDate, "תאריך לידה לועזי אינו תקין").optional(), birthYear: z.number().int().optional(),
  hebrewBirthDate: z.string().refine(isValidHebrewBirthDate, "תאריך לידה עברי אינו תקין").optional(), deathYear: z.number().int().optional(), hebrewDeathDate: z.string().optional(), significantDates: z.array(significantDateSchema).optional(),
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
export type MonthlyEvent = { id: string; type: "birthday" | "anniversary" | "memorial" | "significant"; label: string; date: string; personIds: string[] };

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

function legacyAgeLabel(person: Person, date = new Date()): string | undefined {
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

const hebrewNumeralValues: Record<string, number> = {
  א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9, י: 10,
  כ: 20, ך: 20, ל: 30, מ: 40, ם: 40, נ: 50, ן: 50, ס: 60, ע: 70,
  פ: 80, ף: 80, צ: 90, ץ: 90, ק: 100, ר: 200, ש: 300, ת: 400,
};

function hebrewNumeralValue(value: string, isYear = false): number | undefined {
  const normalized = value.replace(/[׳״'"\s]/g, "");
  if (/^\d+$/.test(normalized)) return Number(normalized);
  const total = [...normalized].reduce((sum, letter) => sum + (hebrewNumeralValues[letter] ?? 0), 0);
  return total ? (isYear && total < 1000 ? total + 5000 : total) : undefined;
}

function hebrewDateParts(value: string): { day: number; month: string; year: number } | undefined {
  const match = value.match(/^(.+?) ב(.+?) (.+)$/);
  if (!match) return undefined;
  const day = hebrewNumeralValue(match[1]);
  const year = hebrewNumeralValue(match[3], true);
  const month = hebrewMonthOf(value);
  return day && year && month ? { day, month, year } : undefined;
}

function currentHebrewDateParts(date: Date): { day: number; month: string; year: number } | undefined {
  const parts = new Intl.DateTimeFormat("he-u-ca-hebrew", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jerusalem" }).formatToParts(date);
  const day = Number(parts.find(part => part.type === "day")?.value);
  const year = Number(parts.find(part => part.type === "year")?.value);
  const month = parts.find(part => part.type === "month")?.value;
  return day && year && month ? { day, month, year } : undefined;
}

function hebrewMonthIndex(month: string): number {
  const normalized = normalizeHebrewDate(month);
  return hebrewMonths.findIndex(candidate => normalizeHebrewDate(candidate) === normalized);
}

export function ageLabel(person: Person, date = new Date()): string | undefined {
  const birth = person.hebrewBirthDate ? hebrewDateParts(person.hebrewBirthDate) : undefined;
  const comparisonDate = person.deathYear === undefined ? date : new Date(person.deathYear, 11, 31);
  const current = birth ? currentHebrewDateParts(comparisonDate) : undefined;
  if (birth && current) {
    const birthMonth = hebrewMonthIndex(birth.month);
    const currentMonth = hebrewMonthIndex(current.month);
    if (birthMonth >= 0 && currentMonth >= 0) {
      const birthdayPassed = currentMonth > birthMonth || (currentMonth === birthMonth && current.day >= birth.day);
      const years = Math.max(0, current.year - birth.year - (birthdayPassed ? 0 : 1));
      if (years > 0) return `${years} שנים`;
      const months = Math.max(0, (current.year - birth.year) * 12 + currentMonth - birthMonth - (current.day < birth.day ? 1 : 0));
      return `${months} חודשים`;
    }
  }
  return legacyAgeLabel(person, date);
}

export function formatBirthDate(birthDate?: string): string | undefined {
  if (!birthDate) return undefined;
  const match = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : birthDate;
}

export function currentHebrewMonth(date = new Date()): string {
  const jerusalemDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const datePart = (type: string) => Number(jerusalemDate.find(part => part.type === type)?.value);
  const sunset = jerusalemSunsetUtc(datePart("year"), datePart("month"), datePart("day"));
  const hebrewDate = date >= sunset ? new Date(date.getTime() + 24 * 60 * 60 * 1000) : date;
  const parts = new Intl.DateTimeFormat("he-u-ca-hebrew", { month: "long", timeZone: "Asia/Jerusalem" }).formatToParts(hebrewDate);
  return parts.find(part => part.type === "month")?.value ?? "";
}

// Hebrew dates begin at sunset. This uses the NOAA solar-position approximation
// for Jerusalem, avoiding a network dependency.
function jerusalemSunsetUtc(year: number, month: number, day: number): Date {
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfYear = Math.floor((date.getTime() - Date.UTC(year, 0, 0)) / 86400000);
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1);
  const equationOfTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const latitude = 31.7683 * Math.PI / 180;
  const hourAngle = Math.acos(Math.cos(90.833 * Math.PI / 180) / (Math.cos(latitude) * Math.cos(declination)) - Math.tan(latitude) * Math.tan(declination)) * 180 / Math.PI;
  const sunsetMinutesUtc = 720 - 4 * 35.2137 - equationOfTime + 4 * hourAngle;
  return new Date(date.getTime() + sunsetMinutesUtc * 60000);
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

export function monthlyEvents(graph: FamilyGraph, date = new Date()): MonthlyEvent[] {
  const month = currentHebrewMonth(date);
  const events: MonthlyEvent[] = [];
  for (const person of graph.people) {
    if (person.hebrewBirthDate && hebrewMonthOf(person.hebrewBirthDate) === month) events.push({ id: `birthday-${person.id}`, type: "birthday", label: `יום הולדת — ${person.name}`, date: person.hebrewBirthDate, personIds: [person.id] });
    if (person.hebrewDeathDate && hebrewMonthOf(person.hebrewDeathDate) === month) events.push({ id: `memorial-${person.id}`, type: "memorial", label: `יום זיכרון — ${person.name}`, date: person.hebrewDeathDate, personIds: [person.id] });
    for (const [index, event] of (person.significantDates ?? []).entries()) if (hebrewMonthOf(event.date) === month) events.push({ id: `significant-${person.id}-${index}`, type: "significant", label: `${event.label} — ${person.name}`, date: event.date, personIds: [person.id] });
  }
  for (const [index, relationship] of graph.relationships.entries()) {
    if (relationship.type !== "spouse" || !relationship.hebrewMarriageDate || hebrewMonthOf(relationship.hebrewMarriageDate) !== month) continue;
    const names = [relationship.sourceId, relationship.targetId].map(id => graph.people.find(person => person.id === id)?.name).filter(Boolean).join(" ו-");
    events.push({ id: `anniversary-${index}`, type: "anniversary", label: `יום נישואין — ${names}`, date: relationship.hebrewMarriageDate, personIds: [relationship.sourceId, relationship.targetId] });
  }
  return events.sort((left, right) => left.date.localeCompare(right.date, "he"));
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
