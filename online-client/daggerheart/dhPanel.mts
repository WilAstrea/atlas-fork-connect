// online-client/daggerheart/dhPanel.mts
/**
 * The player's Daggerheart pages on the join page: the Sheet tab (their character and its loadout as cards) and the
 * Inventory tab, one sub-tab per character they play. Every change and roll goes to the GM, who answers with the
 * sheet as the note now says; a click on a card shares it in the session chat. The GM's private art (`dh-theme`)
 * dresses the tracks while the session lasts; it is kept in memory only.
 */
import type { DhCardFace, DhMessage, DhSheet } from '../../src/daggerheart/protocol';
import { newRollChoice, renderInventory, renderSheet, rolledLine, type RollChoice, type SheetTheme } from '../../src/daggerheart/render';
import type { DhEdit, DhRollRequest } from '../../src/daggerheart/rules';

export interface DhPanelOptions {
  /** The Sheet page: its sub-tabs and body. */
  sheetBody: HTMLElement;
  tabs: HTMLElement;
  inventoryPage: HTMLElement;
  send(message: Extract<DhMessage, { type: 'dh-edit' | 'dh-roll' }>): boolean;
  share(card: DhCardFace): boolean;
  /** A roll's outcome or a refusal, for the player to read wherever they are. */
  onStatus?(text: string): void;
  doc?: Document;
}

const REFUSALS: Record<string, string> = {
  'not-yours': 'The GM has not given you this sheet.',
  'not-on-sheet': 'That is not on your sheet.',
  'no-hope': 'Not enough Hope for the Experiences picked.',
  'loadout-full': 'Your loadout is full (5 cards).',
  'not-rolled': 'The GM could not roll that.',
};

const NO_SHEET = 'Aún no tienes ficha. Cuando tu DJ te asigne un personaje de Daggerheart, aparecerá aquí.';

export class DhPanel {
  private sheets: readonly DhSheet[] = [];
  private picked: string | null = null;
  private readonly choices = new Map<string, RollChoice>();
  private status: string | null = null;
  private theme: SheetTheme | null = null;
  private shown: 'sheet' | 'inventory' | null = null;

  constructor(private readonly options: DhPanelOptions) {}

  /** Which page shows (the table's tab); null draws nothing. */
  show(page: 'sheet' | 'inventory' | null): void {
    this.shown = page;
    this.draw();
  }

  receive(message: Extract<DhMessage, { type: 'dh-sheets' | 'dh-rolled' | 'dh-refused' | 'dh-theme' }>): void {
    if (message.type === 'dh-sheets') {
      this.sheets = message.entries;
      if (!this.sheets.some((s) => s.id === this.picked)) this.picked = this.sheets[0]?.id ?? null;
    } else if (message.type === 'dh-theme') {
      this.theme = message.images;
    } else if (message.type === 'dh-rolled') {
      this.setStatus(rolledLine(message.label, message.total, message.hope, message.fear, message.outcome));
      // Experiences picked for a roll are spent with it.
      if (message.hope !== undefined) this.choices.get(message.id)?.experiences.clear();
    } else {
      this.setStatus(REFUSALS[message.reason] ?? 'The GM refused that.');
    }
    this.draw();
  }

  private setStatus(text: string): void {
    this.status = text;
    this.options.onStatus?.(text);
  }

  private choiceFor(id: string): RollChoice {
    let choice = this.choices.get(id);
    if (!choice) this.choices.set(id, choice = newRollChoice());
    return choice;
  }

  private drawTabs(): void {
    const doc = this.options.doc ?? document;
    const { tabs } = this.options;
    tabs.replaceChildren();
    tabs.hidden = this.sheets.length < 2;
    for (const sheet of this.sheets) {
      const tab = doc.createElement('button');
      tab.type = 'button';
      tab.className = `sheet-tab${sheet.id === this.picked ? ' is-active' : ''}`;
      tab.textContent = sheet.build.name;
      tab.addEventListener('click', () => { this.picked = sheet.id; this.draw(); });
      tabs.append(tab);
    }
  }

  private draw(): void {
    const doc = this.options.doc ?? document;
    const { sheetBody, inventoryPage } = this.options;
    this.drawTabs();
    const sheet = this.sheets.find((s) => s.id === this.picked);
    if (this.shown !== 'sheet') sheetBody.replaceChildren();
    if (this.shown !== 'inventory') inventoryPage.replaceChildren();
    const target = this.shown === 'sheet' ? sheetBody : this.shown === 'inventory' ? inventoryPage : null;
    if (!target) return;
    if (!sheet) {
      const empty = doc.createElement('p');
      empty.className = 'dh-empty';
      empty.textContent = NO_SHEET;
      target.replaceChildren(empty);
      return;
    }
    if (this.shown === 'inventory') {
      renderInventory(inventoryPage, sheet, { doc, theme: this.theme });
      return;
    }
    const { id } = sheet;
    renderSheet(sheetBody, sheet, {
      edit: (edit: DhEdit) => { this.options.send({ v: 1, type: 'dh-edit', id, edit }); },
      roll: (roll: DhRollRequest) => { this.options.send({ v: 1, type: 'dh-roll', id, roll }); },
      share: (card) => {
        if (this.options.share(card)) this.setStatus(`Shared ${card.name} in the chat.`);
        this.draw();
      },
    }, { doc, choice: this.choiceFor(id), redraw: () => this.draw(), status: this.status, theme: this.theme, withInventory: false });
  }
}
