// Checks the shipped puzzle: derives clues from the art, then confirms the
// clues have exactly one solution and that plain line-by-line deduction is
// enough to reach it (no guessing required).
//
//   node scripts/verify-puzzle.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// With no argument it checks the shipped art; pass a file of raw #/. lines to
// try a variant without touching lib/puzzle.ts.
const variant = process.argv[2];

let art;
if (variant) {
  art = readFileSync(variant, 'utf8');
} else {
  const src = readFileSync(
    fileURLToPath(new URL('../lib/puzzle.ts', import.meta.url)),
    'utf8',
  );
  const artMatch = src.match(/const ART = `\n([\s\S]*?)`/);
  if (!artMatch) {
    throw new Error('could not find the ART template literal in lib/puzzle.ts');
  }
  art = artMatch[1];
}

const rows = art
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const height = rows.length;
const width = rows[0].length;

for (const [i, row] of rows.entries()) {
  if (row.length !== width) {
    throw new Error(`row ${i} is ${row.length} wide, expected ${width}`);
  }
}

const grid = rows.map((row) => [...row].map((ch) => (ch === '#' ? 1 : 0)));

const runs = (line) => {
  const out = [];
  let n = 0;
  for (const cell of line) {
    if (cell === 1) n += 1;
    else if (n > 0) {
      out.push(n);
      n = 0;
    }
  }
  if (n > 0) out.push(n);
  return out.length > 0 ? out : [0];
};

const rowClues = grid.map(runs);
const colClues = Array.from({ length: width }, (_, c) =>
  runs(grid.map((row) => row[c])),
);

// Every arrangement of `clue` inside a line of `len` cells.
const arrangements = (clue, len) => {
  if (clue.length === 1 && clue[0] === 0) return [new Array(len).fill(0)];
  const out = [];
  const place = (idx, start, acc) => {
    if (idx === clue.length) {
      out.push([...acc, ...new Array(len - acc.length).fill(0)]);
      return;
    }
    const remaining =
      clue.slice(idx).reduce((a, b) => a + b, 0) + (clue.length - idx - 1);
    for (let s = start; s + remaining <= len; s += 1) {
      const next = [...acc];
      while (next.length < s) next.push(0);
      for (let k = 0; k < clue[idx]; k += 1) next.push(1);
      if (idx < clue.length - 1) next.push(0);
      place(idx + 1, next.length, next);
    }
  };
  place(0, 0, []);
  return out;
};

const UNKNOWN = -1;

// One pass of line solving: keep only the arrangements compatible with what is
// already known, then commit any cell every survivor agrees on.
const solveLines = (clues, lines) => {
  let changed = false;
  const next = lines.map((line, i) => {
    const fits = arrangements(clues[i], line.length).filter((cand) =>
      cand.every((v, j) => line[j] === UNKNOWN || line[j] === v),
    );
    if (fits.length === 0) throw new Error(`line ${i} has no valid placement`);
    return line.map((v, j) => {
      if (v !== UNKNOWN) return v;
      const first = fits[0][j];
      if (fits.every((cand) => cand[j] === first)) {
        changed = true;
        return first;
      }
      return UNKNOWN;
    });
  });
  return { lines: next, changed };
};

let board = Array.from({ length: height }, () =>
  new Array(width).fill(UNKNOWN),
);

let passes = 0;
for (;;) {
  passes += 1;
  const byRow = solveLines(rowClues, board);
  board = byRow.lines;

  const cols = Array.from({ length: width }, (_, c) =>
    board.map((row) => row[c]),
  );
  const byCol = solveLines(colClues, cols);
  for (let c = 0; c < width; c += 1) {
    for (let r = 0; r < height; r += 1) board[r][c] = byCol.lines[c][r];
  }

  if (!byRow.changed && !byCol.changed) break;
  if (passes > 200) throw new Error('line solver did not settle');
}

const unresolved = board.flat().filter((v) => v === UNKNOWN).length;
const matches = board.every((row, r) =>
  row.every((v, c) => v === grid[r][c] || v === UNKNOWN),
);

console.log(`${width}x${height}, ${grid.flat().filter(Boolean).length} filled`);
console.log(
  rows.map((r) => r.replaceAll('#', '██').replaceAll('.', '  ')).join('\n'),
);
console.log(`\nline-solver passes: ${passes}`);
console.log(`cells left ambiguous: ${unresolved}`);
console.log(`deductions agree with the art: ${matches}`);

if (!matches) {
  console.error('\nFAIL: line solving contradicts the intended picture');
  process.exit(1);
}
if (unresolved > 0) {
  console.error(
    `\nFAIL: ${unresolved} cells need guessing, so the puzzle is not cleanly solvable`,
  );
  for (let r = 0; r < height; r += 1) {
    const line = board[r]
      .map((v, c) =>
        v === UNKNOWN ? (grid[r][c] ? '??' : '..') : v ? '██' : '  ',
      )
      .join('');
    console.error(line);
  }
  process.exit(1);
}

console.log('\nOK: unique solution, reachable by line logic alone');
