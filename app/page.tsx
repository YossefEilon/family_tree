"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { calculateFamilyLayout, edgePath, NODE_HEIGHT, NODE_WIDTH } from "@/lib/layout";
import { ageLabel, currentHebrewMonth, descendants, formatBirthDate, isBirthdayInCurrentHebrewMonth, monthlyEvents, spouses, type FamilyGraph, type Person } from "@/lib/domain";

type PersonStats = { children: number; descendants: number };
type RelationshipDetails = { hebrewMarriageDate?: string };
import { fetchGoogleSheetGraph, GoogleSheetRequestError, saveGoogleSheetGraph } from "@/lib/google-sheet";

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

function HebrewCalendarPanel({ date, onChangeMonth, events, onClose, onSelectPerson }: { date: Date; onChangeMonth: (direction: -1 | 1) => void; events: ReturnType<typeof monthlyEvents>; onClose: () => void; onSelectPerson: (id: string) => void }) {
  return <div className="overlay" role="presentation" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="panel calendar-panel" role="dialog" aria-modal="true" aria-labelledby="hebrew-calendar-title">
    <div className="panel-header"><h2 id="hebrew-calendar-title">אירועים משפחתיים בחודש זה</h2><button className="button" aria-label="סגירת לוח השנה" onClick={onClose}>×</button></div>
    <div className="calendar-heading"><button className="button" onClick={() => onChangeMonth(-1)} aria-label="החודש הקודם">‹</button><strong>{hebrewMonthLabel(date)}</strong><button className="button" onClick={() => onChangeMonth(1)} aria-label="החודש הבא">›</button></div>
    {events.length > 0 ? <div className="calendar-events">{events.map(event => <button key={event.id} className={`calendar-event ${event.type}`} onClick={() => { onSelectPerson(event.personIds[0]); onClose(); }}><span className="calendar-event-icon">{eventIcon(event.type)}</span><span><strong>{event.label}</strong><small>{event.date}</small></span></button>)}</div> : <p className="birthday-empty calendar-empty">אין אירועים בחודש זה</p>}
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
  return <div className="field"><span>{label}</span><div className="date-selects"><label className="date-part">יום<input list={`${listId}-days`} aria-label="יום עברי" value={dayInput} placeholder="י״ב" onChange={event => setPart("day", event.target.value)} /><datalist id={`${listId}-days`}>{Array.from({ length: 30 }, (_, index) => <option key={index + 1} value={hebrewNumeral(index + 1)} />)}</datalist></label><label className="date-part">חודש<input list={`${listId}-months`} aria-label="חודש עברי" value={monthInput} placeholder="אב" onChange={event => setPart("month", event.target.value)} /><datalist id={`${listId}-months`}>{hebrewBirthMonths.map(month => <option key={month} value={month} />)}</datalist></label><label className="date-part">שנה<input list={`${listId}-years`} aria-label="שנה עברית" value={yearInput} placeholder="תשפ״ו" onChange={event => setPart("year", event.target.value)} /><datalist id={`${listId}-years`}>{hebrewDateYears.map(optionYear => <option key={optionYear} value={hebrewNumeral(optionYear)} />)}</datalist></label></div><small className="date-hint">אפשר להקליד לחיפוש או לבחור מהרשימה</small></div>;
}

function BirthDateFields({ birthDate, hebrewBirthDate, onChange }: { birthDate?: string; hebrewBirthDate?: string; onChange: (key: "birthDate" | "birthYear" | "hebrewBirthDate", value: string | number | undefined) => void }) {
  const datePickerRef = useRef<HTMLInputElement>(null);
  const [typedBirthDate, setTypedBirthDate] = useState("");
  const setBirthDate = (value: string) => onChange("birthDate", value || undefined);
  const formattedBirthDate = birthDate ? birthDate.split("-").reverse().join("/") : "";
  useEffect(() => setTypedBirthDate(formattedBirthDate), [formattedBirthDate]);
  const updateTypedBirthDate = (value: string) => {
    setTypedBirthDate(value);
    const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return;
    const [, day, month, year] = match;
    const candidate = `${year}-${month}-${day}`;
    const parsed = new Date(`${candidate}T00:00:00`);
    if (parsed.getFullYear() === Number(year) && parsed.getMonth() + 1 === Number(month) && parsed.getDate() === Number(day)) {
      setBirthDate(candidate);
      onChange("birthYear", Number(year));
    }
  };
  return <>
    <label className="field">תאריך לידה<div className="date-picker"><input className="date-display" type="text" dir="ltr" value={typedBirthDate} placeholder="dd/mm/yyyy" onChange={event => updateTypedBirthDate(event.target.value)} onBlur={() => setTypedBirthDate(formattedBirthDate)} aria-label="תאריך לידה בפורמט יום חודש שנה" /><input ref={datePickerRef} className="calendar-input" type="date" lang="en-GB" value={birthDate ?? ""} onChange={event => { setBirthDate(event.target.value); onChange("birthYear", event.target.value ? Number(event.target.value.slice(0, 4)) : undefined); }} aria-label="בחירת תאריך לידה בלוח שנה" /></div></label>
    <HebrewDateFields value={hebrewBirthDate} label="תאריך לידה עברי" onChange={value => onChange("hebrewBirthDate", value)} />
  </>;
}

function PersonCard({ person, stats, selected, canEdit: _canEdit, onClick, onAddMember }: { person: Person & { x: number; y: number }; stats: PersonStats; selected: boolean; canEdit?: boolean; onClick: () => void; onAddMember?: () => void }) {
  const childrenCount = stats.children;
  const descendantsCount = stats.descendants;
  const requestAddMember = () => { if (onAddMember) onAddMember(); else if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("family:add-member", { detail: person.id })); };
  const status = person.deathYear ? `נפטר/ה בגיל ${ageLabel(person) ?? "לא ידוע"}` : person.isAlive ? (ageLabel(person) ?? "גיל לא ידוע") : "גיל לא ידוע";
  const familyMeta = childrenCount > 0 ? `${childrenCount} ${childrenCount === 1 ? "ילד/ה" : "ילדים"} · ${descendantsCount} צאצאים` : "";
  const hasBirthdayThisMonth = isBirthdayInCurrentHebrewMonth(person);
  return <g className={`person-card ${selected ? "selected" : ""}`} transform={`translate(${person.x - NODE_WIDTH / 2},${person.y - NODE_HEIGHT / 2})`} onClick={onClick} role="button" tabIndex={0} onKeyDown={e => e.key === "Enter" && onClick()}>
    <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx="16" />
    {hasBirthdayThisMonth && <g className="birthday-card-balloons" aria-hidden="true">
      <g className="card-balloon card-balloon-pink"><ellipse cx="218" cy="20" rx="7" ry="9" /><path d="M218 29v18" /></g>
      <g className="card-balloon card-balloon-blue"><ellipse cx="235" cy="31" rx="7" ry="9" /><path d="M235 40v15" /></g>
      <g className="card-balloon card-balloon-yellow"><ellipse cx="202" cy="35" rx="7" ry="9" /><path d="M202 44v12" /></g>
    </g>}
    {person.profileImageUrl ? <image className="profile-image" href={person.profileImageUrl} x="14" y="14" width="44" height="44" preserveAspectRatio="xMidYMid slice" /> : <circle className={`dot ${person.gender}`} cx="36" cy="36" r="11" />}
    <text className="name" x="68" y="37" textAnchor="start" direction="ltr" unicodeBidi="plaintext">{person.name.slice(0, 20)}</text>
    {person.role?.trim() && <text className="meta role" x="18" y="78" textAnchor="start" direction="ltr" unicodeBidi="plaintext">{person.role}</text>}
    <text className="meta" x="18" y="98" textAnchor="start" direction="ltr" unicodeBidi="plaintext">{status}{person.birthYear ? ` · ${person.birthYear}${person.deathYear ? `–${person.deathYear}` : ""}` : ""}</text>
    {hasBirthdayThisMonth && <g className="birthday-badge"><title>יום הולדת בחודש העברי הנוכחי</title><rect x="160" y="96" width="82" height="28" rx="14" /><text x="201" y="115" textAnchor="middle">🎂 החודש</text></g>}
    {familyMeta && <text className="meta family-meta" x="18" y="118" textAnchor="start" direction="ltr" unicodeBidi="plaintext">{familyMeta}</text>}
    <g className="add-member-button" role="button" tabIndex={0} onClick={event => { event.stopPropagation(); requestAddMember(); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.stopPropagation(); requestAddMember(); } }}><rect x="18" y="102" width="110" height="22" rx="7" /><text x="73" y="117" textAnchor="middle">+ בן משפחה</text></g>
  </g>;
}

