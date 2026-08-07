/**
 * Every filled square is stamped rather than drawn: a slightly different
 * rotation, four different corner radii, a little offset and a little tonal
 * variation. The values are hashed from the coordinates so a given square looks
 * the same on every visit, and the grid as a whole stops looking machine-made.
 */

function hash(r: number, c: number, salt: number): number {
  let h = Math.imul(r + 1, 73856093) ^ Math.imul(c + 1, 19349663) ^ salt;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Hashed value in [min, max). */
function between(r: number, c: number, salt: number, min: number, max: number) {
  return min + hash(r, c, salt) * (max - min);
}

export type InkStyle = {
  '--rot': string;
  '--dx': string;
  '--dy': string;
  '--tone': string;
  '--r1': string;
  '--r2': string;
  '--r3': string;
  '--r4': string;
  '--bleed': string;
};

export function inkStyle(r: number, c: number): InkStyle {
  return {
    '--rot': `${between(r, c, 1, -3.2, 3.2).toFixed(2)}deg`,
    '--dx': `${between(r, c, 2, -1.1, 1.1).toFixed(2)}px`,
    '--dy': `${between(r, c, 3, -1.1, 1.1).toFixed(2)}px`,
    '--tone': between(r, c, 4, 0.86, 1).toFixed(3),
    '--r1': `${between(r, c, 5, 8, 24).toFixed(1)}%`,
    '--r2': `${between(r, c, 6, 8, 24).toFixed(1)}%`,
    '--r3': `${between(r, c, 7, 8, 24).toFixed(1)}%`,
    '--r4': `${between(r, c, 8, 8, 24).toFixed(1)}%`,
    // How far the wet edge spreads past the square, in hundredths of a cell.
    '--bleed': between(r, c, 9, 0.02, 0.07).toFixed(3),
  };
}

/** Ink flecks thrown out when the seal lands. Deterministic, so no hydration drift. */
export function sealFlecks(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    angle: between(i, 17, 11, 0, 360),
    distance: between(i, 23, 12, 18, 74),
    size: between(i, 29, 13, 1.5, 5.5),
    delay: between(i, 31, 14, 0, 90),
    spin: between(i, 37, 15, -140, 140),
  }));
}
