// online-client/addons/addons.mts
/**
 * The fork's add-ons on the join page:
 * - Portrait Stage: the GM's stage drawn over the map by Portrait Stage's own renderer (`vendor/portrait-stage`), as
 *   in Atlas's player window, under the page's panels. Its CSS goes in as a constructed style sheet: the page's
 *   security policy refuses the `<style>` the renderer would add.
 * - The world map, in the Map tab, to pan and zoom.
 * Pictures come by asset id through the page's loader, wanted while shown and kept in memory only.
 */
import type { AddonMessage } from '../../src/addons/protocol';
import { StageRenderer } from '../../vendor/portrait-stage/stage/StageRenderer';
import { STAGE_CSS, STAGE_STYLE_ID } from '../../vendor/portrait-stage/stage/stageCss';
import { DEFAULT_LOOK, type StageLook, type StageState } from '../../vendor/portrait-stage/stage/types';

export interface AddonImages {
  /** A loaded image's URL by asset id, or null while it loads. */
  url(id: string): string | null;
  /** The images to fetch besides the scene's. */
  want(ids: readonly string[]): void;
}

function adoptStageCss(doc: Document): void {
  if (doc.getElementById(STAGE_STYLE_ID)) return;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(STAGE_CSS);
  doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  // The renderer adds its style only when no element has this id: this marker stands for it.
  const marker = doc.createElement('meta');
  marker.id = STAGE_STYLE_ID;
  doc.head.append(marker);
}

class WorldMapView {
  private readonly frame: HTMLDivElement;
  private readonly image: HTMLImageElement;
  private readonly note: HTMLParagraphElement;
  private scale = 1;
  private x = 0;
  private y = 0;
  private drag: { x: number; y: number } | null = null;
  asset: string | null = null;

  constructor(page: HTMLElement) {
    const doc = page.ownerDocument;
    this.note = doc.createElement('p');
    this.note.className = 'dh-empty';
    this.note.textContent = 'El mapa del mundo aún no se ha compartido.';
    this.frame = doc.createElement('div');
    this.frame.className = 'dh-worldmap';
    this.frame.hidden = true;
    this.image = doc.createElement('img');
    this.image.alt = 'World map';
    this.image.draggable = false;
    const hint = doc.createElement('div');
    hint.className = 'dh-worldmap-hint';
    hint.textContent = 'Rueda para acercar, arrastra para mover, doble clic para encajar';
    this.frame.append(this.image, hint);
    page.replaceChildren(this.note, this.frame);
    this.frame.addEventListener('wheel', (event) => {
      event.preventDefault();
      const rect = this.frame.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const next = Math.min(8, Math.max(0.2, this.scale * Math.exp(-event.deltaY * 0.0015)));
      this.x = px - ((px - this.x) * next) / this.scale;
      this.y = py - ((py - this.y) * next) / this.scale;
      this.scale = next;
      this.apply();
    }, { passive: false });
    this.frame.addEventListener('pointerdown', (event) => {
      this.drag = { x: event.clientX - this.x, y: event.clientY - this.y };
      this.frame.setPointerCapture(event.pointerId);
    });
    this.frame.addEventListener('pointermove', (event) => {
      if (!this.drag) return;
      this.x = event.clientX - this.drag.x;
      this.y = event.clientY - this.drag.y;
      this.apply();
    });
    const end = (): void => { this.drag = null; };
    this.frame.addEventListener('pointerup', end);
    this.frame.addEventListener('pointercancel', end);
    this.frame.addEventListener('dblclick', () => this.fit());
    this.image.addEventListener('load', () => this.fit());
  }

  show(url: string | null): void {
    this.note.hidden = url !== null;
    this.frame.hidden = url === null;
    if (url && this.image.src !== url) this.image.src = url;
  }

  /** The whole map in view. */
  fit(): void {
    const { clientWidth: w, clientHeight: h } = this.frame;
    const { naturalWidth: iw, naturalHeight: ih } = this.image;
    if (!w || !h || !iw || !ih) return;
    this.scale = Math.min(w / iw, h / ih);
    this.x = (w - iw * this.scale) / 2;
    this.y = (h - ih * this.scale) / 2;
    this.apply();
  }

  private apply(): void {
    this.image.style.transform = `translate(${this.x}px, ${this.y}px) scale(${this.scale})`;
  }
}

export class Addons {
  private renderer: StageRenderer | null = null;
  private state: StageState | null = null;
  private look: StageLook = DEFAULT_LOOK;
  private readonly world: WorldMapView;

  constructor(private readonly stageHost: HTMLElement, mapPage: HTMLElement, private readonly images: AddonImages) {
    this.world = new WorldMapView(mapPage);
  }

  receive(message: AddonMessage): void {
    if (message.type === 'ps-pulse') {
      this.renderer?.pulse(message.pulse);
      return;
    }
    if (message.type === 'world-map') {
      this.world.asset = message.asset;
    } else {
      this.state = message.state;
      this.look = message.look ?? DEFAULT_LOOK;
      this.renderer?.setLook(this.look);
    }
    this.images.want([...this.portraitIds(), ...(this.world.asset ? [this.world.asset] : [])]);
    this.refresh();
  }

  /** An image arrived, or the stage changed: draw what is loaded. A portrait enters once its picture is here. */
  refresh(): void {
    this.world.show(this.world.asset ? this.images.url(this.world.asset) : null);
    if (!this.state) {
      this.renderer?.destroy();
      this.renderer = null;
      return;
    }
    if (!this.renderer) {
      adoptStageCss(this.stageHost.ownerDocument);
      this.renderer = new StageRenderer(this.stageHost, this.look, (id) => this.images.url(id));
    }
    const ready = this.state.portraits.filter((p) => p.path !== '' && this.images.url(p.path) !== null);
    this.renderer.render({ ...this.state, portraits: ready });
  }

  private portraitIds(): string[] {
    return (this.state?.portraits ?? []).map((p) => p.path).filter((id) => id !== '');
  }
}
