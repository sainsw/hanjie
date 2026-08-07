'use client';

import { type CSSProperties, memo } from 'react';
import { inkStyle } from '@/lib/ink';
import {
  type Cell as CellValue,
  COL_CLUES,
  HEIGHT,
  ROW_CLUES,
  WIDTH,
} from '@/lib/puzzle';

type Vars = CSSProperties & Record<string, string | number>;

// Hashed once at module load: 225 squares' worth of rotation and corner radii
// that never need recomputing.
const STAMPS: Vars[][] = Array.from({ length: HEIGHT }, (_, r) =>
  Array.from({ length: WIDTH }, (_, c) => ({
    ...inkStyle(r, c),
    '--r': r,
    '--c': c,
  })),
);

const Cell = memo(function Cell({
  r,
  c,
  value,
  hinted,
}: {
  r: number;
  c: number;
  value: CellValue;
  hinted: boolean;
}) {
  return (
    <div
      className="cell"
      data-s={value}
      data-hint={hinted || undefined}
      style={STAMPS[r][c]}
    />
  );
});

function ClueGroup({
  clue,
  settled,
  flash,
  axis,
  index,
}: {
  clue: number[];
  settled: boolean;
  flash: boolean;
  axis: 'row' | 'col';
  index: number;
}) {
  const blank = clue.length === 1 && clue[0] === 0;
  return (
    <div
      className={`clue clue-${axis}`}
      data-settled={settled}
      data-flash={flash || undefined}
      style={{ '--i': index } as Vars}
    >
      {blank ? (
        <span className="num num-zero">·</span>
      ) : (
        clue.map((n, i) => (
          <span className="num" key={i}>
            {n}
          </span>
        ))
      )}
    </div>
  );
}

export function Board({
  board,
  rowSettled,
  colSettled,
  flashing,
  hinted,
}: {
  board: CellValue[][];
  rowSettled: boolean[];
  colSettled: boolean[];
  flashing: ReadonlySet<string>;
  hinted: string | null;
}) {
  return (
    <>
      <div className="corner" aria-hidden="true">
        <svg viewBox="0 0 40 40" className="corner-mark">
          <title>brush mark</title>
          <path
            d="M8 31 C 15 27, 19 20, 22 12 C 24 7, 28 6, 32 9"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="10" cy="10" r="2.4" fill="currentColor" />
        </svg>
      </div>

      <div className="rail rail-col" aria-hidden="true">
        {COL_CLUES.map((clue, c) => (
          <ClueGroup
            key={c}
            clue={clue}
            index={c}
            axis="col"
            settled={colSettled[c]}
            flash={flashing.has(`col:${c}`)}
          />
        ))}
      </div>

      <div className="rail rail-row" aria-hidden="true">
        {ROW_CLUES.map((clue, r) => (
          <ClueGroup
            key={r}
            clue={clue}
            index={r}
            axis="row"
            settled={rowSettled[r]}
            flash={flashing.has(`row:${r}`)}
          />
        ))}
      </div>

      <div className="board-wrap">
        <div className="rules" aria-hidden="true" />
        <div className="cells" aria-hidden="true">
          {board.map((row, r) =>
            row.map((value, c) => (
              <Cell
                key={`${r}:${c}`}
                r={r}
                c={c}
                value={value}
                hinted={hinted === `${r}:${c}`}
              />
            )),
          )}
        </div>
      </div>
    </>
  );
}