function BirthdayBalloons() {
  return <div className="birthday-balloons" aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <span key={index} className={`balloon balloon-${index + 1}`} />)}</div>;
}

type ImageEditorState = { src: string; zoom: number; pan: { x: number; y: number }; width: number; height: number };

function imagePanLimit(editor: ImageEditorState, axis: "x" | "y"): number {
  const aspect = editor.width / editor.height;
  const overflowRatio = axis === "x" ? Math.max(1, aspect) : Math.max(1, 1 / aspect);
  return Math.max(0, (272 * overflowRatio * editor.zoom - 272) / 2);
}

function ProfileImageField({ value, onChange }: { value?: string; onChange: (value: string | undefined) => void }) {
  const [editor, setEditor] = useState<ImageEditorState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const draggingRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const src = editor?.src;
    return () => { if (src) URL.revokeObjectURL(src); };
  }, [editor?.src]);

  const closeEditor = () => {
    setEditor(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const selectFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const src = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => setEditor({ src, zoom: 1, pan: { x: 0, y: 0 }, width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => { URL.revokeObjectURL(src); window.alert("לא ניתן לפתוח את התמונה"); };
    image.src = src;
  };

  const saveEditedImage = () => {
    if (!editor) return;
    const image = new Image();
    image.onload = () => {
      const size = 600;
      const canvas = document.createElement("canvas");
      canvas.width = size; canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.fillStyle = "#fff"; context.fillRect(0, 0, size, size);
      const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight) * editor.zoom;
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      context.drawImage(image, (size - width) / 2 + editor.pan.x * 600 / 272, (size - height) / 2 + editor.pan.y * 600 / 272, width, height);
      let compressed = canvas.toDataURL("image/jpeg", .65);
      if (compressed.length > 48000) compressed = canvas.toDataURL("image/jpeg", .45);
      if (compressed.length > 48000) { window.alert("לא ניתן לדחוס את התמונה לגודל המתאים ל-Google Sheets"); return; }
      onChange(compressed);
      closeEditor();
    };
    image.src = editor.src;
  };

  const updatePan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!editor || !draggingRef.current) return;
    const maxPanX = imagePanLimit(editor, "x");
    const maxPanY = imagePanLimit(editor, "y");
    const x = editor.pan.x + event.clientX - lastPointerRef.current.x;
    const y = editor.pan.y + event.clientY - lastPointerRef.current.y;
    setEditor({ ...editor, pan: { x: Math.max(-maxPanX, Math.min(maxPanX, x)), y: Math.max(-maxPanY, Math.min(maxPanY, y)) } });
    lastPointerRef.current = { x: event.clientX, y: event.clientY };
  };

  return <div className="image-field full">
    <div className="image-field-heading"><span>תמונת פרופיל</span><small>{value ? "ניתן להחליף את התמונה" : "בחירת תמונה מהמכשיר"}</small></div>
    {value && !editor && <img className="image-field-preview" src={value} alt="תצוגה מקדימה של תמונת הפרופיל" />}
    {editor ? <div className="image-editor" role="group" aria-label="התאמת תמונת הפרופיל">
      <div className="image-crop-preview" onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); draggingRef.current = true; lastPointerRef.current = { x: event.clientX, y: event.clientY }; }} onPointerMove={updatePan} onPointerUp={() => { draggingRef.current = false; }} onPointerCancel={() => { draggingRef.current = false; }}><img src={editor.src} alt="תצוגה מקדימה לחיתוך" style={{ transform: `translate(${editor.pan.x}px, ${editor.pan.y}px) scale(${editor.zoom})` }} /></div>
      <label className="image-zoom">הגדלה <input type="range" min="1" max="2.5" step="0.05" value={editor.zoom} onChange={event => { const zoom = Number(event.target.value); const next = { ...editor, zoom }; const maxPanX = imagePanLimit(next, "x"); const maxPanY = imagePanLimit(next, "y"); setEditor({ ...next, pan: { x: Math.max(-maxPanX, Math.min(maxPanX, editor.pan.x)), y: Math.max(-maxPanY, Math.min(maxPanY, editor.pan.y)) } }); }} /><output>{Math.round(editor.zoom * 100)}%</output></label>
      <small className="image-editor-hint">גררו את התמונה כדי לשנות את המיקום</small>
      <div className="image-editor-actions"><button type="button" className="button" onClick={closeEditor}>ביטול</button><button type="button" className="button primary" onClick={saveEditedImage}>שימוש בתמונה</button></div>
    </div> : <>
      <button type="button" className="button image-pick-button" onClick={() => inputRef.current?.click()}>{value ? "החלפת תמונה" : "בחירת תמונה"}</button>
      <input ref={inputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => { const file = event.target.files?.[0]; if (file) selectFile(file); }} />
      {value && <button type="button" className="button ghost image-remove-button" onClick={() => onChange(undefined)}>הסרת תמונה</button>}
    </>}
  </div>;
}

type LineageRow = { title: string; people: Person[] };

function CumulativeFamilyTree({ graph, root, onClose }: { graph: FamilyGraph; root: Person; onClose: () => void }) {
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
  const generationLabel = (level: number) => level === 0 ? "האדם שנבחר" : level < 0 ? `דור ${Math.abs(level)} מעל` : `דור ${level} מתחת`;
  const explore = (personId: string) => {
    const nextVisibleIds = new Set(visibleIdsState);
    nextVisibleIds.add(personId);
    if ((parents.get(selectedId) ?? []).includes(personId)) (parents.get(personId) ?? []).forEach(parentId => nextVisibleIds.add(parentId));
    else if ((children.get(selectedId) ?? []).includes(personId)) (children.get(personId) ?? []).forEach(childId => nextVisibleIds.add(childId));
    setHistory(previous => [...previous, { visibleIds: new Set(visibleIdsState), selectedId }]);
    setVisibleIdsState(nextVisibleIds);
    setSelectedId(personId);
  };
  const goBack = () => { const previous = history.at(-1); if (!previous) return; setHistory(current => current.slice(0, -1)); setVisibleIdsState(previous.visibleIds); setSelectedId(previous.selectedId); };
  return <div className="overlay lineage-overlay" role="dialog" aria-modal="true" aria-labelledby="lineage-title" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="panel lineage-panel"><div className="panel-header"><div><h2 id="lineage-title">המשפחה המורחבת</h2><p className="lineage-subtitle">בחירת בני משפחה מרחיבה את התצוגה</p></div><div className="lineage-header-actions"><button className="button" disabled={history.length === 0} onClick={goBack}>חזרה</button><button className="button ghost" onClick={onClose} aria-label="סגירה">×</button></div></div><div className="lineage-scroll">{sortedLevels.map(level => <div className="lineage-level" key={level}><span className="lineage-level-label">{generationLabel(level)}</span><div className="lineage-people">{rows.get(level)!.map(person => <button key={person.id} className={`lineage-person ${person.id === selectedId ? "root" : ""}`} onClick={() => explore(person.id)}><span className={`lineage-dot ${person.gender}`} /><span>{person.name}</span>{person.role?.trim() && <small>{person.role}</small>}</button>)}</div></div>)}</div></section></div>;
}

