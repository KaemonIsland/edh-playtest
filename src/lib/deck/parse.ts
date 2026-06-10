import type { ParsedDeckLine, ParsedDecklist } from "@/types";

/**
 * Parse a plain-text decklist. Handles the common formats:
 *   1 Sol Ring
 *   1x Sol Ring
 *   Sol Ring            (quantity defaults to 1)
 *   1 Sol Ring (c16) 250            <- set / collector suffix, stripped
 *   1 Sol Ring [Ramp]               <- Archidekt-ish category tags
 *   1 Atraxa, Praetors' Voice *CMDR*
 *   // Commander  /  Commander:     <- section headers
 *   SB: 1 Sol Ring                  <- sideboard, ignored with a warning
 *   # comment / blank lines         <- skipped
 */
export function parseDecklist(text: string): ParsedDecklist {
  const lines: ParsedDeckLine[] = [];
  const warnings: string[] = [];
  let currentSection: "main" | "commander" | "sideboard" | "maybe" = "main";
  let currentCategory: string | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const raw = rawLine.trim();
    if (!raw) continue;

    // Comments & section headers
    const headerMatch = raw.match(/^(?:\/\/|#)?\s*(commander|command zone|sideboard|maybeboard|maybe|deck|mainboard|main)\s*:?\s*(?:\(\d+\))?$/i);
    if (headerMatch) {
      const section = headerMatch[1]!.toLowerCase();
      if (section.startsWith("commander") || section === "command zone") currentSection = "commander";
      else if (section === "sideboard") currentSection = "sideboard";
      else if (section.startsWith("maybe")) currentSection = "maybe";
      else currentSection = "main";
      continue;
    }
    if (raw.startsWith("//") || raw.startsWith("#")) {
      // Treat any other comment as a category header, e.g. "// Ramp".
      // A new header also ends a Commander/sideboard section.
      const label = raw.replace(/^(?:\/\/|#)\s*/, "").trim();
      if (label) {
        currentCategory = label;
        currentSection = "main";
      }
      continue;
    }

    let line = raw;
    let isSideboard = currentSection === "sideboard" || currentSection === "maybe";
    if (/^SB:\s*/i.test(line)) {
      isSideboard = true;
      line = line.replace(/^SB:\s*/i, "");
    }

    // Quantity prefix: "1 ", "1x ", "x1 "
    let quantity = 1;
    const qtyMatch = line.match(/^(\d+)\s*[xX]?\s+(.*)$/) ?? line.match(/^[xX](\d+)\s+(.*)$/);
    let rest = line;
    if (qtyMatch) {
      quantity = parseInt(qtyMatch[1]!, 10);
      rest = qtyMatch[2]!;
    }

    // Commander markers
    let isCommander = currentSection === "commander";
    if (/\*CMDR\*/i.test(rest)) {
      isCommander = true;
      rest = rest.replace(/\*CMDR\*/gi, "");
    }
    // Other inline flags Archidekt emits, e.g. *F* (foil) — strip them
    rest = rest.replace(/\*[A-Z]+\*/g, "");

    // Category tags: [Ramp] or [Ramp,Draw] or ^Have^ etc.
    const categories: string[] = currentCategory ? [currentCategory] : [];
    rest = rest.replace(/\[([^\]]*)\]/g, (_, cats: string) => {
      for (const c of cats.split(",")) {
        const trimmed = c.split("{")[0]!.trim(); // strip Archidekt color tags like {top}
        if (trimmed && !categories.includes(trimmed)) categories.push(trimmed);
      }
      return "";
    });
    rest = rest.replace(/\^[^^]*\^/g, "");

    // Set / collector suffixes: "(c16) 250", "(2XM)", "(PLST) 250s"
    let setCode: string | undefined;
    let collectorNumber: string | undefined;
    const setMatch = rest.match(/\(([A-Za-z0-9]{2,6})\)\s*([A-Za-z0-9★-]+)?\s*$/);
    if (setMatch) {
      setCode = setMatch[1]!.toLowerCase();
      collectorNumber = setMatch[2];
      rest = rest.slice(0, setMatch.index).trim();
    }

    const name = rest.trim();
    if (!name) {
      warnings.push(`Could not parse line: "${raw}"`);
      continue;
    }
    if (!Number.isFinite(quantity) || quantity < 1) {
      warnings.push(`Bad quantity on line: "${raw}" — defaulting to 1`);
      quantity = 1;
    }
    if (isSideboard) {
      warnings.push(`Skipped sideboard/maybeboard card: ${name}`);
      continue;
    }

    // Merge duplicate names
    const existing = lines.find(
      (l) => l.name.toLowerCase() === name.toLowerCase() && l.isCommander === isCommander,
    );
    if (existing) {
      existing.quantity += quantity;
    } else {
      lines.push({ raw, name, quantity, isCommander, categories, setCode, collectorNumber });
    }
  }

  if (lines.length === 0) {
    warnings.push("No cards found in the pasted text.");
  }
  return { lines, warnings };
}
