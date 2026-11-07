// Family graph and layout tests, using the same TS bundler as the existing tests.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import { build } from "esbuild";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = await mkdtemp(join(tmpdir(), "my-diary-family-"));
let runtime;
try {
  const outfile = join(scratch, "family.mjs");
  await build({ entryPoints: [join(root, "src/lib/family.ts")], outfile, bundle: true, format: "esm", platform: "node" });
  runtime = await import(pathToFileURL(outfile));
} finally { await rm(scratch, { recursive: true, force: true }); }
const { familyEdges, familyGraph, childrenByParents, layoutFamily, FAMILY_CARD } = runtime;
let nextId = 0;
const relation = (toId, kind) => ({ id: `r${nextId++}`, toId, kind, label: "", inverseLabel: "", since: "", notes: "" });
const person = (id, relations = [], extra = {}) => ({ id, name: id, kind: "person", relations, ...extra });

await test("children from different partners keep their own parents, including an unrecorded parent", () => {
  const profiles = [
    person("Maya", [relation("Dev", "spouse"), relation("Sam", "ex_spouse"), relation("June", "child"), relation("Robin", "child"), relation("Theo", "child")]),
    person("Dev"), person("Sam"), person("June", [relation("Sam", "parent")]), person("Robin", [relation("Dev", "parent")]), person("Theo", [], { isPlaceholder: true }),
  ];
  const groups = childrenByParents(profiles, "Maya");
  const parents = (child) => groups.find((g) => g.childIds.includes(child)).parents.map((p) => p.id).sort();
  assert.deepEqual(parents("June"), ["Maya", "Sam"]);
  assert.deepEqual(parents("Robin"), ["Dev", "Maya"]);
  assert.deepEqual(parents("Theo"), ["Maya"]);
  const graph = familyGraph(profiles, "Maya");
  assert.equal(graph.edges.some((e) => e.source === "Dev" && e.target === "June" && e.role === "parent"), false);
  assert.equal(graph.people.find((p) => p.id === "Theo").isPlaceholder, true);
  assert.equal(graph.edges.find((e) => e.kind === "ex_spouse").former, true);
});

await test("inverse declarations deduplicate, and parent roles remain distinct without a two-parent limit", () => {
  const profiles = [
    person("A", [relation("Child", "birth_child")]),
    person("Child", [relation("A", "birth_parent"), relation("B", "adoptive_parent"), relation("C", "step_parent"), relation("D", "guardian")]),
    person("B"), person("C"), person("D"),
  ];
  const edges = familyEdges(profiles);
  assert.equal(edges.length, 4);
  assert.deepEqual(edges.map((e) => e.kind).sort(), ["adoptive_parent", "birth_parent", "guardian", "step_parent"]);
  const [group] = childrenByParents(profiles, "A");
  assert.equal(group.parents.length, 4);
  assert.deepEqual(group.childIds, ["Child"]);
});

await test("a co-parent can be found through a child without inventing a romantic relationship", () => {
  const profiles = [person("Maya", [relation("Child", "child")]), person("Child", [relation("Sam", "parent")]), person("Sam")];
  assert.deepEqual(familyGraph(profiles, "Maya", 1).people.map((p) => p.id).sort(), ["Child", "Maya"]);
  const graph = familyGraph(profiles, "Maya", 2);
  assert.equal(graph.people.length, 3);
  assert.equal(graph.generations.get("Sam"), 0);
  assert.equal(graph.edges.some((e) => e.role === "partner"), false);
});

await test("sibling-only and other explicit family links never fabricate ancestors or pull in businesses", () => {
  const profiles = [person("Maya", [relation("June", "half_sibling"), relation("Bank", "workplace")]), person("June"), person("Bank", [], { kind: "page" }), person("Unrelated")];
  const graph = familyGraph(profiles, "Maya");
  assert.equal(graph.people.length, 2);
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.edges[0].kind, "half_sibling");
  assert.equal(graph.edges.some((e) => e.role === "parent"), false);
});

