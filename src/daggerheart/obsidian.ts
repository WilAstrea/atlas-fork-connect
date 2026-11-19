/**
 * Daggerheart in Obsidian: the session part, the "Import Heart of Daggers PDF" command, and the `daggerheart-sheet`
 * code block, which draws a character note's sheet for the GM (editable, no rolls: players roll from the page).
 */
import { MarkdownRenderChild, Modal, Notice, Setting, TFile, normalizePath, type App, type Plugin } from 'obsidian';
import type { OptionalParts } from '../app/online/hostedSession';
import { DaggerheartHost } from './DaggerheartHost';
import { applyImport, readPdfFields } from './hodImport';
import type { DaggerheartCharacter } from './model';
import { characterOf, obsidianCharacterStore, writeInto } from './obsidianStore';
import { sheetId } from './protocol';
import { newRollChoice, renderSheet } from './render';
import { applyEdit, moveCard } from './rules';

export const DEFAULT_CHARACTER_FOLDER = 'Daggerheart/Characters';

export function daggerheartPart(app: App): NonNullable<OptionalParts['daggerheart']> {
  return ({ session, roll, notify }) => new DaggerheartHost({ session, store: obsidianCharacterStore(app), roll, notify });
}

/** Asks for the player's name in the online session, prefilled; resolves null when cancelled. */
function askPlayer(app: App, character: string, current: string | undefined): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = new Modal(app);
    let value = current ?? '';
    let done = false;
    modal.titleEl.setText(`Who plays ${character}?`);
    new Setting(modal.contentEl)
      .setName('Player name')
      .setDesc('The name they join the online session with. Only that player can see, change and roll this sheet.')
      .addText((text) => text.setValue(value).onChange((v) => { value = v; }));
    new Setting(modal.contentEl).addButton((b) => b.setButtonText('Save').setCta().onClick(() => {
      done = true;
      modal.close();
      resolve(value.trim());
    }));
    modal.onClose = () => { if (!done) resolve(null); };
    modal.open();
  });
}

function pickPdf(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = createEl('input', { type: 'file', attr: { accept: 'application/pdf,.pdf' } });
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.click();
  });
}

const safeName = (name: string): string => name.replace(/[\\/:*?"<>|#^[\]]/g, '').trim() || 'Character';

async function ensureFolder(app: App, path: string): Promise<void> {
  const parts = normalizePath(path).split('/');
  for (let i = 1; i <= parts.length; i++) {
    const sub = parts.slice(0, i).join('/');
    if (!app.vault.getAbstractFileByPath(sub)) await app.vault.createFolder(sub);
  }
}

/** Imports a Heart of Daggers PDF: a new note for a new character, or the build of the note that already has it. */
export async function importHeartOfDaggers(app: App, folder = DEFAULT_CHARACTER_FOLDER): Promise<void> {
  const file = await pickPdf();
  if (!file) return;
  let fields;
  try {
    fields = await readPdfFields(await file.arrayBuffer());
  } catch (error) {
    console.warn('[Daggerheart] Could not read the PDF:', error);
    new Notice('Daggerheart: that PDF has no form fields to read. Export the sheet from Heart of Daggers as a PDF.');
    return;
  }
  const store = obsidianCharacterStore(app);
  const preview = applyImport(undefined, fields, file.name);
  if (!preview.build.name) {
    new Notice('Daggerheart: no character name in that PDF.');
    return;
  }
  // The same character again: its note keeps its state, player, token and card art.
  const existing = (await store.list()).find((s) => s.character.build.name === preview.build.name);
  const player = await askPlayer(app, preview.build.name, existing?.character.player);
  if (player === null) return;
  if (existing) {
    await store.update(existing.path, (c) => ({ ...applyImport(c, fields, file.name), player: player || undefined }));
    new Notice(`Daggerheart: ${preview.build.name} updated. HP, Stress, Hope and tokens were kept.`);
    return;
  }
  await ensureFolder(app, folder);
  const path = normalizePath(`${folder}/${safeName(preview.build.name)}.md`);
  const notes = typeof fields['Notes'] === 'string' ? fields['Notes'].trim() : '';
  const body = `\n\`\`\`daggerheart-sheet\n\`\`\`\n${notes ? `\n## Notes\n\n${notes}\n` : ''}`;
  const created = await app.vault.create(path, body);
  await app.fileManager.processFrontMatter(created, (fm: Record<string, unknown>) => writeInto(fm, { ...preview, player: player || undefined }));
  await app.workspace.getLeaf(true).openFile(created);
  new Notice(`Daggerheart: ${preview.build.name} imported.`);
}

/** The sheet of the note the block sits in, drawn again whenever the note's frontmatter changes. */
class SheetBlock extends MarkdownRenderChild {
  private readonly choice = newRollChoice();

  constructor(container: HTMLElement, private readonly app: App, private readonly path: string) {
    super(container);
  }

  onload(): void {
    this.draw();
    this.registerEvent(this.app.metadataCache.on('changed', (file) => { if (file.path === this.path) this.draw(); }));
  }

  private change(fn: (c: DaggerheartCharacter) => DaggerheartCharacter | null): void {
    const file = this.app.vault.getAbstractFileByPath(this.path);
    if (!(file instanceof TFile)) return;
    void this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      const c = characterOf(fm);
      const next = c ? fn(c) : null;
      if (next) writeInto(fm, next);
    });
  }

  private draw(): void {
    const file = this.app.vault.getAbstractFileByPath(this.path);
    const c = file instanceof TFile ? characterOf(this.app.metadataCache.getFileCache(file)?.frontmatter) : null;
    if (!c) {
      this.containerEl.setText('No Daggerheart character in this note. Use the command to import a Heart of Daggers PDF.');
      return;
    }
    renderSheet(this.containerEl, { id: sheetId(this.path), build: c.build, state: c.state }, {
      edit: (edit) => this.change((cur) => {
        if (edit.kind === 'card-location') return moveCard(cur, edit.card, edit.location);
        const state = applyEdit(cur, edit);
        return state ? { ...cur, state } : null;
      }),
    }, {
      doc: this.containerEl.doc, choice: this.choice, redraw: () => this.draw(),
      artUrl: (card) => {
        const art = card.art ? this.app.vault.getAbstractFileByPath(card.art) : null;
        return art instanceof TFile ? this.app.vault.getResourcePath(art) : null;
      },
    });
  }
}

export function registerDaggerheart(plugin: Plugin): void {
  const { app } = plugin;
  plugin.addCommand({ id: 'daggerheart-import-pdf', name: 'Import Heart of Daggers PDF', callback: () => { void importHeartOfDaggers(app); } });
  plugin.registerMarkdownCodeBlockProcessor('daggerheart-sheet', (_source, el, ctx) => {
    ctx.addChild(new SheetBlock(el, app, ctx.sourcePath));
  });
}