function VerticalFamilyTree({ graph, root, onClose, onSelectPerson }: { graph: FamilyGraph; root: Person; onClose: () => void; onSelectPerson: (id: string) => void }) {
  const [activeRootId, setActiveRootId] = useState(root.id);
  const [visibleAncestors, setVisibleAncestors] = useState(1);
  const [visibleDescendants, setVisibleDescendants] = useState(1);
  const [history, setHistory] = useState<string[]>([]);
  useEffect(() => { setActiveRootId(root.id); setVisibleAncestors(1); setVisibleDescendants(1); setHistory([]); }, [root.id]);
  const peopleById = new Map(graph.people.map(person => [person.id, person]));
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  for (const relationship of graph.relationships) {
    if (relationship.type !== "parent") continue;
    parents.set(relationship.targetId, [...(parents.get(relationship.targetId) ?? []), relationship.sourceId]);
    children.set(relationship.sourceId, [...(children.get(relationship.sourceId) ?? []), relationship.targetId]);
  }
  const activeRoot = peopleById.get(activeRootId) ?? root;
  const navigateTo = (personId: string) => { setHistory(previous => [...previous, activeRoot.id]); setActiveRootId(personId); setVisibleAncestors(1); setVisibleDescendants(1); };
  const goBack = () => { const previous = history.at(-1); if (!previous) return; setHistory(current => current.slice(0, -1)); setActiveRootId(previous); setVisibleAncestors(1); setVisibleDescendants(1); };
  const makeRows = (direction: "up" | "down"): LineageRow[] => {
    const rows: LineageRow[] = [];
    let frontier = [activeRoot.id];
    const seen = new Set([activeRoot.id]);
    for (let generation = 1; frontier.length > 0 && generation <= 99; generation += 1) {
      const nextIds = frontier.flatMap(id => direction === "up" ? parents.get(id) ?? [] : children.get(id) ?? []).filter(id => !seen.has(id));
      nextIds.forEach(id => seen.add(id));
      const rowPeople = nextIds.map(id => peopleById.get(id)).filter((person): person is Person => Boolean(person));
      if (rowPeople.length > 0) rows.push({ title: direction === "up" ? (generation === 1 ? "הורים" : `דור ${generation} מעל`) : (generation === 1 ? "ילדים" : `דור ${generation} מתחת`), people: rowPeople });
      frontier = nextIds;
    }
    return direction === "up" ? rows.reverse() : rows;
  };
  const ancestorRows = makeRows("up");
  const descendantRows = makeRows("down");
  const shownAncestorRows = ancestorRows.slice(-visibleAncestors);
  const shownDescendantRows = descendantRows.slice(0, visibleDescendants);
  const canShowMoreAncestors = shownAncestorRows.length < ancestorRows.length;
  const canShowMoreDescendants = shownDescendantRows.length < descendantRows.length;
  const renderRow = (row: LineageRow, index: number) => <div className="lineage-level" key={`${row.title}-${index}`}><span className="lineage-level-label">{row.title}</span><div className="lineage-people">{row.people.map(person => <button key={person.id} className="lineage-person" onClick={() => navigateTo(person.id)}><span className={`lineage-dot ${person.gender}`} /><span>{person.name}</span>{person.role?.trim() && <small>{person.role}</small>}</button>)}</div></div>;
  return <div className="overlay lineage-overlay" role="dialog" aria-modal="true" aria-labelledby="lineage-title" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="panel lineage-panel"><div className="panel-header"><div><h2 id="lineage-title">המשפחה המורחבת</h2><p className="lineage-subtitle">הדורות של {activeRoot.name}</p></div><div className="lineage-header-actions"><button className="button" disabled={history.length === 0} onClick={goBack}>חזרה</button><button className="button ghost" onClick={onClose} aria-label="סגירה">×</button></div></div><div className="lineage-scroll">{canShowMoreAncestors && <button className="button lineage-expand" onClick={() => setVisibleAncestors(value => value + 1)}>הצג דור נוסף למעלה</button>}{shownAncestorRows.map(renderRow)}<div className="lineage-level current"><span className="lineage-level-label">האדם שנבחר</span><div className="lineage-people"><button className="lineage-person root" onClick={() => setActiveRootId(activeRoot.id)}><span className={`lineage-dot ${activeRoot.gender}`} /><span>{activeRoot.name}</span>{activeRoot.role?.trim() && <small>{activeRoot.role}</small>}</button></div></div>{shownDescendantRows.map(renderRow)}{canShowMoreDescendants && <button className="button lineage-expand" onClick={() => setVisibleDescendants(value => value + 1)}>הצג דור נוסף למטה</button>}{ancestorRows.length === 0 && descendantRows.length === 0 && <p className="lineage-empty">לא נמצאו קשרי הורות עבור אדם זה.</p>}</div></section></div>;
}

function LegacyPersonPanel({ person, stats, marriageDate, onClose, onSave, onFilter, onShowLineage, onBack, isFiltered, canEdit }: { person: Person; stats: PersonStats; marriageDate?: string; onClose: () => void; onSave: (p: Person) => void; onFilter: () => void; onShowLineage: () => void; onBack: () => void; isFiltered: boolean; canEdit: boolean }) {
  const [draft, setDraft] = useState(person); const update = (key: keyof Person, value: string | number | boolean | undefined) => setDraft(d => ({ ...d, [key]: value }));
  const age = ageLabel(person);
  const childrenCount = stats.children;
  const descendantsCount = stats.descendants;
  const status = person.deathYear ? "נפטר/ה" : person.isAlive ? "" : "סטטוס לא ידוע";
  return <div className="overlay" role="dialog" aria-modal="true" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>{isBirthdayInCurrentHebrewMonth(person) && <BirthdayBalloons />}<div className="panel"><div className="panel-header"><h2>{canEdit ? "עריכת אדם" : "פרטי אדם"}</h2><button className="button ghost" onClick={onClose} aria-label="סגירה">✕</button></div>
    {canEdit ? <div className="form-grid">
      <label className="field full">שם מלא<input value={draft.name} onChange={e => update("name", e.target.value)} /></label>
      <label className="field">תפקיד<input value={draft.role ?? ""} onChange={e => update("role", e.target.value)} /></label>
      <label className="field">שם משפחה קודם<input value={draft.previousLastName ?? ""} onChange={e => update("previousLastName", e.target.value)} /></label>
      <BirthDateFields birthDate={draft.birthDate} hebrewBirthDate={draft.hebrewBirthDate} onChange={(key, value) => update(key, value as never)} />
      <label className="field">שנת פטירה<input type="number" value={draft.deathYear ?? ""} onChange={e => update("deathYear", e.target.value ? Number(e.target.value) : undefined as never)} /></label>
      <label className="field">מגדר<select value={draft.gender} onChange={e => update("gender", e.target.value)}><option value="neutral">ניטרלי</option><option value="male">זכר</option><option value="female">נקבה</option></select></label>
      <label className="field">סטטוס<select value={String(draft.isAlive)} onChange={e => update("isAlive", e.target.value === "true")}><option value="true">בחיים</option><option value="false">נפטר/ה</option></select></label>
      <ProfileImageField value={draft.profileImageUrl} onChange={value => update("profileImageUrl", value)} />
      <label className="field full">סיפור חיים<textarea rows={5} value={draft.lifeStory ?? ""} onChange={e => update("lifeStory", e.target.value)} /></label>
      <div className="panel-actions full"><button className="button" onClick={onClose}>ביטול</button><button className="button primary" onClick={() => onSave(draft)}>שמירת שינויים</button></div>
    </div> : <div className="person-details">
      <div className="person-hero">
        <div className="profile-panel">{person.profileImageUrl ? <img src={person.profileImageUrl} alt={`תמונה של ${person.name}`} /> : <span className={`profile-placeholder ${person.gender}`}>{person.name.charAt(0)}</span>}</div>
        <div className="person-heading">{status && <span className={`status-badge ${person.deathYear ? "deceased" : "alive"}`}>{status}</span>}<h3>{person.name}</h3>{person.role?.trim() && <p>{person.role}</p>}</div>
      </div>
      <div className="person-stats" aria-label="נתונים מרכזיים">
        <div className="person-stat"><strong>{age ?? "—"}</strong><span>{person.deathYear ? "גיל בפטירה" : "גיל"}</span></div>
        {childrenCount > 0 && <><div className="person-stat"><strong>{childrenCount}</strong><span>{childrenCount === 1 ? "ילד/ה" : "ילדים"}</span></div><div className="person-stat"><strong>{descendantsCount}</strong><span>צאצאים</span></div></>}
      </div>
      <div className="detail-list">
        {person.hebrewBirthDate && <div><span>תאריך לידה עברי</span><strong>{person.hebrewBirthDate}</strong></div>}
        {person.birthDate && <div><span>תאריך לידה לועזי</span><strong dir="ltr">{formatBirthDate(person.birthDate)}</strong></div>}
        {marriageDate && <div><span>יום נישואין</span><strong>{marriageDate}</strong></div>}
        {person.birthCountry && <div><span>מקום לידה</span><strong>{person.birthCountry}</strong></div>}
        {person.previousLastName && <div><span>שם משפחה קודם</span><strong>{person.previousLastName}</strong></div>}
      </div>
      {(!person.isAlive || person.lifeStory?.trim()) && <section className="story-section"><h4>סיפור חיים</h4><p>{person.lifeStory || "אין עדיין סיפור חיים."}</p></section>}
      <div className="panel-actions"><button className="button primary" onClick={onFilter}>הצג את המשפחה הקרובה</button><button className="button lineage-button" onClick={onShowLineage}>הצג עץ דורות</button><button className="button" onClick={onClose}>סגירה</button></div>
    </div>}
  </div></div>;
}

