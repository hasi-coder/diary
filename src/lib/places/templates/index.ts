// Ready-made layouts a new place starts from. The demo seed uses the same files.
import type { Layout } from "../layout";
import cafe from "./cafe.json";
import clinic from "./clinic.json";
import home from "./home.json";
import library from "./library.json";
import shop from "./shop.json";

export interface Template {
  id: string;
  label: string;
  description: string;
  layout: Layout;
}

// JSON imports widen tuples to arrays; the files follow the Layout shape (and the seed checks they parse).
const asLayout = (json: unknown) => json as Layout;

export const TEMPLATES: Template[] = [
  { id: "home", label: "Home", description: "Living room, kitchen, bedroom, bathroom, study", layout: asLayout(home) },
  { id: "clinic", label: "Clinic", description: "Waiting room, two consulting rooms, staff room, toilets with a family cubicle", layout: asLayout(clinic) },
  { id: "shop", label: "Clothing shop", description: "Shop floor, three 2 × 2 m fitting rooms, stockroom", layout: asLayout(shop) },
  { id: "cafe", label: "Cafe", description: "Counter, tables, sofa corner, kitchen, restroom", layout: asLayout(cafe) },
  { id: "library", label: "Library", description: "Reading room, children's corner, issue desk, restroom", layout: asLayout(library) },
];