await test("layout keeps one card per person, stable positions and separate generations", () => {
  const profiles = [person("Maya", [relation("Dev", "spouse"), relation("Child", "child"), relation("Grandparent", "parent")]), person("Dev", [relation("Child", "child")]), person("Child"), person("Grandparent")];
  const graph = familyGraph(profiles, "Maya", Infinity), layout = layoutFamily(graph, "Maya");
  assert.equal(layout.positions.size, 4);
  assert.ok(layout.positions.get("Grandparent").y < layout.positions.get("Maya").y);
  assert.equal(layout.positions.get("Maya").y, layout.positions.get("Dev").y);
  assert.ok(layout.positions.get("Maya").y < layout.positions.get("Child").y);
  const points = [...layout.positions.values()];
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    assert.ok(Math.abs(points[i].x - points[j].x) >= FAMILY_CARD.width || Math.abs(points[i].y - points[j].y) >= FAMILY_CARD.height);
  }
  assert.deepEqual([...layout.positions], [...layoutFamily(familyGraph([...profiles].reverse(), "Maya", Infinity), "Maya").positions]);
});

await test("legacy cycles terminate and missing endpoints are skipped", () => {
  const profiles = [person("A", [relation("B", "child")]), person("B", [relation("C", "child")]), person("C", [relation("A", "child"), relation("Deleted", "parent")])];
  const graph = familyGraph(profiles, "A", Infinity);
  assert.equal(graph.people.length, 3);
  assert.equal(graph.edges.length, 3);
  assert.equal(layoutFamily(graph, "A").positions.size, 3);
});

await test("biological and specifically labelled legal parents retain distinct roles", () => {
  const profiles = [person("Child", [relation("Birth father", "birth_parent"), { ...relation("Legal father", "parent"), label: "Legal father", inverseLabel: "Legal child" }]), person("Birth father"), person("Legal father")];
  const graph = familyGraph(profiles, "Child");
  assert.equal(graph.edges.length, 2);
  assert.equal(graph.edges.find((e) => e.source === "Birth father").kind, "birth_parent");
  assert.equal(graph.edges.find((e) => e.source === "Legal father").label, "Legal father");
  const [group] = childrenByParents(profiles, "Birth father");
  assert.equal(group.parents.find((p) => p.id === "Legal father").label, "Legal father");
  const reverse = familyEdges([person("Child"), person("Legal father", [{ ...relation("Child", "child"), label: "Legal child", inverseLabel: "Legal father" }])]);
  assert.equal(reverse[0].label, "Legal father");
});

await test("family lines and child groups show Mother, Father, Daughter and Son", () => {
  const profiles = [
    person("Maya", [relation("June", "child"), relation("Theo", "child")], { terms: "feminine" }),
    person("Dev", [], { terms: "masculine" }),
    person("June", [relation("Dev", "parent")], { terms: "feminine" }),
    person("Theo", [relation("Dev", "parent")], { terms: "masculine" }),
  ];
  const edges = familyEdges(profiles);
  assert.deepEqual(edges.filter((e) => e.source === "Maya").map((e) => [e.label, e.childLabel]), [["Mother", "Daughter"], ["Mother", "Son"]]);
  assert.deepEqual(edges.filter((e) => e.source === "Dev").map((e) => [e.label, e.childLabel]), [["Father", "Daughter"], ["Father", "Son"]]);
  const [group] = childrenByParents(profiles, "Maya");
  assert.deepEqual(group.childLabels, { June: "Daughter", Theo: "Son" });
  assert.deepEqual(group.parents.map((p) => p.label), ["Father", "Mother"]);
});

await test("neutral preferences and explicit legal roles are retained in both directions", () => {
  const edges = familyEdges([
    person("Neutral", [relation("Child", "child")], { terms: "neutral", genders: ["female"] }),
    person("Child", [{ ...relation("Legal parent", "parent"), label: "Legal father", inverseLabel: "Legal daughter" }], { terms: "feminine" }),
    person("Legal parent", [], { terms: "neutral" }),
  ]);
  const neutral = edges.find((e) => e.source === "Neutral");
  assert.equal(neutral.label, "Parent");
  assert.equal(neutral.childLabel, "Daughter");
  const legal = edges.find((e) => e.source === "Legal parent");
  assert.equal(legal.label, "Legal father");
  assert.equal(legal.childLabel, "Legal daughter");
  const genericLegal = familyEdges([
    person("Child", [{ ...relation("Parent", "parent"), label: "Legal father", inverseLabel: "Legal child" }], { terms: "feminine" }),
    person("Parent", [], { terms: "masculine" }),
  ])[0];
  assert.equal(genericLegal.childLabel, "Legal daughter");
});
