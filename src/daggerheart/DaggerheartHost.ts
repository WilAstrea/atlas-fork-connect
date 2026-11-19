/**
 * The GM's side of Daggerheart sheets in an online session. Each character note (`dh-character: 1` in its
 * frontmatter) names the player who plays it (`player`, matched to their name in the session, case aside). That
 * player gets the sheet (`dh-sheets`) on admission and whenever a note changes, and only they may change it
 * (`dh-edit`) or roll from it (`dh-roll`). Every request is checked against the GM's own copy of the note; a roll's
 * formula is built here, rolled through Atlas (so it joins Atlas's dice log under the player's name), and its Hope
 * and Fear dice update the note. Fear goes to the GM.
 */
import type { SessionHandler, SessionPlayer } from '../app/online/GmSession';
import type { ControlMessage } from '../app/online/protocol';
import type { SceneSession } from '../app/online/scene/sceneContracts';
import { admitted } from '../app/online/scene/slotAudience';
import type { DaggerheartRoll } from '../app/online/hostedSession';
import type { ChatLog } from './chat';
import type { DaggerheartCharacter } from './model';
import { cardFace, sheetId, type ChatEntry, type DhCardFace, type DhMessage, type DhRefusal, type DhSheet, type ThemeImage } from './protocol';
import { afterCardRoll, afterDuality, applyEdit, buildRoll, dualityOutcome, moveCard, type DhEdit, type DhRollRequest } from './rules';

export interface StoredCharacter { path: string; character: DaggerheartCharacter }

/** The vault's character notes. */
export interface CharacterStore {
  list(): Promise<StoredCharacter[]>;
  /** Rewrites the note's character with `change`'s answer; null (and no write) when it answers null or the note is gone. */
  update(path: string, change: (c: DaggerheartCharacter) => DaggerheartCharacter | null): Promise<DaggerheartCharacter | null>;
  /** Calls `listener` when a character note may have changed; returns the stop. */
  onChange(listener: () => void): () => void;
}

export interface DaggerheartHostOptions {
  session: Pick<SceneSession, 'use' | 'send' | 'getPlayers'>;
  store: CharacterStore;
  roll: DaggerheartRoll | null;
  notify: (message: string) => void;
  /** The session chat; without it chat lines are ignored. */
  chat?: ChatLog;
  /** The GM's private sheet art, as data URLs, sent to each player when they are let in. */
  theme?: () => Promise<Partial<Record<ThemeImage, string>>>;
}

const sameName = (a: string | undefined, b: string): boolean => !!a && a.trim().toLowerCase() === b.trim().toLowerCase();

export class DaggerheartHost implements SessionHandler {
  private readonly stops: Array<() => void> = [];
  private readonly sent = new Map<string, string>();
  /** The GM's Fear this session (the GM keeps the lasting count at the table). */
  private fear = 0;
  private resend: number | null = null;

  constructor(private readonly options: DaggerheartHostOptions) {}

  start(): void {
    if (this.stops.length > 0) return;
    this.stops.push(this.options.session.use(this), this.options.store.onChange(() => this.scheduleResend()));
    if (this.options.chat) this.stops.push(this.options.chat.onEntry((entry) => this.broadcast([entry])));
  }

  stop(): void {
    this.stops.splice(0).forEach((stop) => stop());
    if (this.resend) window.clearTimeout(this.resend);
    this.resend = null;
    this.sent.clear();
  }

  onAdmitted(player: SessionPlayer): void {
    this.sent.delete(player.playerId);
    this.guard(this.sendTo(player));
    this.guard(this.sendTheme(player));
    const history = this.options.chat?.entries ?? [];
    if (history.length > 0) this.send(player, { v: 1, type: 'chat', entries: [...history], history: true });
  }

  onGone(player: SessionPlayer): void {
    this.sent.delete(player.playerId);
  }

  onMessage(player: SessionPlayer, message: ControlMessage): void {
    if (message.type === 'dh-edit') this.guard(this.edit(player, message.id, message.edit));
    else if (message.type === 'dh-roll') this.guard(this.rollFrom(player, message.id, message.roll));
    else if (message.type === 'chat-send') this.guard(this.chatFrom(player, message.text, message.card));
  }

  /** A player's chat line, under their session name. A card must be one of their own, and is shown as the GM's note has it. */
  private async chatFrom(player: SessionPlayer, text: string | undefined, card: DhCardFace | undefined): Promise<void> {
    const chat = this.options.chat;
    if (!chat) return;
    let face: DhCardFace | undefined;
    if (card) {
      const own = (await this.charactersOf(player)).flatMap((s) => s.character.build.domainCards).find((c) => c.name === card.name);
      if (!own) return;
      face = cardFace(own);
    }
    chat.post(player.name, { text, card: face });
  }

