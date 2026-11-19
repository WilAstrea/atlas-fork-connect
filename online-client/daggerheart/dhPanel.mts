// online-client/daggerheart/dhPanel.mts
/**
 * The player's Daggerheart sheet on the join page: a wide drawer with their character (one tab per character they
 * play), its loadout as cards, and the result of their last roll. Its button shows only while the GM sends a sheet.
 * Every change and roll goes to the GM, who answers with the sheet as the note now says.
 */
import type { DhMessage, DhSheet } from '../../src/daggerheart/protocol';
import { newRollChoice, renderSheet, rolledLine, type RollChoice } from '../../src/daggerheart/render';
import type { DhEdit, DhRollRequest } from '../../src/daggerheart/rules';

export interface DhPanelOptions {
  panel: HTMLElement;
  body: HTMLElement;
  tabs: HTMLElement;
  closeButton: HTMLButtonElement;
  toggleButton: HTMLButtonElement;
  send(message: Extract<DhMessage, { type: 'dh-edit' | 'dh-roll' }>): boolean;
  doc?: Document;
}

const REFUSALS: Record<string, string> = {
  'not-yours': 'The GM has not given you this sheet.',
  'not-on-sheet': 'That is not on your sheet.',
  'no-hope': 'Not enough Hope for the Experiences picked.',
  'loadout-full': 'Your loadout is full (5 cards).',
  'not-rolled': 'The GM could not roll that.',
};

export class DhPanel {
  private sheets: readonly DhSheet[] = [];
  private picked: string | null = null;
  private open = false;
  private readonly choices = new Map<string, RollChoice>();
  private status: string | null = null;

  constructor(private readonly options: DhPanelOptions) {
    options.toggleButton.hidden = true;
    options.panel.hidden = true;
    options.toggleButton.addEventListener('click', () => this.setOpen(!this.open));
    options.closeButton.addEventListener('click', () => this.setOpen(false));
  }

  receive(message: Extract<DhMessage, { type: 'dh-sheets' | 'dh-rolled' | 'dh-refused' }>): void {
    if (message.type === 'dh-sheets') {
      this.sheets = message.entries;
      if (!this.sheets.some((s) => s.id === this.picked)) this.picked = this.sheets[0]?.id ?? null;
      this.options.toggleButton.hidden = this.sheets.length === 0;
      if (this.sheets.length === 0) this.setOpen(false);
    } else if (message.type === 'dh-rolled') {
      this.status = rolledLine(message.label, message.total, message.hope, message.fear, message.outcome);
      // Experiences picked for a roll are spent with it.
      if (message.hope !== undefined) this.choices.get(message.id)?.experiences.clear();
    } else {
      this.status = REFUSALS[message.reason] ?? 'The GM refused that.';
    }
    this.draw();
  }

  private setOpen(open: boolean): void {
    this.open = open && this.sheets.length > 0;
    this.options.panel.hidden = !this.open;
    this.options.toggleButton.setAttribute('aria-expanded', String(this.open));
    this.draw();
  }

  private choiceFor(id: string): RollChoice {
    let choice = this.choices.get(id);
    if (!choice) this.choices.set(id, choice = newRollChoice());
    return choice;
  }

  private draw(): void {
    const { body, tabs } = this.options;
    const doc = this.options.doc ?? document;
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
    const sheet = this.sheets.find((s) => s.id === this.picked);
    if (!this.open || !sheet) {
      body.replaceChildren();
      return;
    }
    const { id } = sheet;
    renderSheet(body, sheet, {
      edit: (edit: DhEdit) => { this.options.send({ v: 1, type: 'dh-edit', id, edit }); },
      roll: (roll: DhRollRequest) => { this.options.send({ v: 1, type: 'dh-roll', id, roll }); },
    }, { doc, choice: this.choiceFor(id), redraw: () => this.draw(), status: this.status });
  }
}