function PersonPanelWithRelationshipEditor({ person, stats, marriageDate, onClose, onSave, onAddRelationship, onFilter, onShowLineage, canEdit }: { person: Person; stats: PersonStats; marriageDate?: string; onClose: () => void; onSave: (p: Person) => void; onAddRelationship: (type: "partner" | "child" | "parent", data: { name: string; gender: Person["gender"] }, relationship?: RelationshipDetails) => void; onFilter: () => void; onShowLineage: () => void; canEdit: boolean }) {
  const [draft, setDraft] = useState(person);
  const [relation, setRelation] = useState<"partner" | "child" | "parent">("child");
  const [relationName, setRelationName] = useState("");
  const [relationGender, setRelationGender] = useState<Person["gender"]>("neutral");
  const [hebrewMarriageDate, setHebrewMarriageDate] = useState("");
  const update = (key: keyof Person, value: Person[keyof Person]) => setDraft(current => ({ ...current, [key]: value }));
  if (!canEdit) return <LegacyPersonPanel person={person} stats={stats} marriageDate={marriageDate} onClose={onClose} onSave={onSave} onFilter={onFilter} onShowLineage={onShowLineage} onBack={() => undefined} isFiltered={false} canEdit={false} />;
  return <div className="overlay" role="dialog" aria-modal="true" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>{isBirthdayInCurrentHebrewMonth(person) && <BirthdayBalloons />}<div className="panel"><div className="panel-header"><h2>עריכת אדם</h2><button className="button ghost" onClick={onClose} aria-label="סגירה">×</button></div><div className="form-grid">
    <label className="field full">שם מלא<input value={draft.name} onChange={e => update("name", e.target.value)} /></label>
    <label className="field">תפקיד<input value={draft.role ?? ""} onChange={e => update("role", e.target.value || undefined)} /></label>
    <BirthDateFields birthDate={draft.birthDate} hebrewBirthDate={draft.hebrewBirthDate} onChange={(key, value) => update(key, value)} />
    <label className="field">שנת פטירה<input type="number" value={draft.deathYear ?? ""} onChange={e => update("deathYear", e.target.value ? Number(e.target.value) : undefined)} /></label>
    <label className="field">מגדר<select value={draft.gender} onChange={e => update("gender", e.target.value as Person["gender"])}><option value="neutral">ניטרלי</option><option value="male">זכר</option><option value="female">נקבה</option></select></label>
    <ProfileImageField value={draft.profileImageUrl} onChange={value => update("profileImageUrl", value)} />
    <label className="field full">סיפור חיים<textarea rows={5} value={draft.lifeStory ?? ""} onChange={e => update("lifeStory", e.target.value || undefined)} /></label>
    <section className="relationship-editor full"><h3>הוספת בן משפחה</h3><div className="form-grid"><label className="field">סוג קשר<select value={relation} onChange={e => setRelation(e.target.value as typeof relation)}><option value="partner">בן/בת זוג</option><option value="child">ילד/ה</option><option value="parent">הורה</option></select></label><label className="field">שם מלא<input value={relationName} onChange={e => setRelationName(e.target.value)} /></label><label className="field">מגדר<select value={relationGender} onChange={e => setRelationGender(e.target.value as Person["gender"])}><option value="neutral">ניטרלי</option><option value="male">זכר</option><option value="female">נקבה</option></select></label>{relation === "partner" && <HebrewDateFields value={hebrewMarriageDate} label="תאריך נישואין עברי" onChange={value => setHebrewMarriageDate(value ?? "")} />}</div><button className="button" disabled={!relationName.trim()} onClick={() => { onAddRelationship(relation, { name: relationName.trim(), gender: relationGender }, relation === "partner" ? { hebrewMarriageDate: hebrewMarriageDate.trim() || undefined } : undefined); setRelationName(""); setHebrewMarriageDate(""); }}>הוסף קשר</button></section>
    <div className="panel-actions full"><button className="button" onClick={onClose}>ביטול</button><button className="button primary" onClick={() => onSave(draft)}>שמירת שינויים</button></div>
  </div></div></div>;
}

function PersonPanel({ person, stats, marriageDate, onClose, onSave, onDelete, onAddRelationship, onFilter, onShowLineage, canEdit }: { person: Person; stats: PersonStats; marriageDate?: string; onClose: () => void; onSave: (p: Person) => void; onDelete: (personId: string) => void; onAddRelationship: (type: "partner" | "child" | "parent", data: { name: string; gender: Person["gender"] }, relationship?: RelationshipDetails) => void; onFilter: () => void; onShowLineage: () => void; canEdit: boolean }) {
  return canEdit ? <EditablePersonPanel person={person} marriageDate={marriageDate} onClose={onClose} onSave={onSave} onDelete={onDelete} onShowLineage={onShowLineage} /> : <PersonPanelWithRelationshipEditor person={person} stats={stats} marriageDate={marriageDate} onClose={onClose} onSave={onSave} onAddRelationship={onAddRelationship} onFilter={onFilter} onShowLineage={onShowLineage} canEdit={false} />;
}

