/**
 * Every sound here is synthesised in the browser, so the app ships with no
 * audio files at all. The palette is deliberately small and wooden: a tap for
 * ink, a dry tick for a mark, a plucked note when a line comes out right, and a
 * drum when the seal lands.
 *
 * The context is created on the first real gesture, which is what browsers
 * require, and everything is scheduled against ctx.currentTime so rapid drags
 * do not stack up.
 */

// A "yo" scale, the bright pentatonic you hear in a lot of Japanese folk music.
const SCALE = [
  293.66, 329.63, 392.0, 440.0, 587.33, 659.25, 783.99, 880.0, 1174.66,
];

export type Sound =
  | 'ink'
  | 'mark'
  | 'erase'
  | 'line'
  | 'undo'
  | 'hint'
  | 'ui'
  | 'drum';

type PlayOptions = {
  /** Position within a drag, so a run of taps climbs slightly in pitch. */
  streak?: number;
  /** Which degree of the scale to pluck, for line and win sounds. */
  degree?: number;
  /** Seconds from now. */
  delay?: number;
};

class InkAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private echoSend: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;
  /** Guards against a burst of identical sounds in the same millisecond. */
  private lastAt: Partial<Record<Sound, number>> = {};

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(
        muted ? 0 : 0.9,
        this.ctx.currentTime,
        0.02,
      );
    }
  }

  /** Call from inside a user gesture. Safe to call repeatedly. */
  resume() {
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined') return null;

    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;

    const ctx = new Ctor();

    // Master chain: a gentle low pass keeps the noise bursts from getting
    // scratchy on laptop speakers.
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.9;
    const tame = ctx.createBiquadFilter();
    tame.type = 'lowpass';
    tame.frequency.value = 9500;
    master.connect(tame).connect(ctx.destination);

    // A short feedback delay, used only by the plucked notes so completing a
    // line rings out into the room a little.
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.19;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.27;
    const echoSend = ctx.createGain();
    echoSend.gain.value = 1;
    const echoLevel = ctx.createGain();
    echoLevel.gain.value = 0.22;
    echoSend.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(echoLevel).connect(master);

    this.ctx = ctx;
    this.master = master;
    this.echoSend = echoSend;
    this.noise = this.makeNoise(ctx);
    return ctx;
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private burst(
    at: number,
    opts: {
      type: BiquadFilterType;
      freq: number;
      q?: number;
      gain: number;
      decay: number;
    },
  ) {
    const ctx = this.ctx;
    if (!ctx || !this.noise || !this.master) return;

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.85 + Math.random() * 0.3;

    const filter = ctx.createBiquadFilter();
    filter.type = opts.type;
    filter.frequency.value = opts.freq;
    filter.Q.value = opts.q ?? 1;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(opts.gain, at + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, at + opts.decay);

    src.connect(filter).connect(env).connect(this.master);
    src.start(at);
    src.stop(at + opts.decay + 0.05);
  }

  private tone(
    at: number,
    opts: {
      freq: number;
      type?: OscillatorType;
      gain: number;
      decay: number;
      glideTo?: number;
      echo?: boolean;
    },
  ) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;

    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(opts.freq, at);
    if (opts.glideTo) {
      osc.frequency.exponentialRampToValueAtTime(opts.glideTo, at + opts.decay);
    }

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(opts.gain, at + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, at + opts.decay);

    osc.connect(env).connect(this.master);
    if (opts.echo && this.echoSend) env.connect(this.echoSend);
    osc.start(at);
    osc.stop(at + opts.decay + 0.05);
  }

  /** A struck string: bright attack, a fifth of shimmer above, long tail. */
  private pluck(at: number, freq: number, gain = 0.16) {
    this.tone(at, { freq, type: 'triangle', gain, decay: 1.1, echo: true });
    this.tone(at, {
      freq: freq * 2.01,
      type: 'sine',
      gain: gain * 0.35,
      decay: 0.5,
      echo: true,
    });
    this.burst(at, {
      type: 'bandpass',
      freq: freq * 3,
      q: 2,
      gain: 0.05,
      decay: 0.05,
    });
  }

  play(sound: Sound, opts: PlayOptions = {}) {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;

    const now = ctx.currentTime + (opts.delay ?? 0);
    const wall = performance.now();
    if (wall - (this.lastAt[sound] ?? 0) < 12) return;
    this.lastAt[sound] = wall;

    switch (sound) {
      case 'ink': {
        // A wooden tok that climbs a little as a drag gets longer, so painting
        // a long run feels like it is going somewhere.
        const climb = Math.min(opts.streak ?? 0, 12) * 26;
        this.burst(now, {
          type: 'bandpass',
          freq: 950 + climb,
          q: 6,
          gain: 0.2,
          decay: 0.07,
        });
        this.tone(now, {
          freq: 150 + climb * 0.35,
          gain: 0.13,
          decay: 0.09,
          glideTo: 90,
        });
        break;
      }
      case 'mark':
        this.burst(now, {
          type: 'highpass',
          freq: 2900,
          gain: 0.09,
          decay: 0.045,
        });
        break;
      case 'erase':
        this.burst(now, {
          type: 'lowpass',
          freq: 700,
          gain: 0.11,
          decay: 0.1,
        });
        break;
      case 'line':
        this.pluck(now, SCALE[Math.min(opts.degree ?? 0, SCALE.length - 1)]);
        break;
      case 'hint':
        this.pluck(now, SCALE[2], 0.12);
        this.pluck(now + 0.09, SCALE[5], 0.09);
        break;
      case 'undo':
        this.burst(now, {
          type: 'bandpass',
          freq: 520,
          q: 3,
          gain: 0.12,
          decay: 0.08,
        });
        break;
      case 'ui':
        this.burst(now, {
          type: 'bandpass',
          freq: 1800,
          q: 4,
          gain: 0.06,
          decay: 0.035,
        });
        break;
      case 'drum':
        // Taiko: the skin, then the body dropping away underneath it.
        this.burst(now, {
          type: 'lowpass',
          freq: 1500,
          gain: 0.28,
          decay: 0.12,
        });
        this.tone(now, {
          freq: 165,
          gain: 0.5,
          decay: 0.55,
          glideTo: 48,
        });
        break;
    }
  }

  /** The run of notes that plays as the picture resolves. */
  playVictory() {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;

    [0, 1, 2, 3, 4, 5, 7].forEach((degree, i) => {
      this.pluck(now + i * 0.085, SCALE[degree], 0.15);
    });
    this.tone(now + 0.72, {
      freq: SCALE[8],
      type: 'sine',
      gain: 0.08,
      decay: 2.6,
      echo: true,
    });
  }
}

export const sfx = new InkAudio();
