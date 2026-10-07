"use client";

import { useMemo, useState } from "react";
import { ageLabel, spouses, type FamilyGraph, type Person } from "@/lib/domain";

type Relatives = { parents: Person[]; siblings: Person[]; partners: Person[]; children: Person[] };

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

function personMeta(person: Person): string {
  const years = person.birthYear ? `${person.birthYear}${person.deathYear ? `–${person.deathYear}` : ""}` : "";
  const age = ageLabel(person);
  if (!person.isAlive || person.deathYear !== undefined) return [age ? `נפטר/ה בגיל ${age}` : "נפטר/ה", years].filter(Boolean).join(" · ");
  return [age ?? "", years].filter(Boolean).join(" · ");
}

function Avatar({ person, size }: { person: Person; size: "large" | "small" }) {
  const initial = person.name.trim().charAt(0) || "?";
  if (person.profileImageUrl) return <img className={`mobile-avatar ${size}`} src={person.profileImageUrl} alt="" aria-hidden="true" />;
  return <span className={`mobile-avatar ${size} ${person.gender}`} aria-hidden="true">{initial}</span>;
}

function PersonTile({ person, onFocus, onDetails }: { person: Person; onFocus: () => void; onDetails: () => void }) {
  return <div className="mobile-tile">
    <button className="mobile-tile-main" onClick={onFocus} aria-label={`מעבר ל${person.name}`}>
      <Avatar person={person} size="small" />
      <span className="mobile-tile-name">{person.name}</span>
      {personMeta(person) && <small className="mobile-tile-meta">{personMeta(person)}</small>}
    </button>
    <button className="mobile-tile-details" onClick={onDetails} aria-label={`פרטים על ${person.name}`}>פרטים</button>
  </div>;
}

function RelativesSection({ title, people, onFocus, onDetails }: { title: string; people: Person[]; onFocus: (id: string) => void; onDetails: (id: string) => void }) {
  if (people.length === 0) return null;
  return <section className="mobile-relatives" aria-label={title}>
    <h3>{title} <span className="mobile-relatives-count">{people.length}</span></h3>
    <div className="mobile-tiles-row">
      {people.map(person => <PersonTile key={person.id} person={person} onFocus={() => onFocus(person.id)} onDetails={() => onDetails(person.id)} />)}
    </div>
  </section>;
}

/**
 * Phone-first family view: one person in focus, relatives grouped around them.
 * Tapping a relative moves the focus to them; the back button walks the history.
 */
export default function MobileFamilyTree({ graph, initialId, canEdit, onSelectPerson, onAddMember, onShowCanvas }: {
  graph: FamilyGraph;
  initialId?: string;
  canEdit: boolean;
  onSelectPerson: (id: string) => void;
  onAddMember: (id: string) => void;
  onShowCanvas: () => void;
}) {
  const peopleById = useMemo(() => new Map(graph.people.map(person => [person.id, person])), [graph]);
  const defaultId = useMemo(() => {
    if (initialId && peopleById.has(initialId)) return initialId;
    const isaac = graph.people.find(person => person.name.trim() === "יצחק אילון");
    return isaac?.id ?? graph.people[0]?.id;
  }, [graph, initialId, peopleById]);
  const [focusId, setFocusId] = useState<string | undefined>(defaultId);
  const [history, setHistory] = useState<string[]>([]);

  const focus = (focusId && peopleById.get(focusId)) || (defaultId && peopleById.get(defaultId));
  const relatives = useMemo(() => (focus ? relativesOf(graph, focus.id) : { parents: [], siblings: [], partners: [], children: [] }), [graph, focus]);
  const hasAnyRelatives = relatives.parents.length + relatives.siblings.length + relatives.partners.length + relatives.children.length > 0;

  const goTo = (id: string) => {
    if (focus) setHistory(previous => [...previous, focus.id]);
    setFocusId(id);
  };
  const goBack = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory(current => current.slice(0, -1));
    setFocusId(previous);
  };

  if (!focus) return <div className="mobile-tree"><p className="mobile-empty">אין אנשים להצגה עדיין.</p></div>;

  return <div className="mobile-tree">
    <div className="mobile-tree-topbar">
      <button className="button mobile-back" onClick={goBack} disabled={history.length === 0} aria-label="חזרה לאדם הקודם">→ חזרה</button>
      <button className="button ghost" onClick={onShowCanvas}>מפת עץ מלאה</button>
    </div>

    <section className="mobile-focus" aria-label={`מוקד: ${focus.name}`}>
      <Avatar person={focus} size="large" />
      <div className="mobile-focus-info">
        <h2>{focus.name}</h2>
        {focus.role?.trim() && <p className="mobile-focus-role">{focus.role}</p>}
        {personMeta(focus) && <p className="mobile-focus-meta">{personMeta(focus)}</p>}
      </div>
      <div className="mobile-focus-actions">
        <button className="button" onClick={() => onSelectPerson(focus.id)}>פרטים</button>
        {canEdit && <button className="button primary" onClick={() => onAddMember(focus.id)}>+ בן משפחה</button>}
      </div>
    </section>

    {hasAnyRelatives ? <>
      <RelativesSection title="הורים" people={relatives.parents} onFocus={goTo} onDetails={onSelectPerson} />
      <RelativesSection title="אחים ואחיות" people={relatives.siblings} onFocus={goTo} onDetails={onSelectPerson} />
      <RelativesSection title="בני זוג" people={relatives.partners} onFocus={goTo} onDetails={onSelectPerson} />
      <RelativesSection title="ילדים" people={relatives.children} onFocus={goTo} onDetails={onSelectPerson} />
    </> : <div className="mobile-empty">
      <p>עדיין לא הוספו קשרים משפחתיים לאדם זה.</p>
      {canEdit && <button className="button primary" onClick={() => onAddMember(focus.id)}>+ הוספת בן משפחה ראשון</button>}
    </div>}
  </div>;
}
