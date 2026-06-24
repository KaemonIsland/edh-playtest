'use client'

import type { ScryCard } from '@/types'
import {
  collectionEntryId,
  getRepo,
  type CardFinish,
  type CollectionCard,
  type UnresolvedImport,
} from '@/lib/repo'
import { cacheCards } from '@/lib/db'

/**
 * CSV collection import (Mana Flood / Archidekt / Moxfield / ManaBox style).
 * Resolves each printing entirely against the locally-synced MTGJSON tables
 * (via /api/mtgjson/resolve-collection) — no Scryfall round-trip — matching in
 * the order: MTGJSON UUID → Scryfall id → set code + collector number → name.
 * Rows that match none of these are reported unresolved.
 */

// ---------------------------------------------------------------------------
// RFC-4180-ish CSV parser (handles quoted fields, embedded commas/newlines)
// ---------------------------------------------------------------------------

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  // strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)

  while (i < text.length) {
    const ch = text[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
        } else {
          inQuotes = false
          i++
        }
      } else {
        field += ch
        i++
      }
    } else if (ch === '"') {
      inQuotes = true
      i++
    } else if (ch === ',') {
      row.push(field)
      field = ''
      i++
    } else if (ch === '\r') {
      i++
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
    } else {
      field += ch
      i++
    }
  }
  // last field/row
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

// ---------------------------------------------------------------------------
// Column mapping
// ---------------------------------------------------------------------------

interface ColumnMap {
  quantity: number
  name: number
  scryfallId: number
  uuid: number
  finish: number
  setName: number
  setCode: number
  collectorNumber: number
}

function findCol(headers: string[], candidates: string[]): number {
  const norm = headers.map((h) => h.trim().toLowerCase())
  for (const c of candidates) {
    const idx = norm.indexOf(c.toLowerCase())
    if (idx >= 0) return idx
  }
  return -1
}

export function mapColumns(headers: string[]): ColumnMap {
  return {
    quantity: findCol(headers, ['quantity', 'count', 'qty', 'card count']),
    name: findCol(headers, ['card name', 'name', 'card']),
    scryfallId: findCol(headers, ['scryfall id', 'scryfallid', 'scryfall_id', 'scryfall', 'id']),
    uuid: findCol(headers, [
      'uuid',
      'mtgjson uuid',
      'mtgjson_uuid',
      'mtgjsonid',
      'mtgjson id',
      'mtgjson',
    ]),
    finish: findCol(headers, ['foil/variant', 'foil', 'finish', 'printing', 'variant', 'foiling']),
    setName: findCol(headers, ['edition name', 'edition', 'set name', 'set', 'expansion']),
    setCode: findCol(headers, ['set code', 'edition code', 'setcode', 'set_code']),
    collectorNumber: findCol(headers, [
      'collector number',
      'collector_number',
      'card number',
      'number',
      'cn',
      'collector',
    ]),
  }
}

function parseFinish(raw: string | undefined): CardFinish {
  const v = (raw ?? '').trim().toLowerCase()
  if (!v || v === 'normal' || v === 'nonfoil' || v === 'non-foil' || v === 'no' || v === 'false')
    return 'nonfoil'
  if (v.includes('etched')) return 'etched'
  if (v.includes('foil') || v === 'yes' || v === 'true' || v === '1') return 'foil'
  return 'nonfoil'
}

export interface ParsedCsvRow {
  /** Present when the export includes a Scryfall id (most precise). */
  scryfallId?: string
  /** MTGJSON uuid — resolved to a Scryfall id locally via mtg_identifiers. */
  uuid?: string
  name: string
  quantity: number
  finish: CardFinish
  setName?: string
  setCode?: string
  collectorNumber?: string
}

export interface CsvParseResult {
  rows: ParsedCsvRow[]
  /** Rows with no usable identifier (no id and no name). */
  skipped: { name: string; reason: string }[]
  totalRows: number
}

export function parseCollectionCsv(text: string): CsvParseResult {
  const grid = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''))
  if (grid.length === 0) return { rows: [], skipped: [], totalRows: 0 }
  const headers = grid[0]!
  const cols = mapColumns(headers)
  const rows: ParsedCsvRow[] = []
  const skipped: { name: string; reason: string }[] = []

  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r]!
    const get = (idx: number) => (idx >= 0 ? (cells[idx] ?? '').trim() : '')
    const name = get(cols.name)
    const scryfallId = get(cols.scryfallId)
    const uuid = get(cols.uuid)
    const quantity = parseInt(get(cols.quantity) || '1', 10) || 1
    // A row is usable if it has an MTGJSON uuid, Scryfall id, OR a name.
    if (!uuid && !scryfallId && !name) {
      skipped.push({ name: '(unnamed)', reason: 'no UUID, Scryfall ID, or card name' })
      continue
    }
    rows.push({
      scryfallId: scryfallId || undefined,
      uuid: uuid || undefined,
      name: name || '(unnamed)',
      quantity,
      finish: parseFinish(get(cols.finish)),
      setName: get(cols.setName) || undefined,
      setCode: get(cols.setCode) || undefined,
      collectorNumber: get(cols.collectorNumber) || undefined,
    })
  }
  return { rows, skipped, totalRows: grid.length - 1 }
}

