"use client";

import { useDroppable } from "@dnd-kit/core";
import type { Zone } from "@/types";
import { isLand } from "@/types";
import { useGameStore } from "@/lib/game/store";
import { useBotStore } from "@/lib/game/botStore";
import { useUiStore, type MenuItem } from "@/lib/game/uiStore";
import { CardImage } from "@/components/cards/CardImage";
import { BattlefieldCard } from "./BattlefieldCard";

/** Small face-down pile / count for one of the bot's zones. */
function BotPile({
  playerId,
  zone,
  label,
  topVisible,
}: {
  playerId: string;
  zone: Zone;
  label: string;
  topVisible: boolean;
}) {
  const g = useGameStore();
  const openModal = useUiStore((s) => s.openModal);
  const openMenu = useUiStore((s) => s.openMenu);
  const setPreview = useUiStore((s) => s.setPreview);
  const { setNodeRef, isOver } = useDroppable({ id: `${playerId}:${zone}` });

  const ids = g.zoneOrder[playerId]?.[zone] ?? [];
  const topId = zone === "graveyard" || zone === "exile" ? ids[ids.length - 1] : ids[0];
  const topInst = topId ? g.instances[topId] : undefined;

  const menu = (): MenuItem[] => {
    const items: MenuItem[] = [
      {
        label: `Browse opponent ${label.toLowerCase()}`,
        onClick: () =>
          openModal({
            kind: "browse",
            zone,
            title: `Opponent ${label.toLowerCase()}`,
            shuffleAfter: zone === "library",
            playerId,
          }),
      },
    ];
    if (zone === "library") {
      items.push(
        { label: "Bot draws 1", onClick: () => g.draw(1, playerId) },
        { label: "Shuffle bot library", onClick: () => g.shuffleLibrary(playerId) },
      );
    }
    if (zone === "hand") {
      items[0] = {
        label: "Reveal opponent hand (manual override)",
        onClick: () =>
          openModal({
            kind: "browse",
            zone: "hand",
            title: "Opponent hand",
            shuffleAfter: false,
            playerId,
          }),
      };
    }
    return items;
  };

  return (
    <div
      ref={setNodeRef}
      className={`relative flex flex-col items-center rounded-md border px-1.5 py-1 transition-colors ${
        isOver ? "border-emerald-600/70 bg-emerald-950/30" : "border-stone-800 bg-stone-900/50"
      }`}
      onContextMenu={(e) => {
        e.preventDefault();
        openMenu(e.clientX, e.clientY, menu());
      }}
    >
      <span className="text-[9px] tracking-wide text-stone-500 uppercase">{label}</span>
      <button
        className="relative"
        onClick={(e) => openMenu(e.clientX, e.clientY, menu())}
        onMouseEnter={() => {
          if (topVisible && topInst)
            setPreview({
              card: g.cards[topInst.cardId],
              tokenSpec: topInst.tokenSpec,
              flipped: topInst.flipped,
            });
        }}
        onMouseLeave={() => setPreview(null)}
      >
        {ids.length === 0 ? (
          <div className="flex h-[50px] w-[36px] items-center justify-center rounded border border-dashed border-stone-700 text-[8px] text-stone-600">
            —
          </div>
        ) : (
          <CardImage
            card={topVisible ? g.cards[topInst?.cardId ?? ""] : undefined}
            tokenSpec={topVisible ? topInst?.tokenSpec : undefined}
            flipped={topVisible ? (topInst?.flipped ?? 0) : 0}
            faceDown={!topVisible}
            className="h-[50px] w-[36px]"
          />
        )}
        <span className="absolute -right-1 -bottom-1 rounded-full bg-stone-700 px-1 text-[9px] font-bold text-stone-100">
          {ids.length}
        </span>
      </button>
    </div>
  );
}

