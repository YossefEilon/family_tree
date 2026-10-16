"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { calculateFamilyLayout, edgePath, NODE_HEIGHT, NODE_WIDTH } from "@/lib/layout";
import { ageLabel, currentHebrewMonth, descendants, formatBirthDate, isBirthdayInCurrentHebrewMonth, monthlyEvents, spouses, type FamilyGraph, type Person } from "@/lib/domain";
import { fetchGoogleSheetGraph, GoogleSheetRequestError, saveGoogleSheetGraph } from "@/lib/google-sheet";
import MobileFamilyTree, { Avatar, personMeta, relativesOf } from "./mobile-tree";

type PersonStats = { children: number; descendants: number };
type RelationshipDetails = { hebrewMarriageDate?: string };
type ViewMode = "canvas" | "explorer" | "directory";

function newPersonId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isMobile;
}

function friendlyGraphLoadError(error: unknown): string {
  if (error instanceof GoogleSheetRequestError) {
    if (error.status === 404) return "מקור הנתונים לא נמצא כרגע. נסו לרענן את הדף בעוד כמה רגעים.";
    if (error.status === 503) return "מקור הנתונים אינו מוגדר כרגע. נסו שוב מאוחר יותר.";
  }
  return "לא הצלחנו לטעון את עץ המשפחה כרגע. נסו לרענן את הדף בעוד כמה רגעים.";
}

function hebrewMonthLabel(date: Date): string {
  return currentHebrewMonth(date);
}

function shiftHebrewMonth(date: Date, direction: -1 | 1): Date {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  const original = currentHebrewMonth(result);
  for (let days = 0; days < 45; days += 1) {
    result.setDate(result.getDate() + direction);
    if (currentHebrewMonth(result) !== original) return result;
  }
  return result;
}

function eventIcon(type: "birthday" | "anniversary" | "memorial" | "significant"): string {
  return { birthday: "🎂", anniversary: "💍", memorial: "🕯️", significant: "📌" }[type];
}

function eventTypeLabel(type: "birthday" | "anniversary" | "memorial" | "significant"): string {
  return { birthday: "יום הולדת", anniversary: "יום נישואין", memorial: "אזכרה", significant: "אירוע" }[type];
}

function searchResultSubtitle(person: Person, graph: FamilyGraph): string | undefined {
  const parts: string[] = [];
  if (person.role?.trim()) parts.push(person.role.trim());
  const age = ageLabel(person);
  if (person.deathYear !== undefined) {
    parts.push(`נפטר/ה ב־${person.deathYear}${age ? ` (${age})` : ""}`);
  } else if (age) {
    parts.push(age);
  }
  const rels = relativesOf(graph, person.id);
  if (rels.parents.length > 0) {
    parts.push(`הורים: ${rels.parents.map(p => p.name).join(" ו-")}`);
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function QuickHelpPanel({ onClose, onSelectMode }: { onClose: () => void; onSelectMode: (mode: ViewMode) => void }) {
  return (
    <div className="overlay" role="presentation" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="panel help-panel" role="dialog" aria-modal="true" aria-labelledby="help-dialog-title">
        <div className="panel-header">
          <h2 id="help-dialog-title">איך מנווטים בעץ המשפחה?</h2>
          <button className="button ghost" aria-label="סגירת חלון עזרה" onClick={onClose}>✕</button>
        </div>
        <p className="help-intro">בחרו את דרך הצפייה הנוחה לכם ביותר מתוך שלוש התצוגות בראש המסך:</p>
        <div className="help-cards">
          <button type="button" className="help-card" onClick={() => { onSelectMode("canvas"); onClose(); }}>
            <span className="help-card-icon" aria-hidden="true">🌳</span>
            <div>
              <strong>מפת העץ המלאה</strong>
              <p>מבט-על על כל הדורות והענפים. ניתן לגרור את המפה לכל כיוון, להתקרב ולהתרחק עם הגלגלת או הכפתורים בפינה, וללחוץ על כל אדם לפתיחת הכרטיס שלו.</p>
            </div>
          </button>
          <button type="button" className="help-card" onClick={() => { onSelectMode("explorer"); onClose(); }}>
            <span className="help-card-icon" aria-hidden="true">🧭</span>
            <div>
              <strong>סייר משפחה (מומלץ לניווט קל!)</strong>
              <p>מציג אדם אחד במרכז ומסביבו את ההורים, בני הזוג, האחים והילדים שלו. לחיצה על כל קרוב משפחה מעבירה את המוקד אליו צעד-אחר-צעד.</p>
            </div>
          </button>
          <button type="button" className="help-card" onClick={() => { onSelectMode("directory"); onClose(); }}>
            <span className="help-card-icon" aria-hidden="true">📖</span>
            <div>
              <strong>אלפון המשפחה</strong>
              <p>רשימה מסודרת של כל בני המשפחה עם אפשרות סינון לפי חוגגי יום הולדת החודש, מיון לפי שם או גיל, וחיפוש מהיר.</p>
            </div>
          </button>
        </div>
        <div className="panel-actions">
          <button className="button primary" onClick={onClose}>הבנתי, בואו נתחיל!</button>
        </div>
      </section>
    </div>
  );
}

function HebrewCalendarPanel({ date, onChangeMonth, events, onClose, onSelectPerson }: { date: Date; onChangeMonth: (direction: -1 | 1) => void; events: ReturnType<typeof monthlyEvents>; onClose: () => void; onSelectPerson: (id: string) => void }) {
  return <div className="overlay" role="presentation" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="panel calendar-panel" role="dialog" aria-modal="true" aria-labelledby="hebrew-calendar-title">
    <div className="panel-header"><h2 id="hebrew-calendar-title">📅 אירועים משפחתיים לפי חודש עברי</h2><button className="button ghost" aria-label="סגירת לוח השנה" onClick={onClose}>✕</button></div>
    <div className="calendar-heading"><button className="button" onClick={() => onChangeMonth(-1)} aria-label="החודש הקודם">→ החודש הקודם</button><strong>חודש {hebrewMonthLabel(date)}</strong><button className="button" onClick={() => onChangeMonth(1)} aria-label="החודש הבא">החודש הבא ←</button></div>
    {events.length > 0 ? <div className="calendar-events">{events.map(event => <button key={event.id} className={`calendar-event ${event.type}`} onClick={() => { onSelectPerson(event.personIds[0]); onClose(); }}><span className="calendar-event-icon">{eventIcon(event.type)}</span><div className="calendar-event-body"><strong>{event.label}</strong><small>{event.date}</small></div><span className={`calendar-event-tag ${event.type}`}>{eventTypeLabel(event.type)}</span></button>)}</div> : <div className="birthday-empty calendar-empty"><span className="calendar-empty-icon" aria-hidden="true">🗓️</span><p>אין אירועים רשומים בחודש {hebrewMonthLabel(date)}</p><small>נסו לעבור לחודש הקודם או הבא</small></div>}
  </section></div>;
}

const hebrewBirthMonths = ["תשרי", "חשוון", "כסלו", "טבת", "שבט", "אדר א׳", "אדר ב׳", "ניסן", "אייר", "סיוון", "תמוז", "אב", "אלול"];
const hebrewDateYears = Array.from({ length: 151 }, (_, index) => 5700 + index);
const hebrewNumeralValues: Record<string, number> = { א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9, י: 10, כ: 20, ל: 30, מ: 40, ם: 40, נ: 50, ן: 50, ס: 60, ע: 70, פ: 80, ף: 80, צ: 90, ץ: 90, ק: 100, ר: 200, ש: 300, ת: 400 };

function hebrewNumeral(value: number): string {
  const normalized = value >= 5000 ? value - 5000 : value;
  let remaining = normalized;
  let result = "";
  for (const [letter, amount] of [["ת", 400], ["ש", 300], ["ר", 200], ["ק", 100], ["צ", 90], ["פ", 80], ["ע", 70], ["ס", 60], ["נ", 50], ["מ", 40], ["ל", 30], ["כ", 20], ["י", 10], ["ט", 9], ["ח", 8], ["ז", 7], ["ו", 6], ["ה", 5], ["ד", 4], ["ג", 3], ["ב", 2], ["א", 1]] as const) {
    while (remaining >= amount) { result += letter; remaining -= amount; }
  }
  if (result.endsWith("יה")) result = `${result.slice(0, -2)}טו`;
  if (result.endsWith("יו")) result = `${result.slice(0, -2)}טז`;
  return result.length > 1 ? `${result.slice(0, -1)}״${result.slice(-1)}` : `${result}׳`;
}

function numeralValue(value: string, isYear = false): number | undefined {
  const normalized = value.replace(/[״׳'"\s]/g, "");
  if (/^\d+$/.test(normalized)) return Number(normalized);
  const total = [...normalized].reduce((sum, letter) => sum + (hebrewNumeralValues[letter] ?? 0), 0);
  return total ? (isYear && total < 1000 ? total + 5000 : total) : undefined;
}

function HebrewDateFields({ value, onChange, label = "תאריך עברי" }: { value?: string; onChange: (value: string | undefined) => void; label?: string }) {
  const listId = useId().replace(/:/g, "");
  const parts = value?.match(/^(.+?) ב(.+?) (.+)$/);
  const day = numeralValue(parts?.[1] ?? "");
  const year = numeralValue(parts?.[3] ?? "", true);
  const [dayInput, setDayInput] = useState(day ? hebrewNumeral(day) : "");
  const [monthInput, setMonthInput] = useState(parts?.[2] ?? "");
  const [yearInput, setYearInput] = useState(year ? hebrewNumeral(year) : "");
  const setPart = (part: "day" | "month" | "year", nextValue: string) => {
    const current = { day: dayInput, month: monthInput, year: yearInput };
    current[part] = nextValue;
    if (part === "day") setDayInput(nextValue);
    if (part === "month") setMonthInput(nextValue);
    if (part === "year") setYearInput(nextValue);
    const parsedDay = numeralValue(current.day);
    const parsedYear = numeralValue(current.year, true);
    if (parsedDay && parsedDay >= 1 && parsedDay <= 30 && hebrewBirthMonths.includes(current.month) && parsedYear) onChange(`${hebrewNumeral(parsedDay)} ב${current.month} ${hebrewNumeral(parsedYear)}`);
    else if (!nextValue) onChange(undefined);
  };
  return <div className="field"><span>{label}</span><div className="date-selects"><label className="date-part">יום<input list={`${listId}-days`} aria-label="יום עברי" value={dayInput} placeholder="י״ב" onChange={event => setPart("day", event.target.value)} /><datalist id={`${listId}-days`}>{Array.from({ length: 30 }, (_, index) => <option key={index + 1} value={hebrewNumeral(index + 1)} />)}</datalist></label><label className="date-part">חודש<input list={`${listId}-months`} aria-label="חודש עברי" value={monthInput} placeholder="אב" onChange={event => setPart("month", event.target.value)} /><datalist id={`${listId}-months`}>{hebrewBirthMonths.map(month => <option key={month} value={month} />)}</datalist></label><label className="date-part">שנה<input list={`${listId}-years`} aria-label="שנה עברית" value={yearInput} placeholder="תשפ״ו" onChange={event => setPart("year", event.target.value)} /><datalist id={`${listId}-years`}>{hebrewDateYears.map(optionYear => <option key={optionYear} value={hebrewNumeral(optionYear)} />)}</datalist></label></div><small className="date-hint">אפשר להקליד או לבחור מהרשימה</small></div>;
}

function BirthDateFields({ birthDate, hebrewBirthDate, onChange }: { birthDate?: string; hebrewBirthDate?: string; onChange: (key: "birthDate" | "birthYear" | "hebrewBirthDate", value: string | number | undefined) => void }) {
  const datePickerRef = useRef<HTMLInputElement>(null);
  const [typedBirthDate, setTypedBirthDate] = useState("");
  const setBirthDate = (value: string) => onChange("birthDate", value || undefined);
  const formattedBirthDate = birthDate ? birthDate.split("-").reverse().join("/") : "";
  useEffect(() => setTypedBirthDate(formattedBirthDate), [formattedBirthDate]);
  const updateTypedBirthDate = (value: string) => {
    setTypedBirthDate(value);
    const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return;
    const [, day, month, year] = match;
    const paddedDay = day.padStart(2, "0");
    const paddedMonth = month.padStart(2, "0");
    const candidate = `${year}-${paddedMonth}-${paddedDay}`;
    const parsed = new Date(`${candidate}T00:00:00`);
    if (parsed.getFullYear() === Number(year) && parsed.getMonth() + 1 === Number(month) && parsed.getDate() === Number(day)) {
      setBirthDate(candidate);
      onChange("birthYear", Number(year));
    }
  };
  return <>
    <label className="field">תאריך לידה לועזי<div className="date-picker"><input className="date-display" type="text" dir="ltr" inputMode="numeric" value={typedBirthDate} placeholder="יום/חודש/שנה" onChange={event => updateTypedBirthDate(event.target.value)} onBlur={() => setTypedBirthDate(formattedBirthDate)} aria-label="תאריך לידה בפורמט יום חודש שנה" /><input ref={datePickerRef} className="calendar-input" type="date" lang="he-IL" value={birthDate ?? ""} onChange={event => { setBirthDate(event.target.value); onChange("birthYear", event.target.value ? Number(event.target.value.slice(0, 4)) : undefined); }} aria-label="בחירת תאריך לידה בלוח שנה" /></div></label>
    <HebrewDateFields value={hebrewBirthDate} label="תאריך לידה עברי" onChange={value => onChange("hebrewBirthDate", value)} />
  </>;
}

function PersonCard({ person, stats, selected, canEdit, onClick, onAddMember }: { person: Person & { x: number; y: number }; stats: PersonStats; selected: boolean; canEdit?: boolean; onClick: () => void; onAddMember?: () => void }) {
  const childrenCount = stats.children;
  const descendantsCount = stats.descendants;
  const requestAddMember = () => { if (onAddMember) onAddMember(); else if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("family:add-member", { detail: person.id })); };
  const isDeceased = !person.isAlive || person.deathYear !== undefined;
  const status = isDeceased ? `🕯️ נפטר/ה${person.deathYear !== undefined && ageLabel(person) ? ` (${ageLabel(person)})` : ""}` : (ageLabel(person) ?? "");
  const yearsText = person.birthYear ? `${person.birthYear}${person.deathYear ? `–${person.deathYear}` : ""}` : "";
  const statusLine = [status, yearsText].filter(Boolean).join(" · ") || "לחצו לצפייה בכרטיס";
  const familyMeta = childrenCount > 0 ? `👶 ${childrenCount} ${childrenCount === 1 ? "ילד/ה" : "ילדים"}${descendantsCount > childrenCount ? ` · ${descendantsCount} צאצאים` : ""}` : "לחיצה לכרטיס מלא ←";
  const hasBirthdayThisMonth = isBirthdayInCurrentHebrewMonth(person);
  const displayName = person.name.length > 18 ? `${person.name.slice(0, 17)}…` : person.name;
  const subTitle = person.role?.trim() ? person.role : person.previousLastName ? `לבית ${person.previousLastName}` : "";
  const displaySubTitle = subTitle.length > 22 ? `${subTitle.slice(0, 21)}…` : subTitle;
  const showAddButton = Boolean(canEdit);
  const initial = person.name.trim().charAt(0) || "?";

  return <g className={`person-card ${selected ? "selected" : ""} ${isDeceased ? "deceased" : ""}`} transform={`translate(${person.x - NODE_WIDTH / 2},${person.y - NODE_HEIGHT / 2})`} onClick={onClick} role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}>
    <rect className="person-card-bg" width={NODE_WIDTH} height={NODE_HEIGHT} rx="18" />
    <path className={`person-card-accent ${person.gender}`} d="M 18 2 H 232 A 16 16 0 0 1 248 18 V 12 H 2 V 18 A 16 16 0 0 1 18 2 Z" />
    <path className="person-card-footer-bg" d="M 2 92 H 248 V 114 A 16 16 0 0 1 232 130 H 18 A 16 16 0 0 1 2 114 Z" />
    {hasBirthdayThisMonth && <g className="birthday-card-balloons" aria-hidden="true">
      <g className="card-balloon card-balloon-pink"><ellipse cx="218" cy="20" rx="7" ry="9" /><path d="M218 29v18" /></g>
      <g className="card-balloon card-balloon-blue"><ellipse cx="235" cy="31" rx="7" ry="9" /><path d="M235 40v15" /></g>
      <g className="card-balloon card-balloon-yellow"><ellipse cx="202" cy="35" rx="7" ry="9" /><path d="M202 44v12" /></g>
    </g>}
    <circle className={`person-card-ring ${person.gender}`} cx="39" cy="48" r="24" />
    {person.profileImageUrl ? (
      <image className="profile-image" href={person.profileImageUrl} x="17" y="26" width="44" height="44" preserveAspectRatio="xMidYMid slice" />
    ) : (
      <g>
        <circle className={`dot ${person.gender}`} cx="39" cy="48" r="21" />
        <text className="avatar-initial" x="39" y="54" textAnchor="middle">{initial}</text>
      </g>
    )}
    <text className="name" x="72" y="38" textAnchor="start" direction="ltr" unicodeBidi="plaintext"><title>{person.name}</title>{displayName}</text>
    {displaySubTitle ? (
      <text className={`meta ${person.role?.trim() ? "role" : ""}`} x="72" y="56" textAnchor="start" direction="ltr" unicodeBidi="plaintext">{displaySubTitle}</text>
    ) : null}
    <text className="meta status-line" x="72" y={displaySubTitle ? "74" : "60"} textAnchor="start" direction="ltr" unicodeBidi="plaintext">{statusLine}</text>
    <line x1="12" y1="92" x2="238" y2="92" stroke="#e6ecf5" strokeWidth="1" />
    {hasBirthdayThisMonth && <g className="birthday-badge"><title>יום הולדת בחודש העברי הנוכחי</title><rect x="158" y="99" width="78" height="24" rx="12" /><text x="197" y="115" textAnchor="middle">🎂 החודש</text></g>}
    {!showAddButton && <text className={`meta family-meta ${childrenCount > 0 ? "has-children" : ""}`} x="16" y="115" textAnchor="start" direction="ltr" unicodeBidi="plaintext">{familyMeta}</text>}
    {showAddButton && <g className="add-member-button" role="button" tabIndex={0} onClick={event => { event.stopPropagation(); requestAddMember(); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.stopPropagation(); requestAddMember(); } }}><rect x="14" y="99" width="110" height="24" rx="12" /><text x="69" y="115" textAnchor="middle">+ הוספת קשר</text></g>}
  </g>;
}

function BirthdayBalloons() {
  return <div className="birthday-balloons" aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <span key={index} className={`balloon balloon-${index + 1}`} />)}</div>;
}

