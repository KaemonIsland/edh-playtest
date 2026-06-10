"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { Zone } from "@/types";
import { useGameStore } from "@/lib/game/store";
import { useUiStore } from "@/lib/game/uiStore";
import { loadKeybinds, type KeybindMap } from "@/lib/game/keybinds";
import { CardImage } from "@/components/cards/CardImage";
import { HoverPreview } from "@/components/cards/HoverPreview";
import { Battlefield } from "./Battlefield";
import { HandFan } from "./HandFan";
import { ZonePiles } from "./ZonePiles";
import { TopBar } from "./TopBar";
import { BottomBar } from "./BottomBar";
import { ContextMenu } from "./ContextMenu";
import { ActionLog } from "./ActionLog";
import { LibraryBrowser } from "./modals/LibraryBrowser";
import { ScryModal } from "./modals/ScryModal";
import { TokenModal } from "./modals/TokenModal";
import { DicePanel } from "./modals/DicePanel";
import { KeybindsPanel } from "./modals/KeybindsPanel";
import { SnapshotsPanel } from "./modals/SnapshotsPanel";
import { SettingsPanel } from "./modals/SettingsPanel";

const DROP_ZONES: Zone[] = ["battlefield", "hand", "library", "graveyard", "exile", "command"];
const GRID = 20;

export function PlaytesterRoot() {
  const g = useGameStore();
  const ui = useUiStore();
  const [activeDrag, setActiveDrag] = useState<string | null>(null);
  const [keybinds, setKeybinds] = useState<KeybindMap | null>(null);

  useEffect(() => {
    setKeybinds(loadKeybinds());
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  const onDragStart = (e: DragStartEvent) => {
    setActiveDrag(String(e.active.id));
    ui.setDragging(true);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveDrag(null);
    ui.setDragging(false);
    const instanceId = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId || !DROP_ZONES.includes(overId as Zone)) return;
    const zone = overId as Zone;
    const inst = g.instances[instanceId];
    if (!inst) return;

    if (zone === "battlefield") {
      const surface = document.getElementById("battlefield-surface");
      const w = g.prefs.cardSize;
      const h = Math.round(w * 1.4);
      const snap = (v: number) => (g.prefs.snapToGrid ? Math.round(v / GRID) * GRID : v);
      const translated = e.active.rect.current.translated;
      let position: { x: number; y: number } | undefined;
      if (surface && translated) {
        const rect = surface.getBoundingClientRect();
        position = {
          x: Math.max(0, Math.min(snap(translated.left - rect.left), rect.width - w)),
          y: Math.max(0, Math.min(snap(translated.top - rect.top), rect.height - h)),
        };
      }
      if (inst.zone === "battlefield") {
        const selection = useUiStore.getState().selected;
        if (surface && selection.length > 1 && selection.includes(instanceId)) {
          // Group move: shift every selected card by the drag delta.
          const rect = surface.getBoundingClientRect();
          const updates: Record<string, { x: number; y: number }> = {};
          for (const id of selection) {
            const el = surface.querySelector<HTMLElement>(`[data-instance-id="${CSS.escape(id)}"]`);
            if (!el) continue;
            updates[id] = {
              x: Math.max(0, Math.min(snap(el.offsetLeft + e.delta.x), rect.width - w)),
              y: Math.max(0, Math.min(snap(el.offsetTop + e.delta.y), rect.height - h)),
            };
          }
          g.setPositions(updates);
        } else if (position) {
          g.setPosition(instanceId, position);
        }
      } else {
        g.moveCard(instanceId, "battlefield", { position });
      }
      return;
    }

    if (inst.zone === zone) return;
    g.moveCard(instanceId, zone, zone === "library" ? { libraryPlacement: "top" } : undefined);
  };

  // Global keybinds
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (!keybinds) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (useUiStore.getState().modal.kind !== "none") return;

      const key = e.key.toLowerCase();
      const ui = useUiStore.getState();
      const game = useGameStore.getState();
      const fire = (fn: () => void) => {
        e.preventDefault();
        fn();
      };

      if (key === keybinds.draw) fire(() => game.draw(1));
      else if (key === keybinds.untapAll) fire(() => game.untapAll());
      else if (key === keybinds.nextTurn) fire(() => game.nextTurn());
      else if (key === keybinds.nextPhase) fire(() => game.nextPhase());
      else if (key === keybinds.undo) fire(() => game.undo());
      else if (key === keybinds.redo) fire(() => game.redo());
      else if (key === keybinds.shuffle) fire(() => game.shuffleLibrary());
      else if (key === keybinds.searchLibrary)
        fire(() =>
          ui.openModal({ kind: "browse", zone: "library", title: "Library", shuffleAfter: true }),
        );
      else if (key === keybinds.scry) fire(() => ui.openModal({ kind: "scry", count: 1, surveil: false }));
      else if (key === keybinds.mill) fire(() => game.mill(1));
      else if (key === keybinds.tokenModal) fire(() => ui.openModal({ kind: "token" }));
      else if (key === keybinds.dice) fire(() => ui.openModal({ kind: "dice" }));
      else if (key === keybinds.toggleLog) fire(() => ui.setLogOpen(!ui.logOpen));
      else if (key === keybinds.keybindsHelp) fire(() => ui.openModal({ kind: "keybinds" }));
    },
    [keybinds],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  const dragInst = activeDrag ? g.instances[activeDrag] : undefined;

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex h-dvh flex-col bg-[#08080a] text-stone-100 select-none">
        <TopBar />

        <main className="relative flex min-h-0 flex-1 gap-2 p-2">
          <div className="relative min-w-0 flex-1 pb-32">
            <Battlefield />
            <ActionLog />
            <HandFan />
          </div>
          <ZonePiles />
        </main>

        <div className="px-3 pb-0.5 text-center text-[9px] text-stone-600">
          Card data and images provided by Scryfall. Not affiliated with Wizards of the Coast.
        </div>
        <BottomBar />
      </div>

      <HoverPreview />
      <ContextMenu />

      <DragOverlay dropAnimation={null}>
        {dragInst && (
          <CardImage
            card={g.cards[dragInst.cardId]}
            tokenSpec={dragInst.tokenSpec}
            flipped={dragInst.flipped}
            faceDown={dragInst.faceDown && dragInst.zone !== "hand"}
            className="rotate-3 shadow-2xl shadow-black"
            style={{ width: g.prefs.cardSize, height: Math.round(g.prefs.cardSize * 1.4) }}
          />
        )}
      </DragOverlay>

      {ui.modal.kind === "browse" && (
        <LibraryBrowser
          zone={ui.modal.zone}
          title={ui.modal.title}
          shuffleAfter={ui.modal.shuffleAfter}
        />
      )}
      {ui.modal.kind === "scry" && <ScryModal count={ui.modal.count} surveil={ui.modal.surveil} />}
      {ui.modal.kind === "token" && <TokenModal />}
      {ui.modal.kind === "dice" && <DicePanel />}
      {ui.modal.kind === "keybinds" && <KeybindsPanel onChange={setKeybinds} />}
      {ui.modal.kind === "snapshots" && <SnapshotsPanel />}
      {ui.modal.kind === "settings" && <SettingsPanel />}
    </DndContext>
  );
}
