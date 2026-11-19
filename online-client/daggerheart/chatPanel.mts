// online-client/daggerheart/chatPanel.mts
/**
 * The session chat on the join page: a panel over the dock at the bottom left, opened from its Chat button (which
 * counts unread lines while it is closed). Lines come from the GM (`chat`); a line the player writes goes to the GM
 * (`chat-send`), who names them and sends it back to everyone, so the player sees their own line as the others do.
 */
import { chatLine } from '../../src/daggerheart/render';
import { MAX_CHAT_TEXT, type ChatEntry, type DhCardFace, type DhMessage } from '../../src/daggerheart/protocol';

export interface ChatPanelOptions {
  panel: HTMLElement;
  button: HTMLButtonElement;
  send(message: Extract<DhMessage, { type: 'chat-send' }>): boolean;
  doc?: Document;
}

export class ChatPanel {
  private readonly list: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly doc: Document;
  private unread = 0;
  private open = false;

  constructor(private readonly options: ChatPanelOptions) {
    this.doc = options.doc ?? document;
    const { panel, button } = options;
    const header = this.doc.createElement('div');
    header.className = 'dh-chat-header';
    const title = this.doc.createElement('h2');
    title.textContent = 'Chat';
    const close = this.doc.createElement('button');
    close.type = 'button';
    close.className = 'icon-button';
    close.setAttribute('aria-label', 'Close chat');
    close.textContent = '×';
    close.addEventListener('click', () => this.setOpen(false));
    header.append(title, close);
    this.list = this.doc.createElement('div');
    this.list.className = 'dh-chat-list';
    this.list.setAttribute('aria-live', 'polite');
    const form = this.doc.createElement('form');
    form.className = 'dh-chat-form';
    this.input = this.doc.createElement('input');
    this.input.maxLength = MAX_CHAT_TEXT;
    this.input.placeholder = 'Escribe a la mesa…';
    this.input.setAttribute('aria-label', 'Message');
    const sendButton = this.doc.createElement('button');
    sendButton.type = 'submit';
    sendButton.textContent = 'Enviar';
    form.append(this.input, sendButton);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = this.input.value.trim();
      if (text && options.send({ v: 1, type: 'chat-send', text })) this.input.value = '';
    });
    panel.append(header, this.list, form);
    button.addEventListener('click', () => this.setOpen(!this.open));
    this.doc.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.open) this.setOpen(false);
    });
  }

  /** Shares a card: it shows for everyone once the GM sends it back. */
  shareCard(card: DhCardFace): boolean {
    const sent = this.options.send({ v: 1, type: 'chat-send', card });
    if (sent) this.setOpen(true);
    return sent;
  }

  receive(entries: readonly ChatEntry[], history: boolean): void {
    if (history) this.list.replaceChildren();
    for (const entry of entries) this.list.append(chatLine(this.doc, entry));
    this.list.scrollTop = this.list.scrollHeight;
    if (!this.open && !history) {
      this.unread += entries.length;
      this.drawBadge();
    }
  }

  private setOpen(open: boolean): void {
    this.open = open;
    this.options.panel.hidden = !open;
    this.options.button.setAttribute('aria-expanded', String(open));
    if (open) {
      this.unread = 0;
      this.list.scrollTop = this.list.scrollHeight;
      this.input.focus({ preventScroll: true });
    }
    this.drawBadge();
  }

  private drawBadge(): void {
    this.options.button.dataset.unread = this.unread > 0 ? String(Math.min(this.unread, 99)) : '';
  }
}
