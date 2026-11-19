// Daggerheart character model stored in a vault note's frontmatter.
// `build` comes from an import (Heart of Daggers PDF) and may be overwritten by a re-import;
// `state` is live play state owned by the plugin and is never overwritten by an import.

export const TRAITS = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'] as const;
export type Trait = (typeof TRAITS)[number];

export interface Experience { name: string; bonus: number }

export interface Weapon {
  name: string;
  slot: 'primary' | 'secondary';
  trait: string;
  range: string;
  damage: string;      // dice expression, e.g. "d6+1"
  damageType: string;   // 'magic' | 'physical' as Heart of Daggers writes them
  feature?: string | undefined;
  active: boolean;
}

export interface ArmorItem {
  name: string;
  baseThresholds?: [number, number] | undefined;
  score: number;
  feature?: string | undefined;
}

export interface DomainCard {
  name: string;
  level: number;
  domain: string;
  type: string;        // Spell | Ability | Grimoire
  recall: number;
  effect: string;
  location: 'loadout' | 'vault';
  art?: string | undefined;        // vault path to user-supplied art
}

export interface DaggerheartBuild {
  name: string;
  pronouns?: string | undefined;
  level: number;
  tier: number;
  ancestry: string;
  community: string;
  class: string;
  subclass: string;
  domains: string[];
  spellcastTrait?: Trait | undefined;
  traits: Record<Trait, number>;
  evasion: number;
  armorScore: number;
  thresholds: { major: number; severe: number };
  proficiency: number;
  maxHp: number;
  maxStress: number;
  maxHope: number;
  experiences: Experience[];
  weapons: Weapon[];
  armor?: ArmorItem | undefined;
  domainCards: DomainCard[];
  features: { hope?: string | undefined; classAndSubclass?: string | undefined; heritage?: string | undefined };
  inventory: string[];
  gold: { handfuls: number; bags: number; chests: number; coins: number; stashed: number };
}

export interface DaggerheartState {
  hp: number;          // marked HP
  stress: number;      // marked Stress
  hope: number;
  armorSlots: number;  // marked armor slots
  conditions: string[];
  cardTokens: Record<string, number>; // per-card counters, e.g. Unleash Chaos
}

export interface DaggerheartCharacter {
  'dh-character': 1;
  source?: { kind: 'heart-of-daggers-pdf'; file?: string | undefined; imported: string } | undefined;
  player?: string | undefined;     // Connect player name allowed to edit this sheet
  token?: string | undefined;      // Atlas token id linked to this sheet
  build: DaggerheartBuild;
  state: DaggerheartState;
}

export function emptyState(): DaggerheartState {
  return { hp: 0, stress: 0, hope: 0, armorSlots: 0, conditions: [], cardTokens: {} };
}
