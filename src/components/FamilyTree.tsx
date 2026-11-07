import { useEffect, useMemo, useRef, useState } from "react";
import { MinusIcon, PlusIcon, UsersThreeIcon } from "@phosphor-icons/react";
import type { Profile } from "../lib/api";
import { childrenByParents, FAMILY_CARD, familyGraph, layoutFamily, type FamilyEdge } from "../lib/family";
import { useJournal } from "../lib/journal";
import { Avatar, Button, Field, inputClass } from "./ui";
import { FamilyMemberDialog } from "./FamilyMemberDialog";

function edgeStyle(edge: FamilyEdge) {
  if (edge.role === "partner") return { color: "#db2777", dash: edge.former ? "6 4" : "" };
  if (edge.role === "relative") return { color: "#94a3b8", dash: "3 5" };
  if (edge.kind === "adoptive_parent") return { color: "#059669", dash: "" };
  if (["step_parent", "foster_parent", "guardian"].includes(edge.kind)) return { color: "#7c3aed", dash: "6 4" };
  return { color: "#2563eb", dash: "" };
}

export function FamilyTree({ profile }: { profile: Profile }) {
  const { snapshot, profiles, navigate } = useJournal();
  const [focusId, setFocusId] = useState(profile.id);
  const [depth, setDepth] = useState(3);
  const [zoom, setZoom] = useState(0.85);
  const [adding, setAdding] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const focus = profiles.get(focusId) ?? profile;
  const graph = useMemo(() => familyGraph(snapshot.profiles, focus.id, depth), [snapshot.profiles, focus.id, depth]);
  const layout = useMemo(() => layoutFamily(graph, focus.id), [graph, focus.id]);
  const groups = useMemo(() => childrenByParents(snapshot.profiles, focus.id), [snapshot.profiles, focus.id]);
  const { width: cardWidth, height: cardHeight } = FAMILY_CARD;
  useEffect(() => {
    const point = layout.positions.get(focus.id);
    const el = viewport.current;
    if (point && el) el.scrollTo({ left: Math.max(0, (point.x + cardWidth / 2) * zoom - el.clientWidth / 2), top: Math.max(0, (point.y + cardHeight / 2) * zoom - el.clientHeight / 2) });
  }, [focus.id, layout, zoom, cardWidth, cardHeight]);
  const name = (id: string) => profiles.get(id)?.displayName || profiles.get(id)?.name || "Unknown profile";
  const roleFor = (id: string) => [...new Set(graph.edges.filter((e) => e.role === "parent")
    .flatMap((e) => e.source === focus.id && e.target === id ? [e.childLabel ?? "Child"] : e.target === focus.id && e.source === id ? [e.label] : []))].join(" · ");
  const labels: { left: number; right: number; y: number }[] = [];
  return <section className="space-y-5 rounded-2xl bg-white p-4 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-lg font-bold text-slate-800"><UsersThreeIcon className="text-brand-500" /> Family tree</h2><p className="mt-1 text-sm text-slate-500">{name(focus.id)}'s family · Select a person to explore their branch.</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => navigate({ view: "profile", id: focus.id, tab: "about" })}>Manage relationships</Button><Button onClick={() => setAdding(true)}><PlusIcon /> Add family member</Button></div>
    </div>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <Field label="Show"><select className={inputClass} value={depth} onChange={(e) => setDepth(Number(e.target.value))}><option value={1}>Closest family</option><option value={2}>Two connections away</option><option value={3}>Three connections away</option><option value={Infinity}>Whole connected family</option></select></Field>
      <div className="flex items-center gap-2"><Button variant="outline" aria-label="Zoom out" disabled={zoom <= 0.4} onClick={() => setZoom((v) => Math.max(0.4, v - 0.15))}><MinusIcon /></Button><span className="w-12 text-center text-xs text-slate-500">{Math.round(zoom * 100)}%</span><Button variant="outline" aria-label="Zoom in" disabled={zoom >= 1.6} onClick={() => setZoom((v) => Math.min(1.6, v + 0.15))}><PlusIcon /></Button><Button variant="ghost" onClick={() => { setFocusId(profile.id); setZoom(0.85); }}>Reset</Button></div>
    </div>
    <div ref={viewport} role="region" aria-label={`Family tree for ${name(focus.id)}`} tabIndex={0} className="max-h-[650px] overflow-auto rounded-xl border border-slate-200 bg-slate-50" style={{ minHeight: 300 }}>
      <div style={{ width: layout.width * zoom, minWidth: "100%", height: layout.height * zoom, position: "relative" }}>
        <div style={{ position: "absolute", left: "50%", marginLeft: -layout.width * zoom / 2, width: layout.width, height: layout.height, transform: `scale(${zoom})`, transformOrigin: "top left" }}>
          <svg width={layout.width} height={layout.height} className="absolute inset-0" aria-hidden="true">
            {graph.edges.map((edge) => {
              const a = layout.positions.get(edge.source)!, b = layout.positions.get(edge.target)!;
              const style = edgeStyle(edge);
              const sameRow = a.y === b.y;
              let path: string, labelX: number, labelY: number;
              if (sameRow) {
                const left = a.x < b.x ? a : b, right = a.x < b.x ? b : a;
                const x1 = left.x + cardWidth / 2, x2 = right.x + cardWidth / 2;
                const y = left.y - 28 - Math.min(40, (x2 - x1) / 20);
                path = `M ${x1} ${left.y} V ${y} H ${x2} V ${right.y}`; labelX = (x1 + x2) / 2; labelY = y - 5;
              } else {
                const x1 = a.x + cardWidth / 2, x2 = b.x + cardWidth / 2;
                const y1 = a.y < b.y ? a.y + cardHeight : a.y, y2 = a.y < b.y ? b.y : b.y + cardHeight;
                const middle = (y1 + y2) / 2;
                path = `M ${x1} ${y1} C ${x1} ${middle}, ${x2} ${middle}, ${x2} ${y2}`; labelX = (x1 + x2) / 2; labelY = middle - 5;
              }
              const text = edge.role === "parent" ? `${edge.label} → ${edge.childLabel}` : edge.label;
              const halfWidth = text.length * 2.8 + 5;
              const left = labelX - halfWidth, right = labelX + halfWidth;
              const baseY = labelY;
              for (const offset of [0, -14, 14, -28, 28, -42, 42]) {
                const y = baseY + offset;
                if (y > 12 && !labels.some((placed) => left < placed.right && right > placed.left && Math.abs(y - placed.y) < 13)) { labelY = y; break; }
              }
              labels.push({ left, right, y: labelY });
              return <g key={edge.id}><title>{edge.role === "parent" ? `${name(edge.source)} is ${name(edge.target)}'s ${edge.label.toLowerCase()}` : `${name(edge.target)} · ${edge.label} · ${name(edge.source)}`}</title><path d={path} fill="none" stroke={style.color} strokeWidth={2} strokeDasharray={style.dash} /><text x={labelX} y={labelY} textAnchor="middle" fontSize={10} fill={style.color} stroke="#f8fafc" strokeWidth={4} paintOrder="stroke">{text}</text></g>;
            })}
          </svg>
          {graph.people.map((p) => {
            const pos = layout.positions.get(p.id)!;
            return <button key={p.id} onClick={() => setFocusId(p.id)} aria-label={`Focus family tree on ${p.name}`} style={{ left: pos.x, top: pos.y, width: cardWidth, height: cardHeight }} className={`absolute flex items-center gap-3 rounded-xl border bg-white px-3 text-left shadow-sm hover:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-500 ${p.id === focus.id ? "border-brand-500 ring-2 ring-brand-100" : "border-slate-200"}`}>
              <Avatar profile={p} size="sm" /><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">{p.displayName || p.name}</span><span className="block truncate text-[11px] text-slate-500" title={roleFor(p.id)}>{p.id === focus.id ? "Viewing this family" : roleFor(p.id) || "Explore family"}</span>{p.isPlaceholder && <span className="block text-[10px] text-amber-700">More details to add</span>}</span>
            </button>;
          })}
        </div>
      </div>
    </div>
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500"><span className="text-blue-700">━ Parent / birth parent</span><span className="text-emerald-700">━ Adoptive parent</span><span className="text-violet-700">┄ Step / foster / guardian</span><span className="text-pink-700">━ Partner · ┄ Former partner</span><span>┄ Other recorded family</span></div>
    {graph.people.length < graph.totalPeople && <p className="text-xs text-slate-500">Showing {graph.people.length} of {graph.totalPeople} connected people. Increase the scope to see more.</p>}
    {graph.edges.length === 0 && <p className="text-sm text-slate-500">Add parents, partners or children to start this branch.</p>}
    {groups.length > 0 && <div className="space-y-3 border-t border-slate-100 pt-4">
      <h3 className="text-sm font-semibold text-slate-700">Children by recorded parents</h3>
      {groups.map((group) => <div key={group.id} className="rounded-xl bg-slate-50 p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">{group.parents.map((parent, i) => <span key={`${parent.id}-${parent.kind}`}>{i > 0 && <span className="mr-2 text-slate-300">+</span>}<button className="font-semibold hover:text-brand-600 hover:underline" onClick={() => setFocusId(parent.id)}>{name(parent.id)}</button><span className="ml-1 text-xs text-slate-400">({parent.label.toLowerCase()})</span></span>)}</div>
        {new Set(group.parents.map((p) => p.id)).size === 1 && <p className="mt-1 text-xs text-slate-400">No other parents recorded</p>}
        <div className="mt-3 flex flex-wrap gap-2">{group.childIds.map((id) => <button key={id} onClick={() => setFocusId(id)} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700 hover:border-brand-400">{name(id)} <span className="text-xs text-slate-400">· {group.childLabels[id]}</span></button>)}</div>
      </div>)}
    </div>}
    {adding && <FamilyMemberDialog key={focus.id} profile={focus} onClose={() => setAdding(false)} />}
  </section>;
}
