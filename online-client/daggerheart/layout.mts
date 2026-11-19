// online-client/daggerheart/layout.mts
/**
 * The Daggerheart table's layout over Connect's page, built here so Connect's own page stays as it is:
 * - a tab bar at the top centre: 1 Table · 2 Sheet · 3 Inventory · 4 Map (keys 1 to 4);
 * - Atlas's widgets (Fear, a torch's timer…) as badges at the top right;
 * - the top bar's buttons moved to the bottom right;
 * - a dock at the bottom left with the chat and the dice log, above which rolls show.
 * Sheet, Inventory and Map are pages over the map; the dock stays on every tab.
 */
export type TableTab = 'table' | 'sheet' | 'inventory' | 'map';

export const TABS: ReadonlyArray<{ id: TableTab; label: string }> = [
  { id: 'table', label: 'Mesa' },
  { id: 'sheet', label: 'Ficha' },
  { id: 'inventory', label: 'Inventario' },
  { id: 'map', label: 'Mapa' },
];

export interface TableLayout {
  trackers: HTMLElement;
  chatButton: HTMLButtonElement;
  chatPanel: HTMLElement;
  sheetPage: HTMLElement;
  inventoryPage: HTMLElement;
  mapPage: HTMLElement;
  /** Shows a tab; `onTab` hears every change. */
  show(tab: TableTab): void;
  readonly tab: TableTab;
  onTab(listener: (tab: TableTab) => void): void;
}

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function page(doc: Document, table: HTMLElement, id: string, label: string): HTMLElement {
  const section = el(doc, 'section', 'dh-page');
  section.id = id;
  section.hidden = true;
  section.setAttribute('aria-label', label);
  table.append(section);
  return section;
}

export function mountTableLayout(doc: Document = document): TableLayout {
  const table = doc.getElementById('table') as HTMLElement;
  const topBar = table.querySelector<HTMLElement>('.top-bar') as HTMLElement;
  const actions = table.querySelector<HTMLElement>('.top-actions') as HTMLElement;
  table.classList.add('dh-table-skin');

  // The tab bar, between the session pill and the widgets.
  const nav = el(doc, 'nav', 'dh-tabbar top-pill');
  nav.setAttribute('aria-label', 'Sections');
  const buttons = new Map<TableTab, HTMLButtonElement>();
  TABS.forEach((tab, index) => {
    const button = el(doc, 'button', 'dh-tab');
    button.type = 'button';
    button.append(el(doc, 'span', 'dh-tab-key', String(index + 1)), el(doc, 'span', 'dh-tab-label', tab.label));
    button.addEventListener('click', () => layout.show(tab.id));
    buttons.set(tab.id, button);
    nav.append(button);
  });
  const trackers = el(doc, 'div', 'dh-trackers');
  trackers.setAttribute('aria-label', 'Trackers');
  topBar.append(nav, trackers);

  // The top bar's own buttons go to the bottom right, as Atlas's "More" sits there.
  const corner = el(doc, 'div', 'dh-corner');
  corner.append(actions);
  table.append(corner);

  // The dock: Chat and the dice log's button, their panels above them.
  const dock = el(doc, 'div', 'dh-dock');
  const chatButton = el(doc, 'button', 'icon-button dh-dock-button', 'Chat');
  chatButton.type = 'button';
  chatButton.setAttribute('aria-expanded', 'false');
  const diceButton = doc.getElementById('dice-log-button');
  dock.append(chatButton);
  if (diceButton) {
    diceButton.classList.add('dh-dock-button');
    dock.append(diceButton);
  }
  const chatPanel = el(doc, 'aside', 'dh-chat dh-chat-page');
  chatPanel.hidden = true;
  chatPanel.setAttribute('aria-label', 'Session chat');
  table.append(dock, chatPanel);

  const sheetPage = doc.getElementById('dh-panel') as HTMLElement;
  sheetPage.classList.add('dh-page');
  const inventoryPage = page(doc, table, 'dh-inventory', 'Inventory');
  const mapPage = page(doc, table, 'dh-map', 'Map');
  const pages: Record<Exclude<TableTab, 'table'>, HTMLElement> = { sheet: sheetPage, inventory: inventoryPage, map: mapPage };

  const listeners: Array<(tab: TableTab) => void> = [];
  let current: TableTab = 'table';
  const layout: TableLayout = {
    trackers, chatButton, chatPanel, sheetPage, inventoryPage, mapPage,
    get tab() { return current; },
    show(tab) {
      current = tab;
      table.dataset.dhTab = tab;
      for (const [id, button] of buttons) {
        button.classList.toggle('is-active', id === tab);
        button.setAttribute('aria-pressed', String(id === tab));
      }
      for (const [id, section] of Object.entries(pages)) section.hidden = id !== tab;
      for (const listener of listeners) listener(tab);
    },
    onTab(listener) { listeners.push(listener); },
  };

  // 1 to 4 switch tabs, unless the player is typing.
  doc.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
    const index = ['1', '2', '3', '4'].indexOf(event.key);
    const tab = TABS[index];
    if (tab) layout.show(tab.id);
  });
  layout.show('table');
  return layout;
}
