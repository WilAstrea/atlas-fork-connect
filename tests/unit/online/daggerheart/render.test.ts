import { describe, expect, it, vi } from 'vitest';
import { applyImport } from '../../../../src/daggerheart/hodImport';
import { newRollChoice, renderSheet } from '../../../../src/daggerheart/render';

const c = applyImport(undefined, {
  Name: 'Test', Instinct: '+2', 'Spellcast Trait': 'Instinct', 'HP Max': '6', 'Stress Max': '6', 'Hope Max': '6', Armor: '3', 'HP 1': true,
  'Experience 1': 'Scholar', 'Experience 1 Bonus': '+2',
  'Weapon 1 Label': 'Wand', 'Weapon 1 Trait and Range': 'Knowledge / Far', 'Weapon 1 Damage and Type': 'd6+1 mag',
  'Domain Card 1, Name': 'Unleash Chaos', 'Domain Card 1, Effects': 'Place tokens… roll d10s', 'Domain Card 1, Loadout': true,
  'Domain Card 2, Name': 'Wall Walk', 'Domain Card 2, Effects': 'Climb **walls**.', 'Domain Card 2, Loadout': true,
});

function draw() {
  const root = document.createElement('div');
  const edit = vi.fn();
  const roll = vi.fn();
  const choice = newRollChoice();
  const redraw = (): void => renderSheet(root, { id: 'a', build: c.build, state: c.state }, { edit, roll }, { doc: document, choice, redraw });
  redraw();
  const click = (selector: string, text?: string): void => {
    const el = [...root.querySelectorAll<HTMLElement>(selector)].find((e) => text === undefined || e.textContent?.includes(text));
    el?.click();
  };
  return { root, edit, roll, click };
}

describe('Daggerheart sheet', () => {
  it('marks a track up to the pip clicked, and unmarks the last marked one', () => {
    const t = draw();
    const hp = t.root.querySelectorAll<HTMLElement>('.dh-track-hp .dh-pip');
    hp[3]?.click();
    hp[0]?.click();
    expect(t.edit.mock.calls).toEqual([[{ kind: 'track', track: 'hp', value: 4 }], [{ kind: 'track', track: 'hp', value: 0 }]]);
  });

  it('rolls a trait with the Experiences picked, and weapon damage', () => {
    const t = draw();
    t.click('.dh-experience', 'Scholar');
    t.click('.dh-trait', 'Instinct');
    t.click('.dh-action', 'Roll damage');
    expect(t.roll.mock.calls).toEqual([[{ kind: 'action', trait: 'instinct', experiences: ['Scholar'] }], [{ kind: 'damage', weapon: 0 }]]);
  });

  it('draws the loadout as cards, counting tokens only on cards that use them, with bold as text', () => {
    const t = draw();
    const cards = [...t.root.querySelectorAll('.dh-card')];
    expect(cards.map((card) => card.querySelector('.dh-card-name')?.textContent)).toEqual(['Unleash Chaos', 'Wall Walk']);
    expect(cards.map((card) => card.querySelector('.dh-card-tokens') !== null)).toEqual([true, false]);
    expect(cards[1]?.querySelector('strong')?.textContent).toBe('walls');
    expect(t.root.innerHTML).not.toContain('**');
  });
});
