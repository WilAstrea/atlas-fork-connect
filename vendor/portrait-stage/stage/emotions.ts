/** The emotions a portrait can show: each tints the picture, gives it a glow and a way of moving. */
export const EMOTIONS = ['joy', 'sadness', 'anger', 'fear', 'love', 'hurt', 'tired'] as const;
export type Emotion = (typeof EMOTIONS)[number];

/** Lucide icons for the panel's emotion menu and badge. */
export const EMOTION_ICONS: Record<Emotion, string> = {
  joy: 'laugh',
  sadness: 'frown',
  anger: 'angry',
  fear: 'ghost',
  love: 'heart',
  hurt: 'heart-crack',
  tired: 'moon',
};

export const isEmotion = (value: unknown): value is Emotion => typeof value === 'string' && (EMOTIONS as readonly string[]).includes(value);

/** Stage effects that last until switched off; one-shot effects are told, not kept. */
export interface StageEffects {
  /** Black bars above and below, as in a film. */
  readonly cinema: boolean;
  /** The map behind the portraits out of focus. */
  readonly blur: boolean;
  /** Light rain falling in front of everyone. */
  readonly rain: boolean;
}

export const NO_EFFECTS: StageEffects = { cinema: false, blur: false, rain: false };

/** A moment, not a state: the screen shakes, or flashes a colour. */
export type Pulse = { readonly kind: 'shake' } | { readonly kind: 'flash'; readonly color: FlashColor };
export const FLASH_COLORS = ['white', 'red', 'gold', 'black'] as const;
export type FlashColor = (typeof FLASH_COLORS)[number];
export const FLASH_CSS: Record<FlashColor, string> = {
  white: 'rgba(255, 255, 255, .9)',
  red: 'rgba(200, 20, 20, .75)',
  gold: 'rgba(255, 210, 110, .8)',
  black: 'rgba(0, 0, 0, .95)',
};
