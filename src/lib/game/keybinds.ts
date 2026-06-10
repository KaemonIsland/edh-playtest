"use client";

export type KeybindAction =
  | "draw"
  | "untapAll"
  | "nextTurn"
  | "nextPhase"
  | "undo"
  | "redo"
  | "shuffle"
  | "searchLibrary"
  | "scry"
  | "mill"
  | "tokenModal"
  | "dice"
  | "toggleLog"
  | "keybindsHelp";

export interface KeybindDef {
  action: KeybindAction;
  label: string;
  default: string;
}

export const KEYBIND_DEFS: KeybindDef[] = [
  { action: "draw", label: "Draw a card", default: "d" },
  { action: "untapAll", label: "Untap all", default: "u" },
  { action: "nextTurn", label: "Next turn", default: "n" },
  { action: "nextPhase", label: "Next phase", default: "p" },
  { action: "undo", label: "Undo", default: "z" },
  { action: "redo", label: "Redo", default: "y" },
  { action: "shuffle", label: "Shuffle library", default: "s" },
  { action: "searchLibrary", label: "Search / browse library", default: "f" },
  { action: "scry", label: "Scry top of library", default: "c" },
  { action: "mill", label: "Mill top card", default: "m" },
  { action: "tokenModal", label: "Create token", default: "t" },
  { action: "dice", label: "Dice & coins", default: "r" },
  { action: "toggleLog", label: "Toggle action log", default: "l" },
  { action: "keybindsHelp", label: "Show keybinds", default: "?" },
];

const STORAGE_KEY = "edh-playtest:keybinds";

export type KeybindMap = Record<KeybindAction, string>;

export function defaultKeybinds(): KeybindMap {
  return Object.fromEntries(KEYBIND_DEFS.map((d) => [d.action, d.default])) as KeybindMap;
}

export function loadKeybinds(): KeybindMap {
  if (typeof window === "undefined") return defaultKeybinds();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultKeybinds();
    return { ...defaultKeybinds(), ...(JSON.parse(raw) as Partial<KeybindMap>) };
  } catch {
    return defaultKeybinds();
  }
}

export function saveKeybinds(map: KeybindMap): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}
