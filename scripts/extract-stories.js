const fs = require('fs');
const path = require('path');

const htmlPath = 'C:/Users/User/Downloads/code_artifact.html';
const html = fs.readFileSync(htmlPath, 'utf8');

// 1. Extract portraits
const portraits = {};
const portraitPillRegex = /<button class="portrait-pill"[^>]*data-person="([^"]+)"[^>]*>[\s\S]*?<img src="([^"]+)"/g;
let pMatch;
while ((pMatch = portraitPillRegex.exec(html)) !== null) {
  portraits[pMatch[1]] = pMatch[2];
}
console.log('Portraits extracted:', Object.keys(portraits));

// 2. Extract scripts data: elbazChapters, amzalagChapters, geoStations, nameChains, peopleRoster
function extractJsVariable(varName) {
  const startPattern = `var ${varName} = `;
  const startIndex = html.indexOf(startPattern);
  if (startIndex === -1) {
    console.error('Could not find', varName);
    return null;
  }
  const contentStart = startIndex + startPattern.length;
  // find matching semicolon or end
  // We can evaluate it using Function or regex
  let openBrackets = 0;
  let inString = false;
  let quoteChar = '';
  let escape = false;
  let endIndex = contentStart;

  for (let i = contentStart; i < html.length; i++) {
    const ch = html[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (inString) {
      if (ch === quoteChar) {
        inString = false;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      quoteChar = ch;
      continue;
    }
    if (ch === '[' || ch === '{') {
      openBrackets++;
    } else if (ch === ']' || ch === '}') {
      openBrackets--;
      if (openBrackets === 0) {
        endIndex = i + 1;
        break;
      }
    }
  }

  const jsCode = html.substring(contentStart, endIndex);
  try {
    return eval('(' + jsCode + ')');
  } catch (err) {
    console.error('Failed to eval', varName, err);
    return null;
  }
}

const elbazChapters = extractJsVariable('elbazChapters');
const amzalagChapters = extractJsVariable('amzalagChapters');
const geoStations = extractJsVariable('geoStations');
const nameChains = extractJsVariable('nameChains');
const peopleRoster = extractJsVariable('peopleRoster');

console.log('elbazChapters:', elbazChapters ? elbazChapters.length : 0);
console.log('amzalagChapters:', amzalagChapters ? amzalagChapters.length : 0);
console.log('geoStations:', geoStations ? geoStations.length : 0);
console.log('nameChains:', nameChains ? Object.keys(nameChains).length : 0);
console.log('peopleRoster:', peopleRoster ? peopleRoster.length : 0);

// Write portraits to lib/stories-portraits.ts
const portraitsTs = `// Auto-generated from code_artifact.html
export const storyPortraits: Record<string, string> = ${JSON.stringify(portraits, null, 2)};
`;
fs.writeFileSync(path.join(__dirname, '../lib/stories-portraits.ts'), portraitsTs, 'utf8');
console.log('Wrote lib/stories-portraits.ts');

// Write initial stories data
const initialStoriesData = {
  title: "מסע השורשים: שושלות אלבז ואמזלג",
  subtitle: "מאתיים שנות היסטוריה, קבלה, צורפות, מנהיגות קהילתית וציונות מחתרתית — משלוחות הרי האטלס, נווה המדבר של הסהרה האלג׳ירית ומלאח קזבלנקה, ועד להר הזיתים, קריית אתא, טירת הכרמל וגבעת שמואל.",
  heroBadge: "כרוניקה משפחתית אינטראקטיבית · דמנאת · גַרְדָאיָה · אַפְלוּ · קזבלנקה · ארץ ישראל",
  stats: {
    generations: "7 דורות",
    generationsDesc: "רצף שמות ויוחסין מתועד מ־1785 ועד 2025",
    branches: "4 ענפים",
    branchesDesc: "אלבז · זנו · אמזלג · שריקי",
    aliyahWaves: "1924 / 1957 / 1964",
    aliyahWavesDesc: "שלושה גלי עלייה לארץ ישראל",
    figuresCount: "78 דמויות",
    figuresCountDesc: "מוצלבות מתוך מסד הנתונים המשפחתי",
  },
  etymologies: [
    {
      title: "אמזלג (Amzallag)",
      desc: "משורש ברברי־מרוקאי שפירושו ״צורף כסף״ או ״חרש תכשיטים״. שושלת צורפים יהודים מיוחסת שפעלה בערי הנמל של מרוקו (מוגדור, קזבלנקה, סלא), לצד דיפלומטים ואישי ציבור ידועים."
    },
    {
      title: "שריקי (Chriqui / Cheriki)",
      desc: "ממוצא מגורשי ספרד (1492) שהתיישבו במרוקו. נגזר משם המבצר העתיק שֶׁרִיקָה (Jérica / Xèrica) במחוז קסטלון–ולנסיה בספרד, או מכינוי לתושבי המזרח."
    },
    {
      title: "אלבז (Elbaz / Al-Baz)",
      desc: "שם משפחה עתיק שפירושו בערבית ובספרדית ״הבז״ (Falcon / איה) — סמל של מהירות, אומץ וחדות עין. משפחת רבנים, דיינים ומקובלים מפורסמת במרוקו שמרכזה היה בדמנאת, מרקש ופאס."
    },
    {
      title: "זנו / זנו־ביהי (Zenou-Bihi)",
      desc: "משפחה שורשית מנאות המדבר של הסהרה האלג׳ירית (גרדאיה ועמק המזאב). השם קשור לשורש העברי ׳בניה׳ / ׳זן׳, ונודע בסוחריו ופרנסיו המכובדים שהיו קשורים למשפחות סבן־בבי ופרטוש."
    }
  ],
  elbazChapters,
  amzalagChapters,
  geoStations,
  nameChains,
  peopleRoster
};

const storiesDataTs = `// Auto-generated initial stories data from code_artifact.html
import { z } from "zod";

export const storyHighlightSchema = z.object({
  label: z.string(),
  val: z.string(),
});

export const storyChapterSchema = z.object({
  era: z.string(),
  loc: z.string(),
  title: z.string(),
  body: z.array(z.string()),
  quote: z.string(),
  cite: z.string(),
  highlights: z.array(storyHighlightSchema),
});

export const geoStationSchema = z.object({
  id: z.string(),
  name: z.string(),
  region: z.string(),
  branch: z.string(),
  desc: z.string(),
  figures: z.array(z.string()),
  memorial: z.string(),
});

export const nameChainNodeSchema = z.object({
  gen: z.string(),
  name: z.string(),
  info: z.string(),
});

export const nameChainSchema = z.object({
  label: z.string(),
  title: z.string(),
  nodes: z.array(nameChainNodeSchema),
});

export const rosterPersonSchema = z.object({
  key: z.string(),
  name: z.string(),
  branch: z.enum(["elbaz", "amzalag", "eilon"]),
  branchLabel: z.string(),
  dates: z.string(),
  burial: z.string(),
  bio: z.string(),
  rel: z.string(),
  personId: z.string().optional(),
});

export const etymologySchema = z.object({
  title: z.string(),
  desc: z.string(),
});

export const storiesDataSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  heroBadge: z.string(),
  stats: z.object({
    generations: z.string(),
    generationsDesc: z.string(),
    branches: z.string(),
    branchesDesc: z.string(),
    aliyahWaves: z.string(),
    aliyahWavesDesc: z.string(),
    figuresCount: z.string(),
    figuresCountDesc: z.string(),
  }),
  etymologies: z.array(etymologySchema).optional(),
  elbazChapters: z.array(storyChapterSchema),
  amzalagChapters: z.array(storyChapterSchema),
  geoStations: z.array(geoStationSchema),
  nameChains: z.record(z.string(), nameChainSchema),
  peopleRoster: z.array(rosterPersonSchema),
});

export type StoryHighlight = z.infer<typeof storyHighlightSchema>;
export type StoryChapter = z.infer<typeof storyChapterSchema>;
export type GeoStation = z.infer<typeof geoStationSchema>;
export type NameChainNode = z.infer<typeof nameChainNodeSchema>;
export type NameChain = z.infer<typeof nameChainSchema>;
export type RosterPerson = z.infer<typeof rosterPersonSchema>;
export type StoriesData = z.infer<typeof storiesDataSchema>;

export const initialStoriesData: StoriesData = ${JSON.stringify(initialStoriesData, null, 2)};
`;

fs.writeFileSync(path.join(__dirname, '../lib/stories-data.ts'), storiesDataTs, 'utf8');
console.log('Wrote lib/stories-data.ts');
