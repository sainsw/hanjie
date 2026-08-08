'use client';

/**
 * Controls are drawn rather than imported: every glyph below is a few brush
 * strokes so nothing in the frame looks like it came from a different set.
 */

type IconProps = { className?: string };

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function BrushIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M16.5 3.6c1.6 1 2.2 2.6 1.4 4l-4.2 7-3.5-2.2 4.2-7c.8-1.4 2.5-1.8 4.1-.8Z"
        {...stroke}
      />
      <path
        d="M10.2 12.4 6.6 18.8c-.7 1.2-2 1.6-3.3 1.3.9-.9 1-1.9.7-2.9-.3-1 .1-2 1.1-2.5l1.6-.9"
        {...stroke}
      />
    </svg>
  );
}

export function MarkIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M5.6 5.2c3.9 3.4 8.5 8.5 12.9 13.8" {...stroke} />
      <path d="M18.4 5.4C14.7 8.9 9.9 14.1 5.7 18.6" {...stroke} />
    </svg>
  );
}

export function UndoIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M4.5 9.5h9.2c3.2 0 5.6 2 5.6 4.8s-2.4 4.9-5.6 4.9H9.4"
        {...stroke}
      />
      <path d="M8.4 4.8 4 9.4l4.5 4.3" {...stroke} />
    </svg>
  );
}

export function RedoIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M19.5 9.5h-9.2c-3.2 0-5.6 2-5.6 4.8s2.4 4.9 5.6 4.9h4.3"
        {...stroke}
      />
      <path d="M15.6 4.8 20 9.4l-4.5 4.3" {...stroke} />
    </svg>
  );
}

export function HintIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 3.4c3.3 0 5.7 2.4 5.7 5.4 0 2.3-1.4 3.6-2.3 4.9-.6.9-.8 1.7-.9 2.6H9.5c-.1-.9-.3-1.7-.9-2.6C7.7 12.4 6.3 11.1 6.3 8.8c0-3 2.4-5.4 5.7-5.4Z"
        {...stroke}
      />
      <path d="M9.9 19.4h4.2M10.7 21.4h2.6" {...stroke} />
    </svg>
  );
}

export function ResetIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.6-5.9" {...stroke} />
      <path d="M20.4 4.2v4.4h-4.5" {...stroke} />
    </svg>
  );
}

export function SoundIcon({
  muted,
  className,
}: IconProps & { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M4.2 9.4h3.1L11.6 6v12L7.3 14.6H4.2Z" {...stroke} />
      {muted ? (
        <path d="M15.6 9.6 20 14.4M20 9.6l-4.4 4.8" {...stroke} />
      ) : (
        <>
          <path d="M14.9 9.2c1.4 1.6 1.4 4 0 5.6" {...stroke} />
          <path d="M17.6 6.8c2.8 2.9 2.8 7.5 0 10.4" {...stroke} />
        </>
      )}
    </svg>
  );
}

export function LampIcon({ night, className }: IconProps & { night: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {night ? (
        <path
          d="M19.4 15.2A7.6 7.6 0 0 1 9.3 4.9a7.7 7.7 0 1 0 10.1 10.3Z"
          {...stroke}
        />
      ) : (
        <>
          <circle cx="12" cy="12" r="4.1" {...stroke} />
          <path
            d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6"
            {...stroke}
          />
        </>
      )}
    </svg>
  );
}

export function Control({
  label,
  hint,
  onClick,
  disabled,
  pressed,
  tone,
  vacant,
  children,
}: {
  label: string;
  /** Shown on hover and listed in the help panel, never printed on the button. */
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  tone?: 'warn';
  /** Nothing for this control to do yet, so it keeps its slot but not its ink. */
  vacant?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="control"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={label}
      aria-hidden={vacant || undefined}
      data-tone={tone}
      data-vacant={vacant || undefined}
      title={hint ? `${label} (${hint})` : label}
    >
      {children}
      <span className="control-label">{label}</span>
    </button>
  );
}

/** Tally marks: one tick per line, inked in as that line comes out right. */
export function Tally({
  settled,
  label,
}: {
  settled: boolean[];
  label: string;
}) {
  const done = settled.filter(Boolean).length;
  return (
    <div className="tally">
      <span className="tally-label">{label}</span>
      <span className="tally-marks">
        {settled.map((on, i) => (
          <i key={i} data-on={on} style={{ '--i': i } as React.CSSProperties} />
        ))}
      </span>
      <span className="tally-count">
        {done}/{settled.length}
      </span>
    </div>
  );
}
