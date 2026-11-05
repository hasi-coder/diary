import { useId, type ReactNode } from "react";
import type { Garment } from "../lib/places/garments";

/** Small product illustrations, selected by the actual cut rather than its layer.
 * Unique paint ids keep differently coloured cards independent in the wardrobe. */
export function GarmentIcon({ definition: g, color, className = "" }: { definition: Garment; color: string; className?: string }) {
  const id = useId().replace(/:/g, "");
  const fabric = `url(#${id}-fabric)`, dark = `url(#${id}-fold)`;
  const r = g.recipe, category = g.category;
  const trim = r?.trim === "woven" ? "#e7dcc5" : "#d4b56e";
  const seams = { fill: "none", stroke: "#243144", strokeOpacity: 0.24, strokeWidth: 1.1 };
  const rgb = Number.parseInt(mix(color, "#000000", 0).slice(1), 16);
  const pale = ((rgb >> 16) & 255) * 0.2126 + ((rgb >> 8) & 255) * 0.7152 + (rgb & 255) * 0.0722 > 215;
  const stitches = { fill: "none", stroke: pale ? "#64748b" : "#fff", strokeOpacity: pale ? 0.45 : 0.5, strokeWidth: 1.2 };
  let art: ReactNode;

  if (r?.drape === "saree" || r?.drape === "osariya") {
    const osariya = r.drape === "osariya";
    art = <>
      <path d="M62 16 76 20 78 67 65 62Z" fill={dark} />
      <path d="M34 15 24 20 19 34 29 39 34 29 36 44H62L64 29 70 38 79 33 72 20 62 15Q49 26 34 15Z" fill="#e2e5e8" stroke="#718096" strokeOpacity=".3" />
      <path d="M35 40Q48 44 62 40L72 85Q48 90 25 85Z" />
      <path d="M39 46 34 85M45 46 43 87M51 45 53 87M57 44 63 86" {...seams} />
      <path d="M27 79Q49 84 71 79L72 85Q48 90 25 85Z" fill={trim} stroke="none" />
      <path d="M60 12 74 16 42 53 28 46Z" fill={fabric} />
      <path d="M61 13 31 46M72 17 40 51" fill="none" stroke={trim} strokeWidth="2.3" strokeOpacity="1" />
      <path d="M65 17 36 47M69 18 40 48" {...seams} />
      {osariya && <><path d="M34 41Q48 45 63 40L68 51Q47 57 29 51Z" fill={fabric} /><path d="m36 44-2 6m7-5-1 7m7-6v7m6-8 1 7m5-8 2 6" {...seams} /><path d="M30 51Q48 57 67 51" fill="none" stroke={trim} strokeWidth="2" strokeOpacity="1" /></>}
    </>;
  } else if (r?.drape === "dupatta") {
    art = <>
      <path d="M21 19Q48 7 75 19L69 77 55 81 59 31Q48 40 36 31L40 81 25 77Z" />
      <path d="M23 21 28 73 36 76M73 21 66 74 59 77" fill="none" stroke={trim} strokeWidth="2.6" strokeOpacity="1" />
      <path d="M24 23Q48 42 72 23M27 19Q48 33 69 19M28 30 33 69M66 31 62 69" {...seams} />
      <path d="m26 77 1 7m4-6 1 7m4-5 1 6m20-5-1 5m5-7-1 7m6-9-1 7" {...seams} />
    </>;
  } else if (g.slot === "bra") {
    const sports = category === "sports_bra", bralette = category === "bralette";
    art = sports ? <>
      <path d="M28 22H37L39 35Q48 43 57 35L59 22H68L71 66Q48 75 25 66Z" />
      <path d="M26 60Q48 67 70 60L71 66Q48 75 25 66Z" fill={dark} stroke="none" />
      <path d="M31 24 33 47M64 24 62 47M37 47Q48 53 59 47" {...stitches} />
    </> : <>
      <path d="M22 48 27 23 33 24 30 49M66 49 63 24 69 23 74 48" fill={dark} />
      <path d={bralette ? "M19 48 30 34 46 50 48 54 51 50 66 34 78 48 73 68Q48 74 23 68Z" : "M18 46Q28 35 41 42L48 54 55 42Q69 35 78 46L74 64Q59 73 49 61H47Q37 73 22 64Z"} />
      <path d="M23 64Q48 73 74 64M47 52 49 60M26 47Q24 60 39 62M70 47Q72 60 57 62" {...seams} />
    </>;
  } else if (g.slot === "underwearBottom") {
    const brief = /briefs/.test(category) && !/boxer/.test(category);
    const high = category.includes("high_waist");
    art = <>
      <path d={brief ? `M18 ${high ? 26 : 35}Q48 ${high ? 31 : 40} 78 ${high ? 26 : 35}L73 52Q57 52 55 72H41Q39 52 23 52Z` : "M22 28Q48 33 74 28L79 70 54 73 48 50 42 73 17 70Z"} />
      <path d={brief ? `M19 ${high ? 32 : 41}Q48 ${high ? 37 : 46} 77 ${high ? 32 : 41}` : "M21 35Q48 40 75 35M48 40V51"} {...seams} />
      <path d={brief ? "M25 52Q39 54 43 69M71 52Q57 54 53 69" : "m20 65 20 3m16 0 20-3"} {...stitches} />
    </>;
  } else if (r?.kind === "skirt" || r?.drape === "redda" || g.id === "a_line_skirt") {
    const wrap = r?.drape === "redda", long = wrap || (r?.length ?? 0.65) > 0.8;
    const hem = long ? 85 : 77;
    art = <>
      <path d={`M31 17Q48 20 65 17L${wrap ? 72 : 81} ${hem}Q48 ${hem + 9} ${wrap ? 24 : 15} ${hem}Z`} />
      <path d="M30 24Q48 28 66 24" {...seams} />
      {wrap ? <><path d={`M59 23 43 ${hem + 2}M61 23 46 ${hem + 2}`} {...seams} /><path d={`M25 ${hem - 6}Q48 ${hem + 1} 71 ${hem - 6}L72 ${hem}Q48 ${hem + 9} 24 ${hem}Z`} fill={trim} stroke="none" /></> : <>
        <path d={`M36 29 27 ${hem}M44 29 40 ${hem + 3}M52 29 56 ${hem + 3}M60 29 69 ${hem}`} {...seams} />
        {!!r?.pleats && <path d={`M32 30 21 ${hem - 1}M40 30 34 ${hem + 2}M48 30V${hem + 4}M56 30 63 ${hem + 2}M64 30 75 ${hem - 1}`} {...stitches} />}
        <path d={`M19 ${hem - 4}Q48 ${hem + 4} 77 ${hem - 4}`} {...stitches} />
      </>}
    </>;
  } else if (g.slot === "feet") {
    const shoe = r?.shoe ?? "sneaker";
    if (shoe === "sandal") art = <>
      <path d="M44 14Q60 10 65 25L70 67Q70 83 54 86 40 86 36 73L30 34Q26 20 44 14Z" fill={dark} />
      <path d="M45 18Q57 15 61 27L66 66Q67 78 55 81 44 82 41 70L34 34Q31 23 45 18Z" fill="#eadfc8" strokeOpacity=".2" />
      <path d="M33 34 63 28 65 40 36 47ZM39 57 67 51 69 63 41 69Z" />
      <path d="m45 20 7 39M37 38 61 33M43 61 64 56" {...seams} />
      <rect x="58" y="30" width="8" height="11" rx="2" fill={trim} strokeOpacity=".4" />
    </>;
    else {
      const boot = shoe === "boot" || shoe === "ankle-boot", flat = shoe === "flat", loafer = shoe === "loafer";
      art = <>
        <path d={boot ? `M25 ${shoe === "boot" ? 15 : 34}H54L53 57Q59 64 76 65 87 65 87 76L18 78 17 67 24 54Z` : flat ? "M18 53Q28 43 40 48L51 58Q60 61 75 63 85 65 84 75H17Q12 64 18 53Z" : "M21 43 41 40 50 55Q60 62 76 63 87 65 86 76H16Q11 64 21 43Z"} />
        <path d="M16 72Q51 76 86 71V79Q48 84 16 78Z" fill="#e6e2d9" strokeOpacity=".25" />
        {boot ? <><path d={`M29 ${shoe === "boot" ? 21 : 40}H48M29 48H49M26 58 50 60M25 64 60 67`} {...seams} /><path d={`M45 ${shoe === "boot" ? 21 : 40}V55`} {...stitches} /></>
          : flat ? <><path d="M21 52Q29 50 37 52L44 60Q29 66 21 58Z" fill={dark} stroke="none" /><path d="M39 49 46 64 53 62 46 52Z" fill={fabric} /></>
          : loafer ? <><path d="M23 47Q36 43 43 48L50 61Q38 69 23 61Z" fill={dark} strokeOpacity=".3" /><path d="m26 53 21-1m-17 8 19-2" {...stitches} /></>
          : <><path d="m37 47 15 11m-18-6 15 11m-12-5 14 9" {...stitches} /><path d="M62 63Q57 66 57 72M23 49 19 66" {...seams} /></>}
      </>;
    }
  } else if (g.slot === "socks") {
    const top = (r?.length ?? 0.4) < 0.3 ? 44 : (r?.length ?? 0.4) > 0.7 ? 13 : 25;
    art = <>
      <path d={`M44 ${top - 3}H65V59L78 68Q85 77 74 82H53Q42 81 43 70L45 62Z`} fill={dark} strokeOpacity=".15" />
      <path d={`M27 ${top}H50V59L64 69Q71 78 60 83H35Q23 82 24 71L27 61Z`} />
      <path d={`M28 ${top + 6}H49M28 ${top + 10}H49M26 70 37 65M51 76 57 69`} {...stitches} />
    </>;
  } else if (r?.part === "bottom" || ["bottom", "midBottom", "outerBottom", "underwearLegs"].includes(g.slot)) {
    const shorts = (r?.length ?? 1) < 0.6, loose = category === "salwar", jeans = category.includes("jeans") || g.id.includes("jeans");
    const hem = shorts ? 65 : 86;
    art = <>
      <path d={loose ? "M28 15H68Q80 46 69 78L64 85H54L49 42 43 85H32L26 78Q17 45 28 15Z" : `M28 14Q48 18 68 14L${shorts ? 73 : 70} ${hem} 53 ${hem + 1} 48 40 43 ${hem + 1} ${shorts ? 23 : 26} ${hem}Z`} />
      <path d="M28 23Q48 27 68 23M48 25V40M31 28Q33 38 40 36M65 28Q63 38 56 36" {...seams} />
      <path d={`M28 ${hem - 5}H42M54 ${hem - 5}H68`} {...stitches} />
      {jeans && <><path d="M32 16V23M42 18V24M57 18V24M64 17V23M29 43 27 78M67 43 69 78" {...stitches} /><circle cx="48" cy="21" r="1.5" fill={trim} stroke="none" /></>}
      {loose && <path d="m34 30-4 22m11-21-5 32m20-32 5 32m2-32 4 20M31 78H43M54 78H66" {...seams} />}
    </>;
  } else if (g.layer === "accessories") {
    switch (r?.accessory) {
      case "bow": art = <><path d="M18 30Q16 49 20 65L43 53H53L76 65Q81 48 77 30L53 42H43Z" /><path d="m23 36 19 11-18 10m48-21L54 47l18 10" {...seams} /><rect x="41" y="39" width="14" height="19" rx="3" fill={dark} /></>; break;
      case "tie": art = <><path d="M36 13H60L56 27 63 76 48 88 33 76 40 27Z" /><path d="M37 15 48 25 59 15M40 28H56M44 33 40 73" {...seams} /><path d="m40 45 16 8m-17 6 19 9" {...stitches} /></>; break;
      case "belt": art = <><path d="M13 37Q48 29 83 37V59Q48 52 13 59Z" /><path d="M16 41Q48 35 80 41M16 54Q48 49 80 54" {...stitches} /><rect x="35" y="32" width="28" height="30" rx="5" fill={trim} strokeOpacity=".4" /><rect x="41" y="38" width="16" height="18" rx="2" fill={dark} /><path d="M49 47H64" stroke={trim} strokeOpacity="1" strokeWidth="3" /><path d="M21 45h2m3 0h2m41 0h2m4 0h2" {...seams} /></>; break;
      case "sash": art = <><path d="M13 33 79 25 83 48 17 59Z" /><path d="M55 48 75 49 73 85 61 77 56 84Z" fill={dark} /><path d="M57 34 59 52 48 51 47 36Z" /><path d="m18 39 27-4m19-3 12-2M19 53 45 48" {...stitches} /></>; break;
      case "suspenders": art = <><path d="M23 16 32 13 48 55 64 13 73 16 54 64V82H42V64Z" /><path d="m27 19 20 41m21-41L50 60" {...stitches} /><rect x="21" y="12" width="13" height="10" rx="2" fill="#bec6ce" /><rect x="62" y="12" width="13" height="10" rx="2" fill="#bec6ce" /><rect x="41" y="77" width="14" height="10" rx="2" fill="#bec6ce" /></>; break;
      case "watch": art = <><path d="M38 10H58L62 87H34Z" /><path d="M39 17H57M38 23H58M38 74H58M38 80H58" {...seams} /><circle cx="48" cy="48" r="23" fill="#d7dce1" strokeOpacity=".3" /><circle cx="48" cy="48" r="18" fill="#fcfaf5" strokeOpacity=".2" /><path d="M48 34V48L58 53M48 34v-2m0 32v-2m-16-14h2m28 0h2" stroke="#475569" strokeOpacity="1" fill="none" strokeWidth="2" strokeLinecap="round" /></>; break;
      case "wristband": case "cuffs": art = <><path d="M22 34Q47 19 74 34V66Q47 81 22 66Z" /><ellipse cx="48" cy="34" rx="26" ry="10" fill={dark} /><ellipse cx="48" cy="33" rx="18" ry="5" fill="#f0eee9" stroke="none" /><path d="M27 62Q48 72 69 62M29 41V59" {...stitches} /></>; break;
      case "neckerchief": art = <><path d="M16 23 80 24 51 75 44 75Z" /><path d="M17 24 47 42 79 25 59 48 48 78 36 47Z" fill={dark} strokeOpacity=".2" /><path d="m20 28 27 20 29-19M44 55l3 15" {...stitches} /></>; break;
      default: art = <><path d="M24 14Q48 7 69 17L58 41 71 78 52 85 37 43 25 80 10 74 28 35Z" /><path d="M29 18Q45 30 63 19L55 38Q40 42 26 32Z" fill={dark} /><path d="m23 46-9 24m32-23 10 30m3-29 9 27M24 19Q44 32 63 21" {...stitches} /><path d="m12 74-2 6m6-5-2 7m6-5-2 6m35 0 2 6m3-8 3 6m2-8 3 6" {...seams} /></>;
    }
  } else {
    const dress = r?.kind === "dress" || g.slot === "dress" || g.slot === "outerDress";
    const tunic = /tunic|kurta|kameez/.test(category), coat = g.slot === "outerDress";
    const cropped = !dress && (r?.length ?? 1) < 0.8;
    const hem = dress ? tunic ? 83 : 87 : cropped ? 63 : 79;
    const sleeves = r?.sleeves ?? 0.35, long = sleeves > 0.6, sleeveless = sleeves === 0;
    const open = !!r?.openFront, collar = !!r?.detail && r.detail !== "zip", hoodie = category === "hoodie";
    const outline = sleeveless ? `M31 15 38 17Q48 28 58 17L65 15 68 34 63 43 65 ${hem}Q48 ${hem + 5} 31 ${hem}L33 43 28 34Z`
      : `M34 16 23 21${r?.sleevePuff ? "Q10 22 12 37L21 44" : long ? " 10 72 23 76 31 42" : " 13 38 26 45 31 33"}L34 ${dress ? 43 : hem} ${dress ? `${tunic ? 29 : 20} ${hem}` : ""}Q48 ${hem + 7} ${dress ? tunic ? 67 : 76 : 62} ${hem}L62 ${dress ? 43 : 33}${dress ? " 65 33" : ""}${r?.sleevePuff ? " 74 44Q89 28 73 21" : long ? " 73 76 86 72 73 21" : " 70 45 83 38 73 21"}L62 16Q48 27 34 16Z`;
    art = <>
      {hoodie && <path d="M31 22Q25 6 48 7 72 6 65 23L57 30H38Z" fill={dark} />}
      <path d={outline} />
      {open && <path d={`M42 21H54L56 ${hem + 1}H40Z`} fill="#eef0f2" stroke="none" />}
      {r?.detail === "blazer" ? <><path d={`M35 16 44 23 38 41 44 49 41 ${hem} 31 ${hem} 34 45 29 33Z`} fill={dark} /><path d={`M61 16 52 23 58 41 52 49 55 ${hem} 65 ${hem} 62 45 67 33Z`} fill={dark} /><path d={`M36 17 42 24 36 40 42 48M60 17 54 24 60 40 54 48M35 58H40M57 58H62`} {...stitches} /></>
        : collar ? <><path d="M34 16 46 24 39 35 30 22ZM62 16 50 24 57 35 66 22Z" fill={dark} strokeOpacity=".2" /><path d={`M48 29V${dress ? 48 : hem - 6}`} {...seams} />{[38, 49, 60].filter((y) => y < hem - 8).map((y) => <circle key={y} cx="48" cy={y} r="1.3" fill="#f6f4ee" stroke="none" />)}<path d="M56 40H63V49Q59 52 56 49Z" {...seams} /></>
        : <path d={sleeveless ? "M38 17Q48 34 58 17" : "M35 17Q48 35 61 17"} {...seams} />}
      {r?.detail === "zip" && <><path d={`M48 27V${hem - 2}`} {...stitches} /><rect x="46" y="32" width="4" height="6" rx="1" fill="#bfc5cb" stroke="none" /></>}
      {dress && !coat && !tunic && <><path d="M34 44Q48 49 62 44" {...seams} /><path d={`M38 49 32 ${hem - 3}M45 50 43 ${hem}M51 50 54 ${hem}M58 49 66 ${hem - 3}`} {...seams} /></>}
      {tunic && <><path d="M48 28V43M32 68V81M64 68V81" {...seams} /><path d="M31 79Q48 84 65 79" fill="none" stroke={r?.trim ? trim : "#fff"} strokeOpacity={r?.trim ? 1 : 0.4} strokeWidth="2.5" /></>}
      {coat && <><path d="M48 28V86M29 50H67M34 62H40M57 62H64" {...seams} /><rect x="42" y="47" width="12" height="8" rx="1" fill={dark} /></>}
      {hoodie && <><path d="M29 62 41 56H55L67 62 63 71H33Z" {...seams} /><path d="M41 27V41M55 27V41" {...stitches} /></>}
      {!tunic && <path d={`M${dress ? 25 : 35} ${hem - 4}Q48 ${hem + 1} ${dress ? 71 : 61} ${hem - 4}`} {...stitches} />}
      {!sleeveless && <path d={long ? "m12 68 12 4m48 0 12-4" : "m16 36 11 6m42 0 11-6"} {...stitches} />}
    </>;
  }

  return <svg viewBox="0 0 96 96" aria-hidden="true" focusable="false" className={className} fill={fabric} stroke="#263345" strokeOpacity=".3" strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round">
    <defs>
      <linearGradient id={`${id}-fabric`} x1=".1" y1="0" x2=".85" y2="1" gradientUnits="objectBoundingBox"><stop stopColor={mix(color, "#ffffff", 0.16)} /><stop offset=".45" stopColor={color} /><stop offset="1" stopColor={mix(color, "#172033", 0.17)} /></linearGradient>
      <linearGradient id={`${id}-fold`} x1="0" y1="0" x2="1" y2="1"><stop stopColor={mix(color, "#172033", 0.08)} /><stop offset="1" stopColor={mix(color, "#172033", 0.3)} /></linearGradient>
    </defs>
    <ellipse cx="48" cy="89" rx="27" ry="3" fill="#27344b" fillOpacity=".07" stroke="none" />
    {art}
  </svg>;
}

function mix(color: string, other: string, amount: number): string {
  const hex = color.replace(/^#/, "");
  const expanded = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  if (!/^[\da-f]{6}$/i.test(expanded)) return color;
  const a = Number.parseInt(expanded, 16), b = Number.parseInt(other.slice(1), 16);
  return `#${[16, 8, 0].map((shift) => Math.round(((a >> shift) & 255) * (1 - amount) + ((b >> shift) & 255) * amount).toString(16).padStart(2, "0")).join("")}`;
}
