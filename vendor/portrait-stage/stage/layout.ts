import { SLOT_COUNT, type Portrait, type StageLook } from './types';

/** Where a portrait stands on the stage. */
export interface Placement {
  /** Horizontal centre, percent of the stage's width, its manual offset included. */
  readonly centerPct: number;
  /** Stacking order: place 1 in front of place 2, and so on; the spotlight in front of all when the look says so. */
  readonly z: number;
  /** The side it enters from and leaves to. */
  readonly side: 'left' | 'right';
}

const SPOTLIGHT_Z = 20;

function sidesCenter(slot: number, look: StageLook): number {
  const half = SLOT_COUNT / 2;
  return slot < half
    ? look.edgePct + slot * look.spacingPct
    : 100 - look.edgePct - (SLOT_COUNT - 1 - slot) * look.spacingPct;
}

/** The place of every portrait, by id. */
export function placePortraits(portraits: readonly Portrait[], look: StageLook): Map<string, Placement> {
  const placements = new Map<string, Placement>();
  const ordered = [...portraits].sort((a, b) => a.slot - b.slot);
  const count = ordered.length;
  ordered.forEach((portrait, index) => {
    const home =
      look.layout === 'sides' ? sidesCenter(portrait.slot, look) : look.edgePct + ((100 - 2 * look.edgePct) * (index + 1)) / (count + 1);
    const centerPct = home + portrait.offsetPct;
    // Place 1 stands in front of place 2, 2 in front of 3, and so on.
    const z = SLOT_COUNT - portrait.slot;
    placements.set(portrait.id, {
      centerPct,
      z: portrait.spotlight && look.spotlightFront ? SPOTLIGHT_Z + z : z,
      side: home < 50 ? 'left' : 'right',
    });
  });
  return placements;
}

/** Whether anyone has the spotlight, which dims everyone else. */
export const anySpotlight = (portraits: readonly Portrait[]): boolean => portraits.some((p) => p.spotlight);
