import type { CardInstance, GameCore, ScryCard } from "@/types";
import { isLand } from "@/types";

/**
 * The bot's "brain": deliberately dumb, rules-based heuristics.
 *
 * Honest constraints (surfaced in the UI/log, not hidden):
 * - Castability only counts `produced_mana` of UNTAPPED LANDS. Mana abilities
 *   on nonland permanents, cost reducers, alternative/additional costs and
 *   X spells (treated as X=0) are ignored.
 * - Hybrid pips are treated as payable by either side; Phyrexian pips as the
 *   colored side only.
 * The human gets a manual override for everything the heuristic misses.
 */

export type BotColor = "W" | "U" | "B" | "R" | "G" | "C";

export interface ParsedCost {
  generic: number;
  /** Each entry is the set of colors that can pay that pip. */
  pips: BotColor[][];
  hasX: boolean;
}

/** Parse "{2}{G}{G}{W/U}{X}" → { generic: 2, pips: [[G],[G],[W,U]], hasX } */
export function parseManaCost(cost: string | undefined): ParsedCost | null {
  if (cost === undefined) return null;
  const parsed: ParsedCost = { generic: 0, pips: [], hasX: false };
  for (const match of cost.matchAll(/\{([^}]+)\}/g)) {
    const sym = match[1]!.toUpperCase();
    if (/^\d+$/.test(sym)) {
      parsed.generic += parseInt(sym, 10);
    } else if (sym === "X" || sym === "Y" || sym === "Z") {
      parsed.hasX = true; // treated as X=0
    } else if (sym === "C") {
      parsed.pips.push(["C"]);
    } else if (sym === "S") {
      parsed.pips.push(["C"]); // snow: any mana in our model
    } else {
      // hybrid {W/U}, phyrexian {G/P}, 2-brid {2/W}
      const parts = sym.split("/").filter((p) => p !== "P");
      const colors = parts.filter((p): p is BotColor => "WUBRGC".includes(p));
      const twobrid = parts.find((p) => /^\d+$/.test(p));
      if (colors.length > 0) {
        parsed.pips.push(colors);
        if (twobrid) {
          // {2/W}: payable by W or 2 generic — treat as the colored side.
        }
      } else if (twobrid) {
        parsed.generic += parseInt(twobrid, 10);
      }
    }
  }
  return parsed;
}

export interface ManaSource {
  instanceId: string;
  name: string;
  /** Colors this source can produce (one mana per tap in our model). */
  colors: BotColor[];
}

/** The bot's untapped lands that actually produce mana. */
export function untappedManaSources(
  core: GameCore,
  cards: Record<string, ScryCard>,
  playerId: string,
): ManaSource[] {
  const sources: ManaSource[] = [];
  for (const id of core.zoneOrder[playerId]?.battlefield ?? []) {
    const inst = core.instances[id];
    if (!inst || inst.tapped || inst.faceDown) continue;
    const card = cards[inst.cardId];
    const typeLine = inst.tokenSpec?.typeLine ?? card?.type_line ?? "";
    if (!isLand(typeLine)) continue;
    const produced = (card?.produced_mana ?? []).filter((c): c is BotColor =>
      "WUBRGC".includes(c),
    );
    if (produced.length === 0) continue;
    sources.push({ instanceId: id, name: card?.name ?? "Land", colors: produced });
  }
  return sources;
}

/**
 * Try to pay a cost from sources. Most-constrained-first greedy matching:
 * colored pips with the fewest able sources get assigned first, each pip
 * preferring the least flexible source; generic comes from whatever is left.
 * Returns the source ids to tap, or null if unpayable.
 */
export function findPayment(cost: ParsedCost, sources: ManaSource[]): string[] | null {
  if (cost.pips.length + cost.generic > sources.length) return null;
  const available = [...sources];
  const tapped: string[] = [];

  const pips = [...cost.pips].sort(
    (a, b) =>
      available.filter((s) => s.colors.some((c) => a.includes(c))).length -
      available.filter((s) => s.colors.some((c) => b.includes(c))).length,
  );

  for (const pip of pips) {
    const candidates = available
      .filter((s) => s.colors.some((c) => pip.includes(c)))
      .sort((a, b) => a.colors.length - b.colors.length);
    const chosen = candidates[0];
    if (!chosen) return null;
    tapped.push(chosen.instanceId);
    available.splice(available.indexOf(chosen), 1);
  }

  if (cost.generic > available.length) return null;
  // Pay generic with the most flexible sources last (i.e. use flexible first
  // is wrong — keep flexible sources for nothing; order doesn't matter now).
  for (let i = 0; i < cost.generic; i++) tapped.push(available[i]!.instanceId);
  return tapped;
}

export interface CastableSpell {
  instanceId: string;
  card: ScryCard;
  cmc: number;
  /** Source ids to tap to pay for it. */
  payment: string[];
  fromCommandZone: boolean;
  isPermanent: boolean;
}

const PERMANENT_RE = /\b(Creature|Artifact|Enchantment|Planeswalker|Battle|Land)\b/;

