export const MASTER_VOLUME = 0.22;

export const SOUND_VOLUME = {
  ui: 0.45,
  movement: 0.48,
  combat: 0.72,
  weapon: 0.76,
  heavy: 0.9,
} as const;

export type SoundId =
  | "menu-click"
  | "menu-hover"
  | "loading-continue"
  | "footstep"
  | "jump"
  | "double-jump"
  | "landing"
  | "dash"
  | "low-slide"
  | "duck"
  | "ground-slam-start"
  | "ground-slam-impact"
  | "dive-start"
  | "dive-hit"
  | "head-stomp"
  | "player-hit"
  | "player-stunned"
  | "damage-pop"
  | "weapon-switch"
  | "weapon-pickup"
  | "weapon-drop"
  | "pistol-shot"
  | "pistol-empty"
  | "pistol-reload-start"
  | "pistol-reload-end"
  | "pistol-perfect"
  | "pistol-throw"
  | "whip-swing"
  | "whip-crack"
  | "whip-pull"
  | "teleport-throw"
  | "teleport-pulse"
  | "teleport-cancel"
  | "teleport-arrival"
  | "lightning-raise"
  | "lightning-strike"
  | "lightning-pulse"
  | "lightning-shock"
  | "sledge-swing"
  | "sledge-impact"
  | "sledge-slam"
  | "respawn";

interface SoundShape {
  category: keyof typeof SOUND_VOLUME;
  frequency: number;
  endFrequency?: number;
  duration: number;
  type?: OscillatorType;
  noise?: boolean;
  minInterval?: number;
}

const SOUND_SHAPES: Record<SoundId, SoundShape> = {
  "menu-click": { category: "ui", frequency: 520, endFrequency: 720, duration: 0.045, type: "square", minInterval: 0.04 },
  "menu-hover": { category: "ui", frequency: 420, endFrequency: 500, duration: 0.035, type: "sine", minInterval: 0.08 },
  "loading-continue": { category: "ui", frequency: 360, endFrequency: 760, duration: 0.16, type: "triangle" },
  footstep: { category: "movement", frequency: 118, endFrequency: 72, duration: 0.035, noise: true, minInterval: 0.12 },
  jump: { category: "movement", frequency: 260, endFrequency: 620, duration: 0.12, type: "triangle" },
  "double-jump": { category: "movement", frequency: 440, endFrequency: 760, duration: 0.12, type: "triangle" },
  landing: { category: "movement", frequency: 110, endFrequency: 68, duration: 0.08, noise: true, minInterval: 0.08 },
  dash: { category: "movement", frequency: 190, endFrequency: 90, duration: 0.09, noise: true },
  "low-slide": { category: "movement", frequency: 170, endFrequency: 55, duration: 0.16, noise: true, minInterval: 0.16 },
  duck: { category: "movement", frequency: 130, endFrequency: 90, duration: 0.05, type: "square" },
  "ground-slam-start": { category: "movement", frequency: 180, endFrequency: 80, duration: 0.14, type: "sawtooth" },
  "ground-slam-impact": { category: "heavy", frequency: 82, endFrequency: 34, duration: 0.24, noise: true, minInterval: 0.15 },
  "dive-start": { category: "movement", frequency: 260, endFrequency: 130, duration: 0.1, noise: true },
  "dive-hit": { category: "combat", frequency: 150, endFrequency: 70, duration: 0.13, noise: true, minInterval: 0.08 },
  "head-stomp": { category: "combat", frequency: 220, endFrequency: 90, duration: 0.1, type: "square" },
  "player-hit": { category: "combat", frequency: 240, endFrequency: 140, duration: 0.07, noise: true, minInterval: 0.04 },
  "player-stunned": { category: "combat", frequency: 320, endFrequency: 180, duration: 0.13, type: "triangle", minInterval: 0.1 },
  "damage-pop": { category: "combat", frequency: 680, endFrequency: 820, duration: 0.04, type: "square", minInterval: 0.04 },
  "weapon-switch": { category: "weapon", frequency: 360, endFrequency: 510, duration: 0.055, type: "square" },
  "weapon-pickup": { category: "weapon", frequency: 540, endFrequency: 780, duration: 0.08, type: "triangle" },
  "weapon-drop": { category: "weapon", frequency: 210, endFrequency: 120, duration: 0.08, noise: true },
  "pistol-shot": { category: "weapon", frequency: 920, endFrequency: 150, duration: 0.08, noise: true, minInterval: 0.05 },
  "pistol-empty": { category: "weapon", frequency: 190, endFrequency: 120, duration: 0.05, type: "square", minInterval: 0.08 },
  "pistol-reload-start": { category: "weapon", frequency: 260, endFrequency: 300, duration: 0.08, type: "square" },
  "pistol-reload-end": { category: "weapon", frequency: 420, endFrequency: 620, duration: 0.08, type: "square" },
  "pistol-perfect": { category: "weapon", frequency: 720, endFrequency: 960, duration: 0.12, type: "triangle" },
  "pistol-throw": { category: "weapon", frequency: 280, endFrequency: 130, duration: 0.11, noise: true },
  "whip-swing": { category: "weapon", frequency: 240, endFrequency: 680, duration: 0.11, noise: true, minInterval: 0.08 },
  "whip-crack": { category: "weapon", frequency: 900, endFrequency: 260, duration: 0.06, noise: true, minInterval: 0.05 },
  "whip-pull": { category: "weapon", frequency: 380, endFrequency: 120, duration: 0.16, type: "sawtooth" },
  "teleport-throw": { category: "weapon", frequency: 420, endFrequency: 650, duration: 0.1, type: "triangle" },
  "teleport-pulse": { category: "weapon", frequency: 620, endFrequency: 500, duration: 0.055, type: "sine", minInterval: 0.3 },
  "teleport-cancel": { category: "weapon", frequency: 420, endFrequency: 120, duration: 0.12, type: "triangle" },
  "teleport-arrival": { category: "heavy", frequency: 180, endFrequency: 620, duration: 0.2, noise: true },
  "lightning-raise": { category: "weapon", frequency: 260, endFrequency: 760, duration: 0.18, type: "sawtooth" },
  "lightning-strike": { category: "heavy", frequency: 90, endFrequency: 860, duration: 0.26, noise: true, minInterval: 0.2 },
  "lightning-pulse": { category: "weapon", frequency: 720, endFrequency: 540, duration: 0.055, type: "square", minInterval: 0.32 },
  "lightning-shock": { category: "combat", frequency: 760, endFrequency: 240, duration: 0.1, type: "sawtooth", minInterval: 0.08 },
  "sledge-swing": { category: "heavy", frequency: 155, endFrequency: 85, duration: 0.16, noise: true, minInterval: 0.1 },
  "sledge-impact": { category: "heavy", frequency: 95, endFrequency: 38, duration: 0.22, noise: true, minInterval: 0.12 },
  "sledge-slam": { category: "heavy", frequency: 120, endFrequency: 34, duration: 0.32, noise: true, minInterval: 0.2 },
  respawn: { category: "ui", frequency: 380, endFrequency: 780, duration: 0.16, type: "triangle" },
};

