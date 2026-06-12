"use client";

import { create } from "zustand";
import type {
  CardInstance,
  Deck,
  GameCore,
  LogEvent,
  ManaColor,
  Phase,
  PlayerState,
  ScryCard,
  TokenSpec,
  Zone,
} from "@/types";
import { ALL_ZONES, PHASES, includedEntries, isCreature, isLand } from "@/types";
import { uid } from "./ids";
import { shuffled } from "./shuffle";

export const PLAYER_ID = "you";
/** Bot player ids are bot1..bot3. Kept for single-bot call sites. */
export const BOT_ID = "bot1";
export const MAX_OPPONENTS = 3;
const HISTORY_LIMIT = 200;

export function isBotId(playerId: string): boolean {
  return playerId !== PLAYER_ID;
}

/** Who controls a card right now (theft-aware). */
export function controllerOf(inst: CardInstance): string {
  return inst.controllerId ?? inst.ownerId;
}

export type LibraryPlacement = "top" | "bottom" | "shuffle";

export interface MoveOptions {
  position?: { x: number; y: number };
  libraryPlacement?: LibraryPlacement;
  /** Insert index for ordered zones (library top = 0). */
  index?: number;
  silent?: boolean;
  /** Battlefield only: who gains control (card theft). Defaults to the owner. */
  controllerId?: string;
}

export type LayoutMode = "stacked" | "side-left" | "side-right";

interface UiPrefs {
  drawOnTurn: boolean;
  snapToGrid: boolean;
  showPhaseStepper: boolean;
  /** Card width in px (height is width × 1.4). Accessibility sizing. */
  cardSize: number;
  /** Opponent board placement: stacked on top, or beside (ultra-wide). */
  layoutMode: LayoutMode;
}

const PREFS_KEY = "edh-playtest:prefs";
const DEFAULT_PREFS: UiPrefs = {
  drawOnTurn: true,
  snapToGrid: false,
  showPhaseStepper: false,
  cardSize: 100,
  layoutMode: "stacked",
};

function loadPrefs(): UiPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<UiPrefs>) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export interface GameStore extends GameCore {
  /** Static card data, keyed by Scryfall print id. Not part of undo history. */
  cards: Record<string, ScryCard>;
  deck: Deck | null;
  /** Opponent decks (up to MAX_OPPONENTS) — startGame creates bot1..botN. */
  botDecks: Deck[];
  started: boolean;
  history: GameCore[];
  future: GameCore[];
  prefs: UiPrefs;

  // lifecycle
  loadDeck: (deck: Deck) => void;
  loadBotDecks: (decks: Deck[]) => void;
  startGame: () => void;
  mulligan: () => void;
  /** Finish a London mulligan: bottom the given hand cards. */
  bottomCards: (instanceIds: string[]) => void;
  resetGame: () => void;

  // undo/redo
  undo: () => void;
  redo: () => void;

  // card movement & state
  moveCard: (instanceId: string, to: Zone, opts?: MoveOptions) => void;
  setPosition: (instanceId: string, pos: { x: number; y: number }) => void;
  /** Move several battlefield cards at once (one undo step). */
  setPositions: (updates: Record<string, { x: number; y: number }>) => void;
  toggleTap: (instanceId: string) => void;
  /** Tap/untap a selection together: all end up opposite the reference card. */
  toggleTapMany: (instanceIds: string[], referenceId: string) => void;
  /** Tap specific cards in one undo step (bot mana payments, attacks). */
  tapCards: (instanceIds: string[], reason?: string) => void;
  untapAll: (playerId?: string) => void;
  setFaceDown: (instanceId: string, faceDown: boolean) => void;
  flipFace: (instanceId: string) => void;
  addCounterOnCard: (instanceId: string, name: string, delta: number) => void;
  tapAll: (playerId?: string) => void;
  /** Add one of every counter already on a player's permanents (and their poison/energy/experience). */
  proliferate: (playerId?: string) => void;
  attach: (instanceId: string, hostId: string) => void;
  unattach: (instanceId: string) => void;
  createToken: (spec: TokenSpec, count?: number, playerId?: string) => void;
  createTokenFromCard: (card: ScryCard, count?: number, playerId?: string) => void;
  cloneInstance: (instanceId: string) => void;
  removeInstance: (instanceId: string) => void;

  // library
  draw: (n?: number, playerId?: string) => void;
  mill: (n: number) => void;
  shuffleLibrary: (playerId?: string) => void;
  revealTop: () => void;
  /** Reorder the top N of the library (scry/surveil result). */
  resolveTopCards: (
    toTop: string[],
    toBottom: string[],
    toGraveyard: string[],
  ) => void;
  tutorToHand: (instanceId: string) => void;

  // players / trackers
  setLife: (playerId: string, value: number) => void;
  addLife: (playerId: string, delta: number) => void;
  addTracker: (
    playerId: string,
    tracker: "poison" | "energy" | "experience",
    delta: number,
  ) => void;
  addPlayerCounter: (playerId: string, name: string, delta: number) => void;
  addCommanderTax: (playerId: string, oracleId: string, delta: number) => void;
  addMana: (playerId: string, color: ManaColor, delta: number) => void;
  clearMana: (playerId: string) => void;

  // turn structure
  nextTurn: () => void;
  /** Start a player's turn: turn++, set active, untap theirs, draw for turn. */
  beginPlayerTurn: (playerId: string, draw?: boolean) => void;
  nextPhase: () => void;
  setPhase: (phase: Phase) => void;
  /** Typed bot log entry with optional reasoning (FSM transparency). */
  logBot: (message: string, reasoning?: string) => void;

  // dice & misc
  rollDie: (sides: number) => number;
  flipCoin: () => "Heads" | "Tails";
  logNote: (message: string) => void;

  // prefs
  setPref: <K extends keyof UiPrefs>(key: K, value: UiPrefs[K]) => void;

  // snapshot restore
  restoreCore: (core: GameCore, cards: ScryCard[]) => void;
}