type ImageEditorState = {
  src: string;
  zoom: number;
  rotation: number;
  pan: { x: number; y: number };
  width: number;
  height: number;
};

function imagePanLimit(editor: ImageEditorState, axis: "x" | "y"): number {
  const isRotated = editor.rotation % 180 !== 0;
  const effectiveWidth = isRotated ? editor.height : editor.width;
  const effectiveHeight = isRotated ? editor.width : editor.height;
  const aspect = effectiveWidth / effectiveHeight;
  const overflowRatio = axis === "x" ? Math.max(1, aspect) : Math.max(1, 1 / aspect);
  return Math.max(0, (272 * overflowRatio * editor.zoom - 272) / 2);
}

async function compressImageToSafeSize(
  image: HTMLImageElement,
  editor: ImageEditorState,
  maxChars = 44000
): Promise<string> {
  const isRotated = editor.rotation % 180 !== 0;
  const srcW = isRotated ? image.naturalHeight : image.naturalWidth;
  const srcH = isRotated ? image.naturalWidth : image.naturalHeight;

  // Progressive compression steps to ensure 100% success within Google Sheets cell limit
  const steps = [
    { size: 360, quality: 0.82 },
    { size: 360, quality: 0.70 },
    { size: 320, quality: 0.65 },
    { size: 280, quality: 0.60 },
    { size: 240, quality: 0.55 },
    { size: 200, quality: 0.50 },
    { size: 160, quality: 0.45 },
  ];

  for (const step of steps) {
    const { size, quality } = step;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);

    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate((editor.rotation * Math.PI) / 180);

    const previewSize = 272;
    const scale = Math.max(size / srcW, size / srcH) * editor.zoom;
    const panRatio = size / previewSize;

    // Transform pan vector back from screen space into image rotated coordinate space
    const rad = (-editor.rotation * Math.PI) / 180;
    const rotPanX = editor.pan.x * Math.cos(rad) - editor.pan.y * Math.sin(rad);
    const rotPanY = editor.pan.x * Math.sin(rad) + editor.pan.y * Math.cos(rad);

    const drawW = image.naturalWidth * scale;
    const drawH = image.naturalHeight * scale;

    ctx.drawImage(
      image,
      -drawW / 2 + rotPanX * panRatio,
      -drawH / 2 + rotPanY * panRatio,
      drawW,
      drawH
    );
    ctx.restore();

    const result = canvas.toDataURL("image/jpeg", quality);
    if (result.length <= maxChars || step === steps[steps.length - 1]) {
      return result;
    }
  }
  throw new Error("לא ניתן לדחוס את התמונה");
}

