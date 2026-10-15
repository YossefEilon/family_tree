import { describe, expect, it } from "vitest";
import { parseGoogleSheetGraph } from "./google-sheet";

describe("parseGoogleSheetGraph", () => {
  it("accepts numeric years, free-text roles and free-text ids", () => {
    const graph = parseGoogleSheetGraph({
      nodes: [
        { id: "elazar-elbaz-1936", name: "הרב אלעזר אלבז", death: 2021, role: "child" },
        { id: 1783974161539, name: "בדיקה", death: "2021.0", role: "spouse" },
      ],
      links: [],
    });
    expect(graph.people).toHaveLength(2);
    expect(graph.people[0].deathYear).toBe(2021);
    expect(graph.people[0].isAlive).toBe(false);
    expect(graph.people[0].role).toBe("child");
    expect(graph.people[1].id).toBe("1783974161539");
    expect(graph.people[1].deathYear).toBe(2021);
  });

  it("skips invalid rows instead of failing the whole tree", () => {
    const graph = parseGoogleSheetGraph({
      nodes: [
        { id: "good", name: "תקין" },
        { id: "bad-date", name: "תאריך שבור", birth: "30/02/2021" },
        { id: "bad-pic", name: "תמונה שבורה", profilePic: "not a url" },
        { id: "bad-hebrew", name: "עברי שבור", hebrewBirthDate: "לא תאריך" },
        { id: "good", name: "כפילות מזהה" },
      ],
      links: [
        { source: "good", target: "missing", type: "parent" },
        { source: "good", target: "good", type: "spouse" },
      ],
    });
    expect(graph.people.map(person => person.id)).toEqual(["good"]);
    expect(graph.relationships).toHaveLength(1);
    expect(graph.relationships[0].type).toBe("spouse");
  });

  it("throws when no valid people remain", () => {
    expect(() => parseGoogleSheetGraph({ nodes: [], links: [] })).toThrow();
    expect(() => parseGoogleSheetGraph({ nodes: [{ id: "x", name: "  " }], links: [] })).toThrow();
  });
});
