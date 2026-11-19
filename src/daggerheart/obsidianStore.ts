/** The vault's Daggerheart character notes, through Obsidian's metadata cache and `processFrontMatter`. */
import { TFile, type App } from 'obsidian';
import type { CharacterStore, StoredCharacter } from './DaggerheartHost';
import { emptyState, type DaggerheartCharacter } from './model';

type Frontmatter = Record<string, unknown>;

const isRecord = (v: unknown): v is Frontmatter => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The character a note's frontmatter holds, filled to the shape the sheet expects; null when it holds none. */
export function characterOf(frontmatter: unknown): DaggerheartCharacter | null {
  if (!isRecord(frontmatter) || frontmatter['dh-character'] !== 1 || !isRecord(frontmatter.build)) return null;
  const build = frontmatter.build as unknown as DaggerheartCharacter['build'];
  if (typeof build.name !== 'string' || !Array.isArray(build.domainCards)) return null;
  const state = { ...emptyState(), ...(isRecord(frontmatter.state) ? frontmatter.state : {}) };
  if (!Array.isArray(state.conditions)) state.conditions = [];
  if (!isRecord(state.cardTokens)) state.cardTokens = {};
  return {
    'dh-character': 1,
    source: isRecord(frontmatter.source) ? frontmatter.source as DaggerheartCharacter['source'] : undefined,
    player: typeof frontmatter.player === 'string' ? frontmatter.player : undefined,
    token: typeof frontmatter.token === 'string' ? frontmatter.token : undefined,
    build,
    state,
  };
}

/** Writes `c` into a note's frontmatter, leaving every other key the user keeps there. */
export function writeInto(frontmatter: Frontmatter, c: DaggerheartCharacter): void {
  frontmatter['dh-character'] = 1;
  for (const key of ['source', 'player', 'token'] as const) {
    if (c[key] === undefined) delete frontmatter[key];
    else frontmatter[key] = JSON.parse(JSON.stringify(c[key])) as unknown;
  }
  frontmatter.build = JSON.parse(JSON.stringify(c.build)) as unknown;
  frontmatter.state = JSON.parse(JSON.stringify(c.state)) as unknown;
}

export function obsidianCharacterStore(app: App): CharacterStore {
  const fileOf = (path: string): TFile | null => {
    const file = app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? file : null;
  };
  return {
    list: async () => {
      const found: StoredCharacter[] = [];
      for (const file of app.vault.getMarkdownFiles()) {
        const character = characterOf(app.metadataCache.getFileCache(file)?.frontmatter);
        if (character) found.push({ path: file.path, character });
      }
      return found;
    },
    update: async (path, change) => {
      const file = fileOf(path);
      if (!file) return null;
      let written: DaggerheartCharacter | null = null;
      await app.fileManager.processFrontMatter(file, (frontmatter: Frontmatter) => {
        const current = characterOf(frontmatter);
        const next = current ? change(current) : null;
        if (!next) return;
        writeInto(frontmatter, next);
        written = next;
      });
      return written;
    },
    onChange: (listener) => {
      const refs = [
        app.metadataCache.on('changed', (_file, _data, cache) => { if (cache.frontmatter?.['dh-character'] === 1) listener(); }),
        app.vault.on('delete', () => listener()),
        app.vault.on('rename', () => listener()),
      ];
      return () => {
        app.metadataCache.offref(refs[0]!);
        app.vault.offref(refs[1]!);
        app.vault.offref(refs[2]!);
      };
    },
  };
}
