/**
 * Daggerheart rules the sheet needs, pure: what a player may change on their own sheet, how a roll from it is
 * built, and how duality dice resolve (SRD: Hope and Fear d12; a tie is a critical success that gains a Hope and
 * clears a Stress; the higher die names the roll "with Hope" or "with Fear"; each Experience used costs a Hope).
 */
import { TRAITS, type DaggerheartCharacter, type DaggerheartState, type Trait } from './model';

export const CONDITIONS = ['hidden', 'restrained', 'vulnerable'] as const;
export const MAX_CUSTOM_CONDITION = 40;
export const MAX_CARD_TOKENS = 20;

/** One change a player asks for on their own sheet. The GM applies it to the note, clamped to the sheet's limits. */
export type DhEdit =
  | { kind: 'track'; track: 'hp' | 'stress' | 'hope' | 'armorSlots'; value: number }
  | { kind: 'condition'; name: string; on: boolean }
  | { kind: 'card-tokens'; card: string; value: number }
  | { kind: 'card-location'; card: string; location: 'loadout' | 'vault' };

/** A roll a player asks for from their sheet. The GM builds the formula from its own copy, never the player's. */
export type DhRollRequest =
  | { kind: 'action'; trait: Trait; experiences: string[]; advantage?: 'advantage' | 'disadvantage'; modifier?: number }
  | { kind: 'spellcast'; experiences: string[]; advantage?: 'advantage' | 'disadvantage'; modifier?: number }
  | { kind: 'damage'; weapon: number; critical?: boolean }
  | { kind: 'card-damage'; card: string; dice: number };

export const LOADOUT_LIMIT = 5;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, Math.round(value)));

export function trackMax(c: DaggerheartCharacter, track: 'hp' | 'stress' | 'hope' | 'armorSlots'): number {
  switch (track) {
    case 'hp': return c.build.maxHp;
    case 'stress': return c.build.maxStress;
    case 'hope': return c.build.maxHope;
    case 'armorSlots': return c.build.armorScore;
  }
}

/** The state after `edit`, or null when the edit names nothing on this sheet or would break the rules. */
export function applyEdit(c: DaggerheartCharacter, edit: DhEdit): DaggerheartState | null {
  const state: DaggerheartState = structuredClone(c.state);
  switch (edit.kind) {
    case 'track':
      state[edit.track] = clamp(edit.value, 0, trackMax(c, edit.track));
      return state;
    case 'condition': {
      const name = edit.name.trim().toLowerCase().slice(0, MAX_CUSTOM_CONDITION);
      if (!name) return null;
      const set = new Set(state.conditions);
      if (edit.on) set.add(name); else set.delete(name);
      state.conditions = [...set];
      return state;
    }
    case 'card-tokens': {
      if (!c.build.domainCards.some((card) => card.name === edit.card)) return null;
      state.cardTokens = { ...state.cardTokens, [edit.card]: clamp(edit.value, 0, MAX_CARD_TOKENS) };
      return state;
    }
    case 'card-location':
      // Where a card sits is part of the build (the PDF's loadout marks): `moveCard` changes it, not the state.
      return null;
  }
}

/** Moves a domain card between loadout and vault; null when it is not on the sheet or the loadout is full. */
export function moveCard(c: DaggerheartCharacter, card: string, location: 'loadout' | 'vault'): DaggerheartCharacter | null {
  const found = c.build.domainCards.find((d) => d.name === card);
  if (!found) return null;
  if (found.location === location) return c;
  if (location === 'loadout' && c.build.domainCards.filter((d) => d.location === 'loadout').length >= LOADOUT_LIMIT) return null;
  return {
    ...c,
    build: { ...c.build, domainCards: c.build.domainCards.map((d) => (d.name === card ? { ...d, location } : d)) },
  };
}

const signed = (n: number): string => (n === 0 ? '' : n > 0 ? `+${n}` : String(n));
const traitLabel = (t: Trait): string => t[0]!.toUpperCase() + t.slice(1);

