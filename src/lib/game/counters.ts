"use client";

/**
 * Counter types for the playtester's "Dice Bag". A counter's `name` is what gets
 * stored on a card instance (and shown on its chip); the icon/label are only for
 * the picker UI. Dragging one onto a battlefield card adds one of that counter.
 */
export interface CounterDef {
  /** Stored counter name (matches what BattlefieldCard renders). */
  name: string;
  /** Short display label for the picker. */
  label: string;
  /** Emoji/glyph icon. */
  icon: string;
}

/** MIME type used to carry a counter name through native drag-and-drop. */
export const COUNTER_DND_TYPE = "application/x-mtg-counter";

export const COUNTER_TYPES: CounterDef[] = [
  { name: "+1/+1", label: "+1/+1", icon: "🟢" },
  { name: "-1/-1", label: "-1/-1", icon: "🔴" },
  { name: "loyalty", label: "Loyalty", icon: "🛡️" },
  { name: "charge", label: "Charge", icon: "🔋" },
  { name: "flying", label: "Flying", icon: "🕊️" },
  { name: "deathtouch", label: "Deathtouch", icon: "💀" },
  { name: "first strike", label: "First strike", icon: "⚔️" },
  { name: "double strike", label: "Double strike", icon: "⚔️" },
  { name: "vigilance", label: "Vigilance", icon: "👁️" },
  { name: "trample", label: "Trample", icon: "🐾" },
  { name: "lifelink", label: "Lifelink", icon: "❤️" },
  { name: "menace", label: "Menace", icon: "😼" },
  { name: "hexproof", label: "Hexproof", icon: "✋" },
  { name: "indestructible", label: "Indestructible", icon: "🗿" },
  { name: "haste", label: "Haste", icon: "⚡" },
  { name: "reach", label: "Reach", icon: "🏹" },
  { name: "shield", label: "Shield", icon: "🔰" },
  { name: "stun", label: "Stun", icon: "💫" },
  { name: "poison", label: "Poison", icon: "☣️" },
  { name: "oil", label: "Oil", icon: "🛢️" },
  { name: "generic", label: "Generic", icon: "⬤" },
];

const RECENT_KEY = "edh-playtest:recent-counters";
const RECENT_MAX = 6;

export function loadRecentCounters(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : ["+1/+1", "-1/-1"];
  } catch {
    return ["+1/+1", "-1/-1"];
  }
}

export function pushRecentCounter(name: string): string[] {
  const next = [name, ...loadRecentCounters().filter((n) => n !== name)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}
