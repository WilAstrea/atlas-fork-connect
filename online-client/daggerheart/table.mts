// online-client/daggerheart/table.mts
/**
 * The Daggerheart table on the join page, put together in one place so `main.mts` only builds it, hands it the
 * GM's messages and the scene's widgets, and gives it a way to send. See `layout.mts` for where everything sits.
 */
import type { PlayerWidget } from '../../src/app/online/scene/sceneTypes';
import type { DhMessage } from '../../src/daggerheart/protocol';
import { ChatPanel } from './chatPanel.mts';
import { DhPanel } from './dhPanel.mts';
import { mountTableLayout } from './layout.mts';
import { TrackersView } from './trackers.mts';
import './table.css';

export interface DaggerheartTable {
  receive(message: Extract<DhMessage, { type: 'dh-sheets' | 'dh-rolled' | 'dh-refused' | 'dh-theme' | 'chat' }>): void;
  widgets(widgets: readonly PlayerWidget[]): void;
}

export function mountDaggerheart(send: (message: Extract<DhMessage, { type: 'dh-edit' | 'dh-roll' | 'chat-send' }>) => boolean): DaggerheartTable {
  const layout = mountTableLayout(document);
  const trackers = new TrackersView(layout.trackers);
  const chat = new ChatPanel({ panel: layout.chatPanel, button: layout.chatButton, send });
  const sheet = new DhPanel({
    sheetBody: document.getElementById('dh-body') as HTMLElement,
    tabs: document.getElementById('dh-tabs') as HTMLElement,
    inventoryPage: layout.inventoryPage,
    send,
    share: (card) => chat.shareCard(card),
  });
  const mapNote = document.createElement('p');
  mapNote.className = 'dh-empty';
  mapNote.textContent = 'El mapa del mundo aún no se ha compartido.';
  layout.mapPage.append(mapNote);
  layout.onTab((tab) => sheet.show(tab === 'sheet' || tab === 'inventory' ? tab : null));
  return {
    receive(message) {
      if (message.type === 'chat') chat.receive(message.entries, message.history === true);
      else sheet.receive(message);
    },
    widgets: (widgets) => trackers.render(widgets),
  };
}
