"use client";

import { useEffect, useMemo, useState } from "react";
import { ageLabel, isBirthdayInCurrentHebrewMonth, spouses, type FamilyGraph, type Person } from "@/lib/domain";

export type Relatives = { parents: Person[]; siblings: Person[]; partners: Person[]; children: Person[] };

export function relativesOf(graph: FamilyGraph, id: string): Relatives {
  const peopleById = new Map(graph.people.map(person => [person.id, person]));
  const parentIds = new Set<string>();
  const childIds = new Set<string>();
  for (const relationship of graph.relationships) {
    if (relationship.type !== "parent") continue;
    if (relationship.targetId === id) parentIds.add(relationship.sourceId);
    if (relationship.sourceId === id) childIds.add(relationship.targetId);
  }
  const siblingIds = new Set<string>();
  for (const parentId of parentIds) {
    for (const relationship of graph.relationships) {
      if (relationship.type === "parent" && relationship.sourceId === parentId && relationship.targetId !== id) {
        siblingIds.add(relationship.targetId);
      }
    }
  }
  const byId = (ids: Iterable<string>) => [...ids].map(personId => peopleById.get(personId)).filter((person): person is Person => Boolean(person));
  // Siblings read better oldest-first when birth years are known.
  const byAge = (people: Person[]) => [...people].sort((a, b) => (a.birthYear ?? 9999) - (b.birthYear ?? 9999));
  return {
    parents: byAge(byId(parentIds)),
    siblings: byAge(byId(siblingIds)),
    partners: byId(spouses(graph, id)),
    children: byAge(byId(childIds)),
  };
}

export function personMeta(person: Person): string {
  const years = person.birthYear ? `${person.birthYear}${person.deathYear ? `–${person.deathYear}` : ""}` : "";
  const age = ageLabel(person);
  if (!person.isAlive || person.deathYear !== undefined) return [age ? `נפטר/ה בגיל ${age}` : "נפטר/ה", years].filter(Boolean).join(" · ");
  return [age ?? "", years].filter(Boolean).join(" · ");
}

export function Avatar({ person, size }: { person: Person; size: "large" | "small" }) {
  const initial = person.name.trim().charAt(0) || "?";
  if (person.profileImageUrl) return <img className={`mobile-avatar ${size}`} src={person.profileImageUrl} alt="" aria-hidden="true" />;
  return <span className={`mobile-avatar ${size} ${person.gender}`} aria-hidden="true">{initial}</span>;
}

function PersonTile({ person, relationHint, onFocus, onDetails }: { person: Person; relationHint?: string; onFocus: () => void; onDetails: () => void }) {
  const hasBirthday = isBirthdayInCurrentHebrewMonth(person);
  return <div className="mobile-tile">
    <button className="mobile-tile-main" onClick={onFocus} aria-label={`מעבר אל ${person.name}`}>
      <div className="mobile-tile-avatar-wrap">
        <Avatar person={person} size="small" />
        {hasBirthday && <span className="mobile-tile-birthday" title="יום הולדת החודש">🎂</span>}
      </div>
      <div className="mobile-tile-text">
        {relationHint && <span className="mobile-tile-relation">{relationHint}</span>}
        <span className="mobile-tile-name">{person.name}</span>
        {personMeta(person) && <small className="mobile-tile-meta">{personMeta(person)}</small>}
      </div>
      <span className="mobile-tile-arrow" aria-hidden="true">←</span>
    </button>
    <button className="mobile-tile-details" onClick={onDetails} aria-label={`פתיחת כרטיס פרטים עבור ${person.name}`}>כרטיס מלא</button>
  </div>;
}

function RelativesSection({ title, icon, relationHint, people, onFocus, onDetails }: { title: string; icon: string; relationHint?: (person: Person) => string; people: Person[]; onFocus: (id: string) => void; onDetails: (id: string) => void }) {
  if (people.length === 0) return null;
  return <section className="mobile-relatives" aria-label={title}>
    <div className="mobile-relatives-header">
      <h3><span className="mobile-relatives-icon" aria-hidden="true">{icon}</span> {title} <span className="mobile-relatives-count">{people.length}</span></h3>
      <small className="mobile-relatives-hint">לחצו על אדם כדי להתמקד בו</small>
    </div>
    <div className="mobile-tiles-grid">
      {people.map(person => <PersonTile key={person.id} person={person} relationHint={relationHint?.(person)} onFocus={() => onFocus(person.id)} onDetails={() => onDetails(person.id)} />)}
    </div>
  </section>;
}

