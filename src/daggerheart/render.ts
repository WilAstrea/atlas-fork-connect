/**
 * A Daggerheart sheet and its domain cards, drawn with plain DOM so the web page and Obsidian share it. Text only,
 * never markup: everything comes from a note. The sheet asks for changes and rolls through `actions`; it never
 * changes itself, it is drawn again from what the GM sends back.
 */
import { TRAITS, type DomainCard, type Trait } from './model';
import { cardFace, SHEET_CONDITIONS, type ChatEntry, type DhCardFace, type DhSheet, type ThemeImage } from './protocol';
import type { DhEdit, DhRollRequest } from './rules';

export interface SheetActions {
  edit(edit: DhEdit): void;
  /** Without it the sheet offers no rolls (the GM's own copy in a note). */
  roll?(roll: DhRollRequest): void;
  /** Shares a domain card in the session chat (a click on the card); without it a click does nothing. */
  share?(card: DhCardFace): void;
}

/** The GM's sheet art, as URLs, by its name in the theme folder. */
export type SheetTheme = Partial<Record<ThemeImage, string>>;

/** Puts the theme's art on `root` as CSS variables (`--dh-art-<name>`), and `has-theme` while there is any. */
export function applyTheme(root: HTMLElement, theme: SheetTheme | null | undefined): void {
  const entries = Object.entries(theme ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
  for (const [name, url] of entries) root.style.setProperty(`--dh-art-${name}`, `url("${url.replace(/"/g, '%22')}")`);
  root.classList.toggle('has-theme', entries.length > 0);
}

/** What the player picked for their next roll; kept by the caller across redraws. */
export interface RollChoice {
  experiences: Set<string>;
  advantage: 'advantage' | 'disadvantage' | null;
  modifier: number;
}

export const newRollChoice = (): RollChoice => ({ experiences: new Set(), advantage: null, modifier: 0 });

const DOMAIN_COLORS: Record<string, string> = {
  arcana: '#6d3fa6', blade: '#a12a2a', bone: '#8a8a7a', codex: '#2f5fa8', grace: '#b03c86',
  midnight: '#2a2a46', sage: '#3e7d3a', splendor: '#b8902a', valor: '#c4632a',
};

export const domainColor = (domain: string): string => DOMAIN_COLORS[domain.trim().toLowerCase()] ?? '#555a66';
const signed = (n: number): string => (n >= 0 ? `+${n}` : String(n));
const title = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

type Make = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => HTMLElementTagNameMap[K];

function maker(doc: Document): Make {
  return (tag, cls, text) => {
    const el = doc.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };
}

/** Text with `**bold**` runs, as Heart of Daggers writes them; the rest stays plain text. */
function richText(make: Make, text: string): HTMLElement {
  const block = make('div', 'dh-text');
  for (const paragraph of text.split(/\n{2,}/)) {
    const p = make('p');
    for (const part of paragraph.split(/(\*\*[^*]+\*\*)/)) {
      if (!part) continue;
      if (/^\*\*[^*]+\*\*$/.test(part)) {
        p.append(make('strong', undefined, part.slice(2, -2)));
        continue;
      }
      const lines = part.split('\n');
      lines.forEach((line, i) => {
        p.append(line);
        if (i < lines.length - 1) p.append(make('br'));
      });
    }
    block.append(p);
  }
  return block;
}

/** A row of pips: clicking the n-th marks n (clicking the last marked one unmarks it). */
function track(make: Make, label: string, value: number, max: number, kind: string, onSet: (value: number) => void): HTMLElement {
  const row = make('div', `dh-track dh-track-${kind}`);
  row.append(make('span', 'dh-track-label', label));
  const pips = make('div', 'dh-pips');
  for (let i = 1; i <= max; i++) {
    const pip = make('button', `dh-pip${i <= value ? ' is-marked' : ''}`);
    pip.type = 'button';
    // Two halves, which the theme's art uses for a broken heart or a split shield; plain pips ignore them.
    pip.append(make('span', 'dh-pip-half dh-pip-left'), make('span', 'dh-pip-half dh-pip-right'));
    pip.setAttribute('aria-label', `${label} ${i} of ${max}${i <= value ? ', marked' : ''}`);
    pip.addEventListener('click', () => onSet(i === value ? i - 1 : i));
    pips.append(pip);
  }
  row.append(pips, make('span', 'dh-track-count', `${value}/${max}`));
  return row;
}

function button(make: Make, cls: string, text: string, onClick: () => void, label?: string): HTMLButtonElement {
  const b = make('button', cls, text);
  b.type = 'button';
  if (label) b.setAttribute('aria-label', label);
  b.addEventListener('click', onClick);
  return b;
}

function rollOptions(choice: RollChoice): { experiences: string[]; advantage?: 'advantage' | 'disadvantage'; modifier?: number } {
  return {
    experiences: [...choice.experiences],
    ...(choice.advantage ? { advantage: choice.advantage } : {}),
    ...(choice.modifier ? { modifier: choice.modifier } : {}),
  };
}

/** A domain card as the table shows it: level, domain colour, type, Recall cost, its text, and its tokens. */
export function renderCard(doc: Document, card: DomainCard, tokens: number, actions: SheetActions, artUrl?: string | null): HTMLElement {
  const make = maker(doc);
  const el = make('article', `dh-card dh-card-${card.location}${actions.share ? ' is-shareable' : ''}`);
  el.style.setProperty('--dh-domain', domainColor(card.domain));
  if (actions.share) {
    el.tabIndex = 0;
    el.setAttribute('aria-label', `${card.name}: click to share in the chat`);
    const share = (event: Event): void => {
      // The card's own buttons (tokens, roll, move) keep their clicks.
      if (event.target instanceof Element && event.target.closest('button')) return;
      actions.share?.(cardFace(card));
    };
    el.addEventListener('click', share);
    el.addEventListener('keydown', (event) => { if (event.key === 'Enter' && event.target === el) share(event); });
  }
  const art = make('div', 'dh-card-art');
  if (artUrl) art.style.backgroundImage = `url("${artUrl.replace(/"/g, '%22')}")`;
  art.append(make('span', 'dh-card-level', String(card.level)), make('span', 'dh-card-recall', String(card.recall)));
  art.lastElementChild?.setAttribute('aria-label', `Recall cost ${card.recall}`);
  el.append(art);
  el.append(make('div', 'dh-card-type', card.type || 'Card'), make('h4', 'dh-card-name', card.name), make('div', 'dh-card-domain', card.domain));
  el.append(richText(make, card.effect));
  const foot = make('div', 'dh-card-foot');
  // Only cards that work with tokens (Unleash Chaos) count them; any already on a card stay visible.
  if (card.location === 'loadout' && (/\btokens?\b/i.test(card.effect) || tokens > 0)) {
    const counter = make('div', 'dh-card-tokens');
    counter.append(
      button(make, 'dh-mini', '−', () => actions.edit({ kind: 'card-tokens', card: card.name, value: Math.max(0, tokens - 1) }), `Remove a token from ${card.name}`),
      make('span', undefined, `${tokens} tokens`),
      button(make, 'dh-mini', '+', () => actions.edit({ kind: 'card-tokens', card: card.name, value: tokens + 1 }), `Add a token to ${card.name}`),
    );
    foot.append(counter);
    if (actions.roll && tokens > 0 && /d10/i.test(card.effect)) {
      foot.append(button(make, 'dh-action', `Roll ${tokens}d10`, () => actions.roll?.({ kind: 'card-damage', card: card.name, dice: tokens })));
    }
  }
  foot.append(button(make, 'dh-mini dh-move', card.location === 'loadout' ? 'To vault' : 'To loadout',
    () => actions.edit({ kind: 'card-location', card: card.name, location: card.location === 'loadout' ? 'vault' : 'loadout' })));
  el.append(foot);
  return el;
}

/** A card as the chat shows it: its face only, no buttons. */
export function renderCardFace(doc: Document, face: DhCardFace): HTMLElement {
  const make = maker(doc);
  const el = make('article', 'dh-card dh-card-face');
  el.style.setProperty('--dh-domain', domainColor(face.domain));
  const art = make('div', 'dh-card-art');
  art.append(make('span', 'dh-card-level', String(face.level)), make('span', 'dh-card-recall', String(face.recall)));
  el.append(art, make('div', 'dh-card-type', face.type || 'Card'), make('h4', 'dh-card-name', face.name), make('div', 'dh-card-domain', face.domain));
  el.append(richText(make, face.effect));
  return el;
}

export interface RenderOptions {
  doc: Document;
  choice: RollChoice;
  /** Redraw after the player changed `choice` (it is local until they roll). */
  redraw: () => void;
  /** The URL of a card's art, where the page has it. */
  artUrl?: (card: DomainCard) => string | null;
  /** A line about the last roll or refusal, shown above the cards. */
  status?: string | null;
  /** The GM's sheet art, when there is some. */
  theme?: SheetTheme | null;
  /** Whether the sheet ends with the inventory (the page has a tab of its own for it). */
  withInventory?: boolean;
}

export function renderSheet(root: HTMLElement, sheet: DhSheet, actions: SheetActions, options: RenderOptions): void {
  const make = maker(options.doc);
  const { build, state } = sheet;
  const { choice } = options;
  const canRoll = !!actions.roll;
  root.replaceChildren();
  root.classList.add('dh-sheet');
  applyTheme(root, options.theme);

  // Header: who, and the six traits (a click rolls the trait with what is picked below).
  const head = make('header', 'dh-head');
  const who = make('div', 'dh-who');
  who.append(make('h3', 'dh-name', build.name));
  who.append(make('div', 'dh-sub', [`Level ${build.level}`, `Tier ${build.tier}`, build.ancestry, build.community, `${build.class} (${build.subclass})`, build.pronouns ?? ''].filter(Boolean).join(' · ')));
  head.append(who);
  const traits = make('div', 'dh-traits');
  for (const t of TRAITS) {
    const isSpell = build.spellcastTrait === t;
    const badge = button(make, `dh-trait${isSpell ? ' is-spellcast' : ''}`, '', () => actions.roll?.({ kind: 'action', trait: t, ...rollOptions(choice) }), `Roll ${title(t)} ${signed(build.traits[t])}`);
    badge.disabled = !canRoll;
    badge.append(make('span', 'dh-trait-name', title(t)), make('span', 'dh-trait-value', signed(build.traits[t])));
    traits.append(badge);
  }
  head.append(traits);
  root.append(head);

  const grid = make('div', 'dh-grid');

  // Defence and tracks.
  const vitals = make('section', 'dh-box dh-vitals');
  vitals.append(make('h4', 'dh-box-title', 'Armor & stats'));
  const stats = make('div', 'dh-stats');
  for (const [label, value] of [['Evasion', build.evasion], ['Armor', build.armorScore], ['Proficiency', build.proficiency]] as const) {
    const s = make('div', 'dh-stat');
    s.append(make('span', 'dh-stat-value', String(value)), make('span', 'dh-stat-label', label));
    stats.append(s);
  }
  vitals.append(stats);
  const th = make('div', 'dh-thresholds');
  th.append(make('span', 'dh-th', 'Minor'), make('b', undefined, String(build.thresholds.major)), make('span', 'dh-th', 'Major'), make('b', undefined, String(build.thresholds.severe)), make('span', 'dh-th', 'Severe'));
  vitals.append(th);
  vitals.append(
    track(make, 'Armor', state.armorSlots, build.armorScore, 'armor', (v) => actions.edit({ kind: 'track', track: 'armorSlots', value: v })),
    track(make, 'HP', state.hp, build.maxHp, 'hp', (v) => actions.edit({ kind: 'track', track: 'hp', value: v })),
    track(make, 'Stress', state.stress, build.maxStress, 'stress', (v) => actions.edit({ kind: 'track', track: 'stress', value: v })),
    track(make, 'Hope', state.hope, build.maxHope, 'hope', (v) => actions.edit({ kind: 'track', track: 'hope', value: v })),
  );
  const conditions = make('div', 'dh-conditions');
  const all = [...new Set([...SHEET_CONDITIONS, ...state.conditions])];
  for (const name of all) {
    const on = state.conditions.includes(name);
    conditions.append(button(make, `dh-chip${on ? ' is-on' : ''}`, title(name), () => actions.edit({ kind: 'condition', name, on: !on }), `${title(name)}: ${on ? 'on' : 'off'}`));
  }
  vitals.append(conditions);
  grid.append(vitals);

  // Weapons, armour, and the roll options.
  const gear = make('section', 'dh-box dh-gear');
  gear.append(make('h4', 'dh-box-title', 'Weapons & armor'));
  build.weapons.forEach((w, index) => {
    const row = make('div', `dh-weapon${w.active ? '' : ' is-inactive'}`);
    row.append(make('div', 'dh-weapon-name', w.name));
    row.append(make('div', 'dh-tags', [w.damageType === 'magic' ? 'Magical' : 'Physical', w.range, title(w.trait), w.damage, w.slot].filter(Boolean).join(' · ')));
    if (w.feature) row.append(richText(make, w.feature));
    if (canRoll) {
      const trait = w.trait.trim().toLowerCase() as Trait;
      const buttons = make('div', 'dh-buttons');
      if ((TRAITS as readonly string[]).includes(trait)) buttons.append(button(make, 'dh-action', 'Roll to hit', () => actions.roll?.({ kind: 'action', trait, ...rollOptions(choice) })));
      buttons.append(button(make, 'dh-action', 'Roll damage', () => actions.roll?.({ kind: 'damage', weapon: index })));
      buttons.append(button(make, 'dh-action dh-subtle', 'Critical', () => actions.roll?.({ kind: 'damage', weapon: index, critical: true })));
      row.append(buttons);
    }
    gear.append(row);
  });
  if (build.armor) {
    const row = make('div', 'dh-weapon');
    row.append(make('div', 'dh-weapon-name', build.armor.name));
    row.append(make('div', 'dh-tags', [`Score ${build.armor.score}`, build.armor.baseThresholds ? `Base ${build.armor.baseThresholds.join(' / ')}` : ''].filter(Boolean).join(' · ')));
    if (build.armor.feature) row.append(richText(make, build.armor.feature));
    gear.append(row);
  }
  grid.append(gear);

  const exp = make('section', 'dh-box dh-experiences');
  exp.append(make('h4', 'dh-box-title', 'Experiences'));
  for (const e of build.experiences) {
    const picked = choice.experiences.has(e.name);
    const b = button(make, `dh-experience${picked ? ' is-picked' : ''}`, '', () => {
      if (picked) choice.experiences.delete(e.name); else choice.experiences.add(e.name);
      options.redraw();
    }, `${e.name} ${signed(e.bonus)}: ${picked ? 'used on the next roll (1 Hope)' : 'not used'}`);
    b.disabled = !canRoll;
    b.append(make('span', undefined, e.name), make('b', undefined, signed(e.bonus)));
    exp.append(b);
  }
  if (canRoll) {
    const opts = make('div', 'dh-roll-options');
    for (const side of ['advantage', 'disadvantage'] as const) {
      opts.append(button(make, `dh-chip${choice.advantage === side ? ' is-on' : ''}`, title(side), () => {
        choice.advantage = choice.advantage === side ? null : side;
        options.redraw();
      }));
    }
    const mod = make('div', 'dh-modifier');
    mod.append(
      button(make, 'dh-mini', '−', () => { choice.modifier = Math.max(-20, choice.modifier - 1); options.redraw(); }, 'Lower the modifier'),
      make('span', undefined, `Mod ${signed(choice.modifier)}`),
      button(make, 'dh-mini', '+', () => { choice.modifier = Math.min(20, choice.modifier + 1); options.redraw(); }, 'Raise the modifier'),
    );
    opts.append(mod);
    if (build.spellcastTrait) opts.append(button(make, 'dh-action', 'Spellcast roll', () => actions.roll?.({ kind: 'spellcast', ...rollOptions(choice) })));
    exp.append(opts);
    const cost = choice.experiences.size;
    if (cost > 0) exp.append(make('div', `dh-note${cost > state.hope ? ' is-warning' : ''}`, `Experiences used cost ${cost} Hope (you have ${state.hope}).`));
  }
  grid.append(exp);

  const feats = make('section', 'dh-box dh-features');
  feats.append(make('h4', 'dh-box-title', 'Features'));
  for (const [label, text] of [['Hope feature', build.features.hope], ['Class & subclass', build.features.classAndSubclass], ['Heritage', build.features.heritage]] as const) {
    if (!text) continue;
    const details = make('details', 'dh-feature');
    if (label === 'Hope feature') details.open = true;
    details.append(make('summary', undefined, label), richText(make, text));
    feats.append(details);
  }
  grid.append(feats);
  root.append(grid);

  if (options.status) root.append(make('div', 'dh-status', options.status));

  // The table: the loadout as cards, the vault folded away.
  const loadout = build.domainCards.filter((c) => c.location === 'loadout');
  const vault = build.domainCards.filter((c) => c.location === 'vault');
  const table = make('section', 'dh-table');
  table.append(make('h4', 'dh-box-title', `Loadout (${loadout.length}/5)`));
  const row = make('div', 'dh-cards');
  for (const card of loadout) row.append(renderCard(options.doc, card, state.cardTokens[card.name] ?? 0, actions, options.artUrl?.(card) ?? null));
  if (loadout.length === 0) row.append(make('div', 'dh-note', 'No cards in the loadout.'));
  table.append(row);
  if (vault.length > 0) {
    const fold = make('details', 'dh-vault');
    fold.append(make('summary', undefined, `Vault (${vault.length})`));
    const vrow = make('div', 'dh-cards');
    for (const card of vault) vrow.append(renderCard(options.doc, card, state.cardTokens[card.name] ?? 0, actions, options.artUrl?.(card) ?? null));
    fold.append(vrow);
    table.append(fold);
  }
  root.append(table);

  if (options.withInventory !== false && (build.inventory.length > 0 || build.gold.handfuls + build.gold.bags + build.gold.chests > 0)) {
    const inv = make('details', 'dh-box dh-inventory');
    inv.append(make('summary', undefined, 'Inventory & gold'));
    const list = make('ul');
    for (const item of build.inventory) list.append(make('li', undefined, item));
    inv.append(list, make('div', 'dh-note', `Gold: ${build.gold.handfuls} handfuls · ${build.gold.bags} bags · ${build.gold.chests} chests`));
    root.append(inv);
  }
}

/** The Inventory tab: gold, what is carried and worn, and the items list. */
export function renderInventory(root: HTMLElement, sheet: DhSheet, options: Pick<RenderOptions, 'doc' | 'theme'>): void {
  const make = maker(options.doc);
  const { build } = sheet;
  root.replaceChildren();
  root.classList.add('dh-sheet', 'dh-inventory-page');
  applyTheme(root, options.theme);
  const head = make('header', 'dh-head');
  head.append(make('h3', 'dh-name', build.name), make('div', 'dh-sub', 'Inventory'));
  root.append(head);
  const grid = make('div', 'dh-grid');

  const gold = make('section', 'dh-box dh-gold');
  gold.append(make('h4', 'dh-box-title', 'Gold'));
  const coins = make('div', 'dh-stats dh-stats-4');
  for (const [label, value] of [['Handfuls', build.gold.handfuls], ['Bags', build.gold.bags], ['Chests', build.gold.chests], ['Stashed', build.gold.stashed]] as const) {
    const s = make('div', 'dh-stat');
    s.append(make('span', 'dh-stat-value', String(value)), make('span', 'dh-stat-label', label));
    coins.append(s);
  }
  gold.append(coins);
  grid.append(gold);

  const gear = make('section', 'dh-box');
  gear.append(make('h4', 'dh-box-title', 'Equipped'));
  for (const w of build.weapons) {
    const row = make('div', `dh-weapon${w.active ? '' : ' is-inactive'}`);
    row.append(make('div', 'dh-weapon-name', w.name), make('div', 'dh-tags', [title(w.slot), w.damage, w.range].filter(Boolean).join(' · ')));
    gear.append(row);
  }
  if (build.armor) {
    const row = make('div', 'dh-weapon');
    row.append(make('div', 'dh-weapon-name', build.armor.name), make('div', 'dh-tags', `Armor ${build.armor.score}`));
    gear.append(row);
  }
  grid.append(gear);

  const items = make('section', 'dh-box dh-items');
  items.append(make('h4', 'dh-box-title', `Items (${build.inventory.length})`));
  if (build.inventory.length === 0) items.append(make('div', 'dh-note', 'Nothing carried.'));
  const list = make('ul', 'dh-item-list');
  for (const item of build.inventory) list.append(make('li', undefined, item));
  items.append(list);
  grid.append(items);
  root.append(grid);
}

/** The line shown for a roll result. */
export function rolledLine(label: string, total: number, hope?: number, fear?: number, outcome?: string): string {
  if (hope === undefined || fear === undefined) return `${label}: ${total}`;
  const how = outcome === 'critical' ? 'Critical success!' : outcome === 'hope' ? 'with Hope' : 'with Fear';
  return `${label}: ${total} ${how} (Hope ${hope} · Fear ${fear})`;
}

/** One chat line: who, when, and their words or card. Obsidian's chat view and the page's chat panel draw it alike. */
export function chatLine(doc: Document, entry: ChatEntry): HTMLElement {
  const line = doc.createElement('div');
  line.className = `dh-chat-line${entry.gm ? ' is-gm' : ''}`;
  const head = doc.createElement('div');
  head.className = 'dh-chat-head';
  const who = doc.createElement('b');
  who.textContent = entry.gm ? 'GM' : entry.from;
  const when = doc.createElement('time');
  when.textContent = new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  head.append(who, when);
  line.append(head);
  if (entry.text) {
    const p = doc.createElement('p');
    p.textContent = entry.text;
    line.append(p);
  }
  if (entry.card) line.append(renderCardFace(doc, entry.card));
  return line;
}
