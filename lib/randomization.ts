import type { BoxContent } from "@/types/boxes";

/** Fisher–Yates shuffle. Returns a new array; never mutates the input. */
export function shuffle<T>(input: readonly T[]): T[] {
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pickRandom<T>(input: readonly T[]): T | null {
  if (input.length === 0) return null;
  return input[Math.floor(Math.random() * input.length)];
}

/** De-duplicate a participant name list while keeping order, trimming blanks. */
export function normalizeNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** Split a pasted blob (newlines or commas) into clean names. */
export function parseNameList(text: string): string[] {
  return normalizeNames(text.split(/[\n,;]+/));
}

/**
 * Split a pasted box list — one box per line.
 * Optional labels like "Box 1:", "1." or "Box 2 -" are stripped so only the
 * content remains. Blank lines are skipped; a labelled-but-empty line keeps
 * its position as an empty entry (validation flags it).
 */
export function parseBoxList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => line.replace(/^\s*(?:box\s*\d+\s*[:.\-–]?|\d+\s*[:.\-–])\s*/i, "").trim());
}

/**
 * Build the content assigned to each box for one round.
 * The number of boxes may differ from the number of contents, so we repeat and
 * shuffle the content pool to fill exactly `boxCount` boxes.
 */
export function buildContentsOrder(contents: readonly BoxContent[], boxCount: number): BoxContent[] {
  if (boxCount <= 0) return [];
  if (contents.length === 0) return [];
  const pool: BoxContent[] = [];
  while (pool.length < boxCount) {
    pool.push(...shuffle(contents));
  }
  return shuffle(pool).slice(0, boxCount);
}

/** Build the list of box indexes [0..boxCount-1], shuffled for display order. */
export function buildBoxIndexes(boxCount: number): number[] {
  const indexes = Array.from({ length: Math.max(0, boxCount) }, (_, i) => i);
  return shuffle(indexes);
}