/**
 * Interactive step-by-step family explorer: one person in focus, relatives grouped around them.
 * Works seamlessly on both mobile and desktop.
 */
export default function MobileFamilyTree({ graph, initialId, canEdit, onSelectPerson, onAddMember, onShowCanvas, onShowLineage }: {
  graph: FamilyGraph;
  initialId?: string;
  canEdit: boolean;
  onSelectPerson: (id: string) => void;
  onAddMember: (id: string) => void;
  onShowCanvas: (focusId?: string) => void;
  onShowLineage?: (id: string) => void;
}) {
  const peopleById = useMemo(() => new Map(graph.people.map(person => [person.id, person])), [graph]);
  const defaultId = useMemo(() => {
    if (initialId && peopleById.has(initialId)) return initialId;
    const isaac = graph.people.find(person => person.name.trim() === "יצחק אילון");
    return isaac?.id ?? graph.people[0]?.id;
  }, [graph, initialId, peopleById]);
  const [focusId, setFocusId] = useState<string | undefined>(defaultId);
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    if (initialId && peopleById.has(initialId) && initialId !== focusId) {
      setFocusId(initialId);
    }
  }, [initialId, peopleById]);

  const focus = (focusId ? peopleById.get(focusId) : undefined) ?? (defaultId ? peopleById.get(defaultId) : undefined);
  const relatives = useMemo(() => (focus ? relativesOf(graph, focus.id) : { parents: [], siblings: [], partners: [], children: [] }), [graph, focus]);
  const hasAnyRelatives = relatives.parents.length + relatives.siblings.length + relatives.partners.length + relatives.children.length > 0;

  const goTo = (id: string) => {
    if (!focus || focus.id === id) return;
    setHistory(previous => [...previous.slice(-8), focus.id]);
    setFocusId(id);
  };
  const goBack = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory(current => current.slice(0, -1));
    setFocusId(previous);
  };
  const jumpToHistoryIndex = (index: number) => {
    const targetId = history[index];
    if (!targetId) return;
    setHistory(current => current.slice(0, index));
    setFocusId(targetId);
  };
  const resetToRoot = () => {
    const isaac = graph.people.find(person => person.name.trim() === "יצחק אילון") ?? graph.people[0];
    if (!isaac || isaac.id === focus?.id) return;
    setHistory([]);
    setFocusId(isaac.id);
  };

  if (!focus) return <div className="mobile-tree"><p className="mobile-empty">אין אנשים להצגה עדיין.</p></div>;

  const isDeceased = !focus.isAlive || focus.deathYear !== undefined;
  const hasBirthday = isBirthdayInCurrentHebrewMonth(focus);

  return <div className="mobile-tree">
    <div className="explorer-container">
      <div className="mobile-tree-topbar">
        <div className="explorer-nav-buttons">
          <button className="button mobile-back" onClick={goBack} disabled={history.length === 0} aria-label="חזרה לאדם הקודם">
            → חזרה
          </button>
          <button className="button ghost" onClick={resetToRoot} title="חזרה לראש המשפחה">
            ⌂ ראש המשפחה
          </button>
        </div>
        <button className="button explorer-map-btn" onClick={() => onShowCanvas(focus.id)}>
          🌳 הצג במפת העץ
        </button>
      </div>

      {history.length > 0 && (
        <nav className="explorer-breadcrumbs" aria-label="מסלול ניווט">
          <span className="explorer-breadcrumbs-label">מסלול:</span>
          {history.map((histId, idx) => {
            const histPerson = peopleById.get(histId);
            if (!histPerson) return null;
            return (
              <span key={`${histId}-${idx}`} className="explorer-breadcrumb-item">
                <button type="button" className="explorer-breadcrumb-btn" onClick={() => jumpToHistoryIndex(idx)}>
                  {histPerson.name}
                </button>
                <span className="explorer-breadcrumb-sep" aria-hidden="true">←</span>
              </span>
            );
          })}
          <strong className="explorer-breadcrumb-current">{focus.name}</strong>
        </nav>
      )}

      {relatives.parents.length > 0 && (
        <>
          <RelativesSection
            title="הורים (דור קודם)"
            icon="⬆️"
            relationHint={p => p.gender === "female" ? "אם" : p.gender === "male" ? "אב" : "הורה"}
            people={relatives.parents}
            onFocus={goTo}
            onDetails={onSelectPerson}
          />
          <div className="explorer-connector" aria-hidden="true"><span>↓</span></div>
        </>
      )}

      <section className="mobile-focus" aria-label={`במוקד כעת: ${focus.name}`}>
        <div className="mobile-focus-badge-row">
          <span className="focus-pill">במוקד כעת</span>
          {hasBirthday && <span className="focus-birthday-pill">🎂 חוגג/ת יום הולדת החודש</span>}
          {isDeceased && <span className="focus-deceased-pill">🕯️ לזכרו/ה</span>}
        </div>
        <div className="mobile-focus-main">
          <Avatar person={focus} size="large" />
          <div className="mobile-focus-info">
            <h2>{focus.name}</h2>
            {focus.previousLastName && <p className="mobile-focus-maiden">שם משפחה קודם: {focus.previousLastName}</p>}
            {focus.role?.trim() && <p className="mobile-focus-role">{focus.role}</p>}
            {personMeta(focus) && <p className="mobile-focus-meta">{personMeta(focus)}</p>}
            {focus.birthCountry && <p className="mobile-focus-meta">📍 ארץ לידה: {focus.birthCountry}</p>}
          </div>
        </div>
        {focus.lifeStory?.trim() && (
          <p className="mobile-focus-story-preview">{focus.lifeStory}</p>
        )}
        <div className="mobile-focus-actions">
          <button className="button primary" onClick={() => onSelectPerson(focus.id)}>
            📋 פרטים וסיפור חיים
          </button>
          {onShowLineage && (
            <button className="button" onClick={() => onShowLineage(focus.id)}>
              🌿 עץ דורות
            </button>
          )}
          {canEdit && (
            <button className="button accent-outline" onClick={() => onAddMember(focus.id)}>
              + הוספת קשר משפחתי
            </button>
          )}
        </div>
      </section>

      {relatives.partners.length > 0 && (
        <RelativesSection
          title="בני/בנות זוג"
          icon="💍"
          relationHint={p => p.gender === "female" ? "בת זוג" : p.gender === "male" ? "בן זוג" : "זוגיות"}
          people={relatives.partners}
          onFocus={goTo}
          onDetails={onSelectPerson}
        />
      )}

      {relatives.children.length > 0 && (
        <>
          <div className="explorer-connector" aria-hidden="true"><span>↓</span></div>
          <RelativesSection
            title="ילדים (הדור הבא)"
            icon="⬇️"
            relationHint={p => p.gender === "female" ? "בת" : p.gender === "male" ? "בן" : "ילד/ה"}
            people={relatives.children}
            onFocus={goTo}
            onDetails={onSelectPerson}
          />
        </>
      )}

      {relatives.siblings.length > 0 && (
        <RelativesSection
          title="אחים ואחיות"
          icon="👥"
          relationHint={p => p.gender === "female" ? "אחות" : p.gender === "male" ? "אח" : "אח/ות"}
          people={relatives.siblings}
          onFocus={goTo}
          onDetails={onSelectPerson}
        />
      )}

      {!hasAnyRelatives && (
        <div className="mobile-empty">
          <p>עדיין לא הוגדרו קשרים משפחתיים לאדם זה.</p>
          {canEdit && <button className="button primary" onClick={() => onAddMember(focus.id)}>+ הוספת בן משפחה ראשון</button>}
        </div>
      )}
    </div>
  </div>;
}
