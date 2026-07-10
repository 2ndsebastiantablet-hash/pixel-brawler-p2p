import { COMBAT_TUNING } from "../game/combat/CombatTuning";

export const MASTER_VOLUME = COMBAT_TUNING.sound.masterVolume;

export const SOUND_VOLUME = COMBAT_TUNING.sound.categoryVolumes;

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
  | "slingshot-draw"
  | "slingshot-shot"
  | "slingshot-scatter"
  | "slingshot-bounce"
  | "laser-charge"
  | "laser-fire"
  | "laser-vent"
  | "laser-overcharge"
  | "revolver-shot"
  | "revolver-fan"
  | "revolver-last"
  | "minigun-spin"
  | "minigun-fire"
  | "minigun-overheat"
  | "sniper-steady"
  | "sniper-shot"
  | "sniper-chamber"
  | "sniper-reveal"
  | "knife-slash"
  | "knife-stab"
  | "knife-throw"
  | "knife-hit"
  | "knife-contact"
  | "knife-pickup"
  | "machete-slash"
  | "machete-chop"
  | "machete-hit"
  | "axe-swing"
  | "axe-throw"
  | "axe-hit"
  | "axe-impact"
  | "axe-rush"
  | "axe-recall"
  | "wing-flap"
  | "wing-wind"
  | "wing-burst"
  | "wing-gust"
  | "virgin-blood-activate"
  | "virgin-blood-revive"
  | "death-aura"
  | "rocket-place"
  | "rocket-light"
  | "rocket-explode"
  | "holy-bazooka-fire"
  | "holy-bazooka-explode"
  | "holy-bazooka-pickup"
  | "grapple-fire"
  | "grapple-attach"
  | "grapple-release"
  | "chainsaw-run"
  | "chainsaw-hit"
  | "chainsaw-overheat"
  | "spike-mode"
  | "spike-grow"
  | "spike-impale"
  | "spike-crumble"
  | "van-spawn"
  | "van-absorb"
  | "van-enter"
  | "van-shift"
  | "van-honk"
  | "van-bump"
  | "van-crash"
  | "van-hit"
  | "van-explode"
  | "zombie-spawn"
  | "zombie-bite"
  | "hand-spawn"
  | "hand-skitter"
  | "hand-attach"
  | "hand-flick"
  | "hand-defeat"
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
  "slingshot-draw": { category: "weapon", frequency: 260, endFrequency: 430, duration: 0.1, type: "triangle", minInterval: 0.12 },
  "slingshot-shot": { category: "weapon", frequency: 780, endFrequency: 160, duration: 0.09, noise: true, minInterval: 0.08 },
  "slingshot-scatter": { category: "weapon", frequency: 560, endFrequency: 120, duration: 0.12, noise: true, minInterval: 0.12 },
  "slingshot-bounce": { category: "combat", frequency: 340, endFrequency: 210, duration: 0.045, type: "square", minInterval: 0.06 },
  "laser-charge": { category: "weapon", frequency: 360, endFrequency: 940, duration: 0.16, type: "sawtooth", minInterval: 0.25 },
  "laser-fire": { category: "weapon", frequency: 1040, endFrequency: 320, duration: 0.13, type: "sawtooth", minInterval: 0.06 },
  "laser-vent": { category: "heavy", frequency: 430, endFrequency: 90, duration: 0.2, noise: true, minInterval: 0.18 },
  "laser-overcharge": { category: "heavy", frequency: 90, endFrequency: 980, duration: 0.36, noise: true, minInterval: 0.3 },
  "revolver-shot": { category: "weapon", frequency: 720, endFrequency: 95, duration: 0.105, noise: true, minInterval: 0.08 },
  "revolver-fan": { category: "weapon", frequency: 620, endFrequency: 130, duration: 0.09, noise: true, minInterval: 0.05 },
  "revolver-last": { category: "heavy", frequency: 860, endFrequency: 70, duration: 0.16, noise: true, minInterval: 0.1 },
  "minigun-spin": { category: "weapon", frequency: 150, endFrequency: 390, duration: 0.16, type: "sawtooth", minInterval: 0.18 },
  "minigun-fire": { category: "weapon", frequency: 580, endFrequency: 170, duration: 0.045, noise: true, minInterval: 0.035 },
  "minigun-overheat": { category: "heavy", frequency: 260, endFrequency: 70, duration: 0.28, noise: true, minInterval: 0.35 },
  "sniper-steady": { category: "weapon", frequency: 220, endFrequency: 580, duration: 0.13, type: "triangle", minInterval: 0.25 },
  "sniper-shot": { category: "heavy", frequency: 1220, endFrequency: 52, duration: 0.2, noise: true, minInterval: 0.18 },
  "sniper-chamber": { category: "weapon", frequency: 300, endFrequency: 520, duration: 0.1, type: "square", minInterval: 0.18 },
  "sniper-reveal": { category: "weapon", frequency: 180, endFrequency: 740, duration: 0.14, type: "triangle", minInterval: 0.18 },
  "knife-slash": { category: "weapon", frequency: 620, endFrequency: 320, duration: 0.055, noise: true, minInterval: 0.045 },
  "knife-stab": { category: "weapon", frequency: 780, endFrequency: 180, duration: 0.085, noise: true, minInterval: 0.06 },
  "knife-throw": { category: "weapon", frequency: 520, endFrequency: 260, duration: 0.09, noise: true, minInterval: 0.08 },
  "knife-hit": { category: "combat", frequency: 360, endFrequency: 170, duration: 0.06, noise: true, minInterval: 0.05 },
  "knife-contact": { category: "combat", frequency: 540, endFrequency: 210, duration: 0.045, noise: true, minInterval: 0.12 },
  "knife-pickup": { category: "weapon", frequency: 460, endFrequency: 720, duration: 0.07, type: "triangle", minInterval: 0.08 },
  "machete-slash": { category: "weapon", frequency: 410, endFrequency: 170, duration: 0.105, noise: true, minInterval: 0.08 },
  "machete-chop": { category: "heavy", frequency: 280, endFrequency: 75, duration: 0.17, noise: true, minInterval: 0.12 },
  "machete-hit": { category: "combat", frequency: 260, endFrequency: 110, duration: 0.09, noise: true, minInterval: 0.06 },
  "axe-swing": { category: "heavy", frequency: 230, endFrequency: 86, duration: 0.16, noise: true, minInterval: 0.12 },
  "axe-throw": { category: "heavy", frequency: 320, endFrequency: 96, duration: 0.15, noise: true, minInterval: 0.12 },
  "axe-hit": { category: "combat", frequency: 210, endFrequency: 72, duration: 0.11, noise: true, minInterval: 0.07 },
  "axe-impact": { category: "heavy", frequency: 120, endFrequency: 44, duration: 0.18, noise: true, minInterval: 0.12 },
  "axe-rush": { category: "heavy", frequency: 260, endFrequency: 72, duration: 0.18, noise: true, minInterval: 0.18 },
  "axe-recall": { category: "heavy", frequency: 520, endFrequency: 160, duration: 0.22, noise: true, minInterval: 0.16 },
  "wing-flap": { category: "movement", frequency: 180, endFrequency: 90, duration: 0.12, noise: true, minInterval: 0.18 },
  "wing-wind": { category: "movement", frequency: 260, endFrequency: 190, duration: 0.18, noise: true, minInterval: 0.45 },
  "wing-burst": { category: "movement", frequency: 420, endFrequency: 100, duration: 0.18, noise: true, minInterval: 0.32 },
  "wing-gust": { category: "combat", frequency: 360, endFrequency: 120, duration: 0.12, noise: true, minInterval: 0.12 },
  "virgin-blood-activate": { category: "combat", frequency: 620, endFrequency: 260, duration: 0.32, type: "triangle", minInterval: 0.4 },
  "virgin-blood-revive": { category: "combat", frequency: 760, endFrequency: 180, duration: 0.42, noise: true, minInterval: 0.6 },
  "death-aura": { category: "combat", frequency: 96, endFrequency: 52, duration: 0.28, noise: true, minInterval: 0.32 },
  "rocket-place": { category: "weapon", frequency: 180, endFrequency: 110, duration: 0.12, noise: true, minInterval: 0.18 },
  "rocket-light": { category: "heavy", frequency: 260, endFrequency: 820, duration: 0.22, noise: true, minInterval: 0.2 },
  "rocket-explode": { category: "heavy", frequency: 72, endFrequency: 30, duration: 0.42, noise: true, minInterval: 0.34 },
  "holy-bazooka-fire": { category: "heavy", frequency: 160, endFrequency: 760, duration: 0.34, noise: true, minInterval: 0.2 },
  "holy-bazooka-explode": { category: "heavy", frequency: 96, endFrequency: 34, duration: 0.56, noise: true, minInterval: 0.34 },
  "holy-bazooka-pickup": { category: "weapon", frequency: 760, endFrequency: 1040, duration: 0.14, type: "triangle", minInterval: 0.08 },
  "grapple-fire": { category: "weapon", frequency: 420, endFrequency: 720, duration: 0.12, noise: true, minInterval: 0.12 },
  "grapple-attach": { category: "weapon", frequency: 180, endFrequency: 430, duration: 0.13, type: "square", minInterval: 0.12 },
  "grapple-release": { category: "weapon", frequency: 360, endFrequency: 140, duration: 0.09, noise: true, minInterval: 0.1 },
  "chainsaw-run": { category: "weapon", frequency: 150, endFrequency: 130, duration: 0.18, noise: true, minInterval: 0.24 },
  "chainsaw-hit": { category: "combat", frequency: 220, endFrequency: 80, duration: 0.08, noise: true, minInterval: 0.08 },
  "chainsaw-overheat": { category: "heavy", frequency: 260, endFrequency: 55, duration: 0.36, noise: true, minInterval: 0.45 },
  "spike-mode": { category: "weapon", frequency: 120, endFrequency: 520, duration: 0.26, noise: true, minInterval: 0.22 },
  "spike-grow": { category: "weapon", frequency: 180, endFrequency: 70, duration: 0.13, noise: true, minInterval: 0.035 },
  "spike-impale": { category: "combat", frequency: 420, endFrequency: 90, duration: 0.12, noise: true, minInterval: 0.08 },
  "spike-crumble": { category: "combat", frequency: 160, endFrequency: 44, duration: 0.18, noise: true, minInterval: 0.1 },
  "van-spawn": { category: "heavy", frequency: 110, endFrequency: 260, duration: 0.24, noise: true, minInterval: 0.12 },
  "van-absorb": { category: "weapon", frequency: 260, endFrequency: 90, duration: 0.2, noise: true, minInterval: 0.12 },
  "van-enter": { category: "weapon", frequency: 360, endFrequency: 220, duration: 0.07, type: "square", minInterval: 0.08 },
  "van-shift": { category: "weapon", frequency: 420, endFrequency: 720, duration: 0.08, type: "square", minInterval: 0.1 },
  "van-honk": { category: "heavy", frequency: 280, endFrequency: 210, duration: 0.34, type: "sawtooth", minInterval: 0.25 },
  "van-bump": { category: "combat", frequency: 170, endFrequency: 76, duration: 0.11, noise: true, minInterval: 0.08 },
  "van-crash": { category: "heavy", frequency: 92, endFrequency: 32, duration: 0.28, noise: true, minInterval: 0.16 },
  "van-hit": { category: "combat", frequency: 250, endFrequency: 110, duration: 0.08, noise: true, minInterval: 0.06 },
  "van-explode": { category: "heavy", frequency: 70, endFrequency: 28, duration: 0.5, noise: true, minInterval: 0.28 },
  "zombie-spawn": { category: "heavy", frequency: 86, endFrequency: 190, duration: 0.28, noise: true, minInterval: 0.24 },
  "zombie-bite": { category: "combat", frequency: 340, endFrequency: 120, duration: 0.11, noise: true, minInterval: 0.14 },
  "hand-spawn": { category: "weapon", frequency: 420, endFrequency: 160, duration: 0.16, type: "square", minInterval: 0.24 },
  "hand-skitter": { category: "movement", frequency: 320, endFrequency: 260, duration: 0.045, type: "square", minInterval: 0.22 },
  "hand-attach": { category: "combat", frequency: 540, endFrequency: 210, duration: 0.12, noise: true, minInterval: 0.16 },
  "hand-flick": { category: "combat", frequency: 680, endFrequency: 160, duration: 0.12, noise: true, minInterval: 0.12 },
  "hand-defeat": { category: "combat", frequency: 240, endFrequency: 90, duration: 0.1, noise: true, minInterval: 0.1 },
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
