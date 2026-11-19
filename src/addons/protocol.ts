/**
 * Messages of the fork's add-ons, from the GM only: Portrait Stage's stage (`ps-stage`, its moments `ps-pulse`) and
 * the world map of the Map tab (`world-map`). Images go as asset ids, served by Connect's asset channel; vault paths
 * never leave the GM's machine, and a portrait's file name is not sent either.
 */
import type { Pulse } from '../../vendor/portrait-stage/stage/emotions';
import type { StageLook, StageState } from '../../vendor/portrait-stage/stage/types';

export type AddonMessage =
  | { v: 1; type: 'ps-stage'; state: StageState | null; look: StageLook | null }
  | { v: 1; type: 'ps-pulse'; pulse: Pulse }
  | { v: 1; type: 'world-map'; asset: string | null; title: string };

type Fields = Record<string, unknown>;
const isRecord = (v: unknown): v is Fields => typeof v === 'object' && v !== null && !Array.isArray(v);
const MAX_PORTRAITS = 12;

function isStage(v: unknown): boolean {
  if (v === null) return true;
  if (!isRecord(v) || !Array.isArray(v.portraits) || v.portraits.length > MAX_PORTRAITS || typeof v.visible !== 'boolean' || !isRecord(v.effects)) return false;
  return v.portraits.every((p) => isRecord(p) && typeof p.id === 'string' && p.id.length <= 64 && typeof p.path === 'string' && p.path.length <= 128
    && typeof p.slot === 'number' && typeof p.scale === 'number');
}

export const ADDON_VALIDATORS: Record<AddonMessage['type'], (m: Fields) => boolean> = {
  'ps-stage': (m) => isStage(m.state) && (m.look === null || isRecord(m.look)) && JSON.stringify(m).length < 32_000,
  'ps-pulse': (m) => isRecord(m.pulse) && (m.pulse.kind === 'shake' || (m.pulse.kind === 'flash' && typeof m.pulse.color === 'string')),
  'world-map': (m) => (m.asset === null || (typeof m.asset === 'string' && m.asset.length <= 128)) && typeof m.title === 'string' && m.title.length <= 120,
};