class ProceduralSoundSystem {
  private context: AudioContext | null = null;
  private readonly lastPlayed = new Map<SoundId, number>();

  play(id: SoundId): void {
    const shape = SOUND_SHAPES[id];
    const nowMs = Date.now();
    const last = this.lastPlayed.get(id) ?? 0;
    if (shape.minInterval && nowMs - last < shape.minInterval * 1000) {
      return;
    }
    this.lastPlayed.set(id, nowMs);

    const context = this.getContext();
    if (!context) {
      return;
    }
    if (context.state === "suspended") {
      void context.resume();
    }

    const start = context.currentTime;
    const gain = context.createGain();
    gain.gain.setValueAtTime(MASTER_VOLUME * SOUND_VOLUME[shape.category], start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + shape.duration);
    gain.connect(context.destination);

    if (shape.noise) {
      const bufferSize = Math.max(1, Math.floor(context.sampleRate * shape.duration));
      const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < bufferSize; index += 1) {
        data[index] = (Math.random() * 2 - 1) * (1 - index / bufferSize);
      }
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(shape.frequency, start);
      filter.frequency.exponentialRampToValueAtTime(shape.endFrequency ?? shape.frequency, start + shape.duration);
      source.buffer = buffer;
      source.connect(filter);
      filter.connect(gain);
      source.start(start);
      source.stop(start + shape.duration);
      return;
    }

    const oscillator = context.createOscillator();
    oscillator.type = shape.type ?? "square";
    oscillator.frequency.setValueAtTime(shape.frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(shape.endFrequency ?? shape.frequency, start + shape.duration);
    oscillator.connect(gain);
    oscillator.start(start);
    oscillator.stop(start + shape.duration);
  }

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") {
      return null;
    }
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        return null;
      }
      this.context = new AudioContextClass();
    }
    return this.context;
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export const soundSystem = new ProceduralSoundSystem();

export function playSound(id: SoundId): void {
  soundSystem.play(id);
}