export interface BuiltRoll {
  formula: string;
  label: string;
  /** Duality rolls: the first two dice of the result are Hope then Fear. */
  duality: boolean;
  /** Hope the roll spends before it is rolled (Experiences). */
  hopeCost: number;
}

/** The formula and label of a roll from the GM's copy of the sheet; null when the sheet cannot make it. */
export function buildRoll(c: DaggerheartCharacter, request: DhRollRequest): BuiltRoll | null {
  const { build } = c;
  if (request.kind === 'action' || request.kind === 'spellcast') {
    const trait = request.kind === 'spellcast' ? build.spellcastTrait : request.trait;
    if (!trait || !(TRAITS as readonly string[]).includes(trait)) return null;
    const used = [...new Set(request.experiences)].map((name) => build.experiences.find((e) => e.name === name));
    if (used.some((e) => !e)) return null;
    const hopeCost = used.length;
    if (hopeCost > c.state.hope) return null;
    const bonus = build.traits[trait] + used.reduce((sum, e) => sum + (e?.bonus ?? 0), 0) + clamp(request.modifier ?? 0, -20, 20);
    const side = request.advantage === 'advantage' ? '+1d6' : request.advantage === 'disadvantage' ? '-1d6' : '';
    const what = request.kind === 'spellcast' ? `Spellcast (${traitLabel(trait)})` : traitLabel(trait);
    const extras = used.length ? ` + ${used.map((e) => e?.name).join(', ')}` : '';
    return { formula: `2d12${side}${signed(bonus)}`, label: `${what}${extras}`, duality: true, hopeCost };
  }
  if (request.kind === 'damage') {
    const weapon = build.weapons[request.weapon];
    if (!weapon) return null;
    const m = weapon.damage.replace(/\s/g, '').match(/^(\d*)d(\d+)([+-]\d+)?$/i);
    if (!m) return null;
    const count = (m[1] ? parseInt(m[1], 10) : 1) * Math.max(1, build.proficiency);
    const sides = parseInt(m[2]!, 10);
    const flat = m[3] ? parseInt(m[3], 10) : 0;
    // SRD critical damage: the dice's maximum is added to the roll.
    const crit = request.critical ? count * sides : 0;
    return { formula: `${count}d${sides}${signed(flat + crit)}`, label: `${weapon.name} damage${request.critical ? ' (critical)' : ''}`, duality: false, hopeCost: 0 };
  }
  // A card that rolls d10s by tokens spent (Unleash Chaos): its tokens are spent here.
  const card = build.domainCards.find((d) => d.name === request.card && d.location === 'loadout');
  const tokens = c.state.cardTokens[request.card] ?? 0;
  if (!card || request.dice < 1 || request.dice > tokens) return null;
  return { formula: `${request.dice}d10`, label: `${card.name} (${request.dice} tokens)`, duality: false, hopeCost: 0 };
}

export type DualityOutcome = 'critical' | 'hope' | 'fear';

export function dualityOutcome(hope: number, fear: number): DualityOutcome {
  if (hope === fear) return 'critical';
  return hope > fear ? 'hope' : 'fear';
}

/** The state after a duality roll's outcome (and the Hope the roll spent before it). */
export function afterDuality(c: DaggerheartCharacter, outcome: DualityOutcome, hopeCost: number): DaggerheartState {
  const state = structuredClone(c.state);
  state.hope = Math.max(0, state.hope - hopeCost);
  if (outcome !== 'fear') state.hope = Math.min(c.build.maxHope, state.hope + 1);
  if (outcome === 'critical') state.stress = Math.max(0, state.stress - 1);
  return state;
}

/** The state after a card roll spent its tokens. */
export function afterCardRoll(c: DaggerheartCharacter, card: string, spent: number): DaggerheartState {
  const state = structuredClone(c.state);
  state.cardTokens = { ...state.cardTokens, [card]: Math.max(0, (state.cardTokens[card] ?? 0) - spent) };
  return state;
}
