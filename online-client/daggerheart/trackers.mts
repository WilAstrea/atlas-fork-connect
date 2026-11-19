// online-client/daggerheart/trackers.mts
/** Atlas's widgets (counters, clocks, timers) as badges at the top right, as the player window shows them. */
import type { PlayerWidget } from '../../src/app/online/scene/sceneTypes';
import { WIDGET_ICON_PATHS } from '../../src/app/types/widgetIcons';
import { formatTimerTime } from '../../src/app/utils/timerWidget';

const SVG = 'http://www.w3.org/2000/svg';

function icon(doc: Document, name: string, color: string | undefined): SVGSVGElement | null {
  const path = (WIDGET_ICON_PATHS as Record<string, string>)[name];
  if (!path) return null;
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 512 512');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('dh-tracker-icon');
  const shape = doc.createElementNS(SVG, 'path');
  shape.setAttribute('d', path);
  shape.setAttribute('fill', color ?? 'currentColor');
  svg.append(shape);
  return svg;
}

export class TrackersView {
  private drawn = '';

  constructor(private readonly root: HTMLElement, private readonly doc: Document = document) {}

  render(widgets: readonly PlayerWidget[]): void {
    const key = JSON.stringify(widgets);
    if (key === this.drawn) return;
    this.drawn = key;
    this.root.replaceChildren();
    for (const widget of widgets) {
      const badge = this.doc.createElement('div');
      badge.className = `dh-tracker dh-tracker-${widget.type}`;
      const value = widget.type === 'timer' ? formatTimerTime(widget.value) : String(widget.value);
      badge.setAttribute('aria-label', `${widget.label || widget.type}: ${value}`);
      const glyph = icon(this.doc, widget.icon, widget.color);
      if (glyph) badge.append(glyph);
      const text = this.doc.createElement('div');
      text.className = 'dh-tracker-text';
      const number = this.doc.createElement('span');
      number.className = 'dh-tracker-value';
      number.textContent = value;
      const label = this.doc.createElement('span');
      label.className = 'dh-tracker-label';
      label.textContent = widget.label;
      text.append(number, label);
      badge.append(text);
      this.root.append(badge);
    }
  }
}
