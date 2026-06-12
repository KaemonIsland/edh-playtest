"use client";

import { create } from "zustand";
import type { ScryCard, TokenSpec, Zone } from "@/types";

export interface MenuItem {
  label: string;
  onClick?: () => void;
  danger?: boolean;
  separator?: boolean;
  disabled?: boolean;
  /** Submenu items — rendered as a flyout ("Move to ▸"). */
  children?: MenuItem[];
  /** Small leading icon (emoji / glyph). */
  icon?: string;
  /** Right-aligned hint, e.g. a keybind ("U"). */
  hint?: string;
  /**
   * Inline counter row: label + [− count + 🗑]. Clicks keep the menu open;
   * callbacks should refresh the menu items themselves.
   */
  counter?: { count: number; onInc: () => void; onDec: () => void; onRemove: () => void };
}

export type ModalKind =
  | { kind: "none" }
  | { kind: "browse"; zone: Zone; title: string; shuffleAfter: boolean; playerId: string }
  | { kind: "scry"; count: number; surveil: boolean }
  | { kind: "token"; playerId: string }
  | { kind: "dice" }
  | { kind: "keybinds" }
  | { kind: "snapshots" }
  | { kind: "settings" }
  | { kind: "loggame" };

interface PreviewCard {
  card?: ScryCard;
  tokenSpec?: TokenSpec;
  flipped: number;
}

interface UiStore {
  modal: ModalKind;
  menu: { x: number; y: number; items: MenuItem[] } | null;
  preview: PreviewCard | null;
  logOpen: boolean;
  /** >0 while picking cards to bottom after a London mulligan keep. */
  bottoming: number;
  bottomingSelected: string[];
  /** Set while a dnd-kit drag is active so long-press menus stay closed. */
  dragging: boolean;
  /** When the last drag ended — used to swallow the click that follows a drop. */
  lastDragEndAt: number;
  attachSource: string | null;
  /** Marquee-selected battlefield cards. */
  selected: string[];
  /** Which opponent's board is shown ("current opponent"). */
  viewedOpponent: string | null;
  /** Collapse the opponent board down to its summary strip. */
  opponentCollapsed: boolean;

  openModal: (modal: ModalKind) => void;
  closeModal: () => void;
  openMenu: (x: number, y: number, items: MenuItem[]) => void;
  /** Swap the open menu's items in place (used by inline counter rows). */
  refreshMenu: (items: MenuItem[]) => void;
  closeMenu: () => void;
  setPreview: (preview: PreviewCard | null) => void;
  setLogOpen: (open: boolean) => void;
  startBottoming: (count: number) => void;
  toggleBottomingCard: (instanceId: string) => void;
  clearBottoming: () => void;
  setDragging: (dragging: boolean) => void;
  setAttachSource: (instanceId: string | null) => void;
  setSelected: (ids: string[]) => void;
  clearSelected: () => void;
  setViewedOpponent: (playerId: string | null) => void;
  setOpponentCollapsed: (collapsed: boolean) => void;
}

export const useUiStore = create<UiStore>((set, get) => ({
  modal: { kind: "none" },
  menu: null,
  preview: null,
  logOpen: false,
  bottoming: 0,
  bottomingSelected: [],
  dragging: false,
  lastDragEndAt: 0,
  attachSource: null,
  selected: [],
  viewedOpponent: null,
  opponentCollapsed: false,

  openModal: (modal) => set({ modal, menu: null }),
  closeModal: () => set({ modal: { kind: "none" } }),
  openMenu: (x, y, items) => set({ menu: { x, y, items } }),
  refreshMenu: (items) => set((s) => (s.menu ? { menu: { ...s.menu, items } } : {})),
  closeMenu: () => set({ menu: null }),
  setPreview: (preview) => set({ preview }),
  setLogOpen: (logOpen) => set({ logOpen }),
  startBottoming: (count) => set({ bottoming: count, bottomingSelected: [] }),
  toggleBottomingCard: (instanceId) => {
    const { bottomingSelected, bottoming } = get();
    if (bottomingSelected.includes(instanceId)) {
      set({ bottomingSelected: bottomingSelected.filter((id) => id !== instanceId) });
    } else if (bottomingSelected.length < bottoming) {
      set({ bottomingSelected: [...bottomingSelected, instanceId] });
    }
  },
  clearBottoming: () => set({ bottoming: 0, bottomingSelected: [] }),
  setDragging: (dragging) =>
    set({
      dragging,
      ...(dragging ? { menu: null, preview: null } : { lastDragEndAt: Date.now() }),
    }),
  setAttachSource: (instanceId) => set({ attachSource: instanceId }),
  setSelected: (ids) => set({ selected: ids }),
  clearSelected: () => set({ selected: [] }),
  setViewedOpponent: (viewedOpponent) => set({ viewedOpponent }),
  setOpponentCollapsed: (opponentCollapsed) => set({ opponentCollapsed }),
}));

/** True right after a drop, so click handlers can ignore the trailing click. */
export function justFinishedDrag(): boolean {
  return Date.now() - useUiStore.getState().lastDragEndAt < 200;
}
