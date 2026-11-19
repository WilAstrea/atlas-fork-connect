// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountTableLayout } from '../../../../online-client/daggerheart/layout.mts';
import { TrackersView } from '../../../../online-client/daggerheart/trackers.mts';
import { ChatPanel } from '../../../../online-client/daggerheart/chatPanel.mts';
import { renderCard } from '../../../../src/daggerheart/render';

beforeEach(() => {
  document.body.innerHTML = `<section id="table"><header class="top-bar"><div class="top-pill top-info"></div>
    <div class="top-pill top-actions"><button id="dice-log-button"></button></div></header>
    <aside id="dh-panel"><div id="dh-tabs"></div><div id="dh-body"></div></aside></section>`;
});

describe('the Daggerheart table', () => {
  it('switches tabs by click and by the keys 1 to 4, not while typing', () => {
    const layout = mountTableLayout(document);
    const tabs = [...document.querySelectorAll<HTMLButtonElement>('.dh-tab')];
    expect(tabs.map((t) => t.textContent)).toEqual(['1Mesa', '2Ficha', '3Inventario', '4Mapa']);
    tabs[1]?.click();
    expect(layout.tab).toBe('sheet');
    expect(layout.sheetPage.hidden).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }));
    expect(layout.tab).toBe('inventory');
    expect(layout.sheetPage.hidden).toBe(true);
    const input = document.createElement('input');
    document.body.append(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
    expect(layout.tab).toBe('inventory');
    // The top bar's buttons moved to the bottom right, the dice log button to the dock.
    expect(document.querySelector('.dh-corner .top-actions')).not.toBeNull();
    expect(document.querySelector('.dh-dock #dice-log-button')).not.toBeNull();
  });

  it('draws widgets as badges with icon, value and label', () => {
    const root = document.createElement('div');
    new TrackersView(root).render([
      { id: 'a', type: 'counter', label: 'Miedo', icon: 'skull', value: 5, color: '#a020f0' },
      { id: 'b', type: 'timer', label: 'Antorcha', icon: 'torch', value: 300 },
    ]);
    expect([...root.querySelectorAll('.dh-tracker-value')].map((e) => e.textContent)).toEqual(['5', '05:00']);
    expect(root.querySelector('.dh-tracker path')?.getAttribute('fill')).toBe('#a020f0');
  });

  it('counts unread lines while the chat is closed, and sends what is written', () => {
    const panel = document.createElement('aside');
    const button = document.createElement('button');
    const send = vi.fn(() => true);
    const chat = new ChatPanel({ panel, button, send });
    chat.receive([{ id: '1', at: 0, from: 'Ana', text: 'hola' }], false);
    expect(button.dataset.unread).toBe('1');
    button.click();
    expect(button.dataset.unread).toBe('');
    const input = panel.querySelector('input') as HTMLInputElement;
    input.value = 'buenas';
    panel.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(send).toHaveBeenCalledWith({ v: 1, type: 'chat-send', text: 'buenas' });
    expect(panel.querySelectorAll('.dh-chat-line')).toHaveLength(1);
  });

  it('shares a card on a click on the card, not on its buttons', () => {
    const share = vi.fn();
    const edit = vi.fn();
    const card = renderCard(document, { name: 'Unleash Chaos', level: 1, domain: 'Arcana', type: 'Spell', recall: 1, effect: 'tokens', location: 'loadout' }, 1, { edit, share });
    card.querySelector<HTMLElement>('.dh-card-name')?.click();
    card.querySelector<HTMLButtonElement>('.dh-mini')?.click();
    expect(share).toHaveBeenCalledTimes(1);
    expect(share.mock.calls[0]?.[0]).toMatchObject({ name: 'Unleash Chaos', effect: 'tokens' });
    expect(edit).toHaveBeenCalledTimes(1);
  });
});