function EditablePersonPanel({ person, marriageDate, onClose, onSave, onDelete, onShowLineage }: { person: Person; marriageDate?: string; onClose: () => void; onSave: (p: Person) => void; onDelete: (personId: string) => void; onShowLineage: () => void }) {

  const [draft, setDraft] = useState(person);
  const update = <K extends keyof Person>(key: K, value: Person[K]) => setDraft(current => ({ ...current, [key]: value }));
  return <div className="overlay" role="dialog" aria-modal="true" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className="panel"><div className="panel-header"><h2>עריכת אדם</h2><button className="button ghost" onClick={onClose} aria-label="סגירה">×</button></div><div className="form-grid">
    <label className="field full">שם מלא<input value={draft.name} onChange={event => update("name", event.target.value)} /></label>
    <label className="field">שם משפחה קודם<input value={draft.previousLastName ?? ""} onChange={event => update("previousLastName", event.target.value || undefined)} /></label>
    <label className="field">תפקיד<input value={draft.role ?? ""} onChange={event => update("role", event.target.value || undefined)} /></label>
    <BirthDateFields birthDate={draft.birthDate} hebrewBirthDate={draft.hebrewBirthDate} onChange={(key, value) => update(key, value)} />
    {marriageDate && <div className="field"><span>יום נישואין</span><strong>{marriageDate}</strong></div>}
    <label className="field">שנת פטירה<input type="number" value={draft.deathYear ?? ""} onChange={event => update("deathYear", event.target.value ? Number(event.target.value) : undefined)} /></label>
    <HebrewDateFields value={draft.hebrewDeathDate} label="תאריך פטירה עברי" onChange={value => update("hebrewDeathDate", value)} />
    <label className="field">מגדר<select value={draft.gender} onChange={event => update("gender", event.target.value as Person["gender"])}><option value="neutral">ניטרלי</option><option value="male">זכר</option><option value="female">נקבה</option></select></label>
    <label className="field">סטטוס<select value={String(draft.isAlive)} onChange={event => update("isAlive", event.target.value === "true")}><option value="true">בחיים</option><option value="false">נפטר/ה</option></select></label>
    <label className="field full">מקום לידה<input value={draft.birthCountry ?? ""} onChange={event => update("birthCountry", event.target.value || undefined)} /></label>
    <ProfileImageField value={draft.profileImageUrl} onChange={value => update("profileImageUrl", value)} />
    <label className="field full">סיפור חיים<textarea rows={5} value={draft.lifeStory ?? ""} onChange={event => update("lifeStory", event.target.value || undefined)} /></label>
    <div className="panel-actions full"><button className="button danger" onClick={() => { if (window.confirm(`האם למחוק את ${person.name}? פעולה זו תמחק גם את הקשרים שלו.`)) onDelete(person.id); }}>מחיקת אדם</button><span className="panel-actions-spacer" /><button className="button lineage-button" onClick={onShowLineage}>הצג עץ דורות</button><button className="button" onClick={onClose}>ביטול</button><button className="button primary" disabled={!draft.name.trim()} onClick={() => onSave({ ...draft, name: draft.name.trim() })}>שמירת שינויים</button></div>
  </div></div></div>;
}

