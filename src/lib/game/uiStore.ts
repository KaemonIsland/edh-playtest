"use client";

import { create } from "zustand";
import type { ScryCard, TokenSpec, Zone } from "@/types";

export interface MenuItem {
  label: string;
  onClick?: () => void;
  danger?: boolean;
  separator?: boolean;
  disabled?: boolean;
}

export type ModalKind =
  | { kind: "none" }
  | { kind: "browse"; zone: Zone; title: string; shuffleAfter: boolean }
  | { kind: "scry"; count: number; surveil: boolean }
  | { kind: "token" }
  | { kind: "dice" }
  | { kind: "keybinds" }
  | { kind: "snapshots" }
  | { kind: "settings" };

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
  attachSource: string | null;

  openModal: (modal: ModalKind) => void;
  closeModal: () => void;
  openMenu: (x: number, y: number, items: MenuItem[]) => void;
  closeMenu: () => void;
  setPreview: (preview: PreviewCard | null) => void;
  setLogOpen: (open: boolean) => void;
  startBottoming: (count: number) => void;
  toggleBottomingCard: (instanceId: string) => void;
  clearBottoming: () => void;
  setDragging: (dragging: boolean) => void;
  setAttachSource: (instanceId: string | null) => void;
}

export const useUiStore = create<UiStore>((set, get) => ({
  modal: { kind: "none" },
  menu: null,
  preview: null,
  logOpen: false,
  bottoming: 0,
  bottomingSelected: [],
  dragging: false,
  attachSource: null,

  openModal: (modal) => set({ modal, menu: null }),
  closeModal: () => set({ modal: { kind: "none" } }),
  openMenu: (x, y, items) => set({ menu: { x, y, items } }),
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
  setDragging: (dragging) => set({ dragging, ...(dragging ? { menu: null, preview: null } : {}) }),
  setAttachSource: (instanceId) => set({ attachSource: instanceId }),
}));