function emptyZones(): Record<Zone, string[]> {
  return Object.fromEntries(ALL_ZONES.map((z) => [z, []])) as unknown as Record<
    Zone,
    string[]
  >;
}

function makePlayer(id: string, name: string): PlayerState {
  return {
    id,
    name,
    life: 40,
    poison: 0,
    energy: 0,
    experience: 0,
    commanderTax: {},
    manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    counters: {},
    mulligans: 0,
    commanderOracleIds: [],
  };
}

function emptyCore(): GameCore {
  return {
    players: { [PLAYER_ID]: makePlayer(PLAYER_ID, "You") },
    playerOrder: [PLAYER_ID],
    turn: 1,
    phase: "main1",
    activePlayerId: PLAYER_ID,
    instances: {},
    zoneOrder: { [PLAYER_ID]: emptyZones() },
    log: [],
  };
}

function pickCore(s: GameStore): GameCore {
  return {
    players: s.players,
    playerOrder: s.playerOrder,
    turn: s.turn,
    phase: s.phase,
    activePlayerId: s.activePlayerId,
    instances: s.instances,
    zoneOrder: s.zoneOrder,
    log: s.log,
  };
}

function cardName(s: GameCore & { cards: Record<string, ScryCard> }, inst: CardInstance): string {
  if (inst.isToken && inst.tokenSpec) return inst.tokenSpec.name;
  return s.cards[inst.cardId]?.name ?? "Unknown card";
}

/** Add a player to the core: commanders to command zone, shuffled library, 7-card hand. */
function setupPlayer(core: GameCore, deck: Deck, playerId: string, name: string) {
  const player = makePlayer(playerId, name);
  player.commanderOracleIds = deck.commanders.map((c) => c.oracle_id);
  for (const c of deck.commanders) player.commanderTax[c.oracle_id] = 0;
  core.players[playerId] = player;
  if (!core.playerOrder.includes(playerId)) core.playerOrder.push(playerId);
  core.zoneOrder[playerId] = emptyZones();

  const newInstance = (card: ScryCard, zone: Zone): CardInstance => {
    const inst: CardInstance = {
      instanceId: uid(),
      cardId: card.id,
      oracleId: card.oracle_id,
      ownerId: playerId,
      zone,
      tapped: false,
      faceDown: false,
      flipped: 0,
      counters: {},
      attachments: [],
      isToken: false,
    };
    core.instances[inst.instanceId] = inst;
    return inst;
  };

  const libraryIds: string[] = [];
  for (const entry of includedEntries(deck)) {
    if (entry.isCommander) continue;
    for (let i = 0; i < entry.quantity; i++) {
      libraryIds.push(newInstance(entry.card, "library").instanceId);
    }
  }
  core.zoneOrder[playerId]!.library = shuffled(libraryIds);

  for (const cmd of deck.commanders) {
    core.zoneOrder[playerId]!.command.push(newInstance(cmd, "command").instanceId);
  }

  const zones = core.zoneOrder[playerId]!;
  const drawn = zones.library.splice(0, 7);
  for (const id of drawn) core.instances[id]!.zone = "hand";
  zones.hand = drawn;
}

function pushLog(core: GameCore, playerId: string, event: LogEvent) {
  core.log.push({ id: uid("log"), ts: Date.now(), turn: core.turn, playerId, event });
}

function removeFromZone(core: GameCore, inst: CardInstance) {
  // Battlefield cards live in their controller's list (theft-aware).
  const holder = inst.zone === "battlefield" ? controllerOf(inst) : inst.ownerId;
  const order = core.zoneOrder[holder]?.[inst.zone];
  if (order) {
    const idx = order.indexOf(inst.instanceId);
    if (idx >= 0) order.splice(idx, 1);
  }
}

