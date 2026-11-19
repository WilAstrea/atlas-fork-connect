import { EMOTIONS, FLASH_CSS, type Pulse } from './emotions';
import { anySpotlight, placePortraits, type Placement } from './layout';
import { RAIN_FAR, RAIN_NEAR } from './rain';
import { ensureStageStyle } from './stageCss';
import type { EntranceStyle, Portrait, StageLook, StageState } from './types';

/** Turns a vault path into a URL the player window can load. */
export type ResolveUrl = (path: string) => string | null;

interface Shown {
  readonly root: HTMLDivElement;
  readonly figure: HTMLDivElement;
  readonly hpFill: HTMLDivElement;
  readonly hpText: HTMLDivElement;
  image: HTMLImageElement;
  path: string;
}

const EASE_OUT = 'cubic-bezier(.2, .8, .2, 1)';
const EASE_IN = 'cubic-bezier(.4, 0, .9, .4)';
const FLASH_MS = 650;
const SHAKE_MS = 520;

function entranceFrames(style: EntranceStyle, side: Placement['side']): Keyframe[] {
  if (style === 'fade') return [{ opacity: 0 }, { opacity: 1 }];
  if (style === 'rise') return [{ opacity: 0, transform: 'translateY(18%)' }, { opacity: 1, transform: 'none' }];
  const from = side === 'left' ? '-45vw' : '45vw';
  return [{ opacity: 0, transform: `translateX(${from})` }, { opacity: 1, transform: 'none' }];
}

/** The portrait's box takes the picture's proportions. */
function setRatio(root: HTMLElement, image: HTMLImageElement): void {
  if (image.naturalWidth > 0 && image.naturalHeight > 0) root.style.setProperty('--aps-ratio', String(image.naturalWidth / image.naturalHeight));
}

/**
 * Draws the stage into one container, by id: a portrait already shown moves, turns or changes its light
 * in place; a new one enters, a gone one leaves. Under the portraits lie the map's blur and the vignette,
 * over them the film bars and the flashes. It knows nothing of Obsidian or Atlas, so any document (the
 * player window, a test page) can hold it.
 */
export class StageRenderer {
  private readonly doc: Document;
  private readonly stage: HTMLDivElement;
  private readonly cast: HTMLDivElement;
  private readonly shown = new Map<string, Shown>();
  private look: StageLook;
  private state: StageState | null = null;

  constructor(private readonly host: HTMLElement, look: StageLook, private readonly resolveUrl: ResolveUrl) {
    this.doc = host.ownerDocument;
    ensureStageStyle(this.doc);
    this.stage = this.div('aps-stage');
    this.stage.append(this.div('aps-backdrop'), this.div('aps-vignette'));
    this.cast = this.stage.appendChild(this.div('aps-cast'));
    const rain = this.stage.appendChild(this.div('aps-rain'));
    rain.append(this.div('aps-rain-far'), this.div('aps-rain-near'));
    this.stage.style.setProperty('--aps-rain-far', RAIN_FAR);
    this.stage.style.setProperty('--aps-rain-near', RAIN_NEAR);
    this.stage.append(this.div('aps-bar is-top'), this.div('aps-bar is-bottom'));
    host.prepend(this.stage);
    this.look = look;
    this.applyLook();
  }

  /** Whether the stage still stands in its host (the host may have emptied itself). */
  get attached(): boolean {
    return this.stage.isConnected && this.stage.parentElement === this.host;
  }

  /** The stage's size in the window now. */
  size(): { width: number; height: number } {
    return { width: this.stage.clientWidth, height: this.stage.clientHeight };
  }

  setLook(look: StageLook): void {
    this.look = look;
    this.applyLook();
    if (this.state) this.render(this.state);
  }