// ---------------------------------------------------------------------------
// Resolve + build
// ---------------------------------------------------------------------------

export interface ImportProgress {
  phase: 'resolve' | 'save' | 'done'
  resolved: number
  total: number
}

/** How each matched row was resolved — surfaced as import stats. */
export type MatchMethod = 'uuid' | 'scryfallId' | 'setCollector' | 'name'

/**
 * Import diagnostics. Unmatched rows are *always* logged (with the full
 * UUID → Scryfall ID → set+collector → name attempt chain, so you can see
 * which identifier the export carried and where it fell through). Flip this to
 * also dump the chain for rows that *did* match — useful for sanity-checking
 * which tier is actually winning (e.g. "is set+collector ever used, or does
 * UUID always resolve first?").
 */
const IMPORT_DEBUG_VERBOSE = false

export interface ImportResult {
  added: number
  cards: number
  /** Count of rows that couldn't be matched to a Scryfall printing. They are
   * saved to the manual-resolution queue (see `repo.addUnresolvedImports`). */
  unresolvedIds: number
  skippedRows: number
  /** Rows matched, broken down by which identifier resolved them. */
  byMethod: Record<MatchMethod, number>
}

/**
 * Front-face name for matching. A double-faced/split card is filed under its
 * FRONT face name ("Tormented Pariah"), but exports often carry the full
 * "Tormented Pariah // Rampaging Werewolf" — so we split on "//" for name lookups.
 */
function frontFaceName(name: string): string {
  const i = name.indexOf('//')
  return i === -1 ? name : name.slice(0, i).trim()
}

/** Local printing lookups, keyed for each matcher tier (see resolveLocal). */
interface LocalMaps {
  byUuid: Map<string, ScryCard>
  byId: Map<string, ScryCard>
  bySetCn: Map<string, ScryCard>
  byName: Map<string, ScryCard>
  byNameSet: Map<string, ScryCard>
}

/**
 * Resolve printings against the locally-synced MTGJSON tables via
 * /api/mtgjson/resolve-collection — fully offline, no Scryfall. Returns the
 * exact printings each requested identifier maps to, as ready-to-use ScryCards.
 * Best-effort: empty maps if the body is empty or the tables aren't synced.
 */