/** Detach from host / drop attachments when a card leaves the battlefield. */
function breakAttachments(core: GameCore, inst: CardInstance) {
  if (inst.attachedTo) {
    const host = core.instances[inst.attachedTo];
    if (host) host.attachments = host.attachments.filter((id) => id !== inst.instanceId);
    inst.attachedTo = undefined;
  }
  for (const childId of inst.attachments) {
    const child = core.instances[childId];
    if (child) child.attachedTo = undefined;
  }
  inst.attachments = [];
}

function placeInZone(core: GameCore, inst: CardInstance, to: Zone, opts: MoveOptions) {
  removeFromZone(core, inst);
  // Battlefield placement follows the (possibly new) controller; every other
  // zone returns the card to its owner.
  if (to === "battlefield") {
    const ctrl = opts.controllerId ?? controllerOf(inst);
    inst.controllerId = ctrl === inst.ownerId ? undefined : ctrl;
  } else {
    inst.controllerId = undefined;
  }
  const holder = to === "battlefield" ? controllerOf(inst) : inst.ownerId;
  const order = core.zoneOrder[holder]![to];
  if (to === "library") {
    if (opts.libraryPlacement === "bottom") order.push(inst.instanceId);
    else if (opts.libraryPlacement === "shuffle") {
      order.push(inst.instanceId);
    } else if (opts.index !== undefined) order.splice(opts.index, 0, inst.instanceId);
    else order.unshift(inst.instanceId); // default: top
  } else if (opts.index !== undefined) {
    order.splice(opts.index, 0, inst.instanceId);
  } else {
    order.push(inst.instanceId);
  }
  inst.zone = to;

  if (to !== "battlefield") {
    inst.tapped = false;
    inst.position = undefined;
    inst.enteredOnTurn = undefined;
    breakAttachments(core, inst);
    if (to !== "hand") inst.faceDown = false;
  } else {
    inst.enteredOnTurn = core.turn;
    if (opts.position) inst.position = opts.position;
  }
  if (opts.libraryPlacement === "shuffle" && to === "library") {
    core.zoneOrder[inst.ownerId]!.library = shuffled(order);
  }
}

