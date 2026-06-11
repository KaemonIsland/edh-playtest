"use client";

import { create } from "zustand";
import { isBotId, PLAYER_ID, useGameStore } from "./store";
import { useUiStore } from "./uiStore";
import {
  chooseLand,
  chooseSpell,
  describeSources,
  eligibleAttackers,
  findCastableSpells,
} from "./bot";

/**
 * Bot turns as an explicit finite state machine with pause-for-human
 * hand-offs. Default is step-through (one phase per click); auto-play runs
 * the same steps on a timer but still stops at every "bot needs you" prompt.
 * With multiple opponents, turns chain: you → bot1 → bot2 → … → you.
 */

export type BotPhase = "inactive" | "land" | "cast" | "combat" | "end";

export type BotPrompt =
  | {
      kind: "resolve-spell";
      botId: string;
      instanceId: string;
      cardName: string;
      isPermanent: boolean;
      message: string;
    }
  | { kind: "attackers"; botId: string; instanceIds: string[]; message: string };

const PHASE_LABEL: Record<BotPhase, string> = {
  inactive: "Waiting",
  land: "Land phase",
  cast: "Cast phase",
  combat: "Combat",
  end: "Ending turn",
};

interface BotStore {
  /** The bot currently taking its turn (null when it's the human's turn). */
  botId: string | null;
  phase: BotPhase;
  autoPlay: boolean;
  oneSpellPerTurn: boolean;
  attackWithAll: boolean;
  pending: BotPrompt | null;
  playedLand: boolean;
  castsThisTurn: number;

  phaseLabel: () => string;
  /** Hand the turn to a bot (untap + draw, then land phase). */
  beginTurn: (botId: string) => void;
  /** Pass the turn from the human to the first bot in player order. */
  passTurn: () => void;
  /** Advance one FSM step. No-op while a prompt is pending. */
  step: () => void;
  /** Human finished the current hand-off. */
  resolvePending: () => void;
  /** Clear the prompt without side effects (the human handles it manually). */
  dismissPending: () => void;
  /** End the current bot's turn immediately and pass to the next player. */
  endTurnNow: () => void;
  setAutoPlay: (v: boolean) => void;
  setOneSpellPerTurn: (v: boolean) => void;
  setAttackWithAll: (v: boolean) => void;
  reset: () => void;
}

let autoTimer: ReturnType<typeof setTimeout> | null = null;

function clearAutoTimer() {
  if (autoTimer) {
    clearTimeout(autoTimer);
    autoTimer = null;
  }
}

/** Who plays after `playerId` in table order. */
function nextPlayerAfter(playerId: string): string {
  const order = useGameStore.getState().playerOrder;
  const idx = order.indexOf(playerId);
  return order[(idx + 1) % order.length] ?? PLAYER_ID;
}

function botName(botId: string): string {
  return useGameStore.getState().players[botId]?.name ?? "Opponent";
}

