import { describe, expect, it, vi } from 'vitest';
import type { DiceRollResult } from '@atlas-vtt/api-types';
import { DaggerheartHost, type CharacterStore, type StoredCharacter } from '../../../../src/daggerheart/DaggerheartHost';
import { applyImport } from '../../../../src/daggerheart/hodImport';
import { sheetId, type DhMessage } from '../../../../src/daggerheart/protocol';
import type { SessionPlayer } from '../../../../src/app/online/GmSession';
import type { ControlMessage } from '../../../../src/app/online/protocol';

const PATH = 'Daggerheart/Characters/Test.md';
const ID = sheetId(PATH);

function setup(rolls: number[] = [8, 3]) {
  const character = applyImport(undefined, {
    Name: 'Test', Instinct: '+2', Agility: '+0', 'Spellcast Trait': 'Instinct', 'HP Max': '6', 'Stress Max': '6', 'Hope Max': '6',
    Armor: '3', 'Hope 1': true, 'Stress 1': true, 'Experience 1': 'Scholar', 'Experience 1 Bonus': '+2',
    'Domain Card 1, Name': 'Unleash Chaos', 'Domain Card 1, Effects': 'roll d10s', 'Domain Card 1, Loadout': true,
  });
  let stored: StoredCharacter = { path: PATH, character: { ...character, player: 'Wil' } };
  let changed: () => void = () => {};
  const store: CharacterStore = {
    list: async () => [stored],
    update: async (_path, change) => {
      const next = change(stored.character);
      if (next) stored = { ...stored, character: next };
      return next;
    },
    onChange: (listener) => { changed = listener; return () => {}; },
  };
  const sent: Array<{ to: string; message: ControlMessage }> = [];
  const players: SessionPlayer[] = [{ playerId: 'p1', name: 'wil', status: 'admitted' }, { playerId: 'p2', name: 'Other', status: 'admitted' }];
  const roll = vi.fn((_player: SessionPlayer, formula: string, _extras?: { abilityName?: string }): DiceRollResult => ({
    id: 'r', timestamp: 0, formula, modifiers: 0,
    rolls: formula.startsWith('2d12') ? [{ die: 'd12', value: rolls[0]!, max: 12 }, { die: 'd12', value: rolls[1]!, max: 12 }] : [{ die: 'd10', value: 4, max: 10 }],
    total: 42,
  }));
  const notify = vi.fn();
  const host = new DaggerheartHost({
    session: { use: () => () => {}, send: (to, message) => sent.push({ to, message }), getPlayers: () => players },
    store, roll, notify,
  });
  host.start();
  return { host, sent, players, roll, notify, get stored() { return stored; }, changed: () => changed() };
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const ofType = <T extends DhMessage['type']>(sent: Array<{ to: string; message: ControlMessage }>, type: T) =>
  sent.filter((s) => s.message.type === type) as Array<{ to: string; message: Extract<DhMessage, { type: T }> }>;

describe('DaggerheartHost', () => {
  it('sends a sheet only to the player named in the note', async () => {
    const t = setup();
    t.host.onAdmitted(t.players[0]!);
    t.host.onAdmitted(t.players[1]!);
    await flush();
    const sheets = ofType(t.sent, 'dh-sheets');
    expect(sheets.find((s) => s.to === 'p1')?.message.entries.map((e) => e.id)).toEqual([ID]);
    expect(sheets.find((s) => s.to === 'p2')?.message.entries).toEqual([]);
  });

  it('applies the owner\'s edits and refuses anyone else\'s', async () => {
    const t = setup();
    t.host.onMessage(t.players[0]!, { v: 1, type: 'dh-edit', id: ID, edit: { kind: 'track', track: 'hp', value: 4 } });
    t.host.onMessage(t.players[1]!, { v: 1, type: 'dh-edit', id: ID, edit: { kind: 'track', track: 'hp', value: 0 } });
    await flush();
    expect(t.stored.character.state.hp).toBe(4);
    expect(ofType(t.sent, 'dh-refused')).toEqual([{ to: 'p2', message: { v: 1, type: 'dh-refused', id: ID, reason: 'not-yours' } }]);
  });

  it('rolls duality through Atlas, spends Hope on Experiences and gains it with Hope', async () => {
    const t = setup([9, 4]);
    t.host.onMessage(t.players[0]!, { v: 1, type: 'dh-roll', id: ID, roll: { kind: 'action', trait: 'instinct', experiences: ['Scholar'] } });
    await flush();
    expect(t.roll.mock.calls[0]?.[1]).toBe('2d12+4');
    expect(t.roll.mock.calls[0]?.[2]).toEqual({ abilityName: 'Test: Instinct + Scholar' });
    expect(t.stored.character.state.hope).toBe(1); // 1 - 1 (Scholar) + 1 (with Hope)
    expect(ofType(t.sent, 'dh-rolled')[0]?.message).toMatchObject({ hope: 9, fear: 4, outcome: 'hope', total: 42 });
  });

  it('tells the GM about Fear and clears Stress on a critical', async () => {
    const fear = setup([2, 11]);
    fear.host.onMessage(fear.players[0]!, { v: 1, type: 'dh-roll', id: ID, roll: { kind: 'spellcast', experiences: [] } });
    await flush();
    expect(fear.notify).toHaveBeenCalledWith(expect.stringContaining('Fear +1'));
    const crit = setup([6, 6]);
    crit.host.onMessage(crit.players[0]!, { v: 1, type: 'dh-roll', id: ID, roll: { kind: 'action', trait: 'agility', experiences: [] } });
    await flush();
    expect(crit.stored.character.state).toMatchObject({ hope: 2, stress: 0 });
  });

  it('spends card tokens on a card roll', async () => {
    const t = setup();
    t.host.onMessage(t.players[0]!, { v: 1, type: 'dh-edit', id: ID, edit: { kind: 'card-tokens', card: 'Unleash Chaos', value: 2 } });
    await flush();
    t.host.onMessage(t.players[0]!, { v: 1, type: 'dh-roll', id: ID, roll: { kind: 'card-damage', card: 'Unleash Chaos', dice: 2 } });
    await flush();
    expect(t.roll.mock.calls[0]?.[1]).toBe('2d10');
    expect(t.stored.character.state.cardTokens['Unleash Chaos']).toBe(0);
  });
});
