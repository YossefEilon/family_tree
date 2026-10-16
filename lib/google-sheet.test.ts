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

  it("accepts a Hebrew year on its own when the full date is unknown", () => {
    const graph = parseGoogleSheetGraph({
      nodes: [
        { id: "y1", name: "א", hebrewBirthDate: `ה'תרצ"ו` },
        { id: "y2", name: "ב", hebrewBirthDate: `תרצ"ו` },
        { id: "y3", name: "ג", hebrewBirthDate: "5696" },
        { id: "y4", name: "ד", hebrewBirthDate: `כ״ז בתשרי ה׳תשפ״ב` },
        { id: "y5", name: "ה", hebrewBirthDate: "לא תאריך" },
      ],
      links: [],
    });
    expect(graph.people.map(person => person.id)).toEqual(["y1", "y2", "y3", "y4"]);
  });
});