export const useGameStore = create<GameStore>((set, get) => {
  /** Run an undoable mutation: clone core, mutate the clone, commit. */
  function mutate(fn: (core: GameCore) => void) {
    const s = get();
    const prev = pickCore(s);
    const draft = structuredClone(prev);
    fn(draft);
    set({
      ...draft,
      history: [...s.history.slice(-HISTORY_LIMIT + 1), prev],
      future: [],
    });
  }

  return {
    ...emptyCore(),
    cards: {},
    deck: null,
    botDecks: [],
    started: false,
    history: [],
    future: [],
    prefs: loadPrefs(),

    loadDeck: (deck) => {
      const cards: Record<string, ScryCard> = {};
      for (const entry of deck.entries) cards[entry.card.id] = entry.card;
      for (const cmd of deck.commanders) cards[cmd.id] = cmd;
      // keep any bot deck cards that were already registered
      for (const botDeck of get().botDecks) {
        for (const entry of botDeck.entries) cards[entry.card.id] = entry.card;
        for (const cmd of botDeck.commanders) cards[cmd.id] = cmd;
      }
      set({ ...emptyCore(), cards, deck, started: false, history: [], future: [] });
    },

    loadBotDecks: (decks) => {
      const botDecks = decks.slice(0, MAX_OPPONENTS);
      const cards = { ...get().cards };
      for (const botDeck of botDecks) {
        for (const entry of botDeck.entries) cards[entry.card.id] = entry.card;
        for (const cmd of botDeck.commanders) cards[cmd.id] = cmd;
      }
      set({ cards, botDecks });
    },

    startGame: () => {
      const { deck, botDecks } = get();
      if (!deck) return;
      const core: GameCore = {
        players: {},
        playerOrder: [],
        turn: 1,
        phase: "main1",
        activePlayerId: PLAYER_ID,
        instances: {},
        zoneOrder: {},
        log: [],
      };
      setupPlayer(core, deck, PLAYER_ID, "You");
      botDecks.forEach((botDeck, i) => {
        setupPlayer(core, botDeck, `bot${i + 1}`, botDeck.name);
      });

      pushLog(core, PLAYER_ID, {
        type: "game",
        message:
          botDecks.length > 0
            ? `Game started: "${deck.name}" vs ${botDecks.length} opponent${botDecks.length === 1 ? "" : "s"} (${botDecks.map((d) => d.name).join(", ")}). Everyone drew 7.`
            : `Game started with "${deck.name}" — drew opening 7.`,
      });
      set({ ...core, started: true, history: [], future: [] });
    },

    mulligan: () =>
      mutate((core) => {
        const player = core.players[PLAYER_ID]!;
        const zones = core.zoneOrder[PLAYER_ID]!;
        // Shuffle hand back, draw a fresh 7 (London mulligan).
        for (const id of zones.hand) core.instances[id]!.zone = "library";
        zones.library = shuffled([...zones.library, ...zones.hand]);
        const drawn = zones.library.splice(0, 7);
        for (const id of drawn) core.instances[id]!.zone = "hand";
        zones.hand = drawn;
        player.mulligans += 1;
        pushLog(core, PLAYER_ID, {
          type: "mulligan",
          count: player.mulligans,
          message: `Mulligan #${player.mulligans}: drew a new 7 (bottom ${player.mulligans} on keep).`,
        });
      }),

    bottomCards: (instanceIds) =>
      mutate((core) => {
        const zones = core.zoneOrder[PLAYER_ID]!;
        for (const id of instanceIds) {
          const inst = core.instances[id];
          if (!inst || inst.zone !== "hand") continue;
          placeInZone(core, inst, "library", { libraryPlacement: "bottom", silent: true });
        }
        pushLog(core, PLAYER_ID, {
          type: "mulligan",
          count: instanceIds.length,
          message: `Kept hand, bottomed ${instanceIds.length} card${instanceIds.length === 1 ? "" : "s"}.`,
        });
      }),

    resetGame: () => {
      const { deck } = get();
      if (deck) get().loadDeck(deck);
    },

    undo: () => {
      const s = get();
      const prev = s.history[s.history.length - 1];
      if (!prev) return;
      set({
        ...prev,
        history: s.history.slice(0, -1),
        future: [pickCore(s), ...s.future].slice(0, HISTORY_LIMIT),
      });
    },

    redo: () => {
      const s = get();
      const next = s.future[0];
      if (!next) return;
      set({
        ...next,
        history: [...s.history.slice(-HISTORY_LIMIT + 1), pickCore(s)],
        future: s.future.slice(1),
      });
    },

    moveCard: (instanceId, to, opts = {}) => {
      const s = get();
      mutate((core) => {
        const inst = core.instances[instanceId];
        if (!inst) return;
        const from = inst.zone;
        const name = cardName({ ...core, cards: s.cards }, inst);

        // Tokens cease to exist outside the battlefield.
        if (inst.isToken && to !== "battlefield" && to !== "stack") {
          removeFromZone(core, inst);
          breakAttachments(core, inst);
          delete core.instances[instanceId];
          pushLog(core, inst.ownerId, {
            type: "move",
            cardName: name,
            from,
            to,
            message: `${name} (token) left the battlefield and ceased to exist.`,
          });
          return;
        }

        // Moving the host moves nothing — attachments break on zone change.
        placeInZone(core, inst, to, opts);

        // Commander tax bookkeeping when a commander leaves/re-enters command.
        const player = core.players[inst.ownerId];
        if (player && player.commanderOracleIds.includes(inst.oracleId)) {
          if (from === "command" && (to === "battlefield" || to === "stack")) {
            player.commanderTax[inst.oracleId] =
              (player.commanderTax[inst.oracleId] ?? 0) + 1;
          }
        }

        if (!opts.silent) {
          const placement =
            to === "library"
              ? opts.libraryPlacement === "bottom"
                ? " (bottom)"
                : opts.libraryPlacement === "shuffle"
                  ? " (shuffled in)"
                  : " (top)"
              : "";
          pushLog(core, inst.ownerId, {
            type: "move",
            cardName: name,
            from,
            to,
            message: `${inst.ownerId === PLAYER_ID ? "" : "Opponent's "}${name}: ${from} → ${to}${placement}.`,
          });
        }
      });
    },

    setPosition: (instanceId, pos) => {
      // Position-only drags are frequent; still undoable but logged silently.
      mutate((core) => {
        const inst = core.instances[instanceId];
        if (inst && inst.zone === "battlefield") inst.position = pos;
      });
    },

    setPositions: (updates) => {
      mutate((core) => {
        for (const [id, pos] of Object.entries(updates)) {
          const inst = core.instances[id];
          if (inst && inst.zone === "battlefield") inst.position = pos;
        }
      });
    },

    toggleTapMany: (instanceIds, referenceId) => {
      const s = get();
      mutate((core) => {
        const ref = core.instances[referenceId];
        if (!ref) return;
        const nextTapped = !ref.tapped;
        const names: string[] = [];
        for (const id of instanceIds) {
          const inst = core.instances[id];
          if (!inst || inst.zone !== "battlefield") continue;
          inst.tapped = nextTapped;
          names.push(cardName({ ...core, cards: s.cards }, inst));
        }
        pushLog(core, PLAYER_ID, {
          type: "tap",
          cardName: names.join(", "),
          tapped: nextTapped,
          message: `${nextTapped ? "Tapped" : "Untapped"} ${names.length} cards: ${names.join(", ")}.`,
        });
      });
    },

    toggleTap: (instanceId) => {
      const s = get();
      mutate((core) => {
        const inst = core.instances[instanceId];
        if (!inst) return;
        inst.tapped = !inst.tapped;
        const name = cardName({ ...core, cards: s.cards }, inst);
        pushLog(core, PLAYER_ID, {
          type: "tap",
          cardName: name,
          tapped: inst.tapped,
          message: `${inst.tapped ? "Tapped" : "Untapped"} ${name}.`,
        });
      });
    },

    tapAll: (playerId = PLAYER_ID) =>
      mutate((core) => {
        let n = 0;
        for (const inst of Object.values(core.instances)) {
          if (controllerOf(inst) === playerId && inst.zone === "battlefield" && !inst.tapped) {
            inst.tapped = true;
            n++;
          }
        }
        pushLog(core, playerId, {
          type: "game",
          message: `${playerId === PLAYER_ID ? "Tapped" : "Opponent tapped"} all permanents (${n}).`,
        });
      }),

    proliferate: (playerId = PLAYER_ID) =>
      mutate((core) => {
        let n = 0;
        for (const inst of Object.values(core.instances)) {
          if (controllerOf(inst) !== playerId || inst.zone !== "battlefield") continue;
          for (const name of Object.keys(inst.counters)) {
            inst.counters[name] = (inst.counters[name] ?? 0) + 1;
            n++;
          }
        }
        const p = core.players[playerId];
        if (p) {
          for (const tracker of ["poison", "energy", "experience"] as const) {
            if (p[tracker] > 0) {
              p[tracker] += 1;
              n++;
            }
          }
          for (const name of Object.keys(p.counters)) {
            p.counters[name] = (p.counters[name] ?? 0) + 1;
            n++;
          }
        }
        pushLog(core, playerId, {
          type: "game",
          message: `Proliferated ${playerId === PLAYER_ID ? "your" : "opponent's"} counters — incremented ${n}.`,
        });
      }),

    tapCards: (instanceIds, reason) => {
      const s = get();
      mutate((core) => {
        const names: string[] = [];
        for (const id of instanceIds) {
          const inst = core.instances[id];
          if (!inst || inst.zone !== "battlefield" || inst.tapped) continue;
          inst.tapped = true;
          names.push(cardName({ ...core, cards: s.cards }, inst));
        }
        if (names.length === 0) return;
        pushLog(core, core.instances[instanceIds[0]!]?.ownerId ?? PLAYER_ID, {
          type: "tap",
          cardName: names.join(", "),
          tapped: true,
          message: `Tapped ${names.join(", ")}${reason ? ` (${reason})` : ""}.`,
        });
      });
    },

    untapAll: (playerId = PLAYER_ID) =>
      mutate((core) => {
        let n = 0;
        for (const inst of Object.values(core.instances)) {
          if (controllerOf(inst) === playerId && inst.zone === "battlefield" && inst.tapped) {
            inst.tapped = false;
            n++;
          }
        }
        pushLog(core, playerId, {
          type: "game",
          message: `${playerId === PLAYER_ID ? "Untapped" : "Opponent untapped"} all permanents (${n}).`,
        });
      }),

    setFaceDown: (instanceId, faceDown) => {
      const s = get();
      mutate((core) => {
        const inst = core.instances[instanceId];
        if (!inst) return;
        inst.faceDown = faceDown;
        const name = cardName({ ...core, cards: s.cards }, inst);
        pushLog(core, PLAYER_ID, {
          type: "game",
          message: faceDown ? `Turned ${name} face down.` : `Turned a card face up: ${name}.`,
        });
      });
    },

    flipFace: (instanceId) => {
      const s = get();
      mutate((core) => {
        const inst = core.instances[instanceId];
        if (!inst) return;
        const card = s.cards[inst.cardId];
        const faces = card?.card_faces?.length ?? 1;
        if (faces < 2) return;
        inst.flipped = (inst.flipped + 1) % faces;
        const faceName = card?.card_faces?.[inst.flipped]?.name ?? card?.name ?? "card";
        pushLog(core, PLAYER_ID, {
          type: "game",
          message: `Transformed to ${faceName}.`,
        });
      });
    },

    addCounterOnCard: (instanceId, name, delta) => {
      const s = get();
      mutate((core) => {
        const inst = core.instances[instanceId];
        if (!inst) return;
        const next = (inst.counters[name] ?? 0) + delta;
        if (next <= 0) delete inst.counters[name];
        else inst.counters[name] = next;
        const cn = cardName({ ...core, cards: s.cards }, inst);
        pushLog(core, PLAYER_ID, {
          type: "counter",
          target: cn,
          counter: name,
          delta,
          message: `${delta > 0 ? "+" : ""}${delta} ${name} counter on ${cn} (now ${Math.max(next, 0)}).`,
        });
      });
    },

    attach: (instanceId, hostId) => {
      const s = get();
      mutate((core) => {
        const inst = core.instances[instanceId];
        const host = core.instances[hostId];
        if (!inst || !host || instanceId === hostId) return;
        if (inst.zone !== "battlefield" || host.zone !== "battlefield") return;
        breakAttachments(core, inst);
        inst.attachedTo = hostId;
        host.attachments.push(instanceId);
        inst.position = undefined;
        pushLog(core, PLAYER_ID, {
          type: "game",
          message: `Attached ${cardName({ ...core, cards: s.cards }, inst)} to ${cardName({ ...core, cards: s.cards }, host)}.`,
        });
      });
    },

    unattach: (instanceId) => {
      const s = get();
      mutate((core) => {
        const inst = core.instances[instanceId];
        if (!inst || !inst.attachedTo) return;
        const host = core.instances[inst.attachedTo];
        if (host) {
          host.attachments = host.attachments.filter((id) => id !== instanceId);
          inst.position = host.position
            ? { x: host.position.x + 30, y: host.position.y + 30 }
            : undefined;
        }
        inst.attachedTo = undefined;
        pushLog(core, PLAYER_ID, {
          type: "game",
          message: `Unattached ${cardName({ ...core, cards: s.cards }, inst)}.`,
        });
      });
    },

    createToken: (spec, count = 1, playerId = PLAYER_ID) =>
      mutate((core) => {
        if (!core.zoneOrder[playerId]) return;
        for (let i = 0; i < count; i++) {
          const inst: CardInstance = {
            instanceId: uid("tok"),
            cardId: "",
            oracleId: "",
            ownerId: playerId,
            zone: "battlefield",
            tapped: false,
            faceDown: false,
            flipped: 0,
            counters: {},
            attachments: [],
            isToken: true,
            tokenSpec: spec,
            enteredOnTurn: core.turn,
            position: { x: 40 + i * 30, y: 40 + i * 20 },
          };
          core.instances[inst.instanceId] = inst;
          core.zoneOrder[playerId]!.battlefield.push(inst.instanceId);
        }
        pushLog(core, playerId, {
          type: "token",
          cardName: spec.name,
          message: `Created ${count}x ${spec.name} token${playerId === PLAYER_ID ? "" : " (opponent's field)"}.`,
        });
      }),

    createTokenFromCard: (card, count = 1, playerId = PLAYER_ID) => {
      const s = get();
      if (!s.cards[card.id]) set({ cards: { ...s.cards, [card.id]: card } });
      mutate((core) => {
        if (!core.zoneOrder[playerId]) return;
        for (let i = 0; i < count; i++) {
          const inst: CardInstance = {
            instanceId: uid("tok"),
            cardId: card.id,
            oracleId: card.oracle_id,
            ownerId: playerId,
            zone: "battlefield",
            tapped: false,
            faceDown: false,
            flipped: 0,
            counters: {},
            attachments: [],
            isToken: true,
            enteredOnTurn: core.turn,
            position: { x: 40 + i * 30, y: 40 + i * 20 },
          };
          core.instances[inst.instanceId] = inst;
          core.zoneOrder[playerId]!.battlefield.push(inst.instanceId);
        }
        pushLog(core, playerId, {
          type: "token",
          cardName: card.name,
          message: `Created ${count}x ${card.name} token${playerId === PLAYER_ID ? "" : " (opponent's field)"}.`,
        });
      });
    },

    cloneInstance: (instanceId) => {
      const s = get();
      mutate((core) => {
        const src = core.instances[instanceId];
        if (!src) return;
        const inst: CardInstance = {
          ...structuredClone(src),
          instanceId: uid("tok"),
          isToken: true,
          attachments: [],
          attachedTo: undefined,
          enteredOnTurn: core.turn,
          position: src.position
            ? { x: src.position.x + 30, y: src.position.y + 30 }
            : { x: 60, y: 60 },
        };
        core.instances[inst.instanceId] = inst;
        // The copy enters under the source's CONTROLLER (not owner) — cloning
        // a stolen/lent card must land on the field it's actually on.
        core.zoneOrder[controllerOf(src)]!.battlefield.push(inst.instanceId);
        pushLog(core, PLAYER_ID, {
          type: "token",
          cardName: cardName({ ...core, cards: s.cards }, src),
          message: `Created a token copy of ${cardName({ ...core, cards: s.cards }, src)}.`,
        });
      });
    },

    removeInstance: (instanceId) => {
      const s = get();
      mutate((core) => {
        const inst = core.instances[instanceId];
        if (!inst) return;
        const name = cardName({ ...core, cards: s.cards }, inst);
        removeFromZone(core, inst);
        breakAttachments(core, inst);
        delete core.instances[instanceId];
        pushLog(core, PLAYER_ID, { type: "game", message: `Removed ${name} from the game.` });
      });
    },

    draw: (n = 1, playerId = PLAYER_ID) =>
      mutate((core) => {
        const zones = core.zoneOrder[playerId];
        if (!zones) return;
        const drawn = zones.library.splice(0, n);
        for (const id of drawn) core.instances[id]!.zone = "hand";
        zones.hand.push(...drawn);
        pushLog(core, playerId, {
          type: "draw",
          count: drawn.length,
          message: `${playerId === PLAYER_ID ? "Drew" : "Opponent drew"} ${drawn.length} card${drawn.length === 1 ? "" : "s"}.`,
        });
      }),

    mill: (n) => {
      const s = get();
      mutate((core) => {
        const zones = core.zoneOrder[PLAYER_ID]!;
        const milled = zones.library.splice(0, n);
        for (const id of milled) core.instances[id]!.zone = "graveyard";
        zones.graveyard.push(...milled);
        const names = milled
          .map((id) => cardName({ ...core, cards: s.cards }, core.instances[id]!))
          .join(", ");
        pushLog(core, PLAYER_ID, {
          type: "library",
          action: "mill",
          message: `Milled ${milled.length}: ${names || "none"}.`,
        });
      });
    },

    shuffleLibrary: (playerId = PLAYER_ID) =>
      mutate((core) => {
        const zones = core.zoneOrder[playerId];
        if (!zones) return;
        zones.library = shuffled(zones.library);
        pushLog(core, playerId, {
          type: "library",
          action: "shuffle",
          message: `Shuffled ${playerId === PLAYER_ID ? "library" : "opponent's library"}.`,
        });
      }),

    revealTop: () => {
      const s = get();
      mutate((core) => {
        const topId = core.zoneOrder[PLAYER_ID]!.library[0];
        const name = topId
          ? cardName({ ...core, cards: s.cards }, core.instances[topId]!)
          : "nothing (library empty)";
        pushLog(core, PLAYER_ID, {
          type: "library",
          action: "reveal",
          message: `Revealed top of library: ${name}.`,
        });
      });
    },

    resolveTopCards: (toTop, toBottom, toGraveyard) => {
      mutate((core) => {
        const zones = core.zoneOrder[PLAYER_ID]!;
        const moving = new Set([...toTop, ...toBottom, ...toGraveyard]);
        zones.library = zones.library.filter((id) => !moving.has(id));
        zones.library.unshift(...toTop);
        zones.library.push(...toBottom);
        for (const id of toGraveyard) {
          const inst = core.instances[id];
          if (inst) {
            inst.zone = "graveyard";
            zones.graveyard.push(id);
          }
        }
        pushLog(core, PLAYER_ID, {
          type: "library",
          action: "scry",
          message: `Scry/surveil: ${toTop.length} to top, ${toBottom.length} to bottom${
            toGraveyard.length ? `, ${toGraveyard.length} to graveyard` : ""
          }.`,
        });
      });
    },

    tutorToHand: (instanceId) => {
      const s = get();
      mutate((core) => {
        const inst = core.instances[instanceId];
        if (!inst) return;
        const zones = core.zoneOrder[inst.ownerId]!;
        removeFromZone(core, inst);
        inst.zone = "hand";
        zones.hand.push(instanceId);
        zones.library = shuffled(zones.library);
        pushLog(core, inst.ownerId, {
          type: "library",
          action: "tutor",
          message: `Searched library for ${cardName({ ...core, cards: s.cards }, inst)} (to hand), then shuffled.`,
        });
      });
    },

    setLife: (playerId, value) =>
      mutate((core) => {
        const p = core.players[playerId];
        if (!p) return;
        const delta = value - p.life;
        p.life = value;
        pushLog(core, playerId, {
          type: "life",
          playerId,
          delta,
          total: value,
          message: `Life set to ${value}.`,
        });
      }),

    addLife: (playerId, delta) =>
      mutate((core) => {
        const p = core.players[playerId];
        if (!p) return;
        p.life += delta;
        pushLog(core, playerId, {
          type: "life",
          playerId,
          delta,
          total: p.life,
          message: `Life ${delta > 0 ? "+" : ""}${delta} → ${p.life}.`,
        });
      }),

    addTracker: (playerId, tracker, delta) =>
      mutate((core) => {
        const p = core.players[playerId];
        if (!p) return;
        p[tracker] = Math.max(0, p[tracker] + delta);
        pushLog(core, playerId, {
          type: "tracker",
          playerId,
          tracker,
          value: p[tracker],
          message: `${tracker[0]!.toUpperCase()}${tracker.slice(1)} ${delta > 0 ? "+" : ""}${delta} → ${p[tracker]}.`,
        });
      }),

    addPlayerCounter: (playerId, name, delta) =>
      mutate((core) => {
        const p = core.players[playerId];
        if (!p) return;
        const next = (p.counters[name] ?? 0) + delta;
        if (next <= 0) delete p.counters[name];
        else p.counters[name] = next;
        pushLog(core, playerId, {
          type: "tracker",
          playerId,
          tracker: name,
          value: Math.max(next, 0),
          message: `${name} ${delta > 0 ? "+" : ""}${delta} → ${Math.max(next, 0)}.`,
        });
      }),

    addCommanderTax: (playerId, oracleId, delta) =>
      mutate((core) => {
        const p = core.players[playerId];
        if (!p) return;
        p.commanderTax[oracleId] = Math.max(0, (p.commanderTax[oracleId] ?? 0) + delta);
        pushLog(core, playerId, {
          type: "tracker",
          playerId,
          tracker: "commanderTax",
          value: p.commanderTax[oracleId]!,
          message: `Commander tax → ${p.commanderTax[oracleId]! * 2} extra mana.`,
        });
      }),

    addMana: (playerId, color, delta) =>
      mutate((core) => {
        const p = core.players[playerId];
        if (!p) return;
        p.manaPool[color] = Math.max(0, p.manaPool[color] + delta);
        pushLog(core, playerId, {
          type: "mana",
          playerId,
          color,
          message: `Mana pool: ${color} ${delta > 0 ? "+" : ""}${delta} (now ${p.manaPool[color]}).`,
        });
      }),

    clearMana: (playerId) =>
      mutate((core) => {
        const p = core.players[playerId];
        if (!p) return;
        p.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
        pushLog(core, playerId, {
          type: "mana",
          playerId,
          color: "clear",
          message: "Mana pool emptied.",
        });
      }),

    nextTurn: () => {
      get().beginPlayerTurn(PLAYER_ID, get().prefs.drawOnTurn);
    },

    beginPlayerTurn: (playerId, draw = true) => {
      mutate((core) => {
        // The turn counter tracks ROUNDS: it only advances when the turn
        // comes back to you, not on each opponent's turn.
        if (playerId === PLAYER_ID) core.turn += 1;
        core.activePlayerId = playerId;
        core.phase = "main1";
        let untapped = 0;
        for (const inst of Object.values(core.instances)) {
          if (controllerOf(inst) === playerId && inst.zone === "battlefield" && inst.tapped) {
            inst.tapped = false;
            untapped++;
          }
        }
        const who = playerId === PLAYER_ID ? "Your" : "Opponent's";
        pushLog(core, playerId, {
          type: "turn",
          turn: core.turn,
          message: `Turn ${core.turn} (${who.toLowerCase()} turn) — untapped ${untapped} permanent${untapped === 1 ? "" : "s"}.`,
        });
        if (draw) {
          const zones = core.zoneOrder[playerId];
          if (zones) {
            const drawn = zones.library.splice(0, 1);
            for (const id of drawn) core.instances[id]!.zone = "hand";
            zones.hand.push(...drawn);
            if (drawn.length) {
              pushLog(core, playerId, {
                type: "draw",
                count: 1,
                message: playerId === PLAYER_ID ? "Drew for turn." : "Opponent drew for turn.",
              });
            }
          }
        }
      });
    },

    logBot: (message, reasoning) =>
      mutate((core) => {
        pushLog(core, BOT_ID, { type: "bot", message, reasoning });
      }),

    nextPhase: () =>
      mutate((core) => {
        const idx = PHASES.indexOf(core.phase);
        core.phase = PHASES[(idx + 1) % PHASES.length]!;
        pushLog(core, PLAYER_ID, {
          type: "phase",
          phase: core.phase,
          message: `Phase: ${core.phase}.`,
        });
      }),

    setPhase: (phase) =>
      mutate((core) => {
        core.phase = phase;
        pushLog(core, PLAYER_ID, { type: "phase", phase, message: `Phase: ${phase}.` });
      }),

    rollDie: (sides) => {
      const result = 1 + Math.floor(Math.random() * sides);
      mutate((core) => {
        pushLog(core, PLAYER_ID, {
          type: "roll",
          die: `d${sides}`,
          result,
          message: `Rolled a d${sides}: ${result}.`,
        });
      });
      return result;
    },

    flipCoin: () => {
      const result = Math.random() < 0.5 ? "Heads" : ("Tails" as const);
      mutate((core) => {
        pushLog(core, PLAYER_ID, {
          type: "roll",
          die: "coin",
          result,
          message: `Coin flip: ${result}.`,
        });
      });
      return result;
    },

    logNote: (message) =>
      mutate((core) => {
        pushLog(core, PLAYER_ID, { type: "game", message });
      }),

    setPref: (key, value) => {
      const prefs = { ...get().prefs, [key]: value };
      set({ prefs });
      try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
      } catch {
        // private mode / quota — non-fatal
      }
    },

    restoreCore: (core, cards) => {
      const cardMap: Record<string, ScryCard> = {};
      for (const c of cards) cardMap[c.id] = c;
      set({
        ...structuredClone(core),
        cards: { ...get().cards, ...cardMap },
        started: true,
        history: [],
        future: [],
      });
    },
  };
});

// ---------------------------------------------------------------------------
// Selectors / helpers used by components
// ---------------------------------------------------------------------------

export function selectZone(s: GameStore, playerId: string, zone: Zone): string[] {
  return s.zoneOrder[playerId]?.[zone] ?? [];
}

export function instanceCard(s: GameStore, instanceId: string): ScryCard | undefined {
  const inst = s.instances[instanceId];
  return inst ? s.cards[inst.cardId] : undefined;
}

export function hasSummoningSickness(s: GameStore, instanceId: string): boolean {
  const inst = s.instances[instanceId];
  if (!inst || inst.zone !== "battlefield") return false;
  const card = s.cards[inst.cardId];
  const typeLine = inst.tokenSpec?.typeLine ?? card?.type_line ?? "";
  return isCreature(typeLine) && inst.enteredOnTurn === s.turn;
}

export { isCreature, isLand };