function ProfileImageField({ value, onChange }: { value?: string; onChange: (value: string | undefined) => void }) {
  const [editor, setEditor] = useState<ImageEditorState | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [mode, setMode] = useState<"file" | "url">("file");
  const [urlInput, setUrlInput] = useState("");
  const [urlPreviewValid, setUrlPreviewValid] = useState<boolean | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const draggingRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const src = editor?.src;
    return () => { if (src && src.startsWith("blob:")) URL.revokeObjectURL(src); };
  }, [editor?.src]);

  const closeEditor = () => {
    setEditor(null);
    setImageError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const selectFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setImageError("נא לבחור קובץ תמונה תקין (JPG, PNG, WebP).");
      return;
    }
    setImageError(null);
    const src = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => setEditor({
      src,
      zoom: 1,
      rotation: 0,
      pan: { x: 0, y: 0 },
      width: image.naturalWidth,
      height: image.naturalHeight
    });
    image.onerror = () => {
      URL.revokeObjectURL(src);
      setImageError("לא ניתן לפתוח את התמונה. נסו קובץ אחר.");
    };
    image.src = src;
  };

  const rotateImage = () => {
    if (!editor) return;
    const nextRotation = (editor.rotation + 90) % 360;
    setEditor({ ...editor, rotation: nextRotation, pan: { x: 0, y: 0 } });
  };

  const resetCrop = () => {
    if (!editor) return;
    setEditor({ ...editor, zoom: 1, pan: { x: 0, y: 0 } });
  };

  const saveEditedImage = async () => {
    if (!editor) return;
    setIsProcessing(true);
    setImageError(null);
    try {
      const image = new Image();
      image.onload = async () => {
        try {
          const compressed = await compressImageToSafeSize(image, editor);
          onChange(compressed);
          closeEditor();
        } catch {
          setImageError("שגיאה בעיבוד התמונה. נסו שוב.");
        } finally {
          setIsProcessing(false);
        }
      };
      image.onerror = () => {
        setImageError("לא ניתן לטעון את התמונה לעיבוד.");
        setIsProcessing(false);
      };
      image.src = editor.src;
    } catch {
      setImageError("שגיאה בעיבוד התמונה.");
      setIsProcessing(false);
    }
  };

  const updatePan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!editor || !draggingRef.current) return;
    const maxPanX = imagePanLimit(editor, "x");
    const maxPanY = imagePanLimit(editor, "y");
    const x = editor.pan.x + event.clientX - lastPointerRef.current.x;
    const y = editor.pan.y + event.clientY - lastPointerRef.current.y;
    setEditor({
      ...editor,
      pan: { x: Math.max(-maxPanX, Math.min(maxPanX, x)), y: Math.max(-maxPanY, Math.min(maxPanY, y)) }
    });
    lastPointerRef.current = { x: event.clientX, y: event.clientY };
  };

  const handleWheelZoom = (e: React.WheelEvent) => {
    if (!editor) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.08 : -0.08;
    const zoom = Math.max(1, Math.min(3, editor.zoom + delta));
    const next = { ...editor, zoom };
    const maxPanX = imagePanLimit(next, "x");
    const maxPanY = imagePanLimit(next, "y");
    setEditor({
      ...next,
      pan: { x: Math.max(-maxPanX, Math.min(maxPanX, editor.pan.x)), y: Math.max(-maxPanY, Math.min(maxPanY, editor.pan.y)) }
    });
  };

  const handleUrlApply = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    if (!/^https?:\/\//i.test(trimmed)) {
      setImageError("נא להזין כתובת תקינה שמתחילה ב-http:// או https://");
      return;
    }
    onChange(trimmed);
    setUrlInput("");
    setUrlPreviewValid(null);
  };

  return <div className="image-field full">
    <div className="image-field-heading">
      <span>תמונת פרופיל</span>
      <small>{value ? "יש תמונה מוגדרת · ניתן להחליף או להסיר" : "הוספת תמונה לפרופיל"}</small>
    </div>

    {editor ? (
      <div className="image-editor" role="group" aria-label="עריכה והתאמת תמונה">
        <div
          className="image-crop-preview"
          onWheel={handleWheelZoom}
          onPointerDown={event => {
            event.currentTarget.setPointerCapture(event.pointerId);
            draggingRef.current = true;
            lastPointerRef.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerMove={updatePan}
          onPointerUp={() => { draggingRef.current = false; }}
          onPointerCancel={() => { draggingRef.current = false; }}
        >
          <img
            src={editor.src}
            alt="תצוגה מקדימה לחיתוך"
            style={{
              transform: `translate(${editor.pan.x}px, ${editor.pan.y}px) rotate(${editor.rotation}deg) scale(${editor.zoom})`
            }}
          />
          <div className="crop-circle-mask" aria-hidden="true" />
        </div>

        <div className="image-editor-toolbar">
          <div className="image-zoom-controls">
            <button
              type="button"
              className="button ghost zoom-step-btn"
              onClick={() => {
                const zoom = Math.max(1, editor.zoom - 0.2);
                setEditor({ ...editor, zoom });
              }}
              title="הקטנה"
            >
              −
            </button>
            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={editor.zoom}
              onChange={event => {
                const zoom = Number(event.target.value);
                const next = { ...editor, zoom };
                const maxPanX = imagePanLimit(next, "x");
                const maxPanY = imagePanLimit(next, "y");
                setEditor({
                  ...next,
                  pan: { x: Math.max(-maxPanX, Math.min(maxPanX, editor.pan.x)), y: Math.max(-maxPanY, Math.min(maxPanY, editor.pan.y)) }
                });
              }}
            />
            <button
              type="button"
              className="button ghost zoom-step-btn"
              onClick={() => {
                const zoom = Math.min(3, editor.zoom + 0.2);
                setEditor({ ...editor, zoom });
              }}
              title="הגדלה"
            >
              ＋
            </button>
            <output>{Math.round(editor.zoom * 100)}%</output>
          </div>

          <div className="image-editor-tools">
            <button type="button" className="button small-btn" onClick={rotateImage} title="סיבוב התמונה ב-90 מעלות">
              🔄 סיבוב 90°
            </button>
            <button type="button" className="button small-btn ghost" onClick={resetCrop} title="איפוס מיקום והגדלה">
              🎯 איפוס
            </button>
          </div>
        </div>

        <small className="image-editor-hint">💡 גררו עם העכבר/אצבע למיקום, גלגלו להגדלה, ולחצו על סיבוב במידת הצורך</small>
        {imageError && <p role="alert" className="field-error">{imageError}</p>}

        <div className="image-editor-actions">
          <button type="button" className="button" onClick={closeEditor} disabled={isProcessing}>
            ביטול
          </button>
          <button type="button" className="button primary" onClick={saveEditedImage} disabled={isProcessing}>
            {isProcessing ? "מעבד ושומר…" : "✓ שימוש בתמונה זו"}
          </button>
        </div>
      </div>
    ) : (
      <div className="image-upload-wrapper">
        {value && (
          <div className="current-image-preview">
            <img src={value} alt="תצוגה מקדימה של תמונת הפרופיל" className="image-field-preview" />
            <div className="current-image-actions">
              <span className="current-image-badge">תמונה מוגדרת כעת</span>
              <button type="button" className="button ghost danger-text" onClick={() => onChange(undefined)}>
                🗑️ הסרת תמונה
              </button>
            </div>
          </div>
        )}

        <div className="image-source-tabs">
          <button
            type="button"
            className={`source-tab ${mode === "file" ? "active" : ""}`}
            onClick={() => setMode("file")}
          >
            📁 העלאה מהמכשיר או גרירה
          </button>
          <button
            type="button"
            className={`source-tab ${mode === "url" ? "active" : ""}`}
            onClick={() => setMode("url")}
          >
            🔗 קישור לתמונה ברשת
          </button>
        </div>

        {mode === "file" ? (
          <div
            className={`image-dropzone ${isDragging ? "dragging" : ""}`}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={e => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) selectFile(file);
            }}
            onPaste={e => {
              const file = e.clipboardData.files?.[0];
              if (file) selectFile(file);
            }}
          >
            <span className="dropzone-icon" aria-hidden="true">📷</span>
            <strong>גררו לכאן תמונה, הדביקו מהלוח (Ctrl+V) או לחצו לבחירה</strong>
            <small>תומך בכל סוגי התמונות (JPG, PNG, WebP) — נחתך ומותאם אוטומטית</small>
            <button type="button" className="button primary" onClick={() => inputRef.current?.click()}>
              {value ? "בחירת תמונה אחרת מהמכשיר" : "בחירת תמונה מהמכשיר"}
            </button>
            <input
              ref={inputRef}
              className="visually-hidden"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={event => {
                const file = event.target.files?.[0];
                if (file) selectFile(file);
              }}
            />
          </div>
        ) : (
          <div className="image-url-box">
            <label className="field full">
              <span>כתובת URL ישירה לתמונה:</span>
              <div className="url-input-row">
                <input
                  type="url"
                  placeholder="https://example.com/photo.jpg"
                  value={urlInput}
                  onChange={e => {
                    setUrlInput(e.target.value);
                    setUrlPreviewValid(null);
                    setImageError(null);
                  }}
                />
                <button
                  type="button"
                  className="button primary"
                  disabled={!urlInput.trim()}
                  onClick={handleUrlApply}
                >
                  הגדר כתמונה
                </button>
              </div>
            </label>
            {urlInput.trim() && (
              <div className="url-preview-card">
                <span>תצוגה מקדימה:</span>
                <img
                  src={urlInput.trim()}
                  alt="תצוגה מקדימה מהקישור"
                  className="image-field-preview"
                  onLoad={() => setUrlPreviewValid(true)}
                  onError={() => {
                    setUrlPreviewValid(false);
                    setImageError("לא ניתן לטעון תמונה מכתובת זו. ודאו שהקישור ישיר לקובץ תמונה.");
                  }}
                />
                {urlPreviewValid === true && <span className="valid-url-tag">✓ התמונה נטענה בהצלחה</span>}
              </div>
            )}
          </div>
        )}
        {imageError && <p role="alert" className="field-error">{imageError}</p>}
      </div>
    )}
  </div>;
}

function ImageViewerModal({ src, name, onClose }: { src: string; name: string; onClose: () => void }) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="overlay lightbox-overlay" role="dialog" aria-modal="true" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="lightbox-content">
        <div className="lightbox-header">
          <strong>תמונת פרופיל — {name}</strong>
          <button type="button" className="button ghost close-btn" onClick={onClose} aria-label="סגירה">✕</button>
        </div>
        <div className="lightbox-body">
          <img src={src} alt={`תמונה מלאה של ${name}`} className="lightbox-image" />
        </div>
      </div>
    </div>
  );
}

function PhotoQuickChangeModal({
  person,
  onClose,
  onSave,
}: {
  person: Person;
  onClose: () => void;
  onSave: (photoUrl: string | undefined) => void;
}) {
  const [photo, setPhoto] = useState<string | undefined>(person.profileImageUrl);
  return (
    <div className="overlay" role="dialog" aria-modal="true" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="panel photo-quick-modal">
        <div className="panel-header">
          <h2>📷 שינוי תמונת פרופיל — {person.name}</h2>
          <button type="button" className="button ghost" onClick={onClose} aria-label="סגירה">✕</button>
        </div>
        <ProfileImageField value={photo} onChange={setPhoto} />
        <div className="panel-actions">
          <button type="button" className="button" onClick={onClose}>ביטול</button>
          <button
            type="button"
            className="button primary"
            onClick={() => {
              onSave(photo);
              onClose();
            }}
          >
            שמירת תמונה
          </button>
        </div>
      </div>
    </div>
  );
}

function CumulativeFamilyTree({ graph, root, onClose, onOpenProfile }: { graph: FamilyGraph; root: Person; onClose: () => void; onOpenProfile?: (id: string) => void }) {
  const peopleById = new Map(graph.people.map(person => [person.id, person]));
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  for (const relationship of graph.relationships) {
    if (relationship.type !== "parent") continue;
    parents.set(relationship.targetId, [...(parents.get(relationship.targetId) ?? []), relationship.sourceId]);
    children.set(relationship.sourceId, [...(children.get(relationship.sourceId) ?? []), relationship.targetId]);
  }
  const initialVisibleIds = new Set([root.id, ...(parents.get(root.id) ?? []), ...(children.get(root.id) ?? [])]);
  const [visibleIdsState, setVisibleIdsState] = useState<Set<string>>(() => initialVisibleIds);
  const [history, setHistory] = useState<{ visibleIds: Set<string>; selectedId: string }[]>([]);
  const [selectedId, setSelectedId] = useState(root.id);
  useEffect(() => { setVisibleIdsState(new Set([root.id, ...(parents.get(root.id) ?? []), ...(children.get(root.id) ?? [])])); setHistory([]); setSelectedId(root.id); }, [root.id]);

  const visibleIds = visibleIdsState;
  const distance = new Map<string, number>([[root.id, 0]]);
  const queue = [root.id];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const currentDistance = distance.get(id)!;
    const connected = [...(parents.get(id) ?? []).map(parentId => [parentId, -1] as const), ...(children.get(id) ?? []).map(childId => [childId, 1] as const)];
    connected.forEach(([nextId, direction]) => { if (!distance.has(nextId)) { distance.set(nextId, currentDistance + direction); queue.push(nextId); } });
  }
  const rows = new Map<number, Person[]>();
  [...visibleIds].forEach(id => { const person = peopleById.get(id); const level = distance.get(id); if (!person || level === undefined) return; rows.set(level, [...(rows.get(level) ?? []), person]); });
  const sortedLevels = [...rows.keys()].sort((a, b) => a - b);
  const generationLabel = (level: number) => level === 0 ? "נקודת המוצא" : level === -1 ? "הורים (דור מעל)" : level === 1 ? "ילדים (דור מתחת)" : level < 0 ? `${Math.abs(level)} דורות מעל` : `${level} דורות מתחת`;
  const generationCount = sortedLevels.length;
  const visibleCount = visibleIds.size;
  const pathIds = new Set<string>([root.id, selectedId]);
  const pathPrevious = new Map<string, string>();
  const pathQueue = [root.id];
  const pathSeen = new Set([root.id]);
  while (pathQueue.length > 0 && !pathSeen.has(selectedId)) {
    const id = pathQueue.shift()!;
    const connected = [...(parents.get(id) ?? []), ...(children.get(id) ?? [])];
    connected.forEach(nextId => { if (!pathSeen.has(nextId)) { pathSeen.add(nextId); pathPrevious.set(nextId, id); pathQueue.push(nextId); } });
  }
  let pathCursor = selectedId;
  while (pathPrevious.has(pathCursor)) { pathIds.add(pathCursor); pathCursor = pathPrevious.get(pathCursor)!; }
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  const explore = (personId: string) => {
    const nextVisibleIds = new Set(visibleIdsState);
    nextVisibleIds.add(root.id);
    nextVisibleIds.add(personId);
    (parents.get(personId) ?? []).forEach(parentId => nextVisibleIds.add(parentId));
    (children.get(personId) ?? []).forEach(childId => nextVisibleIds.add(childId));
    setHistory(previous => [...previous, { visibleIds: new Set(visibleIdsState), selectedId }]);
    setVisibleIdsState(nextVisibleIds);
    setSelectedId(personId);
  };
  const goBack = () => { const previous = history.at(-1); if (!previous) return; setHistory(current => current.slice(0, -1)); setVisibleIdsState(previous.visibleIds); setSelectedId(previous.selectedId); };
  const resetTree = () => { setVisibleIdsState(new Set(initialVisibleIds)); setHistory([]); setSelectedId(root.id); };
  const selectedPerson = peopleById.get(selectedId);
  return <div className="overlay lineage-overlay" role="dialog" aria-modal="true" aria-labelledby="lineage-title" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="panel lineage-panel">
    <div className="lineage-hero"><div className="lineage-hero-mark" aria-hidden="true">🌿</div><div><span className="lineage-eyebrow">סייר שושלת ודורות</span><h2 id="lineage-title">עץ הדורות סביב {root.name}</h2><p className="lineage-subtitle">לחצו על כל אדם כדי לחשוף את ההורים והילדים שלו לאורך הדורות</p></div><div className="lineage-header-actions"><button className="button lineage-back" disabled={history.length === 0} onClick={goBack} aria-label="חזרה לצעד הקודם">↩ <span>חזרה</span></button><button className="button lineage-reset" onClick={resetTree} aria-label="איפוס עץ הדורות">⌂ <span>איפוס</span></button><button className="button ghost lineage-close" onClick={onClose} aria-label="סגירת עץ הדורות">✕</button></div></div>
    <div className="lineage-summary" aria-label="סיכום התצוגה"><div><strong>{generationCount}</strong><span>דורות מוצגים</span></div><div><strong>{visibleCount}</strong><span>בני משפחה</span></div><div className="lineage-summary-hint"><span className="lineage-pulse" aria-hidden="true" /> <span>נבחר כעת: <strong>{selectedPerson?.name ?? root.name}</strong></span>{onOpenProfile && selectedPerson && <button className="button small-btn" onClick={() => { onOpenProfile(selectedPerson.id); onClose(); }}>לכרטיס האישי</button>}</div></div>
    <div className="lineage-scroll">{sortedLevels.map(level => <div className={`lineage-level ${level === 0 ? "current" : ""} ${rows.get(level)!.some(person => pathIds.has(person.id)) ? "lineage-level-path" : ""}`} key={level}><div className="lineage-level-heading"><span className="lineage-level-label">{generationLabel(level)}</span><span className="lineage-level-count">{rows.get(level)!.length} {rows.get(level)!.length === 1 ? "אדם" : "אנשים"}</span></div><div className="lineage-people">{rows.get(level)!.map(person => <button key={person.id} className={`lineage-person ${person.id === root.id ? "anchor" : ""} ${person.id === selectedId ? "root" : ""} ${pathIds.has(person.id) ? "path" : ""}`} onClick={() => explore(person.id)} aria-pressed={person.id === selectedId}><span className={`lineage-avatar ${person.gender}`}>{person.name.trim().charAt(0)}</span><span className="lineage-person-name">{person.name}</span>{person.role?.trim() && <small>{person.role}</small>}{person.id === root.id && <span className="lineage-selected-label">נקודת מוצא</span>}{person.id === selectedId && person.id !== root.id && <span className="lineage-selected-label">נבחר/ה כעת</span>}</button>)}</div></div>)}</div>
  </section></div>;
}

