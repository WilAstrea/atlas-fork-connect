import { describe, expect, it } from 'vitest';
import { applyImport, mapHeartOfDaggers, type FieldMap } from '../../../../src/daggerheart/hodImport';
import { afterCardRoll, afterDuality, applyEdit, buildRoll, dualityOutcome, moveCard } from '../../../../src/daggerheart/rules';
import { decodeControl, encodeControl } from '../../../../src/app/online/protocol';
import { sheetId } from '../../../../src/daggerheart/protocol';

/** A Heart of Daggers export as pdf-lib reads it (field names of "Old Gus' Unofficial Daggerheart Character Sheet"). */
const FIELDS: FieldMap = {
  Name: 'Test Sorcerer', Pronouns: 'they/them', Level: '1', Tier: '1', Ancestry: 'Fungril', Community: 'Loreborne',
  Class: 'Sorcerer', Subclass: 'Primal Origin', Domains: 'Arcana, Midnight', 'Spellcast Trait': 'Instinct',
  Agility: '+0', Strength: '-1', Finesse: '+1', Instinct: '+2', Presence: '+1', Knowledge: '+0',
  Evasion: '10', Armor: '3', 'Major Damage Threshold': '7', 'Severe Damage Threshold': '14',
  'HP Max': '6', 'Stress Max': '6', 'Hope Max': '6', 'HP 1': true, 'HP 2': true, 'Stress 1': true, 'Hope 1': true, 'Hope 2': true,
  'Proficiency 1': true, 'Armor Slot 1': true,
  'Experience 1': 'Scholar', 'Experience 1 Bonus': '+2', 'Experience 2': 'Sneaky', 'Experience 2 Bonus': '+2',
  'Weapon 1 Label': 'Wand', 'Weapon 1 Trait and Range': 'Knowledge / Far', 'Weapon 1 Damage and Type': 'd6+1 mag', 'Weapon 1 Type': 'Primary', 'Weapon 1 Active': true,
  'Weapon 2 Label': 'Grappler', 'Weapon 2 Trait and Range': 'Finesse / Close', 'Weapon 2 Damage and Type': 'd6 phy', 'Weapon 2 Type': 'Secondary',
  'Armor Label': 'Leather Armor', 'Armor Base Thresholds': '6 / 13', 'Base Armor Score': '3',
  'Domain Card 1, Name': 'Unleash Chaos', 'Domain Card 1, Level': '1', 'Domain Card 1, Domain': 'Arcana', 'Domain Card 1, Type': 'Spell',
  'Domain Card 1, Recall Cost': '1', 'Domain Card 1, Effects': 'Place tokens…', 'Domain Card 1, Loadout': true,
  'Domain Card 2, Name': 'Wall Walk', 'Domain Card 2, Level': '1', 'Domain Card 2, Domain': 'Arcana', 'Domain Card 2, Type': 'Spell',
  'Domain Card 2, Recall Cost': '1', 'Domain Card 2, Effects': 'Climb walls.',
  Inventory: 'Torch\nRope (50 ft)', 'Gold, Handfuls': '1',
};

describe('Heart of Daggers import', () => {
  it('maps the sheet', () => {
    const { build, pdfState } = mapHeartOfDaggers(FIELDS);
    expect(build.traits).toEqual({ agility: 0, strength: -1, finesse: 1, instinct: 2, presence: 1, knowledge: 0 });
    expect(build.spellcastTrait).toBe('instinct');
    expect(build.domains).toEqual(['Arcana', 'Midnight']);
    expect(build.weapons.map((w) => [w.name, w.slot, w.damage, w.damageType])).toEqual([['Wand', 'primary', 'd6+1', 'magic'], ['Grappler', 'secondary', 'd6', 'physical']]);
    expect(build.armor?.baseThresholds).toEqual([6, 13]);
    expect(build.domainCards.map((c) => [c.name, c.location])).toEqual([['Unleash Chaos', 'loadout'], ['Wall Walk', 'vault']]);
    expect(pdfState).toMatchObject({ hp: 2, stress: 1, hope: 2, armorSlots: 1 });
  });

  it('keeps live state, player and card art on re-import', () => {
    const first = applyImport(undefined, FIELDS);
    const played = { ...first, player: 'Wil', state: { ...first.state, hp: 5 } };
    played.build.domainCards[0]!.art = 'art/chaos.png';
    const again = applyImport(played, FIELDS);
    expect(again.state.hp).toBe(5);
    expect(again.player).toBe('Wil');
    expect(again.build.domainCards[0]!.art).toBe('art/chaos.png');
  });
});