export const useBotStore = create<BotStore>((set, get) => {
  function scheduleAuto() {
    clearAutoTimer();
    const { autoPlay, phase, pending } = get();
    if (autoPlay && phase !== "inactive" && !pending) {
      autoTimer = setTimeout(() => get().step(), 700);
    }
  }

  /** Start `botId`'s turn (used for both human hand-off and bot→bot chains). */
  function startBotTurn(botId: string) {
    const g = useGameStore.getState();
    g.beginPlayerTurn(botId, true);
    // Show the acting opponent's board automatically.
    useUiStore.getState().setViewedOpponent(botId);
    set({ botId, phase: "land", pending: null, playedLand: false, castsThisTurn: 0 });
    scheduleAuto();
  }

  /** Pass to whoever follows `after` — chains to the next bot or back to you. */
  function passToNext(after: string) {
    const g = useGameStore.getState();
    const next = nextPlayerAfter(after);
    if (isBotId(next)) {
      startBotTurn(next);
    } else {
      g.beginPlayerTurn(PLAYER_ID, g.prefs.drawOnTurn);
      set({ botId: null, phase: "inactive", pending: null });
    }
  }

  return {
    botId: null,
    phase: "inactive",
    autoPlay: false,
    oneSpellPerTurn: false,
    attackWithAll: true,
    pending: null,
    playedLand: false,
    castsThisTurn: 0,

    phaseLabel: () => PHASE_LABEL[get().phase],

    beginTurn: (botId) => {
      const g = useGameStore.getState();
      if (!g.players[botId] || g.activePlayerId === botId) return;
      startBotTurn(botId);
    },

    passTurn: () => {
      const g = useGameStore.getState();
      if (g.activePlayerId !== PLAYER_ID) return;
      passToNext(PLAYER_ID);
    },

    step: () => {
      const bot = get();
      const botId = bot.botId;
      if (bot.pending || bot.phase === "inactive" || !botId) return;
      const g = useGameStore.getState();
      const core = g; // GameCore fields live on the store itself
      const name = botName(botId);

      switch (bot.phase) {
        case "land": {
          if (!bot.playedLand) {
            const choice = chooseLand(core, g.cards, botId);
            if (choice) {
              g.moveCard(choice.instanceId, "battlefield", { silent: true });
              if (choice.entersTapped) g.tapCards([choice.instanceId], "enters tapped");
              g.logBot(
                `${name} played a land: ${choice.card.name}${choice.entersTapped ? " (tapped)" : ""}.`,
                choice.addsMissingColor
                  ? "Chosen because it adds a color the bot didn't have."
                  : "No land added a missing color; picked the best available.",
              );
            } else {
              g.logBot(`${name} has no land to play.`);
            }
          }
          set({ phase: "cast", playedLand: true });
          break;
        }

        case "cast": {
          if (bot.oneSpellPerTurn && bot.castsThisTurn >= 1) {
            g.logBot(`${name} stops casting (one-spell-per-turn is on).`);
            set({ phase: "combat" });
            break;
          }
          const { castable, sources } = findCastableSpells(core, g.cards, botId);
          const pick = chooseSpell(castable);
          if (!pick) {
            g.logBot(
              `${name} has nothing it can cast.`,
              `Counted ${describeSources(sources)}. Heuristic ignores nonland mana, cost reduction, alternative costs and X spells — use manual override if it missed something.`,
            );
            set({ phase: "combat" });
            break;
          }
          g.tapCards(pick.payment, `paying for ${pick.card.name}`);
          if (pick.isPermanent) {
            g.moveCard(pick.instanceId, "battlefield", { silent: true });
          } else {
            g.moveCard(pick.instanceId, "stack", { silent: true });
          }
          g.logBot(
            `${name} casts ${pick.card.name}${pick.fromCommandZone ? " from the command zone" : ""} (CMC ${pick.cmc}).`,
            `Counted ${describeSources(sources)}; considered ${castable.length} castable spell${castable.length === 1 ? "" : "s"}: ${castable
              .map((c) => `${c.card.name} (${c.cmc})`)
              .join(", ")}. Picked highest CMC.`,
          );
          set({
            castsThisTurn: bot.castsThisTurn + 1,
            pending: {
              kind: "resolve-spell",
              botId,
              instanceId: pick.instanceId,
              cardName: pick.card.name,
              isPermanent: pick.isPermanent,
              message: pick.isPermanent
                ? `${name} cast ${pick.card.name} — resolve any ETB effects, then continue.`
                : `${name} is casting ${pick.card.name} — resolve its effects. It goes to the graveyard when you continue.`,
            },
          });
          break;
        }

        case "combat": {
          const attackers = bot.attackWithAll ? eligibleAttackers(core, g.cards, botId) : [];
          if (attackers.length === 0) {
            g.logBot(
              bot.attackWithAll
                ? `${name} has no creatures able to attack.`
                : `${name} holds back (attack-with-all is off).`,
            );
            set({ phase: "end" });
            break;
          }
          const ids = attackers.map((a) => a.instanceId);
          g.tapCards(ids, "attacking");
          const names = attackers
            .map((a) => a.tokenSpec?.name ?? g.cards[a.cardId]?.name ?? "creature")
            .join(", ");
          g.logBot(`${name} attacks with ${attackers.length}: ${names}.`);
          set({
            phase: "end",
            pending: {
              kind: "attackers",
              botId,
              instanceIds: ids,
              message: `${name} attacks with ${names}. Declare blocks and apply combat damage / life changes, then continue. (In a pod, decide who they're attacking.)`,
            },
          });
          break;
        }

        case "end": {
          g.logBot(`${name} passes the turn.`);
          passToNext(botId);
          break;
        }
      }
      scheduleAuto();
    },

    resolvePending: () => {
      const { pending } = get();
      if (!pending) return;
      const g = useGameStore.getState();
      if (pending.kind === "resolve-spell" && !pending.isPermanent) {
        // Instant/sorcery finished resolving: stack → graveyard.
        if (g.instances[pending.instanceId]?.zone === "stack") {
          g.moveCard(pending.instanceId, "graveyard", { silent: true });
        }
      }
      set({ pending: null });
      scheduleAuto();
    },

    dismissPending: () => {
      const g = useGameStore.getState();
      g.logBot("Player chose to handle the hand-off manually.");
      set({ pending: null });
      scheduleAuto();
    },

    endTurnNow: () => {
      const g = useGameStore.getState();
      const { botId, phase } = get();
      clearAutoTimer();
      if (phase !== "inactive" && botId) {
        g.logBot(`${botName(botId)}'s turn ended early by the player.`);
        passToNext(botId);
      }
    },

    setAutoPlay: (autoPlay) => {
      set({ autoPlay });
      scheduleAuto();
    },
    setOneSpellPerTurn: (oneSpellPerTurn) => set({ oneSpellPerTurn }),
    setAttackWithAll: (attackWithAll) => set({ attackWithAll }),

    reset: () => {
      clearAutoTimer();
      set({ botId: null, phase: "inactive", pending: null, playedLand: false, castsThisTurn: 0 });
    },
  };
});
