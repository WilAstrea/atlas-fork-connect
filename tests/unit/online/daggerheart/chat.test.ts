import { describe, expect, it, vi } from 'vitest';
import { ChatLog } from '../../../../src/daggerheart/chat';
import { DaggerheartHost, type CharacterStore } from '../../../../src/daggerheart/DaggerheartHost';
import { applyImport } from '../../../../src/daggerheart/hodImport';
import { decodeControl } from '../../../../src/app/online/protocol';
import type { SessionPlayer } from '../../../../src/app/online/GmSession';
import type { ControlMessage } from '../../../../src/app/online/protocol';

const character = { ...applyImport(undefined, {
  Name: 'Test', 'Domain Card 1, Name': 'Wall Walk', 'Domain Card 1, Effects': 'Climb walls.', 'Domain Card 1, Domain': 'Midnight', 'Domain Card 1, Level': '1',
}), player: 'Wil' };
const store: CharacterStore = { list: async () => [{ path: 'a.md', character }], update: async () => null, onChange: () => () => {} };
const players: SessionPlayer[] = [{ playerId: 'p1', name: 'Wil', status: 'admitted' }, { playerId: 'p2', name: 'Ana', status: 'admitted' }];

function setup() {
  const chat = new ChatLog();
  const sent: Array<{ to: string; message: ControlMessage }> = [];
  const host = new DaggerheartHost({
    session: { use: () => () => {}, send: (to, message) => sent.push({ to, message }), getPlayers: () => players },
    store, roll: null, notify: vi.fn(), chat, theme: async () => ({ hope_gem: 'data:image/webp;base64,AAAA' }),
  });
  host.start();
  return { chat, sent, host };
}
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('session chat', () => {
  it('names a line by the session, not the message, and sends it to everyone', async () => {
    const t = setup();
    t.host.onMessage(players[0]!, { v: 1, type: 'chat-send', text: '  hola  ' });
    await flush();
    expect(t.chat.entries.map((e) => [e.from, e.text])).toEqual([['Wil', 'hola']]);
    expect(t.sent.filter((s) => s.message.type === 'chat').map((s) => s.to)).toEqual(['p1', 'p2']);
  });

  it('shares only the player\'s own cards, as the GM\'s note has them', async () => {
    const t = setup();
    t.host.onMessage(players[0]!, { v: 1, type: 'chat-send', card: { name: 'Wall Walk', domain: 'x', level: 9, type: 'x', recall: 0, effect: 'forged' } });
    t.host.onMessage(players[1]!, { v: 1, type: 'chat-send', card: { name: 'Wall Walk', domain: 'x', level: 1, type: 'x', recall: 0, effect: 'x' } });
    await flush();
    expect(t.chat.entries).toHaveLength(1);
    expect(t.chat.entries[0]?.card).toMatchObject({ name: 'Wall Walk', effect: 'Climb walls.', domain: 'Midnight', level: 1 });
  });

  it('gives a player let in the history and the theme', async () => {
    const t = setup();
    t.chat.post('GM', { text: 'Bienvenidos' }, true);
    t.sent.length = 0;
    t.host.onAdmitted(players[1]!);
    await flush();
    const types = t.sent.filter((s) => s.to === 'p2').map((s) => s.message.type);
    expect(types).toEqual(expect.arrayContaining(['chat', 'dh-theme', 'dh-sheets']));
    const history = t.sent.find((s) => s.message.type === 'chat')?.message;
    expect(history).toMatchObject({ history: true, entries: [{ from: 'GM', gm: true, text: 'Bienvenidos' }] });
  });

  it('keeps the last lines only and ignores empty ones', () => {
    const chat = new ChatLog();
    expect(chat.post('A', { text: '   ' })).toBeNull();
    for (let i = 0; i < 70; i++) chat.post('A', { text: String(i) });
    expect(chat.entries).toHaveLength(60);
    expect(chat.entries[0]?.text).toBe('10');
  });

  it('accepts only image data URLs as theme art, and chat lines with something in them', () => {
    const decode = (message: object) => decodeControl(JSON.stringify({ v: 1, ...message })).kind;
    expect(decode({ type: 'dh-theme', images: { hope_gem: 'data:image/png;base64,AAAA' } })).toBe('message');
    expect(decode({ type: 'dh-theme', images: { hope_gem: 'https://example.com/a.png' } })).toBe('invalid');
    expect(decode({ type: 'dh-theme', images: { other: 'data:image/png;base64,AAAA' } })).toBe('invalid');
    expect(decode({ type: 'chat-send' })).toBe('invalid');
    expect(decode({ type: 'chat-send', text: 'x'.repeat(501) })).toBe('invalid');
  });
});
