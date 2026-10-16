import { describe, expect, it } from "vitest";
import { initialStoriesData, storiesDataSchema } from "./stories-data";
import { storyPortraits } from "./stories-portraits";

describe("Family Stories Data", () => {
  it("validates initialStoriesData against storiesDataSchema", () => {
    const parsed = storiesDataSchema.safeParse(initialStoriesData);
    expect(parsed.success).toBe(true);
  });

  it("contains all required chapters for Elbaz and Amzalag", () => {
    expect(initialStoriesData.elbazChapters.length).toBeGreaterThanOrEqual(6);
    expect(initialStoriesData.amzalagChapters.length).toBeGreaterThanOrEqual(5);

    // Verify key titles exist
    expect(initialStoriesData.elbazChapters[0].title).toContain("דמנאת");
    expect(initialStoriesData.elbazChapters[4].title).toContain("אליהו אלבז הי״ד");
    expect(initialStoriesData.amzalagChapters[0].title).toContain("יוסף ורחל אמזלג");
    expect(initialStoriesData.amzalagChapters[4].title).toContain("מבצע יכין");
  });

  it("contains heritage stations and name continuity chains", () => {
    expect(initialStoriesData.geoStations.length).toBe(6);
    expect(initialStoriesData.geoStations.map((s) => s.id)).toEqual([
      "demnate",
      "ghardaia",
      "aflou",
      "casablanca",
      "jerusalem",
      "kiryat_ata",
    ]);

    expect(Object.keys(initialStoriesData.nameChains)).toContain("moshe");
    expect(Object.keys(initialStoriesData.nameChains)).toContain("yosef");
    expect(Object.keys(initialStoriesData.nameChains)).toContain("yaakov");
    expect(Object.keys(initialStoriesData.nameChains)).toContain("miriam");
  });

  it("includes founding portraits matching storyPortraits dictionary", () => {
    expect(storyPortraits.bentzion).toBeDefined();
    expect(storyPortraits.nedjma).toBeDefined();
    expect(storyPortraits.yaakov).toBeDefined();
    expect(storyPortraits.moshe_m).toBeDefined();
    expect(storyPortraits.perla).toBeDefined();
    expect(initialStoriesData.peopleRoster.length).toBeGreaterThanOrEqual(18);
  });
});
