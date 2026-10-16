import { describe, expect, it } from "vitest";
import { ageLabel, findPersonInGraph, type Person } from "./domain";

const person = (fields: Partial<Person> = {}): Person => ({
  id: "person", familyId: "default", name: "אדם", birthYear: 2021,
  isAlive: true, gender: "neutral", ...fields,
});

describe("ageLabel", () => {
  it("uses the full Gregorian date when the Hebrew date is missing", () => {
    expect(ageLabel(person({ birthDate: "2021-03-08" }), new Date("2026-08-14T12:00:00+03:00"))).toBe("5 שנים");
    expect(ageLabel(person({ birthDate: "2021-03-08" }), new Date("2026-03-07T12:00:00+02:00"))).toBe("4 שנים");
  });

  it("does not miscalculate the provided Hebrew date when a full date is available", () => {
    expect(ageLabel(person({ birthDate: "2021-03-08", hebrewBirthDate: "כ״ד באדר ב׳ תשפ״א" }), new Date("2026-08-14T12:00:00+03:00"))).toBe("5 שנים");
  });
});

describe("findPersonInGraph", () => {
  const testGraph = {
    people: [
      person({ id: "1", name: "יצחק אילון" }),
      person({ id: "1a6bd34c-547f-468f-9562-79ebaf8f6a5c", name: "בן ציון אלבז" }),
      person({ id: "60c70add-70a8-4f2f-a193-b255a0a042d4", name: "ניג'מה אלבז" }),
      person({ id: "1783974161539", name: "יעקב אלבז" }),
      person({ id: "1783884446224", name: "מרים אלבז" }),
      person({ id: "1783966365046", name: "משה (מוריס) אמזלג" }),
      person({ id: "elazar-elbaz-1936", name: "הרב אלעזר אלבז" }),
    ],
    relationships: [],
  };

  it("finds by exact ID", () => {
    expect(findPersonInGraph(testGraph, "1")?.name).toBe("יצחק אילון");
    expect(findPersonInGraph(testGraph, "1783974161539")?.name).toBe("יעקב אלבז");
  });

  it("finds by story key alias", () => {
    expect(findPersonInGraph(testGraph, "bentzion")?.id).toBe("1a6bd34c-547f-468f-9562-79ebaf8f6a5c");
    expect(findPersonInGraph(testGraph, "nedjma")?.id).toBe("60c70add-70a8-4f2f-a193-b255a0a042d4");
    expect(findPersonInGraph(testGraph, "yaakov")?.id).toBe("1783974161539");
    expect(findPersonInGraph(testGraph, "miriam")?.id).toBe("1783884446224");
    expect(findPersonInGraph(testGraph, "moshe_m")?.id).toBe("1783966365046");
    expect(findPersonInGraph(testGraph, "elazar")?.id).toBe("elazar-elbaz-1936");
  });

  it("finds by Hebrew name with titles and punctuation", () => {
    expect(findPersonInGraph(testGraph, "הרב בן ציון אלבז זצ״ל")?.name).toBe("בן ציון אלבז");
    expect(findPersonInGraph(testGraph, "משה מוריס אמזלג")?.name).toBe("משה (מוריס) אמזלג");
    expect(findPersonInGraph(testGraph, "מרים אלבז")?.name).toBe("מרים אלבז");
  });

  it("returns undefined for unknown person or empty query", () => {
    expect(findPersonInGraph(testGraph, "999999")).toBeUndefined();
    expect(findPersonInGraph(testGraph, "")).toBeUndefined();
    expect(findPersonInGraph(testGraph, null)).toBeUndefined();
  });
});