/** Battlefield summary shown when the board is collapsed: lands / spells / creatures. */
function FieldSummary({ playerId }: { playerId: string }) {
  const g = useGameStore();
  let lands = 0;
  let nonlands = 0;
  let creatures = 0;
  for (const id of g.zoneOrder[playerId]?.battlefield ?? []) {
    const inst = g.instances[id];
    if (!inst) continue;
    const tl = inst.tokenSpec?.typeLine ?? g.cards[inst.cardId]?.type_line ?? "";
    if (isLand(tl)) lands++;
    else nonlands++;
    if (/\bCreature\b/.test(tl)) creatures++;
  }
  return (
    <span className="flex shrink-0 items-center gap-2 rounded bg-stone-900 px-2 py-1 text-[10px] text-stone-400">
      <span title="Lands on the battlefield">⛰ {lands}</span>
      <span title="Nonland permanents">⬡ {nonlands}</span>
      <span title="Creatures">🐾 {creatures}</span>
    </span>
  );
}

export function OpponentBoard({ side = false }: { side?: boolean }) {
  const g = useGameStore();
  const bot = useBotStore();
  const openMenu = useUiStore((s) => s.openMenu);
  const viewedOpponent = useUiStore((s) => s.viewedOpponent);
  const collapsed = useUiStore((s) => s.opponentCollapsed) && !side;
  const setOpponentCollapsed = useUiStore((s) => s.setOpponentCollapsed);

  const viewedId =
    viewedOpponent && g.players[viewedOpponent] ? viewedOpponent : (g.playerOrder.find((p) => p !== "you") ?? null);
  const { setNodeRef, isOver } = useDroppable({
    id: `${viewedId ?? "bot1"}:battlefield`,
    disabled: !viewedId || collapsed,
  });

  if (!viewedId) return null;
  const player = g.players[viewedId];
  if (!player) return null;
  const ids = g.zoneOrder[viewedId]?.battlefield ?? [];
  const isActing = bot.botId === viewedId && bot.phase !== "inactive";
  const botTurnRunning = bot.phase !== "inactive";

  const optionsMenu = (): MenuItem[] => [
    {
      label: `Auto-play turns: ${bot.autoPlay ? "on" : "off"}`,
      onClick: () => bot.setAutoPlay(!bot.autoPlay),
    },
    {
      label: `One spell per turn: ${bot.oneSpellPerTurn ? "on" : "off"}`,
      onClick: () => bot.setOneSpellPerTurn(!bot.oneSpellPerTurn),
    },
    {
      label: `Attack with all able: ${bot.attackWithAll ? "on" : "off"}`,
      onClick: () => bot.setAttackWithAll(!bot.attackWithAll),
    },
  ];

  return (
    <div
      className={`flex flex-col rounded-lg border border-rose-900/40 bg-[#0d0b0c] ${
        side ? "h-full" : collapsed ? "mb-2" : "mb-2 h-[34%] min-h-[180px]"
      }`}
    >
      {/* Opponent header: identity, trackers, hand, piles, bot controls */}
      <div
        className={`flex items-center gap-2 overflow-x-auto px-2 py-1 ${
          collapsed ? "" : "border-b border-stone-800/80"
        }`}
      >
        <button
          onClick={() => setOpponentCollapsed(!collapsed)}
          disabled={side}
          className="shrink-0 rounded px-1 text-stone-500 hover:bg-stone-800 hover:text-stone-200 disabled:opacity-30"
          title={collapsed ? "Expand opponent battlefield" : "Collapse opponent battlefield"}
        >
          {collapsed ? "▸" : "▾"}
        </button>
        <span className="max-w-40 shrink-0 truncate text-xs font-bold text-rose-300/90" title={player.name}>
          🤖 {player.name}
        </span>
        {g.activePlayerId === viewedId && (
          <span className="shrink-0 rounded-full bg-rose-700 px-2 py-0.5 text-[9px] font-bold text-white uppercase">
            their turn
          </span>
        )}

        <span className="flex shrink-0 items-center gap-0.5 rounded bg-stone-900 px-1.5 py-0.5 text-xs">
          <button onClick={() => g.addLife(viewedId, -1)} className="px-1 text-stone-400 hover:text-white">−</button>
          <span className={`min-w-6 text-center font-bold ${player.life <= 10 ? "text-red-400" : "text-emerald-300"}`}>
            ❤ {player.life}
          </span>
          <button onClick={() => g.addLife(viewedId, 1)} className="px-1 text-stone-400 hover:text-white">+</button>
        </span>
        <span className="flex shrink-0 items-center gap-0.5 rounded bg-stone-900 px-1.5 py-0.5 text-xs">
          <button onClick={() => g.addTracker(viewedId, "poison", -1)} className="px-1 text-stone-400 hover:text-white">−</button>
          <span className="min-w-4 text-center font-bold text-fuchsia-300">☠ {player.poison}</span>
          <button onClick={() => g.addTracker(viewedId, "poison", 1)} className="px-1 text-stone-400 hover:text-white">+</button>
        </span>

        <div className="flex shrink-0 items-center gap-1.5">
          <BotPile playerId={viewedId} zone="hand" label="Hand" topVisible={false} />
          <BotPile playerId={viewedId} zone="library" label="Library" topVisible={false} />
          <BotPile playerId={viewedId} zone="graveyard" label="Grave" topVisible={true} />
          <BotPile playerId={viewedId} zone="exile" label="Exile" topVisible={true} />
          <BotPile playerId={viewedId} zone="command" label="Cmd" topVisible={true} />
        </div>

        {collapsed && <FieldSummary playerId={viewedId} />}

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {botTurnRunning && !isActing && (
            <span className="text-[10px] text-stone-500">
              {g.players[bot.botId ?? ""]?.name ?? "Another bot"} is acting…
            </span>
          )}
          {isActing && (
            <>
              <span className="rounded-full bg-rose-900/70 px-2 py-0.5 text-[10px] font-bold text-rose-200">
                {bot.phaseLabel()}
              </span>
              <button
                onClick={() => bot.step()}
                disabled={!!bot.pending}
                className="rounded-md bg-rose-800 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-rose-700 disabled:opacity-40"
                title={bot.pending ? "Resolve the prompt first" : "Advance one bot phase"}
              >
                Step ▸
              </button>
              <button
                onClick={() => bot.endTurnNow()}
                className="rounded-md bg-stone-800 px-2 py-1 text-[11px] font-semibold text-stone-300 hover:bg-stone-700"
              >
                End turn
              </button>
            </>
          )}
          <button
            onClick={() => bot.setAutoPlay(!bot.autoPlay)}
            className={`rounded-md px-2 py-1 text-[11px] font-semibold transition ${
              bot.autoPlay ? "bg-emerald-700 text-white" : "bg-stone-800 text-stone-400 hover:bg-stone-700"
            }`}
            title="Auto-play bot phases (still pauses when a bot needs you)"
          >
            Auto
          </button>
          <button
            onClick={(e) => openMenu(e.clientX, e.clientY, optionsMenu())}
            className="rounded px-1.5 py-1 text-stone-500 hover:bg-stone-800 hover:text-stone-200"
            title="Bot options"
          >
            ⋮
          </button>
        </div>
      </div>

      {/* Opponent battlefield (hidden when collapsed) */}
      {!collapsed && (
        <div
          id={`surface-${viewedId}`}
          ref={setNodeRef}
          className={`relative min-h-0 flex-1 overflow-auto transition-colors ${
            isOver ? "bg-stone-950/80" : ""
          }`}
        >
          {ids.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-stone-700 select-none">
              {player.name}'s battlefield
            </div>
          )}
          {ids.map((id, i) => {
            const inst = g.instances[id];
            if (!inst || inst.attachedTo) return null;
            return (
              <BattlefieldCard
                key={id}
                inst={inst}
                card={g.cards[inst.cardId]}
                fallbackIndex={i}
                sick={
                  inst.enteredOnTurn === g.turn &&
                  /\bCreature\b/.test(
                    inst.tokenSpec?.typeLine ?? g.cards[inst.cardId]?.type_line ?? "",
                  )
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
