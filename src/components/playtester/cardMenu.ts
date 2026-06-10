"use client";

import { PLAYER_ID, useGameStore } from "@/lib/game/store";
import { useUiStore, type MenuItem } from "@/lib/game/uiStore";
import type { Zone } from "@/types";

/** Build the right-click menu for a card instance, based on its zone. */
export function buildCardMenu(instanceId: string): MenuItem[] {
  const g = useGameStore.getState();
  const ui = useUiStore.getState();
  const inst = g.instances[instanceId];
  if (!inst) return [];
  const card = g.cards[inst.cardId];
  const isCommander = g.players[PLAYER_ID]?.commanderOracleIds.includes(inst.oracleId) ?? false;
  const hasFaces = (card?.card_faces?.length ?? 0) > 1;

  const move = (to: Zone, label: string, opts?: Parameters<typeof g.moveCard>[2]): MenuItem => ({
    label,
    onClick: () => g.moveCard(instanceId, to, opts),
  });

  const items: MenuItem[] = [];

  if (inst.zone === "battlefield") {
    items.push(
      { label: inst.tapped ? "Untap" : "Tap", onClick: () => g.toggleTap(instanceId) },
      { label: "+1/+1 counter", onClick: () => g.addCounterOnCard(instanceId, "+1/+1", 1) },
      { label: "−1/−1 counter", onClick: () => g.addCounterOnCard(instanceId, "-1/-1", 1) },
      {
        label: "Add counter…",
        onClick: () => {
          const name = window.prompt("Counter name (e.g. charge, loyalty):");
          if (name?.trim()) g.addCounterOnCard(instanceId, name.trim(), 1);
        },
      },
    );
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
    items.push(
      { label: "Create token copy", onClick: () => g.cloneInstance(instanceId) },
      { label: "", separator: true },
      move("hand", "To hand"),
      move("graveyard", "To graveyard"),
      move("exile", "To exile"),
      move("library", "To library (top)", { libraryPlacement: "top" }),
      move("library", "To library (bottom)", { libraryPlacement: "bottom" }),
      move("library", "Shuffle into library", { libraryPlacement: "shuffle" }),
    );
    if (isCommander) items.push(move("command", "To command zone"));
    if (inst.isToken) {
      items.push({ label: "Remove token", danger: true, onClick: () => g.removeInstance(instanceId) });
    }
  } else if (inst.zone === "hand") {
    items.push(
      move("battlefield", "Play to battlefield"),
      {
        label: "Play face down",
        onClick: () => {
          g.moveCard(instanceId, "battlefield");
          g.setFaceDown(instanceId, true);
        },
      },
      { label: "", separator: true },
      move("graveyard", "Discard"),
      move("exile", "Exile"),
      move("library", "To library (top)", { libraryPlacement: "top" }),
      move("library", "To library (bottom)", { libraryPlacement: "bottom" }),
      move("library", "Shuffle into library", { libraryPlacement: "shuffle" }),
    );
    if (isCommander) items.push(move("command", "To command zone"));
  } else if (inst.zone === "command") {
    const tax = (g.players[PLAYER_ID]?.commanderTax[inst.oracleId] ?? 0) * 2;
    items.push(
      {
        label: `Cast commander${tax > 0 ? ` (+${tax} tax)` : ""}`,
        onClick: () => g.moveCard(instanceId, "battlefield"),
      },
      move("hand", "To hand"),
      move("library", "Shuffle into library", { libraryPlacement: "shuffle" }),
    );
  } else {
    // graveyard / exile / library cards (from browse modals)
    items.push(
      move("hand", "To hand"),
      move("battlefield", "To battlefield"),
      move("graveyard", "To graveyard"),
      move("exile", "To exile"),
      move("library", "To library (top)", { libraryPlacement: "top" }),
      move("library", "To library (bottom)", { libraryPlacement: "bottom" }),
      move("library", "Shuffle into library", { libraryPlacement: "shuffle" }),
    );
    if (isCommander) items.push(move("command", "To command zone"));
  }

  return items.filter((i) => i.separator || i.label);
}
