"use client";

import {
  Award,
  BatteryCharging,
  Biohazard,
  Cat,
  Circle,
  CircleMinus,
  CirclePlus,
  Droplets,
  Eye,
  Feather,
  Gem,
  Hand,
  Heart,
  PawPrint,
  Shield,
  Skull,
  Sparkle,
  Sword,
  Swords,
  Target,
  Zap,
  type LucideIcon,
} from "lucide-react";

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
  icon: LucideIcon;
}

/** MIME type used to carry a counter name through native drag-and-drop. */
export const COUNTER_DND_TYPE = "application/x-mtg-counter";

export const COUNTER_TYPES: CounterDef[] = [
  { name: "+1/+1", label: "+1/+1", icon: CirclePlus },
  { name: "-1/-1", label: "-1/-1", icon: CircleMinus },
  { name: "loyalty", label: "Loyalty", icon: Award },
  { name: "charge", label: "Charge", icon: BatteryCharging },
  { name: "flying", label: "Flying", icon: Feather },
  { name: "deathtouch", label: "Deathtouch", icon: Skull },
  { name: "first strike", label: "First strike", icon: Sword },
  { name: "double strike", label: "Double strike", icon: Swords },
  { name: "vigilance", label: "Vigilance", icon: Eye },
  { name: "trample", label: "Trample", icon: PawPrint },
  { name: "lifelink", label: "Lifelink", icon: Heart },
  { name: "menace", label: "Menace", icon: Cat },
  { name: "hexproof", label: "Hexproof", icon: Hand },
  { name: "indestructible", label: "Indestructible", icon: Gem },
  { name: "haste", label: "Haste", icon: Zap },
  { name: "reach", label: "Reach", icon: Target },
  { name: "shield", label: "Shield", icon: Shield },
  { name: "stun", label: "Stun", icon: Sparkle },
  { name: "poison", label: "Poison", icon: Biohazard },
  { name: "oil", label: "Oil", icon: Droplets },
  { name: "generic", label: "Generic", icon: Circle },
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
