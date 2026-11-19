/**
 * The session chat's lines, kept by the GM for the session: the GM's chat view and the session's Daggerheart part
 * share one log, so a line the GM writes in Obsidian reaches the players and a player's line shows in Obsidian.
 */
import { CHAT_HISTORY, MAX_CHAT_TEXT, type ChatEntry, type DhCardFace } from './protocol';

export class ChatLog {
  private lines: ChatEntry[] = [];
  private readonly listeners = new Set<(entry: ChatEntry) => void>();
  private next = 0;

  get entries(): readonly ChatEntry[] {
    return this.lines;
  }

  /** Adds a line (text trimmed and cut to length; nothing when it has neither text nor card) and tells everyone. */
  post(from: string, content: { text?: string | undefined; card?: DhCardFace | undefined }, gm = false): ChatEntry | null {
    const text = content.text?.trim().slice(0, MAX_CHAT_TEXT);
    if (!text && !content.card) return null;
    const entry: ChatEntry = {
      id: `${Date.now().toString(36)}${(this.next++).toString(36)}`, at: Date.now(), from: from.slice(0, 200) || '?',
      ...(gm ? { gm: true as const } : {}), ...(text ? { text } : {}), ...(content.card ? { card: content.card } : {}),
    };
    this.lines = [...this.lines, entry].slice(-CHAT_HISTORY);
    for (const listener of this.listeners) listener(entry);
    return entry;
  }

  onEntry(listener: (entry: ChatEntry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clear(): void {
    this.lines = [];
  }
}
