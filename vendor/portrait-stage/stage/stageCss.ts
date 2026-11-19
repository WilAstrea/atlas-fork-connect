/** Marks the style element the stage adds to a document, so it is added once. */
export const STAGE_STYLE_ID = 'atlas-portrait-stage-style';

/**
 * The stage's look, added to the player window's document by the stage itself: it must not depend on
 * which stylesheets the host copies into its popout.
 */
export const STAGE_CSS = `
.aps-stage {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
  /* Sizes below are in cqh: the stage's own height, whatever room each portrait has to its side. */
  container-type: size;
  --aps-ease: cubic-bezier(.2, .8, .2, 1);
}
.aps-backdrop, .aps-vignette, .aps-cast, .aps-flash { position: absolute; inset: 0; }
/* The map behind the portraits, out of focus. */
.aps-backdrop { z-index: 0; backdrop-filter: blur(0px); transition: backdrop-filter var(--aps-duration, 450ms) ease; }
.aps-stage.is-blur .aps-backdrop { backdrop-filter: blur(var(--aps-blur, 6px)); }
/* Darker edges while someone is on stage, so the portraits stand apart from the map. */
.aps-vignette {
  z-index: 1;
  opacity: 0;
  background:
    radial-gradient(ellipse 75% 70% at 50% 42%, rgba(0, 0, 0, 0) 40%, rgba(0, 0, 0, var(--aps-vignette, .4)) 100%),
    linear-gradient(to top, rgba(0, 0, 0, calc(var(--aps-vignette, .4) * .9)) 0%, rgba(0, 0, 0, 0) 38%);
  transition: opacity calc(var(--aps-duration, 450ms) * 1.6) ease;
}
.aps-stage.has-cast .aps-vignette { opacity: 1; }
.aps-cast { z-index: 2; transition: opacity var(--aps-duration, 450ms) ease; }
.aps-stage.is-hidden .aps-cast { opacity: 0; }
/* Film bars. */
.aps-bar {
  position: absolute;
  left: 0;
  right: 0;
  height: 11%;
  z-index: 40;
  background: #000;
  transition: transform calc(var(--aps-duration, 450ms) * 1.5) var(--aps-ease);
}
.aps-bar.is-top { top: 0; transform: translateY(-101%); }
.aps-bar.is-bottom { bottom: 0; transform: translateY(101%); }
.aps-stage.is-cinema .aps-bar { transform: none; }
.aps-flash { z-index: 50; opacity: 0; }
/* Light rain in front of everyone, slanted by the wind: two layers, the near one faster. */
.aps-rain {
  position: absolute;
  inset: -20%;
  z-index: 30;
  opacity: 0;
  transform: rotate(12deg);
  transition: opacity calc(var(--aps-duration, 450ms) * 2.5) ease;
}
.aps-stage.is-rain .aps-rain { opacity: 1; }
.aps-rain-far, .aps-rain-near { position: absolute; inset: 0; }
.aps-rain-far { background-image: var(--aps-rain-far); background-size: 160px 320px; animation: aps-rain-far .9s linear infinite; }
.aps-rain-near { background-image: var(--aps-rain-near); background-size: 240px 480px; animation: aps-rain-near .55s linear infinite; }
.aps-stage:not(.is-rain) .aps-rain-far, .aps-stage:not(.is-rain) .aps-rain-near { animation-play-state: paused; }
@keyframes aps-rain-far { to { background-position: 0 320px; } }
@keyframes aps-rain-near { to { background-position: 0 480px; } }
@media (prefers-reduced-motion: reduce) { .aps-rain-far, .aps-rain-near { animation-duration: 6s; } }
/* Health over the head of whoever holds the turn, as Atlas draws it on the map. */
.aps-hp {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 1.2cqh);
  translate: -50% 0;
  width: 22cqh;
  height: 3.4cqh;
  min-width: 120px;
  min-height: 22px;
  border-radius: 999px;
  border: .35cqh solid #1a1a1a;
  background: #2a2a2a;
  box-shadow: 0 .4cqh 1.2cqh rgba(0, 0, 0, .5);
  overflow: hidden;
  opacity: 0;
  transform: translateY(1.5cqh);
  transition: opacity var(--aps-duration, 450ms) ease, transform var(--aps-duration, 450ms) var(--aps-ease), bottom var(--aps-duration, 450ms) var(--aps-ease);
}
.aps-portrait.has-hp .aps-hp { opacity: 1; transform: none; }
/* Over the head of a portrait the spotlight makes taller. */
.aps-portrait.is-spotlight .aps-hp { bottom: calc(104% + 1.2cqh); }
.aps-hp-fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--aps-hp-color, #22c55e);
  border-radius: 999px;
  transition: width calc(var(--aps-duration, 450ms) * 1.4) var(--aps-ease), background-color var(--aps-duration, 450ms) ease;
}
.aps-hp-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font: 700 2.2cqh/1 var(--font-interface, system-ui, sans-serif);
  -webkit-text-stroke: .25cqh #000;
  paint-order: stroke fill;
  letter-spacing: .02em;
}

.aps-portrait {
  --aps-h: calc(var(--aps-height-num, 82) * var(--aps-scale, 1) * 1cqh);
  position: absolute;
  bottom: var(--aps-bottom, 0%);
  height: var(--aps-h);
  /* Width from the picture's own proportions, never from the room left to the stage's edge. */
  width: calc(var(--aps-h) * var(--aps-ratio, .5));
  translate: -50% 0;
  transition: left var(--aps-duration, 450ms) var(--aps-ease), height var(--aps-duration, 450ms) var(--aps-ease),
    width var(--aps-duration, 450ms) var(--aps-ease);
}
/* Every state names the same filters in the same order, so the browser can fade between them
   (into black and white and back, into the spotlight and out) instead of jumping. */
.aps-light {
  width: 100%;
  height: 100%;
  transform-origin: 50% 100%;
  transition: filter var(--aps-duration, 450ms) ease, transform var(--aps-duration, 450ms) var(--aps-ease);
  filter: grayscale(0) brightness(1) saturate(1) drop-shadow(0 0 14px rgba(255, 236, 190, 0)) drop-shadow(0 6px 14px rgba(0, 0, 0, .45));
}
.aps-stage.has-spotlight .aps-portrait:not(.is-spotlight) .aps-light {
  filter: grayscale(0) brightness(var(--aps-dim, .45)) saturate(.7) drop-shadow(0 0 14px rgba(255, 236, 190, 0)) drop-shadow(0 6px 14px rgba(0, 0, 0, .45));
}
.aps-portrait.is-spotlight .aps-light {
  transform: scale(1.04);
  filter: grayscale(0) brightness(1) saturate(1) drop-shadow(0 0 14px rgba(255, 236, 190, .55)) drop-shadow(0 6px 14px rgba(0, 0, 0, .45));
}
.aps-portrait.is-benched .aps-light,
.aps-stage.has-spotlight .aps-portrait.is-benched .aps-light {
  transform: translateY(var(--aps-bench-drop, 8%));
  filter: grayscale(1) brightness(.72) saturate(1) drop-shadow(0 0 14px rgba(255, 236, 190, 0)) drop-shadow(0 6px 14px rgba(0, 0, 0, .45));
}
.aps-stage.has-spotlight .aps-portrait.is-benched .aps-light {
  filter: grayscale(1) brightness(var(--aps-dim, .45)) saturate(1) drop-shadow(0 0 14px rgba(255, 236, 190, 0)) drop-shadow(0 6px 14px rgba(0, 0, 0, .45));
}
.aps-motion { width: 100%; height: 100%; transform-origin: 50% 100%; }
.aps-figure {
  position: relative;
  width: 100%;
  height: 100%;
  transition: transform var(--aps-duration, 450ms) var(--aps-ease), filter var(--aps-duration, 450ms) ease;
  filter: sepia(0) saturate(1) hue-rotate(0deg) brightness(1) drop-shadow(0 0 16px rgba(0, 0, 0, 0));
}
.aps-figure.is-flipped { transform: scaleX(-1); }
/* Emotions: a tint and a glow on the picture, a way of moving on its frame. */
.aps-portrait.is-joy .aps-figure { filter: sepia(.25) saturate(1.3) hue-rotate(-10deg) brightness(1.08) drop-shadow(0 0 16px rgba(255, 210, 90, .55)); }
.aps-portrait.is-sadness .aps-figure { filter: sepia(.4) saturate(.6) hue-rotate(170deg) brightness(.85) drop-shadow(0 0 16px rgba(90, 140, 255, .35)); }
.aps-portrait.is-anger .aps-figure { filter: sepia(.5) saturate(1.8) hue-rotate(-30deg) brightness(.95) drop-shadow(0 0 16px rgba(255, 60, 40, .6)); }
.aps-portrait.is-fear .aps-figure { filter: sepia(.15) saturate(.4) hue-rotate(200deg) brightness(1.05) drop-shadow(0 0 16px rgba(170, 120, 255, .4)); }
.aps-portrait.is-love .aps-figure { filter: sepia(.3) saturate(1.4) hue-rotate(-40deg) brightness(1.05) drop-shadow(0 0 16px rgba(255, 120, 190, .6)); }
.aps-portrait.is-hurt .aps-figure { filter: sepia(.6) saturate(1.5) hue-rotate(-35deg) brightness(.85) drop-shadow(0 0 16px rgba(220, 30, 30, .45)); }
.aps-portrait.is-tired .aps-figure { filter: sepia(.2) saturate(.6) hue-rotate(0deg) brightness(.8) drop-shadow(0 0 16px rgba(0, 0, 0, 0)); }
.aps-portrait.is-joy .aps-motion { animation: aps-joy 2.6s ease-in-out infinite; }
.aps-portrait.is-sadness .aps-motion { animation: aps-sadness 5s ease-in-out infinite; }
.aps-portrait.is-anger .aps-motion { animation: aps-anger .32s linear infinite; }
.aps-portrait.is-fear .aps-motion { animation: aps-fear .2s linear infinite; }
.aps-portrait.is-love .aps-motion { animation: aps-love 1.4s ease-in-out infinite; }
.aps-portrait.is-hurt .aps-motion { animation: aps-hurt-hit .5s ease-out 1, aps-hurt 4s ease-in-out .5s infinite; }
.aps-portrait.is-tired .aps-motion { animation: aps-tired 6s ease-in-out infinite; }
@keyframes aps-joy { 0%, 45%, 100% { transform: none; } 10% { transform: translateY(-2.5%); } 20% { transform: none; } 30% { transform: translateY(-1.4%); } }
@keyframes aps-sadness { 0%, 100% { transform: translateY(1%); } 50% { transform: translateY(2.4%) rotate(-.6deg); } }
@keyframes aps-anger { 0%, 100% { transform: translate(0, 0); } 25% { transform: translate(.6%, -.3%); } 50% { transform: translate(-.5%, .2%); } 75% { transform: translate(.4%, .3%); } }
@keyframes aps-fear { 0%, 100% { transform: translate(0, 0) scale(.985); } 33% { transform: translate(.3%, .1%) scale(.985); } 66% { transform: translate(-.3%, -.1%) scale(.985); } }
@keyframes aps-love { 0%, 28%, 70%, 100% { transform: none; } 14% { transform: scale(1.025); } 42% { transform: scale(1.02); } }
@keyframes aps-hurt-hit { 0% { transform: none; } 20% { transform: translateX(-3%) rotate(-3deg); } 100% { transform: none; } }
@keyframes aps-hurt { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(-1deg) translateY(.8%); } }
@keyframes aps-tired { 0%, 100% { transform: none; } 50% { transform: rotate(-1.5deg) translateY(1%); } }
@media (prefers-reduced-motion: reduce) { .aps-motion { animation: none !important; } }
/* Whatever the host's own image rules say: the picture fills its box and keeps its proportions. */
.aps-stage .aps-image.aps-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  max-width: none !important;
  max-height: none !important;
  margin: 0;
  object-fit: contain;
  object-position: 50% 100%;
  user-select: none;
  -webkit-user-drag: none;
}
`;

/** Adds the stage's style to `doc` once. */
export function ensureStageStyle(doc: Document): void {
  if (doc.getElementById(STAGE_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STAGE_STYLE_ID;
  style.textContent = STAGE_CSS;
  doc.head.appendChild(style);
}
