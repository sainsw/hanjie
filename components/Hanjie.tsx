'use client';

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import { sfx } from '@/lib/audio';
import {
  type Cell,
  CLUE_DEPTH,
  COL_CLUES,
  emptyBoard,
  HEIGHT,
  isSolved,
  lineSatisfied,
  PUZZLE,
  ROW_CLUES,
  SOLUTION,
  WIDTH,
} from '@/lib/puzzle';
import { Board } from './Board';
import { Seal, type Stage, WinCard } from './Finale';
import {
  BrushIcon,
  Control,
  HintIcon,
  LampIcon,
  MarkIcon,
  RedoIcon,
  ResetIcon,
  SoundIcon,
  Tally,
  UndoIcon,
} from './Hud';

type Change = { r: number; c: number; from: Cell; to: Cell };

type GameState = {
  board: Cell[][];
  past: Change[][];
  future: Change[][];
  hints: number;
  solved: boolean;
};

type Action =
  | { type: 'begin'; change: Change }
  | { type: 'extend'; change: Change }
  | { type: 'hint'; change: Change }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset' };

function withChanges(
  board: Cell[][],
  changes: Change[],
  side: 'to' | 'from',
): Cell[][] {
  const next = board.map((row) => row.slice());
  for (const ch of changes) next[ch.r][ch.c] = ch[side];
  return next;
}

function initial(): GameState {
  return { board: emptyBoard(), past: [], future: [], hints: 0, solved: false };
}

function reduce(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'begin':
    case 'hint': {
      const board = withChanges(state.board, [action.change], 'to');
      return {
        board,
        past: [...state.past, [action.change]],
        future: [],
        hints: state.hints + (action.type === 'hint' ? 1 : 0),
        solved: isSolved(board),
      };
    }
    case 'extend': {
      if (state.past.length === 0) return state;
      const board = withChanges(state.board, [action.change], 'to');
      const past = state.past.slice();
      past[past.length - 1] = [...past[past.length - 1], action.change];
      return { ...state, board, past, future: [], solved: isSolved(board) };
    }
    case 'undo': {
      const last = state.past.at(-1);
      if (!last) return state;
      const board = withChanges(state.board, last, 'from');
      return {
        ...state,
        board,
        past: state.past.slice(0, -1),
        future: [last, ...state.future],
        solved: isSolved(board),
      };
    }
    case 'redo': {
      const [next, ...rest] = state.future;
      if (!next) return state;
      const board = withChanges(state.board, next, 'to');
      return {
        ...state,
        board,
        past: [...state.past, next],
        future: rest,
        solved: isSolved(board),
      };
    }
    case 'reset':
      return initial();
  }
}

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

type Drag = {
  to: Cell;
  origin: { r: number; c: number };
  axis: 'row' | 'col' | null;
  painted: Set<string>;
  streak: number;
  pointerId: number;
};

