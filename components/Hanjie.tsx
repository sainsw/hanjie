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

  const hitRef = useRef<HTMLDivElement>(null);
  const puzzleRef = useRef<HTMLDivElement>(null);
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

  const beginClock = useCallback(() => {
    setStartedAt((at) => at ?? Date.now());
  }, []);

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

  // Sound and theme both survive a reload.
  useEffect(() => {
    const savedMute = localStorage.getItem('hanjie:muted') === 'true';
    setMuted(savedMute);
    sfx.setMuted(savedMute);
    setNight(document.documentElement.dataset.theme === 'night');
  }, []);

  useEffect(() => {
    if (startedAt === null || state.solved) return;
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 250);
    return () => clearInterval(id);
  }, [startedAt, state.solved]);

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
  }, [moveCursor, redo, takeHint, toggleAt, undo]);

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
    <div className="stage" data-stage={stage}>
      <header className="masthead">
        <h1 className="brand">
          <span className="brand-word">Hanjie</span>
          <span className="brand-seal">絵</span>
        </h1>
        <p className="tagline">
          The numbers count the runs of ink in each line. Work out where they
          sit, and a picture comes out of the grid.
        </p>
      </header>

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
              long as it is invisible, without touching the fade. */}
          <div className="hud-play" inert={stage !== 'play'}>
            <div className="clock">
              <span className="clock-face">{formatTime(elapsed)}</span>
              <span className="clock-label">elapsed</span>
            </div>

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

            <p className="mode-note">
              <span className="note-fine">
                Right click paints the other one without switching.
              </span>
              <span className="note-coarse">
                Drag along a line to fill a whole run at once.
              </span>
            </p>

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
