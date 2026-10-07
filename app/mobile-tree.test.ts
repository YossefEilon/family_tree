import { describe, expect, it } from "vitest";
import { demoGraph } from "@/lib/domain";
import { relativesOf } from "./mobile-tree";

describe("mobile relatives", () => {
  it("finds parents, siblings, partners and children", () => {
    // דוד (2): parents 1,10; sibling 3; children 4,5; no partner
    const result = relativesOf(demoGraph, "2");
    expect(result.parents.map(person => person.id).sort()).toEqual(["1", "10"]);
    expect(result.siblings.map(person => person.id)).toEqual(["3"]);
    expect(result.partners).toEqual([]);
    // Children read better oldest-first: 4 (1982) before 5 (1985)
    expect(result.children.map(person => person.id)).toEqual(["4", "5"]);
  });

  it("finds partners in both directions", () => {
    expect(relativesOf(demoGraph, "1").partners.map(person => person.id)).toEqual(["10"]);
    expect(relativesOf(demoGraph, "3").partners.map(person => person.id)).toEqual(["6"]);
  });

  it("handles a person with no relatives", () => {
    const result = relativesOf(
      { people: [{ id: "x", familyId: "default", name: "בודד", isAlive: true, gender: "neutral" }], relationships: [] },
      "x",
    );
    expect([result.parents, result.siblings, result.partners, result.children].every(list => list.length === 0)).toBe(true);
  });
});