function LegacyAddRelationshipPanel({ source, people, onClose, onCreate }: { source: Person; people: Person[]; onClose: () => void; onCreate: (type: "partner" | "child" | "parent", targetId: string | null, newPerson: { name: string; gender: Person["gender"] } | null) => void }) {
  const [type, setType] = useState<"partner" | "child" | "parent">("child");
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [targetId, setTargetId] = useState("");
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Person["gender"]>("neutral");
  const existingPeople = people.filter(person => person.id !== source.id);
  const submit = () => { if (mode === "existing" ? !targetId : !name.trim()) return; onCreate(type, mode === "existing" ? targetId : null, mode === "new" ? { name: name.trim(), gender } : null); };
  return <div className="overlay" role="dialog" aria-modal="true" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className="panel"><div className="panel-header"><h2>הוספת קשר משפחתי</h2><button className="button ghost" onClick={onClose} aria-label="סגירה">×</button></div><p className="relationship-context">קשר חדש עבור <strong>{source.name}</strong></p><div className="form-grid">
    <label className="field full">סוג קשר<select value={type} onChange={event => setType(event.target.value as typeof type)}><option value="partner">בן/בת זוג</option><option value="child">ילד/ה</option><option value="parent">הורה</option></select></label>
    <div className="relationship-mode full"><label><input type="radio" checked={mode === "new"} onChange={() => setMode("new")} /> יצירת אדם חדש</label><label><input type="radio" checked={mode === "existing"} onChange={() => setMode("existing")} /> חיבור לאדם קיים</label></div>
    {mode === "existing" ? <label className="field full">בחירת אדם קיים<select value={targetId} onChange={event => setTargetId(event.target.value)}><option value="">בחרו אדם</option>{existingPeople.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label> : <><label className="field">שם מלא<input autoFocus value={name} onChange={event => setName(event.target.value)} /></label><label className="field">מגדר<select value={gender} onChange={event => setGender(event.target.value as Person["gender"])}><option value="neutral">ניטרלי</option><option value="male">זכר</option><option value="female">נקבה</option></select></label></>}
    <div className="panel-actions full"><button className="button" onClick={onClose}>ביטול</button><button className="button primary" disabled={mode === "existing" ? !targetId : !name.trim()} onClick={submit}>שמירת קשר</button></div>
  </div></div></div>;
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
  return <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="manage-password-title" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className="panel"><div className="panel-header"><h2 id="manage-password-title">כניסה לניהול</h2><button className="button ghost" onClick={onClose} aria-label="סגירה">×</button></div><form className="form-grid" onSubmit={submit}><label className="field full">סיסמה<input autoFocus type="password" value={password} onChange={event => setPassword(event.target.value)} /></label>{error && <p role="alert" className="field-error full">{error}</p>}<div className="panel-actions full"><button type="button" className="button" onClick={onClose}>ביטול</button><button type="submit" className="button primary" disabled={submitting || !password}>{submitting ? "מאמת…" : "כניסה"}</button></div></form></div></div>;
}

function AddRelationshipPanel({ source, people, onClose, onCreate }: { source: Person; people: Person[]; onClose: () => void; onCreate: (type: "partner" | "child" | "parent", targetId: string | null, newPerson: NewPersonDetails | null, relationship?: RelationshipDetails) => void }) {
  const [type, setType] = useState<"partner" | "child" | "parent">("child");
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [targetId, setTargetId] = useState("");
  const [draft, setDraft] = useState<NewPersonDetails>({ name: "", gender: "neutral", isAlive: true });
  const [hebrewMarriageDate, setHebrewMarriageDate] = useState("");
  const update = <K extends keyof NewPersonDetails>(key: K, value: NewPersonDetails[K]) => setDraft(current => ({ ...current, [key]: value }));
  const existingPeople = people.filter(person => person.id !== source.id);
  return <div className="overlay" role="dialog" aria-modal="true" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className="panel"><div className="panel-header"><h2>הוספת קשר משפחתי</h2><button className="button ghost" onClick={onClose} aria-label="סגירה">×</button></div><p className="relationship-context">קשר חדש עבור <strong>{source.name}</strong></p><div className="form-grid">
    <label className="field full">סוג קשר<select value={type} onChange={event => setType(event.target.value as typeof type)}><option value="partner">בן/בת זוג</option><option value="child">ילד/ה</option><option value="parent">הורה</option></select></label>
    {type === "partner" && <HebrewDateFields value={hebrewMarriageDate} label="תאריך נישואין עברי" onChange={value => setHebrewMarriageDate(value ?? "")} />}
    <div className="relationship-mode full"><label><input type="radio" checked={mode === "new"} onChange={() => setMode("new")} /> יצירת אדם חדש</label><label><input type="radio" checked={mode === "existing"} onChange={() => setMode("existing")} /> חיבור לאדם קיים</label></div>
    {mode === "existing" ? <label className="field full">בחירת אדם קיים<select value={targetId} onChange={event => setTargetId(event.target.value)}><option value="">בחרו אדם</option>{existingPeople.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label> : <>
      <label className="field full">שם מלא<input autoFocus value={draft.name} onChange={event => update("name", event.target.value)} /></label>
      <label className="field">שם משפחה קודם<input value={draft.previousLastName ?? ""} onChange={event => update("previousLastName", event.target.value || undefined)} /></label><label className="field">תפקיד<input value={draft.role ?? ""} onChange={event => update("role", event.target.value || undefined)} /></label>
      <BirthDateFields birthDate={draft.birthDate} hebrewBirthDate={draft.hebrewBirthDate} onChange={(key, value) => update(key, value)} />
      <label className="field">שנת פטירה<input type="number" value={draft.deathYear ?? ""} onChange={event => update("deathYear", event.target.value ? Number(event.target.value) : undefined)} /></label><HebrewDateFields value={draft.hebrewDeathDate} label="תאריך פטירה עברי" onChange={value => update("hebrewDeathDate", value)} />
      <label className="field">מגדר<select value={draft.gender} onChange={event => update("gender", event.target.value as Person["gender"])}><option value="neutral">ניטרלי</option><option value="male">זכר</option><option value="female">נקבה</option></select></label><label className="field">סטטוס<select value={String(draft.isAlive)} onChange={event => update("isAlive", event.target.value === "true")}><option value="true">בחיים</option><option value="false">נפטר/ה</option></select></label>
      <label className="field full">מקום לידה<input value={draft.birthCountry ?? ""} onChange={event => update("birthCountry", event.target.value || undefined)} /></label>
    <ProfileImageField value={draft.profileImageUrl} onChange={value => update("profileImageUrl", value)} />
      <label className="field full">סיפור חיים<textarea rows={5} value={draft.lifeStory ?? ""} onChange={event => update("lifeStory", event.target.value || undefined)} /></label>
    </>}
    <div className="panel-actions full"><button className="button" onClick={onClose}>ביטול</button><button className="button primary" disabled={mode === "existing" ? !targetId : !draft.name.trim()} onClick={() => { if (mode === "existing" ? !targetId : !draft.name.trim()) return; onCreate(type, mode === "existing" ? targetId : null, mode === "new" ? { ...draft, name: draft.name.trim() } : null, type === "partner" ? { hebrewMarriageDate: hebrewMarriageDate.trim() || undefined } : undefined); }}>שמירת קשר</button></div>
  </div></div></div>;
}

function NewEntityPanel({ onClose, onCreate }: { onClose: () => void; onCreate: (person: NewPersonDetails) => void }) {
  const [draft, setDraft] = useState<NewPersonDetails>({ name: "", gender: "neutral", isAlive: true });
  const update = <K extends keyof NewPersonDetails>(key: K, value: NewPersonDetails[K]) => setDraft(current => ({ ...current, [key]: value }));
  return <div className="overlay" role="dialog" aria-modal="true" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className="panel"><div className="panel-header"><h2>הוספת אדם חדש</h2><button className="button ghost" onClick={onClose} aria-label="סגירה">×</button></div><div className="form-grid">
    <label className="field full">שם מלא<input autoFocus value={draft.name} onChange={event => update("name", event.target.value)} /></label><label className="field">שם משפחה קודם<input value={draft.previousLastName ?? ""} onChange={event => update("previousLastName", event.target.value || undefined)} /></label><label className="field">תפקיד<input value={draft.role ?? ""} onChange={event => update("role", event.target.value || undefined)} /></label>
    <BirthDateFields birthDate={draft.birthDate} hebrewBirthDate={draft.hebrewBirthDate} onChange={(key, value) => update(key, value)} /><label className="field">שנת פטירה<input type="number" value={draft.deathYear ?? ""} onChange={event => update("deathYear", event.target.value ? Number(event.target.value) : undefined)} /></label><HebrewDateFields value={draft.hebrewDeathDate} label="תאריך פטירה עברי" onChange={value => update("hebrewDeathDate", value)} />
    <label className="field">מגדר<select value={draft.gender} onChange={event => update("gender", event.target.value as Person["gender"])}><option value="neutral">ניטרלי</option><option value="male">זכר</option><option value="female">נקבה</option></select></label><label className="field">סטטוס<select value={String(draft.isAlive)} onChange={event => update("isAlive", event.target.value === "true")}><option value="true">בחיים</option><option value="false">נפטר/ה</option></select></label><label className="field full">מקום לידה<input value={draft.birthCountry ?? ""} onChange={event => update("birthCountry", event.target.value || undefined)} /></label>
     <ProfileImageField value={draft.profileImageUrl} onChange={value => update("profileImageUrl", value)} /><label className="field full">סיפור חיים<textarea rows={5} value={draft.lifeStory ?? ""} onChange={event => update("lifeStory", event.target.value || undefined)} /></label>
    <div className="panel-actions full"><button className="button" onClick={onClose}>ביטול</button><button className="button primary" disabled={!draft.name.trim()} onClick={() => onCreate({ ...draft, name: draft.name.trim() })}>שמירת אדם</button></div>
  </div></div></div>;
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarDate, setCalendarDate] = useState(() => {
    const now = new Date();
    const currentMonth = currentHebrewMonth(now);
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    if (currentHebrewMonth(date) !== currentMonth) date.setDate(date.getDate() + 1);
    return date;
  });
  const [newEntityOpen, setNewEntityOpen] = useState(false); const [managePasswordOpen, setManagePasswordOpen] = useState(false); const [lineagePersonId, setLineagePersonId] = useState<string | null>(null);
  const [graph, setGraph] = useState<FamilyGraph | null>(null); const [selectedId, setSelectedId] = useState<string | null>(null); const [addMemberForId, setAddMemberForId] = useState<string | null>(null); const [spouseFocusId, setSpouseFocusId] = useState<string | null>(null); const [query, setQuery] = useState(""); const [filter, setFilter] = useState<string | null>(null); const [canEdit, setCanEdit] = useState(false); const [scale, setScaleState] = useState(1); const setScale: React.Dispatch<React.SetStateAction<number>> = updater => setScaleState(current => { const next = typeof updater === "function" ? updater(current) : updater; const accelerated = typeof updater === "function" && next === 12 && current >= 11.1 ? current + .9 : typeof updater === "function" && Math.abs(next - current) <= .9 ? current + (next - current) * 2 : next; return Math.max(.4, Math.min(20, accelerated)); }); const [offset, setOffset] = useState({ x: 0, y: 0 }); const [viewportWidth, setViewportWidth] = useState(1200); const [loadError, setLoadError] = useState<string | null>(null); const svgRef = useRef<SVGSVGElement>(null); const didDrag = useRef(false); const didInitialFocus = useRef(false); const pointers = useRef(new Map<number, { x: number; y: number }>()); const panStart = useRef<{ x: number; y: number; offset: { x: number; y: number } } | null>(null); const pinchStart = useRef<{ distance: number; scale: number } | null>(null); const lastTouchTap = useRef<{ time: number; x: number; y: number } | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const latestSave = useRef(0);
  const graphsHaveSameRecords = (left: FamilyGraph, right: FamilyGraph) => {
    const leftPeople = new Set(left.people.map(person => person.id));
    const rightPeople = new Set(right.people.map(person => person.id));
    const relationshipKey = (relationship: FamilyGraph["relationships"][number]) => `${relationship.sourceId}|${relationship.targetId}|${relationship.type}|${relationship.hebrewMarriageDate ?? ""}`;
    const leftRelationships = new Set(left.relationships.map(relationshipKey));
    const rightRelationships = new Set(right.relationships.map(relationshipKey));
    return leftPeople.size === rightPeople.size && [...leftPeople].every(id => rightPeople.has(id)) && leftRelationships.size === rightRelationships.size && [...leftRelationships].every(key => rightRelationships.has(key));
  };
  const persistGraph = async (next: FamilyGraph) => {
    const saveId = ++latestSave.current;
    saveQueue.current = saveQueue.current
      .catch(() => undefined)
      .then(() => saveGoogleSheetGraph(next))
      .catch(async () => {
        // A Google Apps Script write may complete even when its response times out.
        // Verify the source of truth before reporting a failure.
        try {
          const persisted = await fetchGoogleSheetGraph();
          if (graphsHaveSameRecords(persisted, next)) return;
        } catch {
          // Report the original save failure below if verification is unavailable.
        }
        // Do not report an obsolete request after a newer mutation was queued.
        if (saveId === latestSave.current) window.alert("השמירה נכשלה. השינויים לא נשמרו במקור הנתונים.");
      });
    await saveQueue.current;
  };
  useEffect(() => { const timer = window.setInterval(() => refreshDate(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { const updateViewportWidth = () => setViewportWidth(window.innerWidth); updateViewportWidth(); window.addEventListener("resize", updateViewportWidth); return () => window.removeEventListener("resize", updateViewportWidth); }, []);
  useEffect(() => { const openAddMember = (event: Event) => { if (canEdit) setAddMemberForId((event as CustomEvent<string>).detail); }; window.addEventListener("family:add-member", openAddMember); return () => window.removeEventListener("family:add-member", openAddMember); }, [canEdit]);
  useEffect(() => { document.body.dataset.familyEdit = String(canEdit); return () => { delete document.body.dataset.familyEdit; }; }, [canEdit]);
  const loadGraph = () => { setLoadError(null); void fetchGoogleSheetGraph().then(setGraph).catch(error => setLoadError(friendlyGraphLoadError(error))); };
  useEffect(() => { loadGraph(); }, []);
  useEffect(() => {
    if (!graph || didInitialFocus.current) return;
    const person = graph.people.find(candidate => candidate.name.trim() === "יצחק אילון");
    if (!person) return;
    const fullLayout = calculateFamilyLayout(graph, viewportWidth);
    const positionedPerson = fullLayout.people.find(candidate => candidate.id === person.id);
    if (!positionedPerson) return;
    const initialScale = 4;
    setScale(initialScale);
    setOffset({ x: fullLayout.width / 2 - initialScale * positionedPerson.x, y: fullLayout.height / 2 - initialScale * positionedPerson.y });
    setSpouseFocusId(person.id);
    didInitialFocus.current = true;
  }, [graph, viewportWidth]);
  const activeGraph = graph ?? { people: [], relationships: [] }; const personStats = useMemo(() => { const children = new Map<string, string[]>(); activeGraph.people.forEach(person => children.set(person.id, [])); activeGraph.relationships.filter(r => r.type === "parent").forEach(r => children.get(r.sourceId)?.push(r.targetId)); const memo = new Map<string, Set<string>>(); const collect = (id: string, visiting = new Set<string>()): Set<string> => { const cached = memo.get(id); if (cached) return cached; if (visiting.has(id)) return new Set(); const nextVisiting = new Set(visiting).add(id); const result = new Set<string>(); for (const childId of children.get(id) ?? []) { result.add(childId); collect(childId, nextVisiting).forEach(descendantId => result.add(descendantId)); } memo.set(id, result); return result; }; return new Map(activeGraph.people.map(person => [person.id, { children: children.get(person.id)?.length ?? 0, descendants: collect(person.id).size }])); }, [activeGraph]);
  const marriageDatesByPerson = useMemo(() => { const dates = new Map<string, string>(); for (const relationship of activeGraph.relationships) { if (relationship.type !== "spouse" || !relationship.hebrewMarriageDate) continue; if (!dates.has(relationship.sourceId)) dates.set(relationship.sourceId, relationship.hebrewMarriageDate); if (!dates.has(relationship.targetId)) dates.set(relationship.targetId, relationship.hebrewMarriageDate); } return dates; }, [activeGraph]);
  const graphForFilter = (rootId: string): FamilyGraph => { const ids = descendants(activeGraph, rootId); spouses(activeGraph, rootId).forEach(id => ids.add(id)); return { people: activeGraph.people.filter(p => ids.has(p.id)), relationships: activeGraph.relationships.filter(r => ids.has(r.sourceId) && ids.has(r.targetId)) }; };
  const layout = useMemo(() => calculateFamilyLayout(filter ? graphForFilter(filter) : activeGraph, viewportWidth), [activeGraph, filter, viewportWidth]);
  if (!graph) return <LoadingScreen error={loadError} onRetry={loadGraph} />;
  const selected = graph.people.find(p => p.id === selectedId); const matches = query.length > 1 ? graph.people.filter(p => p.name.includes(query)).slice(0, 6) : []; const highlightedPersonId = spouseFocusId; const highlightedDescendants = highlightedPersonId ? descendants(activeGraph, highlightedPersonId) : new Set<string>();
  const savePerson = (person: Person) => { if (!graph) return; const next = { ...graph, people: graph.people.map(p => p.id === person.id ? person : p) }; setGraph(next); setSelectedId(null); void persistGraph(next); };
  const deletePerson = (personId: string) => {
    if (!graph) return;
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
  const addRelationship = (type: "partner" | "child" | "parent", data: { name: string; gender: Person["gender"] }, relationship: RelationshipDetails = {}) => {
    if (!graph || !selected) return;
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
    const newPerson: Person = { id, familyId: selected.familyId, name: data.name, gender: data.gender, isAlive: true };
    const parentIds = type === "child" ? [selected.id, ...spouses(graph, selected.id)] : [];
    const relationships = type === "child" ? parentIds.map(sourceId => ({ familyId: selected.familyId, sourceId, targetId: id, type: "parent" as const })) : [type === "partner" ? { familyId: selected.familyId, sourceId: selected.id, targetId: id, type: "spouse" as const, ...relationship } : { familyId: selected.familyId, sourceId: id, targetId: selected.id, type: "parent" as const }];
    const next = { people: [...graph.people, newPerson], relationships: [...graph.relationships, ...relationships] };
    setGraph(next); void persistGraph(next);
  };
  const createRelationship = (type: "partner" | "child" | "parent", targetId: string | null, newPerson: NewPersonDetails | null, relationship: RelationshipDetails = {}) => {
    if (!graph || !addMemberForId) return;
    const source = graph.people.find(person => person.id === addMemberForId); if (!source) return;
    const id = newPerson ? (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`) : targetId!;
    const person = newPerson ? { id, familyId: source.familyId, ...newPerson } satisfies Person : null;
    const parentIds = type === "child" ? [source.id, ...spouses(graph, source.id)] : [];
    const relationships = type === "child" ? parentIds.map(sourceId => ({ familyId: source.familyId, sourceId, targetId: id, type: "parent" as const })) : [type === "partner" ? { familyId: source.familyId, sourceId: source.id, targetId: id, type: "spouse" as const, ...relationship } : { familyId: source.familyId, sourceId: id, targetId: source.id, type: "parent" as const }];
    const next = { people: person ? [...graph.people, person] : graph.people, relationships: [...graph.relationships.filter(existing => !relationships.some(candidate => existing.sourceId === candidate.sourceId && existing.targetId === candidate.targetId && existing.type === candidate.type)), ...relationships] };
    setGraph(next); setAddMemberForId(null); void persistGraph(next);
  };
  const createStandaloneEntity = (personDetails: NewPersonDetails) => {
    if (!graph) return;
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
    const person = { id, familyId: "default", ...personDetails } satisfies Person;
    const next = { ...graph, people: [...graph.people, person] };
    setGraph(next); setNewEntityOpen(false); void persistGraph(next);
  };
  const zoomAt = (clientX: number, clientY: number, nextScale: number) => { const svg = svgRef.current; const matrix = svg?.getScreenCTM()?.inverse(); if (!svg || !matrix) return; const point = svg.createSVGPoint(); point.x = clientX; point.y = clientY; const viewPoint = point.matrixTransform(matrix); const acceleratedScale = Math.max(.4, Math.min(20, scale + (nextScale - scale) * 2)); setOffset(current => ({ x: viewPoint.x - (viewPoint.x - current.x) * acceleratedScale / scale, y: viewPoint.y - (viewPoint.y - current.y) * acceleratedScale / scale })); setScale(acceleratedScale); };
  const zoomBy = (delta: number) => { const svg = svgRef.current; if (!svg) return; const rect = svg.getBoundingClientRect(); zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, Math.max(.4, Math.min(12, scale + delta))); };
  const svgPoint = (clientX: number, clientY: number) => { const svg = svgRef.current; const matrix = svg?.getScreenCTM()?.inverse(); if (!svg || !matrix) return { x: 0, y: 0 }; const point = svg.createSVGPoint(); point.x = clientX; point.y = clientY; const viewPoint = point.matrixTransform(matrix); return { x: viewPoint.x, y: viewPoint.y }; };
  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => { pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); didDrag.current = false; if (pointers.current.size === 1) panStart.current = { x: event.clientX, y: event.clientY, offset }; else { lastTouchTap.current = null; const points = [...pointers.current.values()]; pinchStart.current = { distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y), scale }; panStart.current = null; didDrag.current = true; event.currentTarget.setPointerCapture(event.pointerId); } };
  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => { if (!pointers.current.has(event.pointerId)) return; pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); const points = [...pointers.current.values()]; if (points.length >= 2 && pinchStart.current) { const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y); const nextScale = Math.max(.4, Math.min(20, pinchStart.current.scale * distance / pinchStart.current.distance)); const midpoint = svgPoint((points[0].x + points[1].x) / 2, (points[0].y + points[1].y) / 2); const worldPoint = { x: (midpoint.x - offset.x) / scale, y: (midpoint.y - offset.y) / scale }; setScale(nextScale); setOffset({ x: midpoint.x - worldPoint.x * nextScale, y: midpoint.y - worldPoint.y * nextScale }); return; } if (points.length === 1 && panStart.current) { const rect = svgRef.current!.getBoundingClientRect(); const movementMultiplier = 2; const svgScale = Math.min(rect.width / layout.width, rect.height / layout.height); const dx = (event.clientX - panStart.current.x) / svgScale * movementMultiplier; const dy = (event.clientY - panStart.current.y) / svgScale * movementMultiplier; if (Math.abs(dx) > 4 || Math.abs(dy) > 4) { didDrag.current = true; event.currentTarget.setPointerCapture(event.pointerId); } setOffset({ x: panStart.current.offset.x + dx, y: panStart.current.offset.y + dy }); } };
  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => { const wasSinglePointer = pointers.current.size === 1; pointers.current.delete(event.pointerId); const points = [...pointers.current.values()]; if (points.length < 2) pinchStart.current = null; panStart.current = points.length === 1 ? { x: points[0].x, y: points[0].y, offset } : null; if (event.type === "pointercancel" || event.pointerType !== "touch" || !wasSinglePointer || didDrag.current) { lastTouchTap.current = null; return; } const now = Date.now(); const previousTap = lastTouchTap.current; const isDoubleTap = previousTap && now - previousTap.time < 350 && Math.hypot(event.clientX - previousTap.x, event.clientY - previousTap.y) < 32; if (isDoubleTap) { lastTouchTap.current = null; zoomAt(event.clientX, event.clientY, Math.min(20, scale * 2)); } else { lastTouchTap.current = { time: now, x: event.clientX, y: event.clientY }; } };
  const focusOnPerson = (personId: string) => {
    const fullLayout = calculateFamilyLayout(graph, viewportWidth);
    const positionedPerson = fullLayout.people.find(candidate => candidate.id === personId);
    if (!positionedPerson) return;
    const focusScale = 4;
    setFilter(null);
    setScale(focusScale);
    setOffset({ x: fullLayout.width / 2 - focusScale * positionedPerson.x, y: fullLayout.height / 2 - focusScale * positionedPerson.y });
  };
  const focusOnIsaacAylon = () => {
    const person = graph.people.find(candidate => candidate.name.trim() === "יצחק אילון");
    if (!person) return;

    // Use the complete graph here so an active family filter cannot hide the
    // person we are focusing on. The transform is in viewBox coordinates:
    // translate + scale * personPosition = viewBox center.
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
    setSelectedId(id);
  };
  const leaveManageMode = () => { setCanEdit(false); void fetch("/api/manage", { method: "DELETE" }); };
  return <main className="app-shell"><header className="topbar"><div className="menu-anchor"><button className="button menu-trigger" aria-label="פתיחת תפריט" aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}>☰</button>{menuOpen && <div className="menu-panel" role="menu"><button className="menu-item" role="menuitem" onClick={() => { setCalendarOpen(true); setMenuOpen(false); }}>אירועים משפחתיים בחודש זה</button><button className="menu-item" role="menuitem" onClick={() => { setMenuOpen(false); canEdit ? leaveManageMode() : setManagePasswordOpen(true); }}>{canEdit ? "יציאה מניהול" : "ניהול"}</button></div>}</div><div className="brand"><span className="brand-mark">♧</span><span>עץ משפחה - משפחת אילון</span>{canEdit && <span className="status">מצב עריכה</span>}</div><div className="toolbar"><div style={{ position: "relative" }}><input className="search" aria-label="חיפוש בני משפחה" placeholder="חיפוש לפי שם…" value={query} onChange={e => setQuery(e.target.value)} />{matches.length > 0 && <div className="panel" style={{ position: "absolute", top: "3rem", right: 0, padding: ".4rem", width: "100%", zIndex: 4 }}>{matches.map(p => <button key={p.id} className="button ghost" style={{ display: "block", width: "100%", textAlign: "right" }} onClick={() => { focusOnPerson(p.id); setSelectedId(p.id); setSpouseFocusId(null); setQuery(""); }}>{p.name}</button>)}</div>}</div><button className="button" onClick={() => setScale(s => Math.min(12, s + .45))}>＋</button><button className="button" onClick={() => setScale(s => Math.max(.4, s - .45))}>−</button><button className="button" onClick={focusOnIsaacAylon}>מיקוד</button>{canEdit && <button className="button primary" onClick={() => setNewEntityOpen(true)}>אדם חדש</button>}</div></header>
    <section className="canvas-shell"><svg className="graph-svg" ref={svgRef} viewBox={`0 0 ${layout.width} ${layout.height}`} onWheel={e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.max(.4, Math.min(12, scale - e.deltaY * .003))); }} onTouchMove={e => { if (e.touches.length > 1) e.preventDefault(); }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} aria-label="עץ המשפחה"><g transform={`translate(${offset.x} ${offset.y}) scale(${scale})`}>{layout.relationships.map((r, i) => { const path = edgePath(r, layout.people); const directlyConnected = spouseFocusId !== null && (r.sourceId === spouseFocusId || r.targetId === spouseFocusId); const highlighted = directlyConnected || (r.type === "parent" && highlightedDescendants.has(r.targetId)); return path ? <path key={`${r.sourceId}-${r.targetId}-${i}`} className={`edge ${r.type}${highlighted ? " highlighted" : ""}`} d={path} /> : null; })}{layout.people.map(p => <PersonCard key={p.id} person={p} stats={personStats.get(p.id) ?? { children: 0, descendants: 0 }} selected={p.id === selectedId || p.id === spouseFocusId} onClick={() => activatePerson(p.id)} />)}</g></svg><div className="legend"><span>● זכר</span><span>● נקבה</span>{filter && <button className="button" onClick={() => setFilter(null)}>הצג הכול</button>}</div></section>
    {selected && <PersonPanel person={selected} stats={personStats.get(selected.id) ?? { children: 0, descendants: 0 }} marriageDate={marriageDatesByPerson.get(selected.id)} canEdit={canEdit} onClose={() => setSelectedId(null)} onDelete={deletePerson} onShowLineage={() => setLineagePersonId(selected.id)} onFilter={() => { const filteredLayout = calculateFamilyLayout(graphForFilter(selected.id), viewportWidth); const positionedSelected = filteredLayout.people.find(person => person.id === selected.id); setFilter(selected.id); setScale(1); if (positionedSelected) setOffset({ x: filteredLayout.width / 2 - positionedSelected.x, y: NODE_HEIGHT / 2 + 24 - positionedSelected.y }); setSelectedId(null); setSpouseFocusId(null); }} onSave={savePerson} onAddRelationship={addRelationship} />}
    {lineagePersonId && graph.people.find(person => person.id === lineagePersonId) && <CumulativeFamilyTree graph={graph} root={graph.people.find(person => person.id === lineagePersonId)!} onClose={() => setLineagePersonId(null)} />}
    {addMemberForId && canEdit && graph.people.find(person => person.id === addMemberForId) && <AddRelationshipPanel source={graph.people.find(person => person.id === addMemberForId)!} people={graph.people} onClose={() => setAddMemberForId(null)} onCreate={createRelationship} />}
    {newEntityOpen && canEdit && <NewEntityPanel onClose={() => setNewEntityOpen(false)} onCreate={createStandaloneEntity} />}
    {calendarOpen && <HebrewCalendarPanel date={calendarDate} events={monthlyEvents(graph, calendarDate)} onChangeMonth={direction => setCalendarDate(current => shiftHebrewMonth(current, direction))} onClose={() => setCalendarOpen(false)} onSelectPerson={id => { focusOnPerson(id); setSelectedId(id); setSpouseFocusId(null); }} />}
    {managePasswordOpen && <ManagePasswordPanel onClose={() => setManagePasswordOpen(false)} onSuccess={() => { setManagePasswordOpen(false); setCanEdit(true); }} />}
  </main>;
}