export function isPermanentCard(typeLine: string): boolean {
  return PERMANENT_RE.test(typeLine);
}

/** All spells the bot could cast right now (hand + commanders, with tax). */
export function findCastableSpells(
  core: GameCore,
  cards: Record<string, ScryCard>,
  playerId: string,
): { castable: CastableSpell[]; sources: ManaSource[] } {
  const sources = untappedManaSources(core, cards, playerId);
  const castable: CastableSpell[] = [];

  const consider = (inst: CardInstance, fromCommandZone: boolean) => {
    const card = cards[inst.cardId];
    if (!card) return;
    if (isLand(card.type_line)) return;
    const cost = parseManaCost(card.mana_cost);
    if (!cost || (cost.generic === 0 && cost.pips.length === 0 && card.cmc === 0 && !card.mana_cost))
      return;
    const tax = fromCommandZone
      ? (core.players[playerId]?.commanderTax[inst.oracleId] ?? 0) * 2
      : 0;
    const taxed: ParsedCost = { ...cost, generic: cost.generic + tax };
    const payment = findPayment(taxed, sources);
    if (payment) {
      castable.push({
        instanceId: inst.instanceId,
        card,
        cmc: card.cmc + tax,
        payment,
        fromCommandZone,
        isPermanent: isPermanentCard(card.type_line),
      });
    }
  };

  for (const id of core.zoneOrder[playerId]?.hand ?? []) {
    const inst = core.instances[id];
    if (inst) consider(inst, false);
  }
  for (const id of core.zoneOrder[playerId]?.command ?? []) {
    const inst = core.instances[id];
    if (inst) consider(inst, true);
  }

  return { castable, sources };
}

/** Default cast heuristic: highest CMC affordable, random tie-break. Swappable. */
export function chooseSpell(castable: CastableSpell[]): CastableSpell | null {
  if (castable.length === 0) return null;
  const maxCmc = Math.max(...castable.map((c) => c.cmc));
  const best = castable.filter((c) => c.cmc === maxCmc);
  return best[Math.floor(Math.random() * best.length)] ?? null;
}

export interface LandChoice {
  instanceId: string;
  card: ScryCard;
  entersTapped: boolean;
  addsMissingColor: boolean;
}

/** Pick a land to play: prefer one adding a missing color that enters untapped. */
export function chooseLand(
  core: GameCore,
  cards: Record<string, ScryCard>,
  playerId: string,
): LandChoice | null {
  const producedAlready = new Set<string>();
  for (const id of core.zoneOrder[playerId]?.battlefield ?? []) {
    const card = cards[core.instances[id]?.cardId ?? ""];
    for (const c of card?.produced_mana ?? []) producedAlready.add(c);
  }

  const options: LandChoice[] = [];
  for (const id of core.zoneOrder[playerId]?.hand ?? []) {
    const inst = core.instances[id];
    const card = inst ? cards[inst.cardId] : undefined;
    if (!inst || !card || !isLand(card.type_line)) continue;
    const text = card.oracle_text ?? card.card_faces?.[0]?.oracle_text ?? "";
    options.push({
      instanceId: id,
      card,
      entersTapped: /enters (the battlefield )?tapped/i.test(text),
      addsMissingColor: (card.produced_mana ?? []).some((c) => !producedAlready.has(c)),
    });
  }
  if (options.length === 0) return null;

  options.sort((a, b) => {
    // missing color first, then untapped, then more colors produced
    const score = (l: LandChoice) =>
      (l.addsMissingColor ? 4 : 0) +
      (l.entersTapped ? 0 : 2) +
      Math.min(l.card.produced_mana?.length ?? 0, 1);
    return score(b) - score(a);
  });
  return options[0] ?? null;
}

/** Untapped, not summoning-sick creatures — the bot's attackers. */
export function eligibleAttackers(
  core: GameCore,
  cards: Record<string, ScryCard>,
  playerId: string,
): CardInstance[] {
  const attackers: CardInstance[] = [];
  for (const id of core.zoneOrder[playerId]?.battlefield ?? []) {
    const inst = core.instances[id];
    if (!inst || inst.tapped || inst.faceDown) continue;
    const typeLine = inst.tokenSpec?.typeLine ?? cards[inst.cardId]?.type_line ?? "";
    if (!/\bCreature\b/.test(typeLine)) continue;
    if ((inst.enteredOnTurn ?? 0) >= core.turn) continue; // summoning sick
    const text = cards[inst.cardId]?.oracle_text ?? "";
    if (/^Defender$|\bDefender\b/m.test(text) || /\bDefender\b/.test(typeLine)) continue;
    attackers.push(inst);
  }
  return attackers;
}

/** Human-readable summary of what mana the bot counted (for the action log). */
export function describeSources(sources: ManaSource[]): string {
  if (sources.length === 0) return "no untapped mana-producing lands";
  const counts = new Map<string, number>();
  for (const s of sources) {
    const key = s.colors.join("/");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return (
    [...counts.entries()].map(([k, n]) => `${n}× {${k}}`).join(", ") +
    ` (${sources.length} land${sources.length === 1 ? "" : "s"})`
  );
}
