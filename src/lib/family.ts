// Family topology comes only from recorded relationships. A partner is never
// assigned as a child's parent just because they share a household or spouse.
import type { Profile } from "./api";
import catalog from "./relations.json";
import { relationLabel } from "./catalog";

type TreeRole = "parent" | "child" | "partner" | "relative";
const kinds = new Map(catalog.kinds.map((k) => [k.kind, k]));
export interface FamilyEdge {
  id: string;
  source: string;
  target: string;
  role: Exclude<TreeRole, "child">;
  /** Parent kind for a parent→child edge; otherwise target is source's kind. */
  kind: string;
  label: string;
  /** The child's role, e.g. Daughter, Son or Legal child. */
  childLabel?: string;
  former: boolean;
}
export interface FamilyGraph {
  people: Profile[];
  edges: FamilyEdge[];
  generations: Map<string, number>;
  totalPeople: number;
}

export function familyEdges(profiles: Profile[]): FamilyEdge[] {
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const people = new Set(profiles.filter((p) => p.kind === "person" || p.kind === "me").map((p) => p.id));
  const edges = new Map<string, FamilyEdge>();
  for (const p of profiles) {
    if (!people.has(p.id)) continue;
    for (const r of p.relations) {
      const info = kinds.get(r.kind);
      const role = info && "familyTree" in info ? info.familyTree as TreeRole : undefined;
      if (!role || !people.has(r.toId) || r.toId === p.id) continue;
      let [source, target, kind] = [p.id, r.toId, r.kind];
      if (role === "parent") [source, target] = [target, source];
      if (role === "child") kind = info!.inverse;
      if (role !== "parent" && role !== "child" && source > target) {
        [source, target] = [target, source]; kind = info!.inverse;
      }
      const edgeRole = role === "child" ? "parent" : role;
      // Typed parent links can carry a more specific role, e.g. "Legal father".
      const parentLabel = role === "parent" ? r.label : role === "child" ? r.inverseLabel : "";
      const childLabel = role === "parent" ? r.inverseLabel : role === "child" ? r.label : "";
      const id = JSON.stringify([source, target, kind]);
      if (!edges.has(id)) edges.set(id, {
        id, source, target, kind, role: edgeRole,
        label: edgeRole === "parent" ? relationLabel(kind, byId.get(source), parentLabel) : kinds.get(kind)?.label[0] ?? kind,
        ...(edgeRole === "parent" ? { childLabel: relationLabel(kinds.get(kind)!.inverse, byId.get(target), childLabel) } : {}),
        former: kind.startsWith("ex_") || kind === "separated",
      });
    }
  }
  return [...edges.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function offset(edge: FamilyEdge): number {
  if (edge.role === "parent") return 1;
  // These are explicit relationships, not inferred missing generations.
  return ({ grandparent: -2, grandchild: 2, great_grandparent: -3, great_grandchild: 3, pibling: -1, nibling: 1, parent_in_law: -1, child_in_law: 1 } as Record<string, number>)[edge.kind] ?? 0;
}

export function familyGraph(profiles: Profile[], focusId: string, depth = 3): FamilyGraph {
  const byId = new Map(profiles.filter((p) => p.kind === "person" || p.kind === "me").map((p) => [p.id, p]));
  const edges = familyEdges(profiles);
  const adjacency = new Map<string, { other: string; step: number; role: string }[]>();
  for (const edge of edges) {
    const add = (from: string, other: string, step: number) => adjacency.set(from, [...adjacency.get(from) ?? [], { other, step, role: edge.role }]);
    add(edge.source, edge.target, offset(edge)); add(edge.target, edge.source, -offset(edge));
  }
  const generations = new Map<string, number>();
  const distance = new Map<string, number>();
  const queue: string[] = [];
  if (byId.has(focusId)) { generations.set(focusId, 0); distance.set(focusId, 0); queue.push(focusId); }
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    const neighbors = [...adjacency.get(id) ?? []].sort((a, b) => {
      const priority = (role: string) => role === "parent" ? 0 : role === "partner" ? 1 : 2;
      return priority(a.role) - priority(b.role) || byId.get(a.other)!.name.localeCompare(byId.get(b.other)!.name) || a.other.localeCompare(b.other);
    });
    for (const next of neighbors) if (!distance.has(next.other)) {
      distance.set(next.other, distance.get(id)! + 1);
      generations.set(next.other, generations.get(id)! + next.step);
      queue.push(next.other);
    }
  }
  const visible = new Set(queue.filter((id) => distance.get(id)! <= depth));
  return {
    people: queue.filter((id) => visible.has(id)).map((id) => byId.get(id)!),
    edges: edges.filter((e) => visible.has(e.source) && visible.has(e.target)),
    generations, totalPeople: queue.length,
  };
}

export const FAMILY_CARD = { width: 184, height: 80, gap: 32, row: 190, padding: 96 };
export function layoutFamily(graph: FamilyGraph, focusId: string) {
  const rows = new Map<number, Profile[]>();
  for (const p of graph.people) {
    const row = graph.generations.get(p.id) ?? 0;
    rows.set(row, [...rows.get(row) ?? [], p]);
  }
  const levels = [...rows.keys()].sort((a, b) => a - b);
  const largest = Math.max(1, ...[...rows.values()].map((row) => row.length));
  const { width: cardWidth, gap, row: rowHeight, padding } = FAMILY_CARD;
  const width = Math.max(640, largest * (cardWidth + gap) - gap + padding * 2);
  const height = Math.max(280, levels.length * rowHeight + padding);
  const positions = new Map<string, { x: number; y: number }>();
  for (const [i, level] of levels.entries()) {
    const row = rows.get(level)!;
    const ordered = [...row].sort((a, b) => {
      if (a.id === focusId) return -1;
      if (b.id === focusId) return 1;
      const parentCenter = (id: string) => {
        const xs = graph.edges.filter((e) => e.role === "parent" && e.target === id)
          .map((e) => positions.get(e.source)?.x).filter((x): x is number => x !== undefined);
        return xs.length ? xs.reduce((sum, x) => sum + x, 0) / xs.length : Infinity;
      };
      const aCenter = parentCenter(a.id), bCenter = parentCenter(b.id);
      if (aCenter !== bCenter) return aCenter - bCenter;
      // Keep children with the same explicitly recorded parents together.
      const parentKey = (id: string) => graph.edges.filter((e) => e.role === "parent" && e.target === id).map((e) => e.source).sort().join("|");
      return parentKey(a.id).localeCompare(parentKey(b.id)) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    });
    const start = (width - (row.length * (cardWidth + gap) - gap)) / 2;
    ordered.forEach((p, j) => positions.set(p.id, { x: start + j * (cardWidth + gap), y: padding + i * rowHeight }));
  }
  return { width, height, positions };
}

export function childrenByParents(profiles: Profile[], focusId: string) {
  const edges = familyEdges(profiles).filter((e) => e.role === "parent");
  const children = [...new Set(edges.filter((e) => e.source === focusId).map((e) => e.target))];
  const groups = new Map<string, { parents: { id: string; kind: string; label: string }[]; childIds: string[]; childLabels: Record<string, string> }>();
  for (const childId of children) {
    const parents = edges.filter((e) => e.target === childId).map((e) => ({ id: e.source, kind: e.kind, label: e.label })).sort((a, b) => a.id.localeCompare(b.id) || a.kind.localeCompare(b.kind));
    const key = JSON.stringify(parents.map((p) => [p.id, p.kind]));
    const group = groups.get(key) ?? { parents, childIds: [], childLabels: {} };
    group.childLabels[childId] = edges.find((e) => e.source === focusId && e.target === childId)?.childLabel ?? "Child";
    group.childIds.push(childId); groups.set(key, group);
  }
  return [...groups.entries()].map(([id, group]) => ({ id, ...group }));
}
