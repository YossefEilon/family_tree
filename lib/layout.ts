import type { FamilyGraph, Person, Relationship } from "./domain";

export const NODE_WIDTH = 250, NODE_HEIGHT = 132, LEVEL_GAP = 320, SPOUSE_GAP = 280;
export type PositionedPerson = Person & { x: number; y: number };
export type LayoutRelationship = Relationship & { parentIds?: string[] };
export type LayoutResult = { people: PositionedPerson[]; relationships: LayoutRelationship[]; width: number; height: number };

type Unit = { people: Person[]; children: Unit[]; parents: Unit[]; level: number; width: number; treeWidth: number; centerX: number };

/** Deterministic family-unit layout: spouses share a row, descendants flow downward. */
export function calculateFamilyLayout(graph: FamilyGraph, viewportWidth = 1200): LayoutResult {
  const units: Unit[] = [], byPerson = new Map<string, Unit>();
  for (const person of graph.people) {
    if (byPerson.has(person.id)) continue;
    const members = new Set<string>([person.id]), queue = [person.id];
    while (queue.length) { const current = queue.shift()!; graph.relationships.filter(r => r.type === "spouse" && (r.sourceId === current || r.targetId === current)).forEach(r => { const other = r.sourceId === current ? r.targetId : r.sourceId; if (!members.has(other) && graph.people.some(p => p.id === other)) { members.add(other); queue.push(other); } }); }
    const people = [...members].map(id => graph.people.find(p => p.id === id)!).sort((a,b) => (a.birthYear ?? 9999) - (b.birthYear ?? 9999));
    const unit: Unit = { people, children: [], parents: [], level: 0, width: people.length * SPOUSE_GAP, treeWidth: 0, centerX: 0 }; people.forEach(p => byPerson.set(p.id, unit)); units.push(unit);
  }
  for (const r of graph.relationships.filter(r => r.type === "parent")) { const parent = byPerson.get(r.sourceId), child = byPerson.get(r.targetId); if (parent && child && parent !== child && !child.parents.includes(parent)) { child.parents.push(parent); parent.children.push(child); } }
  const roots = units.filter(u => !u.parents.length); const seen = new Set<Unit>();
  const level = (u: Unit, l: number) => { if (seen.has(u) && u.level >= l) return; u.level = Math.max(u.level, l); seen.add(u); u.children.forEach(c => level(c, u.level + 1)); }; roots.forEach(r => level(r, 0)); units.forEach(u => level(u, u.level));
  const width = (u: Unit): number => { if (!u.children.length) return u.treeWidth = u.width; const children = u.children.filter(c => c.parents[0] === u); const total = children.reduce((n,c) => n + width(c), 0) + Math.max(0, children.length - 1) * 40; return u.treeWidth = Math.max(u.width, total); }; roots.forEach(width);
  let cursor = 0; const place = (u: Unit, start: number) => { u.centerX = start + u.treeWidth / 2; const children = u.children.filter(c => c.parents[0] === u); let childStart = u.centerX - (children.reduce((n,c) => n + c.treeWidth, 0) + Math.max(0,children.length-1)*40)/2; children.forEach(c => { place(c, childStart); childStart += c.treeWidth + 40; }); };
  roots.forEach(r => { place(r, cursor); cursor += r.treeWidth + 120; }); units.filter(u => !seen.has(u) || !u.treeWidth).forEach(u => { width(u); place(u, cursor); cursor += u.treeWidth + 120; });

  // A child with parents from different family units is initially laid out
  // under the first parent only. Pull each parent toward the centre of its
  // children so that every parent is in the area above the descendants when
  // the graph permits it. Resolve same-level collisions after each pass to
  // keep the result deterministic and readable.
  for (let pass = 0; pass < 3; pass += 1) {
    units.forEach(u => {
      if (!u.children.length) return;
      u.centerX = u.children.reduce((sum, child) => sum + child.centerX, 0) / u.children.length;
    });

    const byLevel = new Map<number, Unit[]>();
    units.forEach(u => byLevel.set(u.level, [...(byLevel.get(u.level) ?? []), u]));
    byLevel.forEach(levelUnits => {
      levelUnits.sort((a, b) => a.centerX - b.centerX || a.people[0].id.localeCompare(b.people[0].id));
      let rightEdge = Number.NEGATIVE_INFINITY;
      levelUnits.forEach(u => {
        const minimumCenter = rightEdge === Number.NEGATIVE_INFINITY
          ? u.centerX
          : rightEdge + 40 + u.width / 2;
        u.centerX = Math.max(u.centerX, minimumCenter);
        rightEdge = u.centerX + u.width / 2;
      });
    });
  }

  const raw = graph.people.map(p => { const u = byPerson.get(p.id)!; const i = u.people.findIndex(x => x.id === p.id); return { ...p, x: u.centerX - ((u.people.length - 1) * SPOUSE_GAP)/2 + i*SPOUSE_GAP, y: 150 + u.level*LEVEL_GAP }; });
  const min = Math.min(...raw.map(p => p.x)), max = Math.max(...raw.map(p => p.x)); const shift = viewportWidth/2 - (min+max)/2; raw.forEach(p => p.x += shift);
  // Render one connector per parent unit and child. The persisted graph still
  // keeps both parent relationships; parentIds only describes the visual edge.
  const groupedParents = new Map<string, LayoutRelationship>();
  for (const relationship of graph.relationships.filter(r => r.type === "parent")) {
    const parentUnit = byPerson.get(relationship.sourceId);
    const childUnit = byPerson.get(relationship.targetId);
    if (!parentUnit || !childUnit) continue;
    const key = `${units.indexOf(parentUnit)}:${relationship.targetId}`;
    const existing = groupedParents.get(key);
    if (existing) {
      existing.parentIds = [...new Set([...(existing.parentIds ?? []), relationship.sourceId])];
    } else {
      groupedParents.set(key, { ...relationship, parentIds: [...parentUnit.people.map(p => p.id)] });
    }
  }
  const relationships: LayoutRelationship[] = [];
  const emittedParentGroups = new Set<string>();
  for (const relationship of graph.relationships) {
    if (relationship.type === "spouse") relationships.push(relationship);
    else {
      const parentUnit = byPerson.get(relationship.sourceId);
      const key = parentUnit ? `${units.indexOf(parentUnit)}:${relationship.targetId}` : "";
      const grouped = groupedParents.get(key);
      if (grouped && !emittedParentGroups.has(key)) {
        relationships.push(grouped);
        emittedParentGroups.add(key);
      }
    }
  }
  return { people: raw, relationships, width: Math.max(viewportWidth, max-min+NODE_WIDTH), height: Math.max(700, (Math.max(...raw.map(p=>p.y),0)+NODE_HEIGHT)) };
}

export function edgePath(r: LayoutRelationship, people: PositionedPerson[]): string | null {
  const s = people.find(p => p.id === r.sourceId), t = people.find(p => p.id === r.targetId);
  if (!s || !t) return null;
  if (r.type === "spouse") return `M ${s.x} ${s.y} Q ${(s.x+t.x)/2} ${s.y+70} ${t.x} ${t.y}`;
  const parentPeople = (r.parentIds ?? [r.sourceId]).map(id => people.find(p => p.id === id)).filter((p): p is PositionedPerson => Boolean(p));
  const sourceX = parentPeople.reduce((sum, person) => sum + person.x, 0) / parentPeople.length;
  const sy=s.y+NODE_HEIGHT/2, ey=t.y-NODE_HEIGHT/2, mid=(sy+ey)/2;
  return `M ${sourceX} ${sy} C ${sourceX} ${mid}, ${t.x} ${mid}, ${t.x} ${ey}`;
}
