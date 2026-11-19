// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { ExtraAssets, withExtras } from '../../../../src/addons/extraAssets';
import { PortraitRelay, type PortraitSource } from '../../../../src/addons/PortraitRelay';
import { WorldMapRelay } from '../../../../src/addons/WorldMapRelay';
import { decodeControl } from '../../../../src/app/online/protocol';
import type { SessionPlayer } from '../../../../src/app/online/GmSession';
import type { ControlMessage } from '../../../../src/app/online/protocol';
import { EMPTY_STAGE, DEFAULT_LOOK, type Portrait, type StageState } from '../../../../vendor/portrait-stage/stage/types';

const players: SessionPlayer[] = [{ playerId: 'p1', name: 'Wil', status: 'admitted' }, { playerId: 'p2', name: 'Ana', status: 'waiting' }];

function session() {
  const sent: Array<{ to: string; message: ControlMessage }> = [];
  return { sent, session: { use: () => () => {}, send: (to: string, message: ControlMessage) => { sent.push({ to, message }); }, getPlayers: () => players } };
}

function assets(known: Record<string, string>) {
  let listener: () => void = () => {};
  const ids = { ...known };
  return {
    ids,
    api: { idFor: (path: string | null | undefined) => (path ? ids[path] ?? null : null), onChange: (l: () => void) => { listener = l; return () => {}; } },
    hashed: () => listener(),
  };
}

const portrait = (over: Partial<Portrait>): Portrait => ({
  id: 'a', path: 'Art/Aiden.png', name: 'Aiden', slot: 0, flipped: false, scale: 100, spotlight: false, benched: false, offsetPct: 0,
  emotion: null, assetId: 'lib-1', source: 'Atlas/aiden.png', showHp: false, hp: null, turn: false, ...over,
});

function stageSource(initial: StageState) {
  let state = initial;
  const subs = new Set<(s: StageState) => void>();
  const pulses = new Set<(p: { kind: 'shake' }) => void>();
  const source: PortraitSource = {
    store: { get: () => state, subscribe: (l) => { subs.add(l); return () => subs.delete(l); }, onPulse: (l) => { pulses.add(l as never); return () => pulses.delete(l as never); } },
    look: () => DEFAULT_LOOK, onLookChange: () => () => {},
  };
  return { source, set: (next: StageState) => { state = next; subs.forEach((l) => l(state)); }, shake: () => pulses.forEach((l) => l({ kind: 'shake' })) };
}

describe('Portrait Stage online', () => {
  it('sends the stage with asset ids instead of paths and names, once each picture is hashed, to admitted players only', () => {
    const { sent, session: s } = session();
    const vault = assets({});
    const extras = new ExtraAssets();
    const stage = stageSource({ ...EMPTY_STAGE, portraits: [portrait({})] });
    const relay = new PortraitRelay({ session: s, assets: vault.api, extras, source: () => stage.source, pollMs: 60_000 });
    relay.start();
    const first = sent.at(-1)?.message as Extract<ControlMessage, { type: 'ps-stage' }>;
    expect(first.state?.portraits[0]).toMatchObject({ path: '', name: '', assetId: null, source: null });
    expect(sent.every((m) => m.to === 'p1')).toBe(true);
    vault.ids['Art/Aiden.png'] = 'sha-aiden';
    vault.hashed();
    const second = sent.at(-1)?.message as Extract<ControlMessage, { type: 'ps-stage' }>;
    expect(second.state?.portraits[0]?.path).toBe('sha-aiden');
    expect(JSON.stringify(sent)).not.toContain('Art/');
    expect(extras.assetsFor('p1')).toEqual(new Set(['sha-aiden']));
    stage.shake();
    expect(sent.at(-1)?.message).toEqual({ v: 1, type: 'ps-pulse', pulse: { kind: 'shake' } });
    relay.stop();
  });

  it('works without Portrait Stage and picks it up when it loads', () => {
    vi.useFakeTimers();
    const { sent, session: s } = session();
    let loaded: PortraitSource | null = null;
    const relay = new PortraitRelay({ session: s, assets: assets({ 'Art/Aiden.png': 'x' }).api, extras: new ExtraAssets(), source: () => loaded, pollMs: 1000 });
    relay.start();
    expect(sent).toEqual([]);
    loaded = stageSource({ ...EMPTY_STAGE, portraits: [portrait({})] }).source;
    vi.advanceTimersByTime(1000);
    expect((sent.at(-1)?.message as { state: StageState }).state.portraits).toHaveLength(1);
    relay.stop();
    vi.useRealTimers();
  });
});

describe('the world map', () => {
  it('follows the file under its name, as an asset players may fetch', () => {
    const { sent, session: s } = session();
    const vault = assets({ 'Daggerheart/Theme/world_map.webp': 'sha-map' });
    const extras = new ExtraAssets();
    let path: string | null = null;
    let changed: () => void = () => {};
    const relay = new WorldMapRelay({ session: s, assets: vault.api, extras, path: () => path, onPathChange: (l) => { changed = l; return () => {}; } });
    relay.start();
    expect(sent).toEqual([]);
    path = 'Daggerheart/Theme/world_map.webp';
    changed();
    expect(sent.at(-1)?.message).toEqual({ v: 1, type: 'world-map', asset: 'sha-map', title: 'Mapa del mundo' });
    expect(extras.assetsFor('p1')).toEqual(new Set(['sha-map']));
  });
});

describe('extra assets', () => {
  it('join the cutscene\'s files in the asset server\'s hook', () => {
    const extras = new ExtraAssets();
    extras.add({ assetsFor: () => new Set(['b']) });
    const listener = vi.fn();
    const joined = withExtras({ assetsFor: () => new Set(['a']), onAssetsChange: () => () => {} }, extras);
    joined.onAssetsChange(listener);
    expect(joined.assetsFor('p')).toEqual(new Set(['a', 'b']));
    extras.changed();
    expect(listener).toHaveBeenCalled();
  });

  it('accepts add-on messages from the GM in shape only', () => {
    const decode = (message: object) => decodeControl(JSON.stringify({ v: 1, ...message })).kind;
    expect(decode({ type: 'world-map', asset: null, title: 'Mapa' })).toBe('message');
    expect(decode({ type: 'ps-pulse', pulse: { kind: 'flash', color: 'red' } })).toBe('message');
    expect(decode({ type: 'ps-pulse', pulse: { kind: 'boom' } })).toBe('invalid');
    expect(decode({ type: 'ps-stage', state: { ...EMPTY_STAGE, portraits: [portrait({ path: 'sha' })] }, look: DEFAULT_LOOK })).toBe('message');
  });
});