export function Hanjie() {
  const [state, dispatch] = useReducer(reduce, undefined, initial);
  const [mode, setMode] = useState<'ink' | 'mark'>('ink');
  const [muted, setMuted] = useState(false);
  const [night, setNight] = useState(false);
  const [stage, setStage] = useState<Stage>('play');
  const [flashing, setFlashing] = useState<ReadonlySet<string>>(new Set());
  const [hinted, setHinted] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  // Open on a first visit, shut on every one after. The rules are worth exactly
  // one read. `helpVisible` outlives `helpOpen` by one animation: the card has
  // to stay painted while it shrinks back into the stamp.
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);

  const hitRef = useRef<HTMLDivElement>(null);
  const puzzleRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLSpanElement>(null);
  const sealRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const flipRef = useRef<Animation | null>(null);
  const drag = useRef<Drag | null>(null);
  const cursor = useRef({ r: 7, c: 7 });
  const settledRef = useRef<{ rows: boolean[]; cols: boolean[] } | null>(null);

  // Read during render so pointer handlers always see the committed board.
  const liveBoard = useRef(state.board);
  liveBoard.current = state.board;

  const rowSettled = useMemo(
    () => state.board.map((row, r) => lineSatisfied(row, ROW_CLUES[r])),
    [state.board],
  );
  const colSettled = useMemo(
    () =>
      Array.from({ length: WIDTH }, (_, c) =>
        lineSatisfied(
          state.board.map((row) => row[c]),
          COL_CLUES[c],
        ),
      ),
    [state.board],
  );

  /* ----------------------------------------------------------------- focus */
  // The crosshair follows the pointer through CSS custom properties rather than
  // React state, so moving across 225 squares never triggers a render.
  const setFocus = useCallback((r: number | null, c: number | null) => {
    const el = puzzleRef.current;
    if (!el) return;
    if (r === null || c === null) {
      el.dataset.hover = 'false';
      return;
    }
    el.style.setProperty('--hr', String(r));
    el.style.setProperty('--hc', String(c));
    el.dataset.hover = 'true';
  }, []);

  const moveCursor = useCallback(
    (r: number, c: number) => {
      cursor.current = {
        r: Math.max(0, Math.min(HEIGHT - 1, r)),
        c: Math.max(0, Math.min(WIDTH - 1, c)),
      };
      const el = puzzleRef.current;
      if (el) el.dataset.cursor = 'true';
      setFocus(cursor.current.r, cursor.current.c);
    },
    [setFocus],
  );

  /* ---------------------------------------------------------------- paints */
  const voice = useCallback((to: Cell, streak: number) => {
    if (to === 1) sfx.play('ink', { streak });
    else if (to === 2) sfx.play('mark');
    else sfx.play('erase');
  }, []);

  const paint = useCallback(
    (r: number, c: number, to: Cell, extend: boolean) => {
      const from = liveBoard.current[r][c];
      if (from === to) return false;
      dispatch({
        type: extend ? 'extend' : 'begin',
        change: { r, c, from, to },
      });
      return true;
    },
    [],
  );

  const markSeen = useCallback(() => {
    try {
      localStorage.setItem('hanjie:seen', 'true');
    } catch {
      // A private window that refuses storage just gets the rules every time,
      // which is the harmless way round to fail.
    }
  }, []);

  const beginClock = useCallback(() => {
    setStartedAt((at) => at ?? Date.now());
    markSeen();
  }, [markSeen]);

  /**
   * The stamp becoming the card, and back. The card always sits at its full
   * size in CSS; what animates is a transform that squashes it onto the stamp's
   * square, so the type inside is only ever scaled down and never blurs the way
   * it would growing from a 50px box. Half a turn on Y carries the two faces
   * past each other, and backface-visibility does the swap at the edge.
   */
  const setHelp = useCallback(
    (next: boolean) => {
      const slot = slotRef.current;
      const card = cardRef.current;
      sfx.play('ui');
      markSeen();

      const still =
        typeof window === 'undefined' ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (!slot || !card || still) {
        setHelpVisible(next);
        setHelpOpen(next);
        return;
      }

      // Any held transform from a previous turn has to go before the card is
      // measured, or the next one starts its sums from a squashed box.
      flipRef.current?.cancel();

      // The card has to be painted before it can be measured.
      if (next) flushSync(() => setHelpVisible(true));
      flushSync(() => setHelpOpen(next));

      const s = slot.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      // Both halves of the transform have to be spelled out here, because a
      // keyframe replaces the property outright — including the centring the
      // card's resting rule depends on.
      // perspective() sits between the flat part of the transform and the half
      // turn, so the near edge swings towards you instead of the card simply
      // squashing flat. It has to be in the list rather than on a parent: the
      // card is fixed to the viewport and has no transformed ancestor.
      const centre = 'translate(-50%, -50%)';
      const depth = 'perspective(1400px)';
      const onStamp =
        `${centre} translate(${(s.left + s.width / 2 - (c.left + c.width / 2)).toFixed(2)}px,` +
        ` ${(s.top + s.height / 2 - (c.top + c.height / 2)).toFixed(2)}px)` +
        ` scale(${(s.width / c.width).toFixed(4)}, ${(s.height / c.height).toFixed(4)})`;

      // The face showing while the card is stamp-sized has to be drawn at the
      // size the squash cancels out, or the mark comes back tiny.
      card.style.setProperty('--flip-scale', String(s.width / c.width));

      flipRef.current = card.animate(
        next
          ? [
              { transform: `${onStamp} rotate(3deg) ${depth} rotateY(0deg)` },
              {
                transform: `${centre} translate(0, 0) scale(1, 1) rotate(0deg) ${depth} rotateY(180deg)`,
              },
            ]
          : [
              {
                transform: `${centre} translate(0, 0) scale(1, 1) rotate(0deg) ${depth} rotateY(180deg)`,
              },
              { transform: `${onStamp} rotate(3deg) ${depth} rotateY(0deg)` },
            ],
        {
          duration: next ? 680 : 560,
          // Symmetric on purpose. A front-loaded ease puts the half-turn past
          // 90deg within the first quarter of the time, so the stamp face is
          // gone before you have seen it turn and the card just appears. This
          // crosses the edge at the midpoint: it grows facing you, then turns.
          easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
          // Hold the last frame. Releasing to the resting rule the instant the
          // turn ends put the card back at full size for the one frame before
          // React could hide it, which read as the modal flashing up again.
          fill: 'forwards',
        },
      );

      if (!next) {
        flipRef.current.finished
          .then(() => setHelpVisible(false))
          .catch(() => {
            // Cancelled by a re-open mid-flight, which already owns the state.
          });
      }
    },
    [markSeen],
  );

  const cellFrom = useCallback((clientX: number, clientY: number) => {
    const el = hitRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const c = Math.floor(((clientX - rect.left) / rect.width) * WIDTH);
    const r = Math.floor(((clientY - rect.top) / rect.height) * HEIGHT);
    if (r < 0 || r >= HEIGHT || c < 0 || c >= WIDTH) return null;
    return { r, c };
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (state.solved) return;
      const cell = cellFrom(e.clientX, e.clientY);
      if (!cell) return;

      e.preventDefault();
      sfx.resume();
      beginClock();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Capture is a convenience for drags that leave the grid, not a
        // requirement, and some pointer ids refuse it.
      }

      const wantMark = e.button === 2 || e.ctrlKey || mode === 'mark';
      const wanted: Cell = wantMark ? 2 : 1;
      const current = liveBoard.current[cell.r][cell.c];
      // Starting on a square that already holds what you are painting means you
      // meant to rub it out, and the whole drag then rubs out.
      const to: Cell = current === wanted ? 0 : wanted;

      drag.current = {
        to,
        origin: cell,
        axis: null,
        painted: new Set([`${cell.r}:${cell.c}`]),
        streak: 0,
        pointerId: e.pointerId,
      };
      moveCursor(cell.r, cell.c);
      if (paint(cell.r, cell.c, to, false)) voice(to, 0);
    },
    [beginClock, cellFrom, mode, moveCursor, paint, state.solved, voice],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const cell = cellFrom(e.clientX, e.clientY);
      const d = drag.current;

      if (!d) {
        setFocus(cell?.r ?? null, cell?.c ?? null);
        if (puzzleRef.current) puzzleRef.current.dataset.cursor = 'false';
        return;
      }
      if (!cell) return;

      // Lock to whichever way the drag first committed, which is how you fill a
      // long run without wobbling into the neighbouring line.
      let { r, c } = cell;
      if (d.axis === null && (r !== d.origin.r || c !== d.origin.c)) {
        d.axis =
          Math.abs(r - d.origin.r) >= Math.abs(c - d.origin.c) ? 'col' : 'row';
      }
      if (d.axis === 'row') r = d.origin.r;
      if (d.axis === 'col') c = d.origin.c;

      const key = `${r}:${c}`;
      if (d.painted.has(key)) return;
      d.painted.add(key);
      setFocus(r, c);
      if (paint(r, c, d.to, true)) {
        d.streak += 1;
        voice(d.to, d.streak);
      }
    },
    [cellFrom, paint, setFocus, voice],
  );

  const endDrag = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  /* ----------------------------------------------------------------- moves */
  const toggleAt = useCallback(
    (r: number, c: number, wanted: Cell) => {
      if (state.solved) return;
      sfx.resume();
      beginClock();
      const current = liveBoard.current[r][c];
      const to: Cell = current === wanted ? 0 : wanted;
      if (paint(r, c, to, false)) voice(to, 0);
    },
    [beginClock, paint, state.solved, voice],
  );

  const undo = useCallback(() => {
    if (state.past.length === 0) return;
    sfx.play('undo');
    dispatch({ type: 'undo' });
  }, [state.past.length]);

  const redo = useCallback(() => {
    if (state.future.length === 0) return;
    sfx.play('undo');
    dispatch({ type: 'redo' });
  }, [state.future.length]);

  const takeHint = useCallback(() => {
    if (state.solved) return;
    const wrong: { r: number; c: number }[] = [];
    for (let r = 0; r < HEIGHT; r += 1) {
      for (let c = 0; c < WIDTH; c += 1) {
        const has = state.board[r][c] === 1 ? 1 : 0;
        if (has !== SOLUTION[r][c]) wrong.push({ r, c });
      }
    }
    if (wrong.length === 0) return;

    sfx.resume();
    beginClock();
    const { r, c } = wrong[Math.floor(Math.random() * wrong.length)];
    const to: Cell = SOLUTION[r][c] === 1 ? 1 : 2;
    dispatch({ type: 'hint', change: { r, c, from: state.board[r][c], to } });
    sfx.play('hint');
    moveCursor(r, c);
    setHinted(`${r}:${c}`);
    setAnnouncement(
      `Hint: row ${r + 1}, column ${c + 1} is ${to === 1 ? 'ink' : 'empty'}.`,
    );
  }, [beginClock, moveCursor, state.board, state.solved]);

  const reset = useCallback(() => {
    if (!confirmReset) {
      setConfirmReset(true);
      sfx.play('ui');
      return;
    }
    setConfirmReset(false);
    setStartedAt(null);
    setElapsed(0);
    setStage('play');
    settledRef.current = null;
    sfx.play('erase');
    dispatch({ type: 'reset' });
  }, [confirmReset]);

  /* --------------------------------------------------------------- effects */
  useEffect(() => {
    if (!confirmReset) return;
    const id = setTimeout(() => setConfirmReset(false), 3200);
    return () => clearTimeout(id);
  }, [confirmReset]);

  useEffect(() => {
    if (!hinted) return;
    const id = setTimeout(() => setHinted(null), 1000);
    return () => clearTimeout(id);
  }, [hinted]);

  // Sound and theme both survive a reload, and so does having read the rules.
  useEffect(() => {
    const savedMute = localStorage.getItem('hanjie:muted') === 'true';
    setMuted(savedMute);
    sfx.setMuted(savedMute);
    setNight(document.documentElement.dataset.theme === 'night');
    const first = localStorage.getItem('hanjie:seen') !== 'true';
    setHelpVisible(first);
    setHelpOpen(first);
  }, []);

  // Focus follows the card in and back out again, so the rules are not
  // something a keyboard has to go looking for or get stuck behind.
  useEffect(() => {
    if (helpOpen) closeRef.current?.focus();
    else if (helpVisible) sealRef.current?.focus();
  }, [helpOpen, helpVisible]);

  // A note for every line that comes out right, climbing as the sheet fills.
  useEffect(() => {
    const prev = settledRef.current;
    settledRef.current = { rows: rowSettled, cols: colSettled };
    if (!prev) return;

    const fresh: string[] = [];
    rowSettled.forEach((on, i) => {
      if (on && !prev.rows[i]) fresh.push(`row:${i}`);
    });
    colSettled.forEach((on, i) => {
      if (on && !prev.cols[i]) fresh.push(`col:${i}`);
    });
    if (fresh.length === 0) return;

    const done =
      rowSettled.filter(Boolean).length + colSettled.filter(Boolean).length;
    fresh.slice(0, 2).forEach((_, i) => {
      sfx.play('line', { degree: Math.floor(done / 4), delay: i * 0.11 });
    });
    setFlashing(new Set(fresh));
    setAnnouncement(`${done} of ${HEIGHT + WIDTH} lines settled.`);
  }, [rowSettled, colSettled]);

  useEffect(() => {
    if (flashing.size === 0) return;
    const id = setTimeout(() => setFlashing(new Set()), 720);
    return () => clearTimeout(id);
  }, [flashing]);

  // The finish, staged: the marks clear, the squares knit together, the seal
  // lands, then the card arrives.
  useEffect(() => {
    if (!state.solved) {
      setStage('play');
      return;
    }
    if (startedAt !== null) setElapsed(Date.now() - startedAt);
    setStage('settle');
    setAnnouncement(`Solved. ${PUZZLE.title}.`);
    sfx.playVictory();

    const timers = [
      setTimeout(() => setStage('merge'), 520),
      setTimeout(() => {
        setStage('seal');
        sfx.play('drum');
      }, 1250),
      setTimeout(() => setStage('card'), 1780),
    ];
    return () => timers.forEach(clearTimeout);
  }, [state.solved, startedAt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // While the rules are up they are the only thing on the page, so nothing
      // else gets a key: pressing H behind a modal should not spend a hint.
      if (helpOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setHelp(false);
        }
        return;
      }

      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (meta) return;

      // A letter does nothing to a focused button, so these stay global.
      switch (e.key) {
        case 'h':
        case 'H':
          takeHint();
          return;
        case 'm':
        case 'M':
          setMuted((was) => {
            const next = !was;
            sfx.setMuted(next);
            localStorage.setItem('hanjie:muted', String(next));
            return next;
          });
          return;
        case 'e':
        case 'E':
          setMode((m) => (m === 'ink' ? 'mark' : 'ink'));
          sfx.play('ui');
          return;
      }

      // The rest drive the cursor inside the grid, and Space and Enter are how
      // you press a button. Left global they swallowed Space from whichever
      // control had focus: the button never fired, and a square nobody could
      // see the cursor on got inked instead.
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.closest('button')) return;

      const { r, c } = cursor.current;
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          moveCursor(r - 1, c);
          break;
        case 'ArrowDown':
          e.preventDefault();
          moveCursor(r + 1, c);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          moveCursor(r, c - 1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          moveCursor(r, c + 1);
          break;
        case ' ':
        case 'Enter':
          e.preventDefault();
          toggleAt(r, c, 1);
          break;
        case 'x':
        case 'X':
          e.preventDefault();
          toggleAt(r, c, 2);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [helpOpen, moveCursor, redo, setHelp, takeHint, toggleAt, undo]);

  /* ---------------------------------------------------------------- render */
  const toggleSound = () => {
    const next = !muted;
    setMuted(next);
    sfx.setMuted(next);
    sfx.resume();
    localStorage.setItem('hanjie:muted', String(next));
    if (!next) sfx.play('ui');
  };

  const toggleTheme = () => {
    const next = !night;
    setNight(next);
    document.documentElement.dataset.theme = next ? 'night' : 'day';
    localStorage.setItem('hanjie:theme', next ? 'night' : 'day');
    sfx.play('ui');
  };

  const vars = {
    '--w': WIDTH,
    '--h': HEIGHT,
    '--rowdepth': CLUE_DEPTH.rows,
    '--coldepth': CLUE_DEPTH.cols,
  } as CSSProperties;

  return (
    <div className="stage" data-stage={stage} data-help={helpVisible}>
      <header className="masthead">
        <h1 className="brand">
          <span className="brand-word">Hanjie</span>
          {/* The seal was decoration. It is now the only thing the rules hang
              off, and the slot holds its square so the title does not shift
              when the stamp lifts off the page to become the card. */}
          <span className="brand-seal-slot" ref={slotRef}>
            <button
              type="button"
              className="brand-seal"
              ref={sealRef}
              onClick={() => setHelp(true)}
              aria-expanded={helpOpen}
              aria-controls="how-to-play"
              aria-label="How to play"
            >
              <span aria-hidden="true">絵</span>
            </button>
          </span>
        </h1>
      </header>

      {/* The stamp, turned over and enlarged. It is a separate element from the
          button on purpose: rules nested inside a <button> would be swallowed
          into its accessible name and never read out. The flip below moves this
          card from the stamp's square to its own, so it reads as one object. */}
      {/* A dismiss target only; Escape and the close button carry the job. */}
      <div
        className="seal-scrim"
        data-show={helpOpen}
        onClick={() => setHelp(false)}
        aria-hidden="true"
      />
      <div
        className="seal-card"
        id="how-to-play"
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-to-play-title"
        data-show={helpVisible}
        inert={!helpOpen}
      >
        <div className="seal-card-front" aria-hidden="true">
          絵
        </div>
        <div className="seal-card-back">
          <h2 className="seal-card-title" id="how-to-play-title">
            How to play
          </h2>
          <p className="help-lede">
            The numbers count the runs of ink in each line. Work out where they
            sit, and a picture comes out of the grid.
          </p>
          <ul className="help-list">
            <li>
              Drag to fill a run. The drag locks to the line you started along.
            </li>
            <li>
              Start on a square that already has your paint to rub out instead.
            </li>
            <li className="help-fine">Right click paints the other thing.</li>
            <li className="help-fine">
              <b>Arrows</b> move, <b>space</b> fills, <b>X</b> rules out.{' '}
              <b>H</b> hint, <b>M</b> mute, <b>E</b> mode, <b>⌘Z</b> undo.
            </li>
            <li>Marks are only for you. Only the ink has to match.</li>
          </ul>
          <button
            type="button"
            className="seal-card-close"
            ref={closeRef}
            onClick={() => setHelp(false)}
          >
            Press on
          </button>
        </div>
      </div>

      <div className="table">
        <div className="sheet">
          <div
            className="puzzle"
            ref={puzzleRef}
            style={vars}
            data-hover="false"
            data-cursor="false"
          >
            <div className="crosshair crosshair-row" aria-hidden="true" />
            <div className="crosshair crosshair-col" aria-hidden="true" />
            <div className="cursor-ring" aria-hidden="true" />

            <Board
              board={state.board}
              rowSettled={rowSettled}
              colSettled={colSettled}
              flashing={flashing}
              hinted={hinted}
            />

            {/* One element takes every pointer event for all 225 squares, and
                it is also the single tab stop: keyboard play moves a cursor
                inside the grid rather than tabbing through the squares, and
                changes are read out through the live region below. */}
            <div
              className="hit"
              ref={hitRef}
              data-mode={mode}
              role="application"
              aria-label={`Hanjie grid, ${WIDTH} by ${HEIGHT}. Arrow keys move, space fills, X marks a square as empty.`}
              // biome-ignore lint/a11y/noNoninteractiveTabindex: a keyboard-operated widget has to be focusable
              tabIndex={0}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onPointerLeave={() => {
                if (!drag.current) setFocus(null, null);
              }}
              onContextMenu={(e) => e.preventDefault()}
              onFocus={() => moveCursor(cursor.current.r, cursor.current.c)}
              onBlur={() => {
                if (puzzleRef.current) {
                  puzzleRef.current.dataset.cursor = 'false';
                }
              }}
            />

            <Seal show={stage === 'seal' || stage === 'card'} />
          </div>
        </div>

        <aside className="hud">
          {/* Both panels share a grid cell and cross-fade, so whichever one is
              on its way out is still laid out and still focusable. `inert`
              takes it out of the tab order and the accessibility tree for as
              long as it is invisible, without touching the fade.

              No clock here: it still runs, it is just not something you need
              while you are working. It is reported once, on the card. */}
          <div className="hud-play" inert={stage !== 'play'}>
            <fieldset className="mode">
              <legend className="sr-only">Drag paints</legend>
              <span className="mode-slide" data-at={mode} aria-hidden="true" />
              <button
                type="button"
                className="mode-option"
                data-active={mode === 'ink'}
                aria-pressed={mode === 'ink'}
                onClick={() => {
                  setMode('ink');
                  sfx.play('ui');
                }}
              >
                <BrushIcon className="icon" />
                Ink
              </button>
              <button
                type="button"
                className="mode-option"
                data-active={mode === 'mark'}
                aria-pressed={mode === 'mark'}
                onClick={() => {
                  setMode('mark');
                  sfx.play('ui');
                }}
              >
                <MarkIcon className="icon" />
                Mark
              </button>
            </fieldset>

            <div className="controls">
              <Control
                label="Undo"
                hint="⌘Z"
                onClick={undo}
                disabled={state.past.length === 0}
              >
                <UndoIcon className="icon" />
              </Control>
              <Control
                label="Redo"
                hint="⇧⌘Z"
                onClick={redo}
                disabled={state.future.length === 0}
                vacant={state.future.length === 0}
              >
                <RedoIcon className="icon" />
              </Control>
              <Control label="Hint" hint="H" onClick={takeHint}>
                <HintIcon className="icon" />
              </Control>
              <Control
                label={confirmReset ? 'Sure?' : 'Clear'}
                onClick={reset}
                tone={confirmReset ? 'warn' : undefined}
              >
                <ResetIcon className="icon" />
              </Control>
              <Control
                label={muted ? 'Sound off' : 'Sound on'}
                hint="M"
                onClick={toggleSound}
                pressed={!muted}
              >
                <SoundIcon muted={muted} className="icon" />
              </Control>
              <Control
                label={night ? 'Night' : 'Day'}
                onClick={toggleTheme}
                pressed={night}
              >
                <LampIcon night={night} className="icon" />
              </Control>
            </div>

            <div className="tallies">
              <Tally settled={rowSettled} label="Rows" />
              <Tally settled={colSettled} label="Columns" />
            </div>
          </div>

          <WinCard
            show={stage === 'card'}
            time={formatTime(elapsed)}
            hints={state.hints}
            onAgain={() => {
              setStartedAt(null);
              setElapsed(0);
              setStage('play');
              settledRef.current = null;
              setConfirmReset(false);
              sfx.play('ui');
              dispatch({ type: 'reset' });
            }}
          />
        </aside>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
