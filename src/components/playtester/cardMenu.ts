"use client";

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

/** Inline rows for counters already on the card: label  − n +  🗑 */
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
      icon: "✛",
      onClick: () => {
        const name = window.prompt("Counter name:");
        if (name?.trim()) g.addCounterOnCard(instanceId, name.trim(), 1);
      },
    },
  );
  return items;
}

function moveToSubmenu(instanceId: string, currentZone: Zone, isCommander: boolean): MenuItem[] {
  const g = useGameStore.getState();
  const move = (to: Zone, label: string, opts?: Parameters<typeof g.moveCard>[2]): MenuItem => ({
    label,
    onClick: () => g.moveCard(instanceId, to, opts),
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

  // Card theft: hand control of the card to another player's battlefield.
  // It still belongs to its owner — leaving the battlefield sends it back to
  // the owner's zones.
  const inst = g.instances[instanceId];
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
          onClick: () => g.moveCard(instanceId, "battlefield", { controllerId: pid }),
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

  const items: MenuItem[] = [];

  if (inst.zone === "battlefield") {
    items.push(
      {
        label: inst.tapped ? "Untap" : "Tap",
        icon: "⤵",
        onClick: () => g.toggleTap(instanceId),
      },
      { label: "Move to", icon: "→", children: moveToSubmenu(instanceId, "battlefield", isCommander) },
      { label: "Card actions", icon: "🂠", children: cardActionsSubmenu(instanceId) },
      { label: "", separator: true },
      {
        label: "+1/+1 counter",
        icon: "✛",
        onClick: () => g.addCounterOnCard(instanceId, "+1/+1", 1),
      },
      { label: "Add counters", icon: "✚", children: addCountersSubmenu(instanceId) },
      ...counterRows(instanceId),
      { label: "", separator: true },
      { label: "Create token copy", icon: "⧉", onClick: () => g.cloneInstance(instanceId) },
      {
        label: inst.isToken ? "Remove token" : "Delete card from game",
        icon: "🗑",
        danger: true,
        onClick: () => g.removeInstance(instanceId),
      },
    );
  } else if (inst.zone === "hand") {
    items.push(
      { label: "Play to battlefield", icon: "▶", onClick: () => g.moveCard(instanceId, "battlefield") },
      {
        label: "Play face down",
        icon: "🂠",
        onClick: () => {
          g.moveCard(instanceId, "battlefield");
          g.setFaceDown(instanceId, true);
        },
      },
      { label: "", separator: true },
      { label: "Move to", icon: "→", children: moveToSubmenu(instanceId, "hand", isCommander) },
    );
  } else if (inst.zone === "command") {
    const tax = (g.players[inst.ownerId]?.commanderTax[inst.oracleId] ?? 0) * 2;
    items.push(
      {
        label: `Cast commander${tax > 0 ? ` (+${tax} tax)` : ""}`,
        icon: "♛",
        onClick: () => g.moveCard(instanceId, "battlefield"),
      },
      { label: "Move to", icon: "→", children: moveToSubmenu(instanceId, "command", isCommander) },
    );
  } else {
    // graveyard / exile / library cards (from browse modals or pile tops)
    items.push({
      label: "Move to",
      icon: "→",
      children: moveToSubmenu(instanceId, inst.zone, isCommander),
    });
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
    { label: "Tap all", icon: "⤵", onClick: () => g.tapAll(playerId) },
    {
      label: "Untap all",
      icon: "⤴",
      hint: mine ? "U" : undefined,
      onClick: () => g.untapAll(playerId),
    },
    { label: "", separator: true },
  ];

  if (mine) {
    items.push({
      label: "Next turn (untap + draw)",
      icon: "▸",
      hint: "N",
      onClick: () => g.nextTurn(),
    });
  }

  items.push(
    { label: "Proliferate all counters", icon: "✚", onClick: () => g.proliferate(playerId) },
    { label: "", separator: true },
    {
      label: "Add token / search Scryfall",
      icon: "⧉",
      hint: mine ? "T" : undefined,
      onClick: () => ui.openModal({ kind: "token", playerId }),
    },
  );

  if (mine) {
    items.push(
      { label: "", separator: true },
      {
        label: `Select all (${battlefieldIds.length})`,
        icon: "▭",
        disabled: battlefieldIds.length === 0,
        onClick: () => ui.setSelected(battlefieldIds),
      },
      {
        label: "Clear selection",
        icon: "✕",
        disabled: ui.selected.length === 0,
        onClick: () => ui.clearSelected(),
      },
    );
  }

  items.push(
    { label: "", separator: true },
    {
      label: "Undo action",
      icon: "↺",
      hint: "Z",
      disabled: g.history.length === 0,
      onClick: () => g.undo(),
    },
  );

  return items;
}