describe('rules', () => {
  const c = applyImport(undefined, FIELDS);

  it('clamps tracks to the sheet', () => {
    expect(applyEdit(c, { kind: 'track', track: 'hp', value: 9 })?.hp).toBe(6);
    expect(applyEdit(c, { kind: 'track', track: 'armorSlots', value: 9 })?.armorSlots).toBe(3);
    expect(applyEdit(c, { kind: 'card-tokens', card: 'Nope', value: 1 })).toBeNull();
  });

  it('builds duality rolls from the GM copy, spending Hope on Experiences', () => {
    expect(buildRoll(c, { kind: 'action', trait: 'instinct', experiences: [] })).toMatchObject({ formula: '2d12+2', duality: true, hopeCost: 0 });
    expect(buildRoll(c, { kind: 'action', trait: 'agility', experiences: ['Scholar'], advantage: 'disadvantage' })).toMatchObject({ formula: '2d12-1d6+2', hopeCost: 1 });
    expect(buildRoll(c, { kind: 'spellcast', experiences: [] })?.label).toBe('Spellcast (Instinct)');
    expect(buildRoll(c, { kind: 'action', trait: 'agility', experiences: ['Scholar', 'Sneaky', 'Ghost'] })).toBeNull();
    const noHope = { ...c, state: { ...c.state, hope: 0 } };
    expect(buildRoll(noHope, { kind: 'action', trait: 'agility', experiences: ['Scholar'] })).toBeNull();
  });

  it('builds damage with proficiency and critical maximum', () => {
    expect(buildRoll(c, { kind: 'damage', weapon: 0 })?.formula).toBe('1d6+1');
    expect(buildRoll(c, { kind: 'damage', weapon: 0, critical: true })?.formula).toBe('1d6+7');
    const pro = { ...c, build: { ...c.build, proficiency: 2 } };
    expect(buildRoll(pro, { kind: 'damage', weapon: 1 })?.formula).toBe('2d6');
  });

  it('resolves Hope, Fear and criticals', () => {
    expect(dualityOutcome(7, 7)).toBe('critical');
    expect(dualityOutcome(8, 3)).toBe('hope');
    expect(dualityOutcome(2, 9)).toBe('fear');
    const s = { ...c, state: { ...c.state, hope: 2, stress: 3 } };
    expect(afterDuality(s, 'critical', 1)).toMatchObject({ hope: 2, stress: 2 });
    expect(afterDuality(s, 'fear', 1)).toMatchObject({ hope: 1, stress: 3 });
  });

  it('spends card tokens and respects the loadout limit', () => {
    const tokens = { ...c, state: { ...c.state, cardTokens: { 'Unleash Chaos': 2 } } };
    expect(buildRoll(tokens, { kind: 'card-damage', card: 'Unleash Chaos', dice: 2 })?.formula).toBe('2d10');
    expect(buildRoll(tokens, { kind: 'card-damage', card: 'Unleash Chaos', dice: 3 })).toBeNull();
    expect(afterCardRoll(tokens, 'Unleash Chaos', 2).cardTokens['Unleash Chaos']).toBe(0);
    expect(moveCard(c, 'Wall Walk', 'loadout')?.build.domainCards[1]?.location).toBe('loadout');
  });
});

describe('protocol', () => {
  it('accepts well-formed Daggerheart messages and refuses formulas from players', () => {
    const id = sheetId('Characters/Test.md');
    expect(decodeControl(encodeControl({ v: 1, type: 'dh-roll', id, roll: { kind: 'action', trait: 'instinct', experiences: [] } })).kind).toBe('message');
    expect(decodeControl(JSON.stringify({ v: 1, type: 'dh-roll', id, roll: { kind: 'action', trait: 'instinct', experiences: [], formula: '99d100' } })).kind).toBe('message');
    expect(decodeControl(JSON.stringify({ v: 1, type: 'dh-roll', id, roll: { kind: 'formula', formula: '99d100' } })).kind).toBe('invalid');
    expect(decodeControl(JSON.stringify({ v: 1, type: 'dh-edit', id, edit: { kind: 'track', track: 'hp', value: -1 } })).kind).toBe('invalid');
  });
});
