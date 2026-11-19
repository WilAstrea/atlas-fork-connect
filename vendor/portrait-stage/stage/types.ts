import type { Emotion, StageEffects } from './emotions';

/** How many portraits the stage holds at once. */
export const SLOT_COUNT = 6;

/** A portrait standing on the stage. */
export interface Portrait {
  /** Unique per showing; a portrait removed and shown again gets a new one, so it enters again. */
  readonly id: string;
  /** Vault path of the image. */
  readonly path: string;
  readonly name: string;
  /** Position from left (0) to right (SLOT_COUNT - 1). */
  readonly slot: number;
  readonly flipped: boolean;
  /** Size relative to the stage's portrait height, in percent (100 = the configured height). */
  readonly scale: number;
  readonly spotlight: boolean;
  /** Out of the scene for now: drawn grey and lower, ready to step back in. Never has the spotlight. */
  readonly benched: boolean;
  /** Moved by hand from its place, percent of the stage's width (negative: to the left). */
  readonly offsetPct: number;
  /** The emotion it shows (a tint, a glow, a way of moving), or none. */
  readonly emotion: Emotion | null;
  /** The Atlas token it came from (its library id and Atlas's copy of its picture), to find it on the map. */
  readonly assetId: string | null;
  readonly source: string | null;
  /** Whether its health bar may show over it while its token is in a fight. */
  readonly showHp: boolean;
  /** Its token's health on the map now; never saved. */
  readonly hp: Vitals | null;
  /** Its token holds the turn of the fight now; never saved. */
  readonly turn: boolean;
}

export interface Vitals {
  readonly current: number;
  readonly max: number;
}

/** What the map tells about a portrait now: its token's health and whether it holds the turn. */
export interface LiveState {
  readonly hp: Vitals | null;
  readonly turn: boolean;
}

/** What players see: the portraits and whether the stage is shown at all. */
export interface StageState {
  readonly portraits: readonly Portrait[];
  /** False hides the portraits without forgetting who is on stage; the effects stay. */
  readonly visible: boolean;
  readonly effects: StageEffects;
}

/** Remembered for an image across showings: how big it stands and which way it looks. */
export interface ImagePrefs {
  readonly scale: number;
  readonly flipped: boolean;
}

export type LayoutMode = 'sides' | 'spread';
export type EntranceStyle = 'slide' | 'fade' | 'rise';

export interface StageLook {
  /** `sides`: three places on each side with a gap in the middle (visual novel). `spread`: who is on stage, evenly across it. */
  layout: LayoutMode;
  /** Portrait height as a percentage of the player window's height. */
  heightPct: number;
  /** Distance of the portraits' feet from the window's bottom, percent of its height. */
  bottomPct: number;
  /** Centre of the outermost places from the window's sides, percent of its width. */
  edgePct: number;
  /** Distance between neighbouring places, percent of the width. */
  spacingPct: number;
  /** Brightness of portraits out of the spotlight while someone has it, 0–100. */
  dimPct: number;
  entrance: EntranceStyle;
  /** Length of entrances, exits and spotlight changes, in milliseconds. */
  durationMs: number;
  /** How far a portrait out of the scene sinks, percent of its height. */
  benchDropPct: number;
  /** Whether the spotlight brings a portrait in front of the others; otherwise place 1 stays in front of 2, and so on. */
  spotlightFront: boolean;
  /** How dark the edges of the window grow while portraits are on stage, 0–100; 0 shows no vignette. */
  vignettePct: number;
  /** How much the map blurs behind the portraits when the blur is on, in pixels. */
  blurPx: number;
  /** The spotlight brings the film bars while anyone has it. */
  spotlightCinema: boolean;
  /** When a portrait's health bar shows: during its turn, always (in a fight), or never. */
  hpMode: 'turn' | 'always' | 'never';
}

export const DEFAULT_LOOK: StageLook = {
  layout: 'sides',
  heightPct: 82,
  bottomPct: 0,
  edgePct: 10,
  spacingPct: 12,
  dimPct: 45,
  entrance: 'slide',
  durationMs: 450,
  benchDropPct: 8,
  spotlightFront: true,
  vignettePct: 40,
  blurPx: 6,
  spotlightCinema: true,
  hpMode: 'turn',
};

/** A portrait as a saved scene keeps it: everything but the id of its showing and what the map tells now. */
export type ScenePortrait = Omit<Portrait, 'id' | 'hp' | 'turn'>;

/** A stage arrangement saved to come back to: who stands where, and how. */
export interface SavedScene {
  readonly id: string;
  readonly name: string;
  readonly portraits: readonly ScenePortrait[];
}

export const EMPTY_STAGE: StageState = { portraits: [], visible: true, effects: { cinema: false, blur: false, rain: false } };
