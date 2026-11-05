import type { Garment } from "../lib/places/garments";

/** Lightweight wardrobe silhouettes; the fitting-room avatar shows the actual mesh. */
export function GarmentIcon({ definition, color, className = "" }: { definition: Garment; color: string; className?: string }) {
  const recipe = definition.recipe;
  const kind = recipe?.kind;
  const slot = definition.slot;
  const dress = kind === "dress" || slot === "dress" || slot === "outerDress";
  const skirt = kind === "skirt" || definition.id === "a_line_skirt";
  const bottom = recipe?.part === "bottom" || ["bottom", "midBottom", "outerBottom", "underwearBottom"].includes(slot);
  const feet = slot === "feet";
  const socks = slot === "socks";
  const accessory = definition.layer === "accessories";
  return (
    <svg viewBox="0 0 80 80" aria-hidden className={className} fill={color} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      {dress ? <><path d="M30 10 22 15 16 29 26 33 29 25 30 37 16 69Q40 76 64 69L50 37 51 25 54 33 64 29 58 15 50 10Q40 18 30 10Z" /><path d="M30 37H50M31 43 26 68M40 43V71M49 43 54 68" fill="none" opacity=".35" /></>
        : skirt ? <><path d="M26 15H54L66 65Q40 73 14 65Z" /><path d="M26 22H54M29 28 25 64M40 28V68M51 28 55 64" fill="none" opacity=".35" /></>
        : feet ? <><path d="M15 42 31 40 36 48 61 55Q69 59 66 65H14Q10 57 15 42Z" /><path d="M13 61H66M31 46 38 50M28 49 35 53" fill="none" opacity=".45" /></>
        : socks ? <><path d="M24 12H47V48L62 57Q69 66 58 69H27Q16 67 19 56L24 48Z" /><path d="M24 20H47M20 58 32 53" fill="none" opacity=".4" /></>
        : bottom ? <><path d={slot === "underwearBottom" ? "M19 23H61L58 55H43L40 40 37 55H22Z" : (recipe?.length ?? 1) < 0.6 ? "M22 15H58L61 52 43 54 40 31 37 54 19 52Z" : "M23 12H57L60 70H44L40 33 36 70H20Z"} /><path d="M23 21H57M40 22V33" fill="none" opacity=".4" /></>
        : accessory ? <>{slot === "neckwear" ? <path d="M34 12H46L43 23 51 62 40 72 29 62 37 23Z" /> : slot === "waistwear" ? <><path d="M10 30H70V49H10Z" /><path d="M34 28H48V51H34Z" fill="none" /></> : slot === "wristwear" ? <><path d="M32 8H48V72H32Z" /><rect x="23" y="25" width="34" height="30" rx="8" fill="#e2e8f0" /><path d="M40 31V40L46 44" fill="none" /></> : <path d="M23 12H55V25H45V69H30V26H23ZM45 25 61 60H49L37 27" />}</>
        : <><path d={(recipe?.sleeves ?? 0.35) > 0.6 ? "M28 12 17 18 8 63 20 66 28 33 27 70H53L52 33 60 66 72 63 63 18 52 12Q40 21 28 12Z" : (recipe?.sleeves ?? 0.35) === 0 ? "M29 12H35Q40 22 45 12H51L53 67Q40 72 27 67Z" : "M28 12 15 20 8 37 22 43 28 31 27 69H53L52 31 58 43 72 37 65 20 52 12Q40 21 28 12Z"} />{recipe?.openFront && <path d="M37 17 35 69M43 17 45 69" fill="none" opacity=".55" />}{recipe?.detail && <><path d="M30 15 36 29 40 20 44 29 50 15M40 27V63" fill="none" opacity=".4" /><rect x="45" y="34" width="8" height="8" fill="none" opacity=".4" /></>}</>}
    </svg>
  );
}
