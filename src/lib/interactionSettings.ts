/** Central device settings: animation files contain only choreography. */
export interface InteractionSettings {
  enabled: boolean;
  actions: Record<string, boolean>;
  minimumAges: Record<string, number>;
  /** Show actions that people's ages rule out, with a lock, instead of hiding them. */
  showLocked: boolean;
}

export const DEFAULT_MINIMUM_AGES = [0, 13, 16, 18, 21, 65] as const;
export const ACTION_AGE_MAPPING: Record<string, { defaultMinimumAge: number; choices: readonly number[] }> = {
  woohoo: { defaultMinimumAge: 18, choices: [18, 21] },
};
export const actionAgeChoices = (id: string): readonly number[] => ACTION_AGE_MAPPING[id]?.choices ?? DEFAULT_MINIMUM_AGES;

export const INTERACTION_SETTINGS: InteractionSettings = {
  enabled: true,
  actions: {},
  showLocked: false,
  minimumAges: Object.fromEntries(Object.entries(ACTION_AGE_MAPPING).map(([id, mapping]) => [id, mapping.defaultMinimumAge])),
};

// Reuse the key to preserve switches saved before the main Settings UI existed.
const STORAGE_KEY = "my-diary.interaction-policy.v1";
const listeners = new Set<() => void>();
let revision = 0;
try {
  const saved = typeof localStorage === "undefined" ? null : JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
  if (typeof saved?.enabled === "boolean") INTERACTION_SETTINGS.enabled = saved.enabled;
  if (typeof saved?.showLocked === "boolean") INTERACTION_SETTINGS.showLocked = saved.showLocked;
  if (saved?.actions && typeof saved.actions === "object") for (const [id, value] of Object.entries(saved.actions)) {
    if (typeof value === "boolean") INTERACTION_SETTINGS.actions[id] = value;
  }
  if (saved?.minimumAges && typeof saved.minimumAges === "object") for (const [id, value] of Object.entries(saved.minimumAges)) {
    if (typeof value === "number" && actionAgeChoices(id).includes(value)) INTERACTION_SETTINGS.minimumAges[id] = value;
  }
} catch { /* Unavailable or malformed storage leaves the defaults in place. */ }

export const subscribeInteractionSettings = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const interactionSettingsRevision = () => revision;
function save() {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(INTERACTION_SETTINGS));
  } catch { /* Settings still work for this session if storage is unavailable. */ }
  revision++;
  listeners.forEach((listener) => listener());
}
export function setInteractionEnabled(id: string | null, enabled: boolean) {
  if (id === null) INTERACTION_SETTINGS.enabled = enabled;
  else INTERACTION_SETTINGS.actions[id] = enabled;
  save();
}
export function setInteractionMinimumAge(id: string, minimumAge: number): boolean {
  if (!actionAgeChoices(id).includes(minimumAge)) return false;
  INTERACTION_SETTINGS.minimumAges[id] = minimumAge;
  save();
  return true;
}
export function setShowLockedActions(show: boolean) {
  INTERACTION_SETTINGS.showLocked = show;
  save();
}