  render(state: StageState): void {
    this.state = state;
    const s = this.stage.classList;
    s.toggle('is-hidden', !state.visible);
    s.toggle('has-spotlight', anySpotlight(state.portraits));
    s.toggle('has-cast', state.visible && state.portraits.length > 0 && this.look.vignettePct > 0);
    // The spotlight brings the film bars with it, when the look says so.
    s.toggle('is-cinema', state.effects.cinema || (this.look.spotlightCinema && anySpotlight(state.portraits)));
    s.toggle('is-blur', state.effects.blur);
    s.toggle('is-rain', state.effects.rain);
    const placements = placePortraits(state.portraits, this.look);
    const ids = new Set(state.portraits.map((p) => p.id));
    for (const [id, shown] of this.shown) {
      if (!ids.has(id)) {
        this.shown.delete(id);
        this.leave(shown, this.sideOf(shown));
      }
    }
    for (const portrait of state.portraits) {
      const placement = placements.get(portrait.id);
      if (!placement) continue;
      const existing = this.shown.get(portrait.id);
      if (existing) this.update(existing, portrait, placement);
      else this.enter(portrait, placement);
    }
  }

  /** A one-shot effect: the window shakes, or flashes a colour. */
  pulse(pulse: Pulse): void {
    if (!this.attached) return;
    if (pulse.kind === 'flash') {
      const flash = this.stage.appendChild(this.div('aps-flash'));
      flash.style.background = FLASH_CSS[pulse.color];
      const fade = flash.animate([{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 0 }], { duration: FLASH_MS, easing: 'ease-out' });
      fade.onfinish = (): void => flash.remove();
      return;
    }
    if (this.reducedMotion()) return;
    // The whole player window shakes: the element that holds Atlas's map and its layers.
    const target = this.host.parentElement ?? this.host;
    const amplitude = Math.max(4, Math.min(this.stage.clientWidth, this.stage.clientHeight) * 0.012);
    const frames: Keyframe[] = [];
    for (let i = 0; i <= 10; i++) {
      const fall = 1 - i / 10;
      const x = i === 10 ? 0 : (Math.random() * 2 - 1) * amplitude * fall;
      const y = i === 10 ? 0 : (Math.random() * 2 - 1) * amplitude * fall * 0.6;
      frames.push({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)` });
    }
    target.animate(frames, { duration: SHAKE_MS, easing: 'linear', composite: 'add' });
  }

  destroy(): void {
    this.shown.clear();
    this.stage.remove();
  }

  private div(className: string): HTMLDivElement {
    const el = this.doc.createElement('div');
    el.className = className;
    return el;
  }

  private applyLook(): void {
    const s = this.stage.style;
    s.setProperty('--aps-height-num', String(this.look.heightPct));
    s.setProperty('--aps-bottom', `${this.look.bottomPct}%`);
    s.setProperty('--aps-dim', String(this.look.dimPct / 100));
    s.setProperty('--aps-duration', `${this.duration()}ms`);
    s.setProperty('--aps-bench-drop', `${this.look.benchDropPct}%`);
    s.setProperty('--aps-vignette', String(this.look.vignettePct / 100));
    s.setProperty('--aps-blur', `${this.look.blurPx}px`);
  }

  private reducedMotion(): boolean {
    return this.doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  private duration(): number {
    return this.reducedMotion() ? Math.min(this.look.durationMs, 200) : this.look.durationMs;
  }

  private makeImage(path: string): HTMLImageElement {
    const image = this.doc.createElement('img');
    image.className = 'aps-image';
    image.alt = '';
    image.draggable = false;
    image.decoding = 'async';
    image.src = this.resolveUrl(path) ?? '';
    return image;
  }

  private enter(portrait: Portrait, placement: Placement): void {
    const root = this.div('aps-portrait');
    root.dataset.id = portrait.id;
    const light = root.appendChild(this.div('aps-light'));
    const motion = light.appendChild(this.div('aps-motion'));
    const figure = motion.appendChild(this.div('aps-figure'));
    const image = figure.appendChild(this.makeImage(portrait.path));
    const hp = root.appendChild(this.div('aps-hp'));
    const hpFill = hp.appendChild(this.div('aps-hp-fill'));
    const hpText = hp.appendChild(this.div('aps-hp-text'));
    const shown: Shown = { root, figure, image, path: portrait.path, hpFill, hpText };
    this.shown.set(portrait.id, shown);
    this.place(shown, portrait, placement);
    root.style.opacity = '0';
    this.cast.appendChild(root);
    const style = this.reducedMotion() ? 'fade' : this.look.entrance;
    // Enter once the picture can paint, so it never slides in empty.
    void image.decode().catch(() => undefined).then(() => {
      if (!root.isConnected) return;
      setRatio(root, image);
      root.style.opacity = '';
      root.animate(entranceFrames(style, placement.side), { duration: this.duration(), easing: EASE_OUT });
    });
  }

  private update(shown: Shown, portrait: Portrait, placement: Placement): void {
    this.place(shown, portrait, placement);
    if (shown.path !== portrait.path) this.swapImage(shown, portrait.path);
  }

  private place(shown: Shown, portrait: Portrait, placement: Placement): void {
    const { root, figure } = shown;
    root.style.left = `${placement.centerPct}%`;
    root.style.zIndex = String(placement.z);
    root.style.setProperty('--aps-scale', String(portrait.scale / 100));
    root.classList.toggle('is-spotlight', portrait.spotlight);
    root.classList.toggle('is-benched', portrait.benched);
    for (const emotion of EMOTIONS) root.classList.toggle(`is-${emotion}`, portrait.emotion === emotion);
    root.dataset.side = placement.side;
    figure.classList.toggle('is-flipped', portrait.flipped);
    this.showHealth(shown, portrait);
  }

  /** The health bar over the portrait: its token's health, while the look and the GM let it show. */
  private showHealth(shown: Shown, portrait: Portrait): void {
    const mode = this.look.hpMode;
    const hp = portrait.hp;
    const visible = hp !== null && hp.max > 0 && portrait.showHp && !portrait.benched && (mode === 'always' || (mode === 'turn' && portrait.turn));
    shown.root.classList.toggle('has-hp', visible);
    if (!hp || hp.max <= 0) return;
    const share = Math.max(0, Math.min(1, hp.current / hp.max));
    shown.hpFill.style.width = `${share * 100}%`;
    shown.hpFill.style.setProperty('--aps-hp-color', share > 0.5 ? '#22c55e' : share > 0.25 ? '#eab308' : '#ef4444');
    shown.hpText.textContent = `${hp.current}/${hp.max}`;
  }

  /** Another picture of the same portrait (an expression): the new one fades in over the old. */
  private swapImage(shown: Shown, path: string): void {
    shown.path = path;
    const old = shown.image;
    const incoming = this.makeImage(path);
    incoming.style.opacity = '0';
    shown.figure.appendChild(incoming);
    shown.image = incoming;
    void incoming.decode().catch(() => undefined).then(() => {
      // Both pictures keep their proportions inside the box while it takes the new one's.
      setRatio(shown.root, incoming);
      incoming.style.opacity = '';
      const fade = incoming.animate([{ opacity: 0 }, { opacity: 1 }], { duration: this.duration(), easing: 'ease' });
      fade.onfinish = (): void => old.remove();
    });
  }

  private sideOf(shown: Shown): Placement['side'] {
    return shown.root.dataset.side === 'left' ? 'left' : 'right';
  }

  private leave(shown: Shown, side: Placement['side']): void {
    const style = this.reducedMotion() ? 'fade' : this.look.entrance;
    const frames = entranceFrames(style, side).reverse();
    const exit = shown.root.animate(frames, { duration: this.duration() * 0.8, easing: EASE_IN, fill: 'forwards' });
    exit.onfinish = (): void => shown.root.remove();
  }
}
