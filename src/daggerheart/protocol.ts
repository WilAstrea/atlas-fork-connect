/**
 * Daggerheart messages of an online session, kept apart from Connect's own protocol so a fork merges cleanly: the
 * protocol imports these types and validators and adds them to its own.
 *
 * GM to one player: `dh-sheets` (the Daggerheart characters that player plays, read from the vault), `dh-rolled`
 * (how their roll went) and `dh-refused`. Player to GM: `dh-edit` (a change to their own sheet) and `dh-roll` (a roll
 * from it). The GM checks every request against its own copy of the note; a player never sends a formula.
 */
import { TRAITS, type DaggerheartBuild, type DaggerheartState } from './model';
import { CONDITIONS, MAX_CUSTOM_CONDITION, type DhEdit, type DhRollRequest, type DualityOutcome } from './rules';

export interface DhSheet {
  /** Opaque id of the character's note, stable while the session runs. */
  id: string;
  build: DaggerheartBuild;
  state: DaggerheartState;
}

export type DhRefusal = 'not-yours' | 'not-on-sheet' | 'no-hope' | 'loadout-full' | 'not-rolled';

export type DhMessage =
  | { v: 1; type: 'dh-sheets'; entries: DhSheet[] }
  | { v: 1; type: 'dh-edit'; id: string; edit: DhEdit }
  | { v: 1; type: 'dh-roll'; id: string; roll: DhRollRequest }
  | { v: 1; type: 'dh-rolled'; id: string; label: string; total: number; hope?: number; fear?: number; outcome?: DualityOutcome }
  | { v: 1; type: 'dh-refused'; id: string; reason: DhRefusal };

export const DH_PLAYER_MESSAGE_TYPES = ['dh-edit', 'dh-roll'] as const;

type Fields = Record<string, unknown>;
const isRecord = (v: unknown): v is Fields => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isId = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9]{1,16}$/.test(v);
const isSide = (v: unknown): boolean => v === undefined || v === 'advantage' || v === 'disadvantage';
const isNames = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 5 && v.every((n) => isText(n, 120));

export function isDhEdit(v: unknown): v is DhEdit {
  if (!isRecord(v)) return false;
  switch (v.kind) {
    case 'track': return (v.track === 'hp' || v.track === 'stress' || v.track === 'hope' || v.track === 'armorSlots') && isInt(v.value, 0, 99);
    case 'condition': return isText(v.name, MAX_CUSTOM_CONDITION) && typeof v.on === 'boolean';
    case 'card-tokens': return isText(v.card, 120) && isInt(v.value, 0, 99);
    case 'card-location': return isText(v.card, 120) && (v.location === 'loadout' || v.location === 'vault');
    default: return false;
  }
}

export function isDhRollRequest(v: unknown): v is DhRollRequest {
  if (!isRecord(v)) return false;
  const modifier = v.modifier === undefined || isInt(v.modifier, -20, 20);
  switch (v.kind) {
    case 'action': return (TRAITS as readonly unknown[]).includes(v.trait) && isNames(v.experiences) && isSide(v.advantage) && modifier;
    case 'spellcast': return isNames(v.experiences) && isSide(v.advantage) && modifier;
    case 'damage': return isInt(v.weapon, 0, 3) && (v.critical === undefined || typeof v.critical === 'boolean');
    case 'card-damage': return isText(v.card, 120) && isInt(v.dice, 1, 20);
    default: return false;
  }
}

/** The GM's sheets: trusted, but checked for shape so a bad note cannot break the page. */
function isDhSheets(v: unknown): v is DhSheet[] {
  return Array.isArray(v) && v.length <= 16 && v.every((s) => isRecord(s) && isId(s.id) && isRecord(s.build) && isRecord(s.state)
    && typeof s.build.name === 'string' && Array.isArray(s.build.domainCards) && Array.isArray(s.state.conditions));
}

export const DH_VALIDATORS: Record<DhMessage['type'], (m: Fields) => boolean> = {
  'dh-sheets': (m) => isDhSheets(m.entries),
  'dh-edit': (m) => isId(m.id) && isDhEdit(m.edit),
  'dh-roll': (m) => isId(m.id) && isDhRollRequest(m.roll),
  'dh-rolled': (m) => isId(m.id) && isText(m.label, 200) && typeof m.total === 'number'
    && (m.outcome === undefined || m.outcome === 'critical' || m.outcome === 'hope' || m.outcome === 'fear'),
  'dh-refused': (m) => isId(m.id) && typeof m.reason === 'string',
};

/** Suggested conditions shown on every sheet; players may add their own words. */
export const SHEET_CONDITIONS = CONDITIONS;

/** A short, stable id for a note path (FNV-1a), so the vault's paths never leave the GM's machine. */
export function sheetId(path: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < path.length; i++) {
    h ^= path.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