  private broadcast(entries: ChatEntry[]): void {
    const players = new Set(admitted(this.options.session.getPlayers()));
    for (const player of this.options.session.getPlayers()) {
      if (players.has(player.playerId)) this.send(player, { v: 1, type: 'chat', entries });
    }
  }

  private async sendTheme(player: SessionPlayer): Promise<void> {
    const images = (await this.options.theme?.()) ?? {};
    if (Object.keys(images).length > 0) this.send(player, { v: 1, type: 'dh-theme', images });
  }

  /** A note that cannot be read or written must not stop the session's other messages. */
  private guard(work: Promise<void>): void {
    work.catch((error: unknown) => { console.warn('[Daggerheart] A sheet request failed:', error); });
  }

  /** The characters `player` plays. */
  private async charactersOf(player: SessionPlayer): Promise<StoredCharacter[]> {
    return (await this.options.store.list()).filter((s) => sameName(s.character.player, player.name));
  }

  private async find(player: SessionPlayer, id: string): Promise<StoredCharacter | null> {
    return (await this.charactersOf(player)).find((s) => sheetId(s.path) === id) ?? null;
  }

  private send(player: SessionPlayer, message: DhMessage): void {
    this.options.session.send(player.playerId, message);
  }

  private refuse(player: SessionPlayer, id: string, reason: DhRefusal): void {
    this.send(player, { v: 1, type: 'dh-refused', id, reason });
  }

  private async sendTo(player: SessionPlayer): Promise<void> {
    const entries: DhSheet[] = (await this.charactersOf(player)).map(({ path, character }) => ({ id: sheetId(path), build: character.build, state: character.state }));
    const json = JSON.stringify(entries);
    if (this.sent.get(player.playerId) === json) return;
    this.sent.set(player.playerId, json);
    this.send(player, { v: 1, type: 'dh-sheets', entries });
  }

  private scheduleResend(): void {
    if (this.resend) return;
    // Obsidian's cache settles a moment after a write: one send per burst of changes.
    this.resend = window.setTimeout(() => {
      this.resend = null;
      const players = new Set(admitted(this.options.session.getPlayers()));
      for (const player of this.options.session.getPlayers()) if (players.has(player.playerId)) this.guard(this.sendTo(player));
    }, 150);
  }

  private async edit(player: SessionPlayer, id: string, edit: DhEdit): Promise<void> {
    const found = await this.find(player, id);
    if (!found) return this.refuse(player, id, 'not-yours');
    let refusal: DhRefusal | null = null;
    await this.options.store.update(found.path, (c) => {
      if (edit.kind === 'card-location') {
        const moved = moveCard(c, edit.card, edit.location);
        if (!moved) refusal = c.build.domainCards.some((d) => d.name === edit.card) ? 'loadout-full' : 'not-on-sheet';
        return moved;
      }
      const state = applyEdit(c, edit);
      if (!state) refusal = 'not-on-sheet';
      return state ? { ...c, state } : null;
    });
    if (refusal) this.refuse(player, id, refusal);
    this.scheduleResend();
  }

  private async rollFrom(player: SessionPlayer, id: string, request: DhRollRequest): Promise<void> {
    const found = await this.find(player, id);
    if (!found) return this.refuse(player, id, 'not-yours');
    const { roll } = this.options;
    const built = buildRoll(found.character, request);
    if (!built) return this.refuse(player, id, request.kind === 'action' || request.kind === 'spellcast' ? 'no-hope' : 'not-on-sheet');
    const result = roll?.(player, built.formula, { abilityName: `${found.character.build.name}: ${built.label}` }) ?? null;
    if (!result) return this.refuse(player, id, 'not-rolled');

    if (built.duality) {
      const [hopeDie, fearDie] = result.rolls.filter((die) => die.die === 'd12' && !die.negative);
      if (!hopeDie || !fearDie) return;
      const outcome = dualityOutcome(hopeDie.value, fearDie.value);
      await this.options.store.update(found.path, (c) => ({ ...c, state: afterDuality(c, outcome, built.hopeCost) }));
      if (outcome === 'fear') {
        this.fear += 1;
        this.options.notify(`Daggerheart: ${found.character.build.name} rolled with Fear. Fear +1 (${this.fear} this session).`);
      }
      this.send(player, { v: 1, type: 'dh-rolled', id, label: built.label, total: result.total, hope: hopeDie.value, fear: fearDie.value, outcome });
    } else {
      if (request.kind === 'card-damage') {
        await this.options.store.update(found.path, (c) => ({ ...c, state: afterCardRoll(c, request.card, request.dice) }));
      }
      this.send(player, { v: 1, type: 'dh-rolled', id, label: built.label, total: result.total });
    }
    this.scheduleResend();
  }
}
