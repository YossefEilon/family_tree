import { describe, expect, it } from "vitest";
import { ageLabel, type Person } from "./domain";

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
