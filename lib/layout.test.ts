import { describe, expect, it } from "vitest";
import { calculateFamilyLayout, edgePath } from "./layout";
import { currentHebrewMonth, demoGraph, descendants, hebrewMonthOf, isBirthdayInCurrentHebrewMonth, spouses } from "./domain";

describe("family graph domain", () => {
  it("finds descendants without looping", () => expect([...descendants(demoGraph, "1")]).toEqual(expect.arrayContaining(["1", "2", "3", "4", "5"])));
  it("finds spouses in both directions", () => { expect(spouses(demoGraph, "10")).toEqual(new Set(["1"])); });
  it("recognizes Hebrew birthday months", () => {
    const date = new Date(2025, 7, 23);
    const month = currentHebrewMonth(date);
    const person = { ...demoGraph.people[0], hebrewBirthDate: `י״ב ב${month} תש״ל` };
    expect(hebrewMonthOf(person.hebrewBirthDate)).toBe(month);
    expect(isBirthdayInCurrentHebrewMonth(person, date)).toBe(true);
    expect(isBirthdayInCurrentHebrewMonth({ ...person, hebrewBirthDate: "י״ב בתשרי תש״ל" }, date)).toBe(false);
  });
});
describe("deterministic layout", () => {
  it("places every person and keeps generations ordered", () => { const a = calculateFamilyLayout(demoGraph, 1200), b = calculateFamilyLayout(demoGraph, 1200); expect(a.people.map(p => [p.id,p.x,p.y])).toEqual(b.people.map(p => [p.id,p.x,p.y])); expect(a.people.find(p => p.id === "4")!.y).toBeGreaterThan(a.people.find(p => p.id === "2")!.y); });
  it("keeps spouses on the same level", () => { const a = calculateFamilyLayout(demoGraph); expect(a.people.find(p => p.id === "1")!.y).toBe(a.people.find(p => p.id === "10")!.y); });
  it("uses one centered connector for a couple's child", () => {
    const layout = calculateFamilyLayout(demoGraph);
    const parentEdges = layout.relationships.filter(r => r.type === "parent" && r.targetId === "2");
    expect(parentEdges).toHaveLength(1);
    expect(parentEdges[0].parentIds).toEqual(["1", "10"]);
    expect(edgePath(parentEdges[0], layout.people)).toContain(`M ${(layout.people.find(p => p.id === "1")!.x + layout.people.find(p => p.id === "10")!.x) / 2}`);
  });
  it("places parents from separate family units above their child", () => {
    const graph = {
      people: [
        { id: "parent-a", familyId: "default", name: "הורה א", isAlive: true, gender: "neutral" as const },
        { id: "parent-b", familyId: "default", name: "הורה ב", isAlive: true, gender: "neutral" as const },
        { id: "child", familyId: "default", name: "ילד", isAlive: true, gender: "neutral" as const },
      ],
      relationships: [
        { familyId: "default", sourceId: "parent-a", targetId: "child", type: "parent" as const },
        { familyId: "default", sourceId: "parent-b", targetId: "child", type: "parent" as const },
      ],
    };
    const layout = calculateFamilyLayout(graph, 1200);
    const child = layout.people.find(person => person.id === "child")!;
    const parentXs = ["parent-a", "parent-b"].map(id => layout.people.find(person => person.id === id)!.x);
    expect(Math.min(...parentXs)).toBeLessThanOrEqual(child.x);
    expect(Math.max(...parentXs)).toBeGreaterThanOrEqual(child.x);
    expect(Math.max(...parentXs) - Math.min(...parentXs)).toBeLessThanOrEqual(320);
    expect(layout.people.filter(person => person.id !== "child").every(person => person.y < child.y)).toBe(true);
  });
});