async function resolveLocal(body: {
  uuids?: string[]
  scryfallIds?: string[]
  prints?: string[]
  names?: string[]
}): Promise<LocalMaps> {
  const empty: LocalMaps = {
    byUuid: new Map(),
    byId: new Map(),
    bySetCn: new Map(),
    byName: new Map(),
    byNameSet: new Map(),
  }
  if (
    !body.uuids?.length &&
    !body.scryfallIds?.length &&
    !body.prints?.length &&
    !body.names?.length
  )
    return empty
  try {
    const res = await fetch('/api/mtgjson/resolve-collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) return empty
    const d = (await res.json()) as Record<keyof LocalMaps, Record<string, ScryCard>>
    return {
      byUuid: new Map(Object.entries(d.byUuid ?? {})),
      byId: new Map(Object.entries(d.byId ?? {})),
      bySetCn: new Map(Object.entries(d.bySetCn ?? {})),
      byName: new Map(Object.entries(d.byName ?? {})),
      byNameSet: new Map(Object.entries(d.byNameSet ?? {})),
    }
  } catch {
    return empty
  }
}

/**
 * Resolve the parsed rows and write them to the collection. Each row is matched
 * locally against the synced MTGJSON tables by a fallback chain — MTGJSON UUID →
 * Scryfall id → set code + collector number → name — so a stale id still resolves
 * by set+collector or name instead of being dropped. Rows that exhaust the chain
 * go to the manual-resolution queue. `mode: "replace"` clears the collection first.
 */
export async function importCollection(
  parsed: CsvParseResult,
  mode: 'merge' | 'replace',
  onProgress?: (p: ImportProgress) => void,
): Promise<ImportResult> {
  const repo = getRepo()

  onProgress?.({ phase: 'resolve', resolved: 0, total: parsed.rows.length })

  // Match each row against the local MTGJSON tables in the canonical order:
  //   MTGJSON UUID → Scryfall id → set code + collector number → name.
  // Every tier is an exact, offline lookup. The precise identifiers resolve in
  // one request; only rows still unmatched fall through to a second name pass,
  // so the name query stays small (and a wrong-printing name match is the last
  // resort, never preferred over an exact set+collector hit).
  const named = (row: ParsedCsvRow) => !!row.name && row.name !== '(unnamed)'

  const precise = await resolveLocal({
    uuids: parsed.rows.filter((r) => r.uuid).map((r) => r.uuid!),
    scryfallIds: parsed.rows.filter((r) => r.scryfallId).map((r) => r.scryfallId!),
    prints: parsed.rows
      .filter((r) => r.setCode && r.collectorNumber)
      .map((r) => `${r.setCode!.toLowerCase()}:${r.collectorNumber}`),
  })

  const matchPrecise = (row: ParsedCsvRow): { card: ScryCard; method: MatchMethod } | undefined => {
    if (row.uuid) {
      const c = precise.byUuid.get(row.uuid)
      if (c) return { card: c, method: 'uuid' }
    }
    if (row.scryfallId) {
      const c = precise.byId.get(row.scryfallId)
      if (c) return { card: c, method: 'scryfallId' }
    }
    if (row.setCode && row.collectorNumber) {
      const c = precise.bySetCn.get(`${row.setCode.toLowerCase()}:${row.collectorNumber}`)
      if (c) return { card: c, method: 'setCollector' }
    }
    return undefined
  }

  // Second pass: resolve unmatched rows by name (front face), preferring the
  // printing from the row's own set when known.
  const unmatchedNames = parsed.rows.filter((r) => named(r) && !matchPrecise(r))
  const nameQuery = new Set<string>()
  for (const r of unmatchedNames) {
    nameQuery.add(r.name.toLowerCase())
    nameQuery.add(frontFaceName(r.name).toLowerCase())
  }
  const byNames = nameQuery.size
    ? await resolveLocal({ names: [...nameQuery] })
    : { byName: new Map<string, ScryCard>(), byNameSet: new Map<string, ScryCard>() }

  const matchName = (row: ParsedCsvRow): ScryCard | undefined => {
    if (!named(row)) return undefined
    const full = row.name.toLowerCase()
    const front = frontFaceName(row.name).toLowerCase()
    if (row.setCode) {
      const set = row.setCode.toLowerCase()
      const c = byNames.byNameSet.get(`${full}|${set}`) ?? byNames.byNameSet.get(`${front}|${set}`)
      if (c) return c
    }
    return byNames.byName.get(full) ?? byNames.byName.get(front)
  }

  const matchRow = (row: ParsedCsvRow): { card: ScryCard; method: MatchMethod } | undefined => {
    const p = matchPrecise(row)
    if (p) return p
    const c = matchName(row)
    return c ? { card: c, method: 'name' } : undefined
  }

  /**
   * Reconstruct the per-row attempt chain in the canonical order
   * (UUID → Scryfall ID → set+collector → name), reporting the tier that won
   * with ✓ and every applicable tier attempted before it with ✗.
   */
  const traceRow = (row: ParsedCsvRow, matched: { method: MatchMethod } | undefined): string[] => {
    const order: MatchMethod[] = ['uuid', 'scryfallId', 'setCollector', 'name']
    const winner = matched ? order.indexOf(matched.method) : order.length
    const lines: string[] = []
    // 1. MTGJSON UUID
    if (row.uuid && 0 <= winner) {
      if (winner === 0) lines.push(`✓ Found by MTGJSON UUID: "${row.uuid}"`)
      else lines.push(`✗ Failed matching MTGJSON UUID: "${row.uuid}"`)
    }
    // 2. Scryfall ID
    if (row.scryfallId && 1 <= winner) {
      if (winner === 1) lines.push(`✓ Found by Scryfall ID: "${row.scryfallId}"`)
      else lines.push(`✗ Failed matching Scryfall ID: "${row.scryfallId}"`)
    }
    // 3. Set code + collector number
    if (2 <= winner) {
      if (winner === 2) {
        lines.push(
          `✓ Found by set code + collector number: "${row.setCode!.toLowerCase()}:${row.collectorNumber}"`,
        )
      } else if (row.setCode && row.collectorNumber) {
        lines.push(
          `✗ Failed matching set code and collector number: "${row.setCode.toLowerCase()}:${row.collectorNumber}"`,
        )
      } else {
        const missing = !row.setCode ? 'set code' : 'collector number'
        lines.push(`✗ Failed matching set code and collector number: "" (row has no ${missing})`)
      }
    }
    // 4. Name
    if (named(row) && 3 <= winner) {
      if (winner === 3) lines.push(`✓ Found by name: "${row.name}"`)
      else lines.push(`✗ Failed matching name: "${row.name}"`)
    }
    return lines
  }

  const total = parsed.rows.length
  // Cache every resolved printing for fast offline display later.
  const resolvedCards: ScryCard[] = [
    ...precise.byUuid.values(),
    ...precise.byId.values(),
    ...precise.bySetCn.values(),
    ...byNames.byName.values(),
  ]
  await cacheCards(resolvedCards).catch(() => {})

  // Build entries, merging duplicate (printing + finish) rows by summing qty.
  const entries = new Map<string, CollectionCard>()
  // Rows that couldn't be matched — collected (and merged) for manual resolution.
  const unresolved = new Map<string, UnresolvedImport>()
  const byMethod: Record<MatchMethod, number> = { uuid: 0, scryfallId: 0, setCollector: 0, name: 0 }
  // Per-row attempt chains, split into matched / unmatched for logging below.
  const failedTraces: string[][] = []
  const matchedTraces: string[][] = []
  const now = Date.now()
  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i]!
    const matched = matchRow(row)
    const card = matched?.card
    if (matched) byMethod[matched.method] += 1
    const trace = traceRow(row, matched)
    ;(matched ? matchedTraces : failedTraces).push([
      `${matched ? 'matched' : 'UNRESOLVED'} — ${row.name}${row.setCode ? ` [${row.setCode} ${row.collectorNumber ?? '?'}]` : ''}`,
      ...trace.map((l) => `  ${l}`),
    ])
    if (!card) {
      const key = `${row.name.toLowerCase()}|${row.setCode ?? ''}|${row.collectorNumber ?? ''}|${row.finish}`
      const prev = unresolved.get(key)
      if (prev) {
        prev.quantity += row.quantity
      } else {
        unresolved.set(key, {
          id: crypto.randomUUID(),
          name: row.name,
          quantity: row.quantity,
          finish: row.finish,
          setCode: row.setCode,
          setName: row.setName,
          collectorNumber: row.collectorNumber,
          scryfallId: row.scryfallId,
          createdAt: now,
        })
      }
      continue
    }
    const id = collectionEntryId(card.id, row.finish)
    const existing = entries.get(id)
    if (existing) {
      existing.quantity += row.quantity
    } else {
      entries.set(id, {
        id,
        printingId: card.id,
        oracleId: card.oracle_id,
        name: card.name,
        setCode: (card.set ?? row.setCode)?.toLowerCase(),
        setName: card.set_name ?? row.setName,
        collectorNumber: card.collector_number ?? row.collectorNumber,
        finish: row.finish,
        quantity: row.quantity,
        card,
        addedAt: now,
        updatedAt: now,
      })
    }
  }

  // --- Import diagnostics -------------------------------------------------
  // Summary of which identifier tier resolved each matched row, then the full
  // attempt chain for every row that couldn't be matched at all.
  console.info(
    `[csv import] resolved ${matchedTraces.length}/${parsed.rows.length} rows — ` +
      `by UUID: ${byMethod.uuid}, Scryfall ID: ${byMethod.scryfallId}, ` +
      `set+collector: ${byMethod.setCollector}, name: ${byMethod.name}; ` +
      `${failedTraces.length} unresolved.`,
  )
  if (failedTraces.length) {
    console.groupCollapsed(`[csv import] ${failedTraces.length} unresolved row(s)`)
    for (const t of failedTraces) console.warn(t.join('\n'))
    console.groupEnd()
  }
  if (IMPORT_DEBUG_VERBOSE && matchedTraces.length) {
    console.groupCollapsed(`[csv import] ${matchedTraces.length} matched row(s)`)
    for (const t of matchedTraces) console.debug(t.join('\n'))
    console.groupEnd()
  }

  onProgress?.({ phase: 'save', resolved: total, total })

  const list = [...entries.values()]
  if (mode === 'replace') {
    await repo.clearCollection()
    await repo.saveCollectionEntries(list)
  } else {
    // Merge: add imported quantities on top of any existing stacks.
    const existing = new Map((await repo.listCollection()).map((c) => [c.id, c]))
    for (const e of list) {
      const prev = existing.get(e.id)
      if (prev) e.quantity += prev.quantity
    }
    await repo.saveCollectionEntries(list)
  }

  // Queue rows we couldn't match for manual resolution (best-effort).
  const unresolvedList = [...unresolved.values()]
  if (unresolvedList.length) await repo.addUnresolvedImports(unresolvedList).catch(() => {})

  onProgress?.({ phase: 'done', resolved: total, total })
  return {
    added: list.length,
    cards: list.reduce((n, e) => n + e.quantity, 0),
    unresolvedIds: unresolvedList.length,
    skippedRows: parsed.skipped.length,
    byMethod,
  }
}