function ProfileViewPanel({
  person,
  graph,
  stats,
  marriageDate,
  canEdit,
  onClose,
  onSelectRelative,
  onFocusOnMap,
  onOpenInExplorer,
  onFilter,
  onShowLineage,
  onEdit,
  onAddRelative,
  onUpdatePhoto,
}: {
  person: Person;
  graph: FamilyGraph;
  stats: PersonStats;
  marriageDate?: string;
  canEdit: boolean;
  onClose: () => void;
  onSelectRelative: (id: string) => void;
  onFocusOnMap: () => void;
  onOpenInExplorer: () => void;
  onFilter: () => void;
  onShowLineage: () => void;
  onEdit: () => void;
  onAddRelative: () => void;
  onUpdatePhoto?: (url: string | undefined) => void;
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [photoEditOpen, setPhotoEditOpen] = useState(false);
  const childrenCount = stats.children;
  const descendantsCount = stats.descendants;
  const isDeceased = !person.isAlive || person.deathYear !== undefined;
  const status = isDeceased ? "לזכרו/ה 🕯️" : "בחיים";
  const age = isDeceased && person.deathYear === undefined ? undefined : ageLabel(person);
  const rels = useMemo(() => relativesOf(graph, person.id), [graph, person.id]);
  const hasBirthday = isBirthdayInCurrentHebrewMonth(person);

  return <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="person-profile-title" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    {hasBirthday && <BirthdayBalloons />}
    <div className="panel profile-modal">
      <div className={`profile-hero-banner ${person.gender}`} aria-hidden="true" />
      <div className="profile-modal-topbar">
        <div className="profile-modal-badges">
          <span className={`status-badge ${isDeceased ? "deceased" : "alive"}`}>{status}</span>
          {hasBirthday && <span className="status-badge birthday">🎂 יום הולדת החודש</span>}
        </div>
        <div className="profile-modal-top-actions">
          {canEdit && (
            <>
              <button className="button small-btn primary" onClick={onAddRelative}>+ הוספת קרוב</button>
              <button className="button small-btn" onClick={onEdit}>✏️ עריכת פרטים</button>
            </>
          )}
          <button className="button ghost close-btn" onClick={onClose} aria-label="סגירה">✕</button>
        </div>
      </div>

      <div className="person-details">
        <div className="person-hero">
          <div className="profile-panel">
            {person.profileImageUrl ? (
              <div className="profile-image-interactive-wrapper">
                <button
                  type="button"
                  className="profile-img-btn"
                  onClick={() => setLightboxOpen(true)}
                  title="לחיצה להגדלת התמונה"
                >
                  <img src={person.profileImageUrl} alt={`תמונה של ${person.name}`} />
                  <span className="profile-img-zoom-hint" aria-hidden="true">🔍 הגדלה</span>
                </button>
                {canEdit && onUpdatePhoto && (
                  <button
                    type="button"
                    className="profile-img-edit-badge"
                    onClick={() => setPhotoEditOpen(true)}
                    title="שינוי תמונת פרופיל"
                  >
                    📷 החלפה
                  </button>
                )}
              </div>
            ) : (
              <div className="profile-placeholder-interactive-wrapper">
                <span className={`profile-placeholder ${person.gender}`}>{person.name.charAt(0)}</span>
                {canEdit && onUpdatePhoto && (
                  <button
                    type="button"
                    className="profile-img-add-badge"
                    onClick={() => setPhotoEditOpen(true)}
                    title="הוספת תמונת פרופיל"
                  >
                    📷 הוספת תמונה
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="person-heading">
            <h3 id="person-profile-title">{person.name}</h3>
            {person.previousLastName && <p className="person-maiden">שם משפחה קודם: {person.previousLastName}</p>}
            {person.role?.trim() && <p className="person-role-pill">{person.role}</p>}
          </div>
        </div>

        <div className="person-stats" aria-label="נתונים מרכזיים">
          <div className="person-stat">
            <strong>{age ?? (person.birthYear ? `${person.birthYear}` : "—")}</strong>
            <span>{age ? (isDeceased ? "גיל בפטירה" : "גיל") : "שנת לידה"}</span>
          </div>
          <div className="person-stat">
            <strong>{childrenCount}</strong>
            <span>{childrenCount === 1 ? "ילד/ה" : "ילדים"}</span>
          </div>
          <div className="person-stat">
            <strong>{descendantsCount}</strong>
            <span>סה״כ צאצאים</span>
          </div>
        </div>

        {(person.hebrewBirthDate || person.birthDate || person.birthYear || person.hebrewDeathDate || person.deathYear || marriageDate || person.birthCountry || person.burialPlace) && (
          <div className="detail-cards-grid">
            {person.hebrewBirthDate && (
              <div className="detail-card-item">
                <span className="detail-card-icon" aria-hidden="true">✡️</span>
                <div><span>תאריך לידה עברי</span><strong>{person.hebrewBirthDate}</strong></div>
              </div>
            )}
            {person.birthDate && (
              <div className="detail-card-item">
                <span className="detail-card-icon" aria-hidden="true">📅</span>
                <div><span>תאריך לידה לועזי</span><strong dir="ltr">{formatBirthDate(person.birthDate)}</strong></div>
              </div>
            )}
            {!person.birthDate && person.birthYear && (
              <div className="detail-card-item">
                <span className="detail-card-icon" aria-hidden="true">📅</span>
                <div><span>שנת לידה</span><strong>{person.birthYear}</strong></div>
              </div>
            )}
            {marriageDate && (
              <div className="detail-card-item">
                <span className="detail-card-icon" aria-hidden="true">💍</span>
                <div><span>יום נישואין עברי</span><strong>{marriageDate}</strong></div>
              </div>
            )}
            {person.hebrewDeathDate && (
              <div className="detail-card-item">
                <span className="detail-card-icon" aria-hidden="true">🕯️</span>
                <div><span>תאריך פטירה עברי</span><strong>{person.hebrewDeathDate}</strong></div>
              </div>
            )}
            {person.deathYear && (
              <div className="detail-card-item">
                <span className="detail-card-icon" aria-hidden="true">🕯️</span>
                <div><span>שנת פטירה</span><strong>{person.deathYear}</strong></div>
              </div>
            )}
            {person.birthCountry && (
              <div className="detail-card-item">
                <span className="detail-card-icon" aria-hidden="true">📍</span>
                <div><span>מקום לידה</span><strong>{person.birthCountry}</strong></div>
              </div>
            )}
            {person.burialPlace && (
              <div className="detail-card-item">
                <span className="detail-card-icon" aria-hidden="true">🪦</span>
                <div><span>מקום קבורה</span><strong>{person.burialPlace}</strong></div>
              </div>
            )}
          </div>
        )}

        {(rels.parents.length > 0 || rels.partners.length > 0 || rels.children.length > 0 || rels.siblings.length > 0) && (
          <section className="profile-relatives-section" aria-label="קשרים משפחתיים">
            <h4>קשרים משפחתיים (לחצו למעבר מהיר)</h4>
            <div className="profile-relatives-groups">
              {rels.parents.length > 0 && (
                <div className="profile-rel-group">
                  <span className="profile-rel-label">👪 הורים</span>
                  <div className="profile-rel-cards">
                    {rels.parents.map(rel => (
                      <button key={rel.id} type="button" className="profile-rel-card" onClick={() => onSelectRelative(rel.id)}>
                        <Avatar person={rel} size="small" />
                        <div className="profile-rel-card-text">
                          <strong>{rel.name}</strong>
                          {personMeta(rel) && <small>{personMeta(rel)}</small>}
                        </div>
                        <span className="profile-rel-card-arrow" aria-hidden="true">←</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {rels.partners.length > 0 && (
                <div className="profile-rel-group">
                  <span className="profile-rel-label">💍 זוגיות</span>
                  <div className="profile-rel-cards">
                    {rels.partners.map(rel => (
                      <button key={rel.id} type="button" className="profile-rel-card" onClick={() => onSelectRelative(rel.id)}>
                        <Avatar person={rel} size="small" />
                        <div className="profile-rel-card-text">
                          <strong>{rel.name}</strong>
                          {personMeta(rel) && <small>{personMeta(rel)}</small>}
                        </div>
                        <span className="profile-rel-card-arrow" aria-hidden="true">←</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {rels.children.length > 0 && (
                <div className="profile-rel-group">
                  <span className="profile-rel-label">👶 ילדים ({rels.children.length})</span>
                  <div className="profile-rel-cards">
                    {rels.children.map(rel => (
                      <button key={rel.id} type="button" className="profile-rel-card" onClick={() => onSelectRelative(rel.id)}>
                        <Avatar person={rel} size="small" />
                        <div className="profile-rel-card-text">
                          <strong>{rel.name}</strong>
                          {personMeta(rel) && <small>{personMeta(rel)}</small>}
                        </div>
                        <span className="profile-rel-card-arrow" aria-hidden="true">←</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {rels.siblings.length > 0 && (
                <div className="profile-rel-group">
                  <span className="profile-rel-label">🤝 אחים ({rels.siblings.length})</span>
                  <div className="profile-rel-cards">
                    {rels.siblings.map(rel => (
                      <button key={rel.id} type="button" className="profile-rel-card" onClick={() => onSelectRelative(rel.id)}>
                        <Avatar person={rel} size="small" />
                        <div className="profile-rel-card-text">
                          <strong>{rel.name}</strong>
                          {personMeta(rel) && <small>{personMeta(rel)}</small>}
                        </div>
                        <span className="profile-rel-card-arrow" aria-hidden="true">←</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {(isDeceased || person.lifeStory?.trim()) && (
          <section className="story-section">
            <h4>📖 סיפור חיים</h4>
            <p>{person.lifeStory || "עדיין לא נכתב סיפור חיים עבור אדם זה."}</p>
          </section>
        )}

        <div className="profile-action-grid">
          <button className="button primary" onClick={onFocusOnMap}>🎯 מיקוד במפת העץ</button>
          <button className="button" onClick={onOpenInExplorer}>🧭 פתיחה בסייר המשפחה</button>
          {childrenCount > 0 && <button className="button" onClick={onFilter}>🌿 הצג ענף צאצאים בלבד</button>}
          <button className="button lineage-button" onClick={onShowLineage}>🌳 עץ דורות</button>
        </div>
      </div>
    </div>
    {lightboxOpen && person.profileImageUrl && (
      <ImageViewerModal
        src={person.profileImageUrl}
        name={person.name}
        onClose={() => setLightboxOpen(false)}
      />
    )}
    {photoEditOpen && onUpdatePhoto && (
      <PhotoQuickChangeModal
        person={person}
        onClose={() => setPhotoEditOpen(false)}
        onSave={url => {
          onUpdatePhoto(url);
          setPhotoEditOpen(false);
        }}
      />
    )}
  </div>;
}

function EditablePersonPanel({ person, marriageDate, onClose, onBackToView, onSave, onDelete, onShowLineage }: { person: Person; marriageDate?: string; onClose: () => void; onBackToView: () => void; onSave: (p: Person) => void; onDelete: (personId: string) => void; onShowLineage: () => void }) {
  const [draft, setDraft] = useState(person);
  const update = <K extends keyof Person>(key: K, value: Person[K]) => setDraft(current => ({ ...current, [key]: value }));
  return <div className="overlay" role="dialog" aria-modal="true" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className="panel"><div className="panel-header"><div><h2>✏️ עריכת פרטים — {person.name}</h2></div><div className="panel-header-buttons"><button className="button small-btn" onClick={onBackToView}>חזרה לכרטיס</button><button className="button ghost" onClick={onClose} aria-label="סגירה">✕</button></div></div><div className="form-grid">
    <label className="field full">שם מלא<input value={draft.name} onChange={event => update("name", event.target.value)} /></label>
    <label className="field">שם משפחה קודם (נעורים)<input value={draft.previousLastName ?? ""} onChange={event => update("previousLastName", event.target.value || undefined)} /></label>
    <label className="field">תפקיד / כינוי במשפחה<input value={draft.role ?? ""} onChange={event => update("role", event.target.value || undefined)} /></label>
    <label className="field">מגדר<select value={draft.gender} onChange={event => update("gender", event.target.value as Person["gender"])}><option value="neutral">לא צוין</option><option value="male">זכר</option><option value="female">נקבה</option></select></label>
    <label className="field">סטטוס חיים<select value={String(draft.isAlive)} onChange={event => update("isAlive", event.target.value === "true")}><option value="true">בחיים</option><option value="false">נפטר/ה</option></select></label>
    <BirthDateFields birthDate={draft.birthDate} hebrewBirthDate={draft.hebrewBirthDate} onChange={(key, value) => update(key, value)} />
    {marriageDate && <div className="field"><span>יום נישואין</span><strong>{marriageDate}</strong></div>}
    {(!draft.isAlive || draft.deathYear !== undefined || draft.hebrewDeathDate) && (
      <>
        <label className="field">שנת פטירה לועזית<input type="number" value={draft.deathYear ?? ""} onChange={event => update("deathYear", event.target.value ? Number(event.target.value) : undefined)} /></label>
        <HebrewDateFields value={draft.hebrewDeathDate} label="תאריך פטירה עברי" onChange={value => update("hebrewDeathDate", value)} />
      </>
    )}
    <label className="field">מקום לידה<input value={draft.birthCountry ?? ""} onChange={event => update("birthCountry", event.target.value || undefined)} /></label>
    <label className="field">מקום קבורה<input value={draft.burialPlace ?? ""} onChange={event => update("burialPlace", event.target.value || undefined)} /></label>
    <ProfileImageField value={draft.profileImageUrl} onChange={value => update("profileImageUrl", value)} />
    <label className="field full">סיפור חיים וקורות<textarea rows={4} placeholder="כתבו כאן זיכרונות, קורות חיים או פרטים מעניינים…" value={draft.lifeStory ?? ""} onChange={event => update("lifeStory", event.target.value || undefined)} /></label>
    <div className="panel-actions full"><button className="button danger" onClick={() => { if (window.confirm(`האם למחוק את ${person.name}? פעולה זו תמחק גם את הקשרים שלו.`)) onDelete(person.id); }}>מחיקת אדם</button><span className="panel-actions-spacer" /><button className="button lineage-button" onClick={onShowLineage}>עץ דורות</button><button className="button" onClick={onBackToView}>ביטול</button><button className="button primary" disabled={!draft.name.trim()} onClick={() => onSave({ ...draft, name: draft.name.trim() })}>שמירת שינויים</button></div>
  </div></div></div>;
}

function PersonPanel({
  person,
  graph,
  stats,
  marriageDate,
  onClose,
  onSave,
  onDelete,
  onSelectRelative,
  onFocusOnMap,
  onOpenInExplorer,
  onFilter,
  onShowLineage,
  onAddRelative,
  canEdit,
}: {
  person: Person;
  graph: FamilyGraph;
  stats: PersonStats;
  marriageDate?: string;
  onClose: () => void;
  onSave: (p: Person) => void;
  onDelete: (personId: string) => void;
  onSelectRelative: (id: string) => void;
  onFocusOnMap: () => void;
  onOpenInExplorer: () => void;
  onFilter: () => void;
  onShowLineage: () => void;
  onAddRelative: () => void;
  canEdit: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  useEffect(() => setIsEditing(false), [person.id]);

  if (canEdit && isEditing) {
    return (
      <EditablePersonPanel
        person={person}
        marriageDate={marriageDate}
        onClose={onClose}
        onBackToView={() => setIsEditing(false)}
        onSave={onSave}
        onDelete={onDelete}
        onShowLineage={onShowLineage}
      />
    );
  }

  return (
    <ProfileViewPanel
      person={person}
      graph={graph}
      stats={stats}
      marriageDate={marriageDate}
      canEdit={canEdit}
      onClose={onClose}
      onSelectRelative={onSelectRelative}
      onFocusOnMap={onFocusOnMap}
      onOpenInExplorer={onOpenInExplorer}
      onFilter={onFilter}
      onShowLineage={onShowLineage}
      onEdit={() => setIsEditing(true)}
      onAddRelative={onAddRelative}
      onUpdatePhoto={url => onSave({ ...person, profileImageUrl: url })}
    />
  );
}

type NewPersonDetails = Omit<Person, "id" | "familyId">;

function ManagePasswordPanel({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSubmitting(true); setError(null);
    try {
      const response = await fetch("/api/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      if (!response.ok) { setError("הסיסמה שגויה"); return; }
      onSuccess();
    } catch { setError("לא ניתן לאמת את הסיסמה כרגע"); } finally { setSubmitting(false); }
  };
  return <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="manage-password-title" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className="panel password-panel"><div className="panel-header"><h2 id="manage-password-title">🔐 כניסה למצב עריכה וניהול</h2><button className="button ghost" onClick={onClose} aria-label="סגירה">✕</button></div><p className="modal-subtitle">הזינו את סיסמת הניהול של המשפחה כדי להוסיף או לערוך בני משפחה וקשרים.</p><form className="form-grid" onSubmit={submit}><label className="field full">סיסמת ניהול<input autoFocus type="password" placeholder="הקלידו סיסמה…" value={password} onChange={event => setPassword(event.target.value)} /></label>{error && <p role="alert" className="field-error full">{error}</p>}<div className="panel-actions full"><button type="button" className="button" onClick={onClose}>ביטול</button><button type="submit" className="button primary" disabled={submitting || !password}>{submitting ? "מאמת…" : "כניסה לעריכה"}</button></div></form></div></div>;
}

function AddRelationshipPanel({ source, people, onClose, onCreate }: { source: Person; people: Person[]; onClose: () => void; onCreate: (type: "partner" | "child" | "parent", targetId: string | null, newPerson: NewPersonDetails | null, relationship?: RelationshipDetails) => void }) {
  const [type, setType] = useState<"partner" | "child" | "parent">("child");
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [targetId, setTargetId] = useState("");
  const [existingFilter, setExistingFilter] = useState("");
  const [draft, setDraft] = useState<NewPersonDetails>({ name: "", gender: "neutral", isAlive: true });
  const [hebrewMarriageDate, setHebrewMarriageDate] = useState("");
  const update = <K extends keyof NewPersonDetails>(key: K, value: NewPersonDetails[K]) => setDraft(current => ({ ...current, [key]: value }));
  const existingPeople = useMemo(() => {
    const candidates = people.filter(person => person.id !== source.id);
    if (!existingFilter.trim()) return candidates;
    return candidates.filter(p => p.name.includes(existingFilter.trim()));
  }, [people, source.id, existingFilter]);

  return <div className="overlay" role="dialog" aria-modal="true" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className="panel"><div className="panel-header"><h2>הוספת בן משפחה עבור {source.name}</h2><button className="button ghost" onClick={onClose} aria-label="סגירה">✕</button></div>
    <div className="form-grid">
      <div className="field full">
        <span>איזה קשר משפחתי תרצו להוסיף ל<strong>{source.name}</strong>?</span>
        <div className="relation-type-cards" role="radiogroup" aria-label="סוג קשר">
          <button type="button" className={`relation-type-card ${type === "child" ? "active" : ""}`} onClick={() => setType("child")}>
            <span className="relation-type-icon">👶</span>
            <strong>ילד או ילדה</strong>
            <small>יתווסף בדור הבא</small>
          </button>
          <button type="button" className={`relation-type-card ${type === "partner" ? "active" : ""}`} onClick={() => setType("partner")}>
            <span className="relation-type-icon">💍</span>
            <strong>בן או בת זוג</strong>
            <small>יתווסף לצד {source.name}</small>
          </button>
          <button type="button" className={`relation-type-card ${type === "parent" ? "active" : ""}`} onClick={() => setType("parent")}>
            <span className="relation-type-icon">⬆️</span>
            <strong>אב או אם (הורה)</strong>
            <small>יתווסף בדור שמעל</small>
          </button>
        </div>
      </div>

      {type === "partner" && <div className="full"><HebrewDateFields value={hebrewMarriageDate} label="תאריך נישואין עברי (אופציונלי)" onChange={value => setHebrewMarriageDate(value ?? "")} /></div>}

      <div className="relationship-mode-tabs full">
        <button type="button" className={`mode-tab ${mode === "new" ? "active" : ""}`} onClick={() => setMode("new")}>✨ יצירת אדם חדש בעץ</button>
        <button type="button" className={`mode-tab ${mode === "existing" ? "active" : ""}`} onClick={() => setMode("existing")}>🔗 חיבור לאדם שכבר קיים בעץ</button>
      </div>

      {mode === "existing" ? (
        <div className="field full">
          <span>בחירת אדם קיים מהעץ</span>
          <input placeholder="סינון מהיר לפי שם…" value={existingFilter} onChange={e => setExistingFilter(e.target.value)} />
          <select value={targetId} onChange={event => setTargetId(event.target.value)} size={Math.min(6, Math.max(3, existingPeople.length + 1))}>
            <option value="">— בחרו אדם מהרשימה —</option>
            {existingPeople.map(person => <option key={person.id} value={person.id}>{person.name}{person.birthYear ? ` (${person.birthYear})` : ""}</option>)}
          </select>
        </div>
      ) : <>
        <label className="field full">שם מלא (חובה)<input autoFocus placeholder="לדוגמה: דניאל אילון" value={draft.name} onChange={event => update("name", event.target.value)} /></label>
        <label className="field">מגדר<select value={draft.gender} onChange={event => update("gender", event.target.value as Person["gender"])}><option value="neutral">לא צוין</option><option value="male">זכר</option><option value="female">נקבה</option></select></label>
        <label className="field">סטטוס<select value={String(draft.isAlive)} onChange={event => update("isAlive", event.target.value === "true")}><option value="true">בחיים</option><option value="false">נפטר/ה</option></select></label>
        <label className="field">שם משפחה קודם<input value={draft.previousLastName ?? ""} onChange={event => update("previousLastName", event.target.value || undefined)} /></label>
        <label className="field">תפקיד / כינוי<input value={draft.role ?? ""} onChange={event => update("role", event.target.value || undefined)} /></label>
        <BirthDateFields birthDate={draft.birthDate} hebrewBirthDate={draft.hebrewBirthDate} onChange={(key, value) => update(key, value)} />
        {!draft.isAlive && (
          <>
            <label className="field">שנת פטירה<input type="number" value={draft.deathYear ?? ""} onChange={event => update("deathYear", event.target.value ? Number(event.target.value) : undefined)} /></label>
            <HebrewDateFields value={draft.hebrewDeathDate} label="תאריך פטירה עברי" onChange={value => update("hebrewDeathDate", value)} />
          </>
        )}
        <label className="field">מקום לידה<input value={draft.birthCountry ?? ""} onChange={event => update("birthCountry", event.target.value || undefined)} /></label>
        <label className="field">מקום קבורה<input value={draft.burialPlace ?? ""} onChange={event => update("burialPlace", event.target.value || undefined)} /></label>
        <ProfileImageField value={draft.profileImageUrl} onChange={value => update("profileImageUrl", value)} />
        <label className="field full">סיפור חיים<textarea rows={3} value={draft.lifeStory ?? ""} onChange={event => update("lifeStory", event.target.value || undefined)} /></label>
      </>}
      <div className="panel-actions full"><button className="button" onClick={onClose}>ביטול</button><button className="button primary" disabled={mode === "existing" ? !targetId : !draft.name.trim()} onClick={() => { if (mode === "existing" ? !targetId : !draft.name.trim()) return; onCreate(type, mode === "existing" ? targetId : null, mode === "new" ? { ...draft, name: draft.name.trim() } : null, type === "partner" ? { hebrewMarriageDate: hebrewMarriageDate.trim() || undefined } : undefined); }}>שמירת קשר משפחתי</button></div>
    </div>
  </div></div>;
}

function NewEntityPanel({ onClose, onCreate }: { onClose: () => void; onCreate: (person: NewPersonDetails) => void }) {
  const [draft, setDraft] = useState<NewPersonDetails>({ name: "", gender: "neutral", isAlive: true });
  const update = <K extends keyof NewPersonDetails>(key: K, value: NewPersonDetails[K]) => setDraft(current => ({ ...current, [key]: value }));
  return <div className="overlay" role="dialog" aria-modal="true" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className="panel"><div className="panel-header"><h2>הוספת אדם חדש לעץ</h2><button className="button ghost" onClick={onClose} aria-label="סגירה">✕</button></div><div className="form-grid">
    <label className="field full">שם מלא (חובה)<input autoFocus value={draft.name} onChange={event => update("name", event.target.value)} /></label>
    <label className="field">מגדר<select value={draft.gender} onChange={event => update("gender", event.target.value as Person["gender"])}><option value="neutral">לא צוין</option><option value="male">זכר</option><option value="female">נקבה</option></select></label>
    <label className="field">סטטוס<select value={String(draft.isAlive)} onChange={event => update("isAlive", event.target.value === "true")}><option value="true">בחיים</option><option value="false">נפטר/ה</option></select></label>
    <label className="field">שם משפחה קודם<input value={draft.previousLastName ?? ""} onChange={event => update("previousLastName", event.target.value || undefined)} /></label>
    <label className="field">תפקיד<input value={draft.role ?? ""} onChange={event => update("role", event.target.value || undefined)} /></label>
    <BirthDateFields birthDate={draft.birthDate} hebrewBirthDate={draft.hebrewBirthDate} onChange={(key, value) => update(key, value)} />
    {!draft.isAlive && (
      <>
        <label className="field">שנת פטירה<input type="number" value={draft.deathYear ?? ""} onChange={event => update("deathYear", event.target.value ? Number(event.target.value) : undefined)} /></label>
        <HebrewDateFields value={draft.hebrewDeathDate} label="תאריך פטירה עברי" onChange={value => update("hebrewDeathDate", value)} />
      </>
    )}
    <label className="field">מקום לידה<input value={draft.birthCountry ?? ""} onChange={event => update("birthCountry", event.target.value || undefined)} /></label>
    <label className="field">מקום קבורה<input value={draft.burialPlace ?? ""} onChange={event => update("burialPlace", event.target.value || undefined)} /></label>
    <ProfileImageField value={draft.profileImageUrl} onChange={value => update("profileImageUrl", value)} />
    <label className="field full">סיפור חיים<textarea rows={4} value={draft.lifeStory ?? ""} onChange={event => update("lifeStory", event.target.value || undefined)} /></label>
    <div className="panel-actions full"><button className="button" onClick={onClose}>ביטול</button><button className="button primary" disabled={!draft.name.trim()} onClick={() => onCreate({ ...draft, name: draft.name.trim() })}>שמירת אדם</button></div>
  </div></div></div>;
}

function FamilyDirectoryView({
  graph,
  personStats,
  onSelectPerson,
  onOpenExplorer,
  onFocusOnMap,
}: {
  graph: FamilyGraph;
  personStats: Map<string, PersonStats>;
  onSelectPerson: (id: string) => void;
  onOpenExplorer: (id: string) => void;
  onFocusOnMap: (id: string) => void;
}) {
  const [dirFilter, setDirFilter] = useState<"all" | "birthday" | "alive" | "deceased">("all");
  const [dirSort, setDirSort] = useState<"name" | "birthYear" | "descendants">("name");
  const [dirSearch, setDirSearch] = useState("");

  const birthdayCount = useMemo(() => graph.people.filter(p => isBirthdayInCurrentHebrewMonth(p)).length, [graph.people]);
  const aliveCount = useMemo(() => graph.people.filter(p => p.isAlive && p.deathYear === undefined).length, [graph.people]);
  const deceasedCount = graph.people.length - aliveCount;

  const filteredPeople = useMemo(() => {
    const q = dirSearch.trim();
    return graph.people
      .filter(person => {
        if (dirFilter === "birthday" && !isBirthdayInCurrentHebrewMonth(person)) return false;
        if (dirFilter === "alive" && (!person.isAlive || person.deathYear !== undefined)) return false;
        if (dirFilter === "deceased" && person.isAlive && person.deathYear === undefined) return false;
        if (q) {
          const hay = [person.name, person.previousLastName, person.role, person.birthCountry].filter(Boolean).join(" ");
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (dirSort === "name") return a.name.localeCompare(b.name, "he");
        if (dirSort === "birthYear") return (a.birthYear ?? 9999) - (b.birthYear ?? 9999);
        const descA = personStats.get(a.id)?.descendants ?? 0;
        const descB = personStats.get(b.id)?.descendants ?? 0;
        return descB - descA || a.name.localeCompare(b.name, "he");
      });
  }, [graph.people, dirFilter, dirSort, dirSearch, personStats]);

  return (
    <section className="directory-view" aria-label="אלפון המשפחה">
      <div className="directory-container">
        <div className="directory-header">
          <div>
            <h2>📖 אלפון בני המשפחה</h2>
            <p>כל בני המשפחה במקום אחד — לחצו על כרטיס לצפייה בפרטים, בקשרים ובסיפור החיים</p>
          </div>
          <div className="directory-search-wrap">
            <input
              className="directory-search"
              placeholder="סינון לפי שם, תפקיד או ארץ לידה…"
              value={dirSearch}
              onChange={e => setDirSearch(e.target.value)}
            />
            {dirSearch && <button className="search-clear" onClick={() => setDirSearch("")} aria-label="ניקוי סינון">✕</button>}
          </div>
        </div>

        <div className="directory-controls">
          <div className="directory-pills" role="tablist" aria-label="סינון אלפון">
            <button type="button" className={`dir-pill ${dirFilter === "all" ? "active" : ""}`} onClick={() => setDirFilter("all")}>
              הכול ({graph.people.length})
            </button>
            <button type="button" className={`dir-pill ${dirFilter === "birthday" ? "active" : ""}`} onClick={() => setDirFilter("birthday")}>
              🎂 חוגגים החודש ({birthdayCount})
            </button>
            <button type="button" className={`dir-pill ${dirFilter === "alive" ? "active" : ""}`} onClick={() => setDirFilter("alive")}>
              בחיים ({aliveCount})
            </button>
            <button type="button" className={`dir-pill ${dirFilter === "deceased" ? "active" : ""}`} onClick={() => setDirFilter("deceased")}>
              🕯️ לזכרם ({deceasedCount})
            </button>
          </div>
          <label className="directory-sort">
            <span>מיון:</span>
            <select value={dirSort} onChange={e => setDirSort(e.target.value as typeof dirSort)}>
              <option value="name">לפי שם (א׳–ת׳)</option>
              <option value="birthYear">לפי שנת לידה / דור</option>
              <option value="descendants">לפי מספר צאצאים</option>
            </select>
          </label>
        </div>

        {filteredPeople.length === 0 ? (
          <div className="mobile-empty">
            <p>לא נמצאו בני משפחה התואמים לסינון שנבחר.</p>
            <button className="button" onClick={() => { setDirFilter("all"); setDirSearch(""); }}>איפוס סינון</button>
          </div>
        ) : (
          <div className="directory-grid">
            {filteredPeople.map(person => {
              const stats = personStats.get(person.id) ?? { children: 0, descendants: 0 };
              const hasBday = isBirthdayInCurrentHebrewMonth(person);
              const isDeceased = !person.isAlive || person.deathYear !== undefined;
              const rels = relativesOf(graph, person.id);
              const partnerNames = rels.partners.map(p => p.name).join(", ");
              const parentNames = rels.parents.map(p => p.name).join(" ו-");
              return (
                <article key={person.id} className={`directory-card ${isDeceased ? "deceased" : ""}`}>
                  <span className={`directory-card-accent ${person.gender}`} aria-hidden="true" />
                  <button type="button" className="directory-card-main" onClick={() => onSelectPerson(person.id)}>
                    <Avatar person={person} size="small" />
                    <div className="directory-card-info">
                      <div className="directory-card-title-row">
                        <strong>{person.name}</strong>
                        <div className="directory-card-badges">
                          {hasBday && <span className="dir-bday-badge" title="יום הולדת החודש">🎂</span>}
                          {isDeceased && <span className="dir-deceased-badge" title="נפטר/ה">🕯️</span>}
                        </div>
                      </div>
                      {person.previousLastName && <small className="directory-card-maiden">לבית {person.previousLastName}</small>}
                      {person.role?.trim() && <span className="directory-card-role">{person.role}</span>}
                      <div className="directory-card-chips">
                        {personMeta(person) && <span className="directory-chip">{personMeta(person)}</span>}
                        {person.birthCountry && <span className="directory-chip">📍 {person.birthCountry}</span>}
                        {stats.children > 0 && <span className="directory-chip branch">👶 {stats.children} ילדים{stats.descendants > stats.children ? ` · ${stats.descendants} צאצאים` : ""}</span>}
                      </div>
                      {(partnerNames || parentNames) && (
                        <small className="directory-card-relatives">
                          {partnerNames ? `💍 ${partnerNames}` : `👪 בן/בת של ${parentNames}`}
                        </small>
                      )}
                    </div>
                  </button>
                  <div className="directory-card-actions">
                    <button type="button" className="button ghost small-btn" onClick={() => onSelectPerson(person.id)}>📋 כרטיס מלא</button>
                    <button type="button" className="button ghost small-btn" onClick={() => onOpenExplorer(person.id)}>🧭 בסייר</button>
                    <button type="button" className="button ghost small-btn" onClick={() => onFocusOnMap(person.id)}>🌳 בעץ</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function LoadingScreen({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return <main className="loading-shell" aria-busy={!error}>
    <div className={`loading-card${error ? " loading-card-error" : ""}`} role={error ? "alert" : "status"}>
      <div className="loading-brand" aria-hidden="true"><span className="loading-mark"><span /><span /><span /></span><span className="loading-brand-line" /></div>
      <p className="loading-eyebrow">משפחת אילון · הסיפור שלנו</p>
      <h1>{error ? "לא הצלחנו לפתוח את עץ אילון" : "טוענים את העץ המשפחתי שלנו"}</h1>
      {error ? <><p className="loading-message">{error}</p><button className="button primary loading-retry" onClick={onRetry}>לנסות שוב</button></> : <>
        <p className="loading-message">רגע קטן, אנחנו מחברים את הדורות, השמות והסיפורים של משפחת אילון.</p>
        <div className="loading-graph" aria-hidden="true"><span className="loading-line loading-line-one" /><span className="loading-line loading-line-two" /><span className="loading-node loading-node-one" /><span className="loading-node loading-node-two" /><span className="loading-node loading-node-three" /></div>
        <div className="loading-dots" aria-hidden="true"><span /><span /><span /></div>
      </>}
    </div>
  </main>;
}

export default function HomePage() {
  const [, refreshDate] = useState(() => Date.now());
  const [helpOpen, setHelpOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarDate, setCalendarDate] = useState(() => {
    const now = new Date();
    const currentMonth = currentHebrewMonth(now);
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    if (currentHebrewMonth(date) !== currentMonth) date.setDate(date.getDate() + 1);
    return date;
  });
  const [newEntityOpen, setNewEntityOpen] = useState(false);
  const [managePasswordOpen, setManagePasswordOpen] = useState(false);
  const [lineagePersonId, setLineagePersonId] = useState<string | null>(null);
  const [graph, setGraph] = useState<FamilyGraph | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [explorerPersonId, setExplorerPersonId] = useState<string | undefined>(undefined);
  const [addMemberForId, setAddMemberForId] = useState<string | null>(null);
  const [spouseFocusId, setSpouseFocusId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchHighlightIdx, setSearchHighlightIdx] = useState(0);
  const [filter, setFilter] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [scale, setScaleState] = useState(1);
  const setScale: React.Dispatch<React.SetStateAction<number>> = updater =>
    setScaleState(current => {
      const next = typeof updater === "function" ? updater(current) : updater;
      return Math.max(0.4, Math.min(20, next));
    });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [viewportWidth, setViewportWidth] = useState(1200);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<ViewMode>("canvas");
  const didSetInitialMobileMode = useRef(false);

  useEffect(() => {
    if (isMobile && !didSetInitialMobileMode.current) {
      setViewMode("explorer");
      didSetInitialMobileMode.current = true;
    }
  }, [isMobile]);

  const svgRef = useRef<SVGSVGElement>(null);
  const didDrag = useRef(false);
  const didInitialFocus = useRef(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const panStart = useRef<{ x: number; y: number; offset: { x: number; y: number } } | null>(null);
  const pinchStart = useRef<{ distance: number; scale: number } | null>(null);
  const lastTouchTap = useRef<{ time: number; x: number; y: number } | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const latestSave = useRef(0);

  const graphsHaveSameRecords = (left: FamilyGraph, right: FamilyGraph) => {
    const canonical = (g: FamilyGraph) => JSON.stringify({
      people: [...g.people].sort((a, b) => a.id.localeCompare(b.id)),
      relationships: [...g.relationships].map(link => `${link.familyId}|${link.sourceId}|${link.targetId}|${link.type}|${link.hebrewMarriageDate ?? ""}`).sort(),
    });
    return canonical(left) === canonical(right);
  };

  const persistGraph = async (next: FamilyGraph) => {
    const saveId = ++latestSave.current;
    saveQueue.current = saveQueue.current
      .catch(() => undefined)
      .then(() => saveGoogleSheetGraph(next))
      .catch(async () => {
        try {
          const persisted = await fetchGoogleSheetGraph();
          if (graphsHaveSameRecords(persisted, next)) return;
        } catch {
          // Report original save failure below if verification is unavailable.
        }
        if (saveId === latestSave.current) setSaveError("השמירה נכשלה. השינויים לא נשמרו — נסו שוב בעוד רגע.");
      });
    await saveQueue.current;
  };

  useEffect(() => { const timer = window.setInterval(() => refreshDate(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { const updateViewportWidth = () => setViewportWidth(window.innerWidth); updateViewportWidth(); window.addEventListener("resize", updateViewportWidth); return () => window.removeEventListener("resize", updateViewportWidth); }, []);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handleWheel = (event: WheelEvent) => { event.preventDefault(); zoomAt(event.clientX, event.clientY, Math.max(0.4, Math.min(12, scale - event.deltaY * 0.003))); };
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [scale, viewMode]);

  useEffect(() => { const openAddMember = (event: Event) => { if (canEdit) setAddMemberForId((event as CustomEvent<string>).detail); }; window.addEventListener("family:add-member", openAddMember); return () => window.removeEventListener("family:add-member", openAddMember); }, [canEdit]);
  useEffect(() => { document.body.dataset.familyEdit = String(canEdit); return () => { delete document.body.dataset.familyEdit; }; }, [canEdit]);

  const loadGraph = () => { setLoadError(null); void fetchGoogleSheetGraph().then(setGraph).catch(error => setLoadError(friendlyGraphLoadError(error))); };
  useEffect(() => { loadGraph(); }, []);

  useEffect(() => {
    if (!graph || didInitialFocus.current) return;
    const person = graph.people.find(candidate => candidate.name.trim() === "יצחק אילון") ?? graph.people[0];
    if (!person) return;
    const fullLayout = calculateFamilyLayout(graph, viewportWidth);
    const positionedPerson = fullLayout.people.find(candidate => candidate.id === person.id);
    if (!positionedPerson) return;
    const initialScale = 4;
    setScale(initialScale);
    setOffset({ x: fullLayout.width / 2 - initialScale * positionedPerson.x, y: fullLayout.height / 2 - initialScale * positionedPerson.y });
    setSpouseFocusId(person.id);
    setExplorerPersonId(person.id);
    didInitialFocus.current = true;
  }, [graph, viewportWidth]);

  const activeGraph = graph ?? { people: [], relationships: [] };
  const personStats = useMemo(() => {
    const children = new Map<string, string[]>();
    activeGraph.people.forEach(person => children.set(person.id, []));
    activeGraph.relationships.filter(r => r.type === "parent").forEach(r => children.get(r.sourceId)?.push(r.targetId));
    const memo = new Map<string, Set<string>>();
    const collect = (id: string, visiting = new Set<string>()): Set<string> => {
      const cached = memo.get(id);
      if (cached) return cached;
      if (visiting.has(id)) return new Set();
      const nextVisiting = new Set(visiting).add(id);
      const result = new Set<string>();
      for (const childId of children.get(id) ?? []) {
        result.add(childId);
        collect(childId, nextVisiting).forEach(descendantId => result.add(descendantId));
      }
      memo.set(id, result);
      return result;
    };
    return new Map(activeGraph.people.map(person => [person.id, { children: children.get(person.id)?.length ?? 0, descendants: collect(person.id).size }]));
  }, [activeGraph]);

  const marriageDatesByPerson = useMemo(() => {
    const dates = new Map<string, string>();
    for (const relationship of activeGraph.relationships) {
      if (relationship.type !== "spouse" || !relationship.hebrewMarriageDate) continue;
      if (!dates.has(relationship.sourceId)) dates.set(relationship.sourceId, relationship.hebrewMarriageDate);
      if (!dates.has(relationship.targetId)) dates.set(relationship.targetId, relationship.hebrewMarriageDate);
    }
    return dates;
  }, [activeGraph]);

  const currentMonthEvents = useMemo(() => monthlyEvents(activeGraph, new Date()), [activeGraph]);

  const graphForFilter = (rootId: string): FamilyGraph => {
    const ids = descendants(activeGraph, rootId);
    spouses(activeGraph, rootId).forEach(id => ids.add(id));
    return { people: activeGraph.people.filter(p => ids.has(p.id)), relationships: activeGraph.relationships.filter(r => ids.has(r.sourceId) && ids.has(r.targetId)) };
  };

  const layout = useMemo(() => calculateFamilyLayout(filter ? graphForFilter(filter) : activeGraph, viewportWidth), [activeGraph, filter, viewportWidth]);

  if (!graph) return <LoadingScreen error={loadError} onRetry={loadGraph} />;

  const selected = graph.people.find(p => p.id === selectedId);
  const filterPerson = filter ? graph.people.find(p => p.id === filter) : null;
  const trimmedQuery = query.trim();
  const matches = trimmedQuery.length >= 1
    ? graph.people
        .filter(p => [p.name, p.previousLastName, p.role, p.birthCountry].filter(Boolean).join(" ").includes(trimmedQuery))
        .slice(0, 8)
    : [];
  const highlightedPersonId = spouseFocusId;
  const highlightedDescendants = highlightedPersonId ? descendants(activeGraph, highlightedPersonId) : new Set<string>();

  const savePerson = (person: Person) => {
    const next = { ...graph, people: graph.people.map(p => p.id === person.id ? person : p) };
    setGraph(next);
    setSelectedId(null);
    void persistGraph(next);
  };

  const deletePerson = (personId: string) => {
    const next = {
      people: graph.people.filter(person => person.id !== personId),
      relationships: graph.relationships.filter(relationship => relationship.sourceId !== personId && relationship.targetId !== personId),
    };
    setGraph(next);
    setSelectedId(null);
    setSpouseFocusId(current => current === personId ? null : current);
    setFilter(current => current === personId ? null : current);
    void persistGraph(next);
  };

  const createRelationship = (type: "partner" | "child" | "parent", targetId: string | null, newPerson: NewPersonDetails | null, relationship: RelationshipDetails = {}) => {
    if (!addMemberForId) return;
    const source = graph.people.find(person => person.id === addMemberForId);
    if (!source) return;
    const id = newPerson ? newPersonId() : targetId!;
    const person = newPerson ? { id, familyId: source.familyId, ...newPerson } satisfies Person : null;
    const parentIds = type === "child" ? [source.id, ...spouses(graph, source.id)] : [];
    const relationships = type === "child"
      ? parentIds.map(sourceId => ({ familyId: source.familyId, sourceId, targetId: id, type: "parent" as const }))
      : [type === "partner" ? { familyId: source.familyId, sourceId: source.id, targetId: id, type: "spouse" as const, ...relationship } : { familyId: source.familyId, sourceId: id, targetId: source.id, type: "parent" as const }];
    const next = {
      people: person ? [...graph.people, person] : graph.people,
      relationships: [...graph.relationships.filter(existing => !relationships.some(candidate => existing.sourceId === candidate.sourceId && existing.targetId === candidate.targetId && existing.type === candidate.type)), ...relationships],
    };
    setGraph(next);
    setAddMemberForId(null);
    void persistGraph(next);
  };

  const createStandaloneEntity = (personDetails: NewPersonDetails) => {
    const id = newPersonId();
    const person = { id, familyId: "default", ...personDetails } satisfies Person;
    const next = { ...graph, people: [...graph.people, person] };
    setGraph(next);
    setNewEntityOpen(false);
    void persistGraph(next);
  };

  const zoomAt = (clientX: number, clientY: number, nextScale: number) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM()?.inverse();
    if (!svg || !matrix) return;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const viewPoint = point.matrixTransform(matrix);
    const clampedScale = Math.max(0.4, Math.min(20, nextScale));
    setOffset(current => ({ x: viewPoint.x - (viewPoint.x - current.x) * clampedScale / scale, y: viewPoint.y - (viewPoint.y - current.y) * clampedScale / scale }));
    setScale(clampedScale);
  };

  const svgPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM()?.inverse();
    if (!svg || !matrix) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const viewPoint = point.matrixTransform(matrix);
    return { x: viewPoint.x, y: viewPoint.y };
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    didDrag.current = false;
    if (pointers.current.size === 1) panStart.current = { x: event.clientX, y: event.clientY, offset };
    else {
      lastTouchTap.current = null;
      const points = [...pointers.current.values()];
      pinchStart.current = { distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y), scale };
      panStart.current = null;
      didDrag.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    if (points.length >= 2 && pinchStart.current) {
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const nextScale = Math.max(0.4, Math.min(20, pinchStart.current.scale * distance / pinchStart.current.distance));
      const midpoint = svgPoint((points[0].x + points[1].x) / 2, (points[0].y + points[1].y) / 2);
      const worldPoint = { x: (midpoint.x - offset.x) / scale, y: (midpoint.y - offset.y) / scale };
      setScale(nextScale);
      setOffset({ x: midpoint.x - worldPoint.x * nextScale, y: midpoint.y - worldPoint.y * nextScale });
      return;
    }
    if (points.length === 1 && panStart.current) {
      const rect = svgRef.current!.getBoundingClientRect();
      const movementMultiplier = 1.6;
      const svgScale = Math.min(rect.width / layout.width, rect.height / layout.height);
      const dx = (event.clientX - panStart.current.x) / svgScale * movementMultiplier;
      const dy = (event.clientY - panStart.current.y) / svgScale * movementMultiplier;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        didDrag.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      setOffset({ x: panStart.current.offset.x + dx, y: panStart.current.offset.y + dy });
    }
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    const wasSinglePointer = pointers.current.size === 1;
    pointers.current.delete(event.pointerId);
    const points = [...pointers.current.values()];
    if (points.length < 2) pinchStart.current = null;
    panStart.current = points.length === 1 ? { x: points[0].x, y: points[0].y, offset } : null;
    if (event.type === "pointercancel" || event.pointerType !== "touch" || !wasSinglePointer || didDrag.current) {
      lastTouchTap.current = null;
      return;
    }
    const now = Date.now();
    const previousTap = lastTouchTap.current;
    const isDoubleTap = previousTap && now - previousTap.time < 350 && Math.hypot(event.clientX - previousTap.x, event.clientY - previousTap.y) < 32;
    if (isDoubleTap) {
      lastTouchTap.current = null;
      zoomAt(event.clientX, event.clientY, Math.min(20, scale * 2));
    } else {
      lastTouchTap.current = { time: now, x: event.clientX, y: event.clientY };
    }
  };

  const focusOnPerson = (personId: string) => {
    const fullLayout = calculateFamilyLayout(graph, viewportWidth);
    const positionedPerson = fullLayout.people.find(candidate => candidate.id === personId);
    if (!positionedPerson) return;
    const focusScale = 4;
    setFilter(null);
    setViewMode("canvas");
    setScale(focusScale);
    setOffset({ x: fullLayout.width / 2 - focusScale * positionedPerson.x, y: fullLayout.height / 2 - focusScale * positionedPerson.y });
    setSpouseFocusId(personId);
    setExplorerPersonId(personId);
  };

  const fitTreeToScreen = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const focusOnIsaacAylon = () => {
    const person = graph.people.find(candidate => candidate.name.trim() === "יצחק אילון") ?? graph.people[0];
    if (!person) return;
    const fullLayout = calculateFamilyLayout(graph, viewportWidth);
    const positionedPerson = fullLayout.people.find(candidate => candidate.id === person.id);
    if (!positionedPerson) return;
    setFilter(null);
    const focusScale = 4;
    setScale(focusScale);
    setOffset({ x: fullLayout.width / 2 - focusScale * positionedPerson.x, y: fullLayout.height / 2 - focusScale * positionedPerson.y });
    setSpouseFocusId(person.id);
    setSelectedId(null);
  };

  const activatePerson = (id: string) => {
    if (didDrag.current) return;
    setSpouseFocusId(id);
    setExplorerPersonId(id);
    setSelectedId(id);
  };

  const selectSearchMatch = (personId: string) => {
    setExplorerPersonId(personId);
    if (viewMode === "canvas") {
      focusOnPerson(personId);
    }
    setSelectedId(personId);
    setQuery("");
  };

  const leaveManageMode = () => {
    setCanEdit(false);
    void fetch("/api/manage", { method: "DELETE" });
  };

  return <main className="app-shell">
    <header className="topbar">
      <div className="topbar-right">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">🌳</span>
          <div className="brand-text">
            <span className="brand-title">משפחת אילון</span>
            <small className="brand-subtitle">{graph.people.length} בני משפחה בעץ</small>
          </div>
          {canEdit && <span className="status">מצב עריכה פעיל</span>}
        </div>

        <nav className="view-switcher" aria-label="בחירת תצוגה">
          <button
            type="button"
            className={`view-tab ${viewMode === "canvas" ? "active" : ""}`}
            onClick={() => setViewMode("canvas")}
          >
            🌳 <span>מפת העץ</span>
          </button>
          <button
            type="button"
            className={`view-tab ${viewMode === "explorer" ? "active" : ""}`}
            onClick={() => setViewMode("explorer")}
          >
            🧭 <span>סייר משפחה</span>
          </button>
          <button
            type="button"
            className={`view-tab ${viewMode === "directory" ? "active" : ""}`}
            onClick={() => setViewMode("directory")}
          >
            📖 <span>אלפון</span>
          </button>
        </nav>
      </div>

      <div className="toolbar">
        <div className="search-container">
          <span className="search-icon" aria-hidden="true">🔍</span>
          <input
            className="search"
            aria-label="חיפוש בני משפחה"
            placeholder="חיפוש בן משפחה לפי שם…"
            value={query}
            onChange={e => { setQuery(e.target.value); setSearchHighlightIdx(0); }}
            onKeyDown={e => {
              if (e.key === "Escape") { setQuery(""); }
              else if (e.key === "ArrowDown" && matches.length > 0) { e.preventDefault(); setSearchHighlightIdx(i => (i + 1) % matches.length); }
              else if (e.key === "ArrowUp" && matches.length > 0) { e.preventDefault(); setSearchHighlightIdx(i => (i - 1 + matches.length) % matches.length); }
              else if (e.key === "Enter" && matches[searchHighlightIdx]) { e.preventDefault(); selectSearchMatch(matches[searchHighlightIdx].id); }
            }}
          />
          {query && <button type="button" className="search-clear" onClick={() => setQuery("")} aria-label="ניקוי חיפוש">✕</button>}
          {matches.length > 0 && (
            <div className="search-dropdown" role="listbox">
              {matches.map((p, index) => {
                const subtitle = searchResultSubtitle(p, graph);
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={index === searchHighlightIdx}
                    className={`search-result-item ${index === searchHighlightIdx ? "highlighted" : ""}`}
                    onClick={() => selectSearchMatch(p.id)}
                  >
                    <Avatar person={p} size="small" />
                    <div className="search-result-text">
                      <strong>{p.name}{p.previousLastName ? ` (${p.previousLastName})` : ""}</strong>
                      {subtitle && <small>{subtitle}</small>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {trimmedQuery.length >= 1 && matches.length === 0 && (
            <div className="search-dropdown search-empty" role="status">
              לא נמצא בן משפחה בשם &ldquo;{trimmedQuery}&rdquo;
            </div>
          )}
        </div>

        <div className="topbar-actions">
          <button
            type="button"
            className="button events-trigger"
            onClick={() => setCalendarOpen(true)}
            title="אירועים וימי הולדת החודש"
          >
            🎂 <span className="btn-label">אירועי החודש</span>
            {currentMonthEvents.length > 0 && <span className="events-badge">{currentMonthEvents.length}</span>}
          </button>

          {canEdit && (
            <button type="button" className="button primary" onClick={() => setNewEntityOpen(true)}>
              + <span className="btn-label">אדם חדש</span>
            </button>
          )}

          <button
            type="button"
            className={`button ${canEdit ? "danger" : "ghost"}`}
            onClick={() => (canEdit ? leaveManageMode() : setManagePasswordOpen(true))}
            title={canEdit ? "יציאה ממצב עריכה" : "כניסה לניהול ועריכת העץ"}
          >
            {canEdit ? "יציאה מעריכה" : "✏️ עריכה"}
          </button>

          <button
            type="button"
            className="button ghost help-trigger"
            onClick={() => setHelpOpen(true)}
            aria-label="עזרה והסבר על השימוש באתר"
            title="איך מנווטים בעץ?"
          >
            ❓
          </button>
        </div>
      </div>
    </header>

    {viewMode === "explorer" && (
      <MobileFamilyTree
        graph={graph}
        initialId={explorerPersonId ?? selectedId ?? undefined}
        canEdit={canEdit}
        onSelectPerson={id => { setSelectedId(id); setSpouseFocusId(id); setExplorerPersonId(id); }}
        onAddMember={id => setAddMemberForId(id)}
        onShowCanvas={id => {
          if (id) focusOnPerson(id);
          else setViewMode("canvas");
        }}
        onShowLineage={id => setLineagePersonId(id)}
      />
    )}

    {viewMode === "directory" && (
      <FamilyDirectoryView
        graph={graph}
        personStats={personStats}
        onSelectPerson={id => { setSelectedId(id); setSpouseFocusId(id); setExplorerPersonId(id); }}
        onOpenExplorer={id => { setExplorerPersonId(id); setViewMode("explorer"); }}
        onFocusOnMap={id => focusOnPerson(id)}
      />
    )}

    {viewMode === "canvas" && (
      <section className="canvas-shell">
        {filterPerson && (
          <div className="filter-banner" role="status">
            <span>🌿 מציג כעת רק את ענף המשפחה והצאצאים של <strong>{filterPerson.name}</strong></span>
            <button type="button" className="button small-btn primary" onClick={() => { setFilter(null); fitTreeToScreen(); }}>
              הצג את כל העץ ✕
            </button>
          </div>
        )}

        <svg
          className="graph-svg"
          ref={svgRef}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          onTouchMove={e => { if (e.touches.length > 1) e.preventDefault(); }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          aria-label="עץ המשפחה"
        >
          <g transform={`translate(${offset.x} ${offset.y}) scale(${scale})`}>
            {layout.relationships.map((r, i) => {
              const path = edgePath(r, layout.people);
              const directlyConnected = spouseFocusId !== null && (r.sourceId === spouseFocusId || r.targetId === spouseFocusId);
              const highlighted = directlyConnected || (r.type === "parent" && highlightedDescendants.has(r.targetId));
              return path ? <path key={`${r.sourceId}-${r.targetId}-${i}`} className={`edge ${r.type}${highlighted ? " highlighted" : ""}`} d={path} /> : null;
            })}
            {layout.people.map(p => (
              <PersonCard
                key={p.id}
                person={p}
                stats={personStats.get(p.id) ?? { children: 0, descendants: 0 }}
                selected={p.id === selectedId || p.id === spouseFocusId}
                canEdit={canEdit}
                onClick={() => activatePerson(p.id)}
              />
            ))}
          </g>
        </svg>

        <div className="canvas-controls-dock" role="toolbar" aria-label="כלי שליטה במפה">
          <button type="button" className="dock-btn" onClick={() => setScale(s => Math.min(12, s + 0.5))} title="התקרבות (+)">
            ＋
          </button>
          <button type="button" className="dock-btn" onClick={() => setScale(s => Math.max(0.4, s - 0.5))} title="התרחקות (-)">
            −
          </button>
          <span className="dock-divider" aria-hidden="true" />
          <button type="button" className="dock-btn dock-text-btn" onClick={fitTreeToScreen} title="הצגת כל העץ במסך">
            ⛶ כל העץ
          </button>
          <button type="button" className="dock-btn dock-text-btn" onClick={focusOnIsaacAylon} title="התמקדות בשורש המשפחה">
            🎯 שורש העץ
          </button>
        </div>

        <div className="legend">
          <span className="legend-dot male">●</span><span>זכר</span>
          <span className="legend-dot female">●</span><span>נקבה</span>
          <span className="legend-sep">|</span>
          <span className="legend-hint">💡 לחצו על אדם לפתיחת כרטיס מלא</span>
        </div>

        {saveError && (
          <div className="save-error" role="alert">
            <span>{saveError}</span>
            <button className="button" onClick={() => setSaveError(null)} aria-label="סגירת הודעת השגיאה">✕</button>
          </div>
        )}
      </section>
    )}

    {selected && (
      <PersonPanel
        key={selected.id}
        person={selected}
        graph={graph}
        stats={personStats.get(selected.id) ?? { children: 0, descendants: 0 }}
        marriageDate={marriageDatesByPerson.get(selected.id)}
        canEdit={canEdit}
        onClose={() => setSelectedId(null)}
        onDelete={deletePerson}
        onSelectRelative={id => { setSelectedId(id); setSpouseFocusId(id); setExplorerPersonId(id); }}
        onFocusOnMap={() => { focusOnPerson(selected.id); setSelectedId(null); }}
        onOpenInExplorer={() => { setExplorerPersonId(selected.id); setViewMode("explorer"); setSelectedId(null); }}
        onShowLineage={() => setLineagePersonId(selected.id)}
        onAddRelative={() => { const id = selected.id; setSelectedId(null); setAddMemberForId(id); }}
        onFilter={() => {
          const filteredLayout = calculateFamilyLayout(graphForFilter(selected.id), viewportWidth);
          const positionedSelected = filteredLayout.people.find(person => person.id === selected.id);
          setFilter(selected.id);
          setViewMode("canvas");
          setScale(1);
          if (positionedSelected) setOffset({ x: filteredLayout.width / 2 - positionedSelected.x, y: NODE_HEIGHT / 2 + 24 - positionedSelected.y });
          setSelectedId(null);
          setSpouseFocusId(null);
        }}
        onSave={savePerson}
      />
    )}

    {lineagePersonId && graph.people.find(person => person.id === lineagePersonId) && (
      <CumulativeFamilyTree
        graph={graph}
        root={graph.people.find(person => person.id === lineagePersonId)!}
        onClose={() => setLineagePersonId(null)}
        onOpenProfile={id => { setSelectedId(id); setSpouseFocusId(id); }}
      />
    )}

    {addMemberForId && canEdit && graph.people.find(person => person.id === addMemberForId) && (
      <AddRelationshipPanel
        source={graph.people.find(person => person.id === addMemberForId)!}
        people={graph.people}
        onClose={() => setAddMemberForId(null)}
        onCreate={createRelationship}
      />
    )}

    {newEntityOpen && canEdit && <NewEntityPanel onClose={() => setNewEntityOpen(false)} onCreate={createStandaloneEntity} />}

    {calendarOpen && (
      <HebrewCalendarPanel
        date={calendarDate}
        events={monthlyEvents(graph, calendarDate)}
        onChangeMonth={direction => setCalendarDate(current => shiftHebrewMonth(current, direction))}
        onClose={() => setCalendarOpen(false)}
        onSelectPerson={id => {
          setExplorerPersonId(id);
          if (viewMode === "canvas") focusOnPerson(id);
          setSelectedId(id);
        }}
      />
    )}

    {managePasswordOpen && (
      <ManagePasswordPanel
        onClose={() => setManagePasswordOpen(false)}
        onSuccess={() => { setManagePasswordOpen(false); setCanEdit(true); }}
      />
    )}

    {helpOpen && <QuickHelpPanel onClose={() => setHelpOpen(false)} onSelectMode={mode => setViewMode(mode)} />}
  </main>;
}
