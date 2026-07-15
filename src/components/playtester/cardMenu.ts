"use client";

import {
  ArrowRight,
  Info,
  Copy,
  Crown,
  Layers,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Shuffle,
  SkipForward,
  SquareDashed,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { controllerOf, PLAYER_ID, useGameStore } from "@/lib/game/store";
import { useUiStore, type MenuItem } from "@/lib/game/uiStore";
import type { Zone } from "@/types";

/** Commonly used counters offered as one-click quick-adds. */
const COMMON_COUNTERS = [
  "+1/+1",
  "-1/-1",
  "charge",
  "loyalty",
  "lore",
  "time",
  "oil",
  "stun",
  "shield",
  "lifelink",
  "hexproof",
  "indestructible",
];

/** Re-render the open menu so inline counter counts stay live. */
function refreshCardMenu(instanceId: string) {
  const ui = useUiStore.getState();
  if (ui.menu) ui.refreshMenu(buildCardMenu(instanceId));
}

/** Inline rows for counters already on the card: label  − n +  remove */
function counterRows(instanceId: string): MenuItem[] {
  const g = useGameStore.getState();
  const inst = g.instances[instanceId];
  if (!inst) return [];
  return Object.entries(inst.counters).map(([name, count]) => ({
    label: name,
    counter: {
      count,
      onInc: () => {
        useGameStore.getState().addCounterOnCard(instanceId, name, 1);
        refreshCardMenu(instanceId);
      },
      onDec: () => {
        useGameStore.getState().addCounterOnCard(instanceId, name, -1);
        refreshCardMenu(instanceId);
      },
      onRemove: () => {
        const current = useGameStore.getState().instances[instanceId]?.counters[name] ?? 0;
        useGameStore.getState().addCounterOnCard(instanceId, name, -current);
        refreshCardMenu(instanceId);
      },
    },
  }));
}

function addCountersSubmenu(instanceId: string): MenuItem[] {
  const g = useGameStore.getState();
  const inst = g.instances[instanceId];
  const items: MenuItem[] = COMMON_COUNTERS.filter(
    (name) => inst?.counters[name] === undefined,
  ).map((name) => ({
    label: name,
    onClick: () => g.addCounterOnCard(instanceId, name, 1),
  }));
  items.push(
    { label: "", separator: true },
    {
      label: "Custom counter…",
      icon: Plus,
      onClick: () => {
        const name = window.prompt("Counter name:");
        if (name?.trim()) g.addCounterOnCard(instanceId, name.trim(), 1);
      },
    },
  );
  return items;
}

function moveToSubmenu(
  instanceIds: string[],
  currentZone: Zone,
  isCommander: boolean,
): MenuItem[] {
  const g = useGameStore.getState();
  const group = instanceIds.length > 1;
  const move = (to: Zone, label: string, opts?: Parameters<typeof g.moveCard>[2]): MenuItem => ({
    label,
    onClick: () => {
      if (group) {
        g.moveCards(instanceIds, to, opts);
        useUiStore.getState().clearSelected();
      } else {
        g.moveCard(instanceIds[0]!, to, opts);
      }
    },
  });

  const items: MenuItem[] = [];
  if (currentZone !== "battlefield") items.push(move("battlefield", "Battlefield"));
  if (currentZone !== "hand") items.push(move("hand", "Hand"));
  if (currentZone !== "graveyard")
    items.push(move("graveyard", currentZone === "hand" ? "Graveyard (discard)" : "Graveyard"));
  if (currentZone !== "exile") items.push(move("exile", "Exile"));
  if (isCommander && currentZone !== "command") items.push(move("command", "Command zone"));
  items.push(
    { label: "", separator: true },
    move("library", "Top of library", { libraryPlacement: "top" }),
    move("library", "Bottom of library", { libraryPlacement: "bottom" }),
    move("library", "Shuffle into library", { libraryPlacement: "shuffle" }),
  );
  if (group) {
    items.push(
      { label: "", separator: true },
      {
        label: "Shuffle group → bottom of library",
        icon: Shuffle,
        onClick: () => {
          g.shuffleToLibraryBottom(instanceIds);
          useUiStore.getState().clearSelected();
        },
      },
    );
  }

  // Card theft (single card only): hand control to another player's battlefield.
  // It still belongs to its owner — leaving the battlefield sends it back.
  const inst = group ? undefined : g.instances[instanceIds[0]!];
  if (inst) {
    const currentController =
      currentZone === "battlefield" ? controllerOf(inst) : inst.ownerId;
    const theftTargets = g.playerOrder.filter((pid) => pid !== currentController);
    if (theftTargets.length > 0 && g.playerOrder.length > 1) {
      items.push({ label: "", separator: true });
      for (const pid of theftTargets) {
        const label =
          pid === PLAYER_ID
            ? "Your battlefield (take control)"
            : `${g.players[pid]?.name ?? "Opponent"}'s battlefield`;
        items.push({
          label,
          onClick: () => g.moveCard(instanceIds[0]!, "battlefield", { controllerId: pid }),
        });
      }
    }
  }
  return items;
}

function cardActionsSubmenu(instanceId: string): MenuItem[] {
  const g = useGameStore.getState();
  const ui = useUiStore.getState();
  const inst = g.instances[instanceId];
  if (!inst) return [];
  const card = g.cards[inst.cardId];
  const hasFaces = (card?.card_faces?.length ?? 0) > 1;

  const items: MenuItem[] = [];
  if (hasFaces) items.push({ label: "Transform / flip face", onClick: () => g.flipFace(instanceId) });
  items.push({
    label: inst.faceDown ? "Turn face up" : "Turn face down",
    onClick: () => g.setFaceDown(instanceId, !inst.faceDown),
  });
  if (inst.attachedTo) {
    items.push({ label: "Unattach", onClick: () => g.unattach(instanceId) });
  } else {
    items.push({
      label: "Attach to… (click target)",
      onClick: () => ui.setAttachSource(instanceId),
    });
  }
  return items;
}

/** Build the right-click menu for a card instance, based on its zone. */
export function buildCardMenu(instanceId: string): MenuItem[] {
  const g = useGameStore.getState();
  const inst = g.instances[instanceId];
  if (!inst) return [];
  const isCommander =
    g.players[inst.ownerId]?.commanderOracleIds.includes(inst.oracleId) ?? false;

  // When the right-clicked card is part of a marquee selection (battlefield
  // only), the move/tap actions act on the whole group.
  const selection = useUiStore.getState().selected;
  const group =
    inst.zone === "battlefield" && selection.length > 1 && selection.includes(instanceId);
  const targets = group ? selection : [instanceId];

  const items: MenuItem[] = [];

  if (inst.zone === "battlefield") {
    if (group) {
      items.push({
        label: `${targets.length} cards selected`,
        disabled: true,
      });
    }
    items.push(
      {
        label: inst.tapped ? (group ? "Untap selected" : "Untap") : group ? "Tap selected" : "Tap",
        icon: RotateCw,
        onClick: () =>
          group ? g.toggleTapMany(targets, instanceId) : g.toggleTap(instanceId),
      },
      {
        label: group ? `Move ${targets.length} to` : "Move to",
        icon: ArrowRight,
        children: moveToSubmenu(targets, "battlefield", isCommander),
      },
      ...(group
        ? []
        : [{ label: "Card actions", icon: Layers, children: cardActionsSubmenu(instanceId) }]),
      { label: "", separator: true },
      {
        label: group ? "+1/+1 counter (each)" : "+1/+1 counter",
        icon: Plus,
        onClick: () => {
          for (const id of targets) g.addCounterOnCard(id, "+1/+1", 1);
        },
      },
      ...(group ? [] : [{ label: "Add counters", icon: Plus, children: addCountersSubmenu(instanceId) }]),
      ...(group ? [] : counterRows(instanceId)),
      { label: "", separator: true },
      ...(group
        ? []
        : [{ label: "Create token copy", icon: Copy, onClick: () => g.cloneInstance(instanceId) }]),
      {
        label: group
          ? `Delete ${targets.length} from game`
          : inst.isToken
            ? "Remove token"
            : "Delete card from game",
        icon: Trash2,
        danger: true,
        onClick: () => {
          for (const id of targets) g.removeInstance(id);
          if (group) useUiStore.getState().clearSelected();
        },
      },
    );
  } else if (inst.zone === "hand") {
    items.push(
      { label: "Play to battlefield", icon: Play, onClick: () => g.moveCard(instanceId, "battlefield") },
      {
        label: "Play face down",
        icon: Layers,
        onClick: () => {
          g.moveCard(instanceId, "battlefield");
          g.setFaceDown(instanceId, true);
        },
      },
      { label: "", separator: true },
      { label: "Move to", icon: ArrowRight, children: moveToSubmenu([instanceId], "hand", isCommander) },
    );
  } else if (inst.zone === "command") {
    const tax = (g.players[inst.ownerId]?.commanderTax[inst.oracleId] ?? 0) * 2;
    items.push(
      {
        label: `Cast commander${tax > 0 ? ` (+${tax} tax)` : ""}`,
        icon: Crown,
        onClick: () => g.moveCard(instanceId, "battlefield"),
      },
      { label: "Move to", icon: ArrowRight, children: moveToSubmenu([instanceId], "command", isCommander) },
    );
  } else {
    // graveyard / exile / library cards (from browse modals or pile tops)
    items.push({
      label: "Move to",
      icon: ArrowRight,
      children: moveToSubmenu([instanceId], inst.zone, isCommander),
    });
  }

  // Every zone: full card details (wishlist, decks, rulings — and readable
  // oracle text when the printing's art hides it).
  const cardData = g.cards[inst.cardId];
  if (cardData) {
    items.push(
      { label: "", separator: true },
      {
        label: "Card details",
        icon: Info,
        onClick: () => useUiStore.getState().openModal({ kind: "carddetail", card: cardData }),
      },
    );
  }

  return items.filter((i) => i.separator || i.label);
}

/**
 * Right-click menu for empty battlefield space (Archidekt-style). All actions
 * apply to `playerId`'s field; "Next turn" and selection are yours-only.
 */
export function buildBattlefieldMenu(playerId: string = PLAYER_ID): MenuItem[] {
  const g = useGameStore.getState();
  const ui = useUiStore.getState();
  const mine = playerId === PLAYER_ID;
  const battlefieldIds = (g.zoneOrder[playerId]?.battlefield ?? []).filter(
    (id) => !g.instances[id]?.attachedTo,
  );

  const items: MenuItem[] = [
    { label: "Tap all", icon: RotateCw, onClick: () => g.tapAll(playerId) },
    {
      label: "Untap all",
      icon: RotateCcw,
      hint: mine ? "U" : undefined,
      onClick: () => g.untapAll(playerId),
    },
    { label: "", separator: true },
  ];

  if (mine) {
    items.push({
      label: "Next turn (untap + draw)",
      icon: SkipForward,
      hint: "N",
      onClick: () => g.nextTurn(),
    });
  }

  items.push(
    { label: "Proliferate all counters", icon: Plus, onClick: () => g.proliferate(playerId) },
    { label: "", separator: true },
    {
      label: "Add token / search Scryfall",
      icon: Copy,
      hint: mine ? "T" : undefined,
      onClick: () => ui.openModal({ kind: "token", playerId }),
    },
  );

  if (mine) {
    items.push(
      { label: "", separator: true },
      {
        label: `Select all (${battlefieldIds.length})`,
        icon: SquareDashed,
        disabled: battlefieldIds.length === 0,
        onClick: () => ui.setSelected(battlefieldIds),
      },
      {
        label: "Clear selection",
        icon: X,
        disabled: ui.selected.length === 0,
        onClick: () => ui.clearSelected(),
      },
    );
  }

  items.push(
    { label: "", separator: true },
    {
      label: "Undo action",
      icon: Undo2,
      hint: "Z",
      disabled: g.history.length === 0,
      onClick: () => g.undo(),
    },
  );

  return items;
}
