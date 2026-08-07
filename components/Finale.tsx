'use client';

import type { CSSProperties } from 'react';
import { sealFlecks } from '@/lib/ink';
import { PUZZLE } from '@/lib/puzzle';

export type Stage = 'play' | 'settle' | 'merge' | 'seal' | 'card';

const FLECKS = sealFlecks(14);

/**
 * The vermilion seal that lands on the finished picture. The edge is roughed up
 * with turbulence so it reads as pressed rather than printed.
 */
export function Seal({ show }: { show: boolean }) {
  return (
    <div className="seal" data-show={show} aria-hidden="true">
      <svg viewBox="0 0 100 100" className="seal-stamp">
        <title>seal</title>
        <defs>
          <filter id="seal-worn">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.62"
              numOctaves="3"
              seed="7"
              result="grain"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="grain"
              scale="3.4"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
        <g filter="url(#seal-worn)">
          <rect x="4" y="4" width="92" height="92" rx="9" fill="var(--seal)" />
          <rect
            x="11"
            y="11"
            width="78"
            height="78"
            rx="5"
            fill="none"
            stroke="var(--paper)"
            strokeWidth="2.6"
            opacity="0.55"
          />
          <text
            x="50"
            y="52"
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--paper)"
            className="seal-glyph"
          >
            完
          </text>
        </g>
      </svg>
      <span className="seal-flecks">
        {FLECKS.map((f, i) => (
          <i
            key={i}
            style={
              {
                '--angle': `${f.angle}deg`,
                '--dist': `${f.distance}px`,
                '--size': `${f.size}px`,
                '--delay': `${f.delay}ms`,
                '--spin': `${f.spin}deg`,
              } as CSSProperties
            }
          />
        ))}
      </span>
    </div>
  );
}

export function WinCard({
  show,
  time,
  hints,
  onAgain,
}: {
  show: boolean;
  time: string;
  hints: number;
  onAgain: () => void;
}) {
  return (
    <div className="wincard" data-show={show} inert={!show} aria-live="polite">
      <p className="wincard-kanji">{PUZZLE.kanji}</p>
      <h2 className="wincard-title">{PUZZLE.title}</h2>
      <p className="wincard-note">{PUZZLE.note}</p>
      <dl className="wincard-stats">
        <div>
          <dt>Time</dt>
          <dd>{time}</dd>
        </div>
        <div>
          <dt>Hints</dt>
          <dd>{hints}</dd>
        </div>
      </dl>
      <button type="button" className="wincard-again" onClick={onAgain}>
        Clear the sheet
      </button>
    </div>
  );
}
