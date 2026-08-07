# Hanjie

A nonogram, drawn as ink on paper. One puzzle, one page, and as much care as I
could put into the twenty seconds between filling the last square and the seal
landing on it.

Next.js App Router, React 19, no CSS framework and no UI library. The only
runtime dependencies are Next and React.

```bash
npm install
npm run dev
```

## How it plays

Numbers along the top and left count the runs of ink in that line. Work out
where the runs sit and the picture falls out of the grid.

- Drag to fill a run. The drag locks to the row or column you started moving
  along, so a long line does not wobble into its neighbour.
- Starting a drag on a square that already has what you are painting rubs out
  instead, for the whole drag.
- Right click paints the other thing without switching mode.
- Arrow keys move, space fills, `X` marks a square as ruled out, `H` takes a
  hint, `M` mutes, `E` swaps mode, `⌘Z` and `⇧⌘Z` undo and redo.

A line's numbers fade and take a line through when that line comes out right.
Marks are only for you: the puzzle is finished when the ink matches, whatever
you have crossed off.

## The parts worth knowing about

**`lib/puzzle.ts`** holds the picture as a block of `#` and `.`, and derives the
clues from it at module load. The art is the single source of truth, so the
numbers can never drift away from the drawing.

**`scripts/verify-puzzle.mjs`** re-derives those clues and runs a line solver
over them. It fails if the puzzle has more than one solution, or if reaching the
solution would need guesswork rather than logic. Both earlier drafts of this
picture failed it: a couple of birds in the empty top-left corner had nothing to
anchor them, and could slide between rows without breaking any clue. The mist
bands that replaced them are pinned.

```bash
npm run verify-puzzle              # check the shipped art
npm run verify-puzzle some.txt     # try a variant first
```

**`lib/ink.ts`** hashes each square's coordinates into a rotation, four corner
radii, a sub-pixel offset and a tone. Nothing is random at runtime, so a given
square looks the same on every visit, but no two squares look alike and the
finished grid does not look printed. When you solve it, all of that jitter
transitions out at once and the squares knit into a single shape.

**`lib/audio.ts`** synthesises every sound in the browser. There are no audio
files. A wooden tap for ink that climbs in pitch as a drag gets longer, a dry
tick for a mark, a plucked pentatonic note each time a line comes out right that
rises as the sheet fills, and a taiko hit under the seal.

## Checks

```bash
npm run lint && npm run format:check && npm run typecheck && npm run verify-puzzle && npm run build
```

## If you want to change the picture

Edit the `ART` block in `lib/puzzle.ts` and run `npm run verify-puzzle`. Clues,
layout, tally marks and the win condition all follow from it. Sparse marks
floating in empty space are the thing most likely to fail the check.
