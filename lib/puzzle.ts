// The picture is the source of truth. Clues are derived from it at module load,
// which means the art and the numbers can never drift apart.
//
// `#` is ink, `.` is paper. Keep the block rectangular; scripts/verify-puzzle.mjs
// re-derives the clues from this literal and checks the puzzle still has exactly
// one solution reachable by line logic alone.
const ART = `
...............
...........##..
.####.....####.
..........####.
###........##..
......###......
......####.....
.....#####.....
....#######....
....########...
...##.....##...
..####......#..
..############.
.##############
###############
`;

export type Cell = 0 | 1 | 2; // paper, ink, marked-empty

export const SOLUTION: readonly (readonly number[])[] = ART.trim()
  .split('\n')
  .map((line) => [...line.trim()].map((ch) => (ch === '#' ? 1 : 0)));

export const HEIGHT = SOLUTION.length;
export const WIDTH = SOLUTION[0].length;

export const PUZZLE = {
  title: 'Fuji at first light',
  kanji: '富士',
  note: 'A low sun, drifting mist, and the mountain beneath it.',
} as const;

function runsOf(line: readonly number[]): number[] {
  const out: number[] = [];
  let run = 0;
  for (const cell of line) {
    if (cell === 1) {
      run += 1;
    } else if (run > 0) {
      out.push(run);
      run = 0;
    }
  }
  if (run > 0) out.push(run);
  return out.length > 0 ? out : [0];
}

export const ROW_CLUES: number[][] = SOLUTION.map((row) => runsOf(row));

export const COL_CLUES: number[][] = Array.from({ length: WIDTH }, (_, c) =>
  runsOf(SOLUTION.map((row) => row[c])),
);

export const TOTAL_INK = SOLUTION.flat().filter((v) => v === 1).length;

/** How deep the widest row clue and tallest column clue are, for layout. */
export const CLUE_DEPTH = {
  rows: Math.max(...ROW_CLUES.map((c) => c.length)),
  cols: Math.max(...COL_CLUES.map((c) => c.length)),
};

/**
 * A line is "settled" when its filled runs already match its clue. That is what
 * dims the numbers as you go. Marked-empty cells are ignored: only ink counts.
 */
export function lineSatisfied(cells: readonly Cell[], clue: number[]): boolean {
  const actual = runsOf(cells.map((c) => (c === 1 ? 1 : 0)));
  return actual.length === clue.length && actual.every((n, i) => n === clue[i]);
}

/** Ink in the right places, everywhere. Marks are irrelevant to winning. */
export function isSolved(board: readonly Cell[][]): boolean {
  for (let r = 0; r < HEIGHT; r += 1) {
    for (let c = 0; c < WIDTH; c += 1) {
      if ((board[r][c] === 1 ? 1 : 0) !== SOLUTION[r][c]) return false;
    }
  }
  return true;
}

export function emptyBoard(): Cell[][] {
  return Array.from({ length: HEIGHT }, () => new Array<Cell>(WIDTH).fill(0));
}
