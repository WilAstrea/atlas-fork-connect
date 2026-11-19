/**
 * Portrait Stage for Atlas VTT, online: the GM's stage goes to every admitted player as it changes (`ps-stage`), its
 * moments as they happen (`ps-pulse`), and its pictures through Connect's asset channel. Portrait Stage has no API;
 * it is read the way its own player-window bridge reads it (its store and its look), so the plugin needs no change,
 * and is looked for again every few seconds, as it may load after Connect or be switched off and on.
 */
import type { Pulse } from '../../vendor/portrait-stage/stage/emotions';
import type { StageLook, StageState } from '../../vendor/portrait-stage/stage/types';
import type { ExtraAssetProvider, ExtraAssets } from './extraAssets';
import type { AddonMessage } from './protocol';
import { sendToAdmitted, type RelaySession, type SessionHandler, type SessionPlayer, type VaultAssetIds } from './relayBase';

/** What the relay reads of Portrait Stage: the parts its own player-window bridge uses. */
export interface PortraitSource {
  store: {
    get(): StageState;
    subscribe(listener: (state: StageState) => void): () => void;
    onPulse(listener: (pulse: Pulse) => void): () => void;
  };
  look(): StageLook;
  onLookChange(listener: () => void): () => void;
}

export interface PortraitRelayOptions {
  session: RelaySession;
  assets: VaultAssetIds;
  extras: ExtraAssets;
  /** Portrait Stage, while it is loaded. */
  source: () => PortraitSource | null;
  /** How often to look for Portrait Stage again, in ms. */
  pollMs?: number;
}

export class PortraitRelay implements SessionHandler, ExtraAssetProvider {
  private readonly stops: Array<() => void> = [];
  private attached: PortraitSource | null = null;
  private detach: Array<() => void> = [];
  private poll: number | null = null;
  private ids = new Set<string>();
  private last: Extract<AddonMessage, { type: 'ps-stage' }> = { v: 1, type: 'ps-stage', state: null, look: null };
  private lastJson = '';

  constructor(private readonly options: PortraitRelayOptions) {}

  start(): void {
    if (this.stops.length > 0) return;
    this.stops.push(this.options.session.use(this), this.options.extras.add(this), this.options.assets.onChange(() => this.project()));
    this.find();
    this.poll = window.setInterval(() => this.find(), this.options.pollMs ?? 3000);
  }

  stop(): void {
    if (this.poll !== null) window.clearInterval(this.poll);
    this.poll = null;
    this.release();
    this.stops.splice(0).forEach((stop) => stop());
  }

  onAdmitted(player: SessionPlayer): void {
    if (this.last.state) this.options.session.send(player.playerId, this.last);
  }

  assetsFor(): ReadonlySet<string> {
    return this.ids;
  }

  private find(): void {
    let source: PortraitSource | null = null;
    try {
      source = this.options.source();
    } catch {
      source = null;
    }
    if (source === this.attached) return;
    this.release();
    this.attached = source;
    if (source) {
      this.detach.push(
        source.store.subscribe(() => this.project()),
        source.store.onPulse((pulse) => sendToAdmitted(this.options.session, { v: 1, type: 'ps-pulse', pulse })),
        source.onLookChange(() => this.project()),
      );
    }
    this.project();
  }

  private release(): void {
    this.detach.splice(0).forEach((stop) => stop());
    this.attached = null;
  }

  /** The stage as players get it: each picture's path becomes its asset id (none until hashed), no file names. */
  private project(): void {
    const source = this.attached;
    let message: Extract<AddonMessage, { type: 'ps-stage' }>;
    const ids = new Set<string>();
    if (!source) {
      message = { v: 1, type: 'ps-stage', state: null, look: null };
    } else {
      const state = source.store.get();
      const portraits = state.portraits.map((portrait) => {
        const id = this.options.assets.idFor(portrait.path);
        if (id) ids.add(id);
        return { ...portrait, path: id ?? '', name: '', assetId: null, source: null };
      });
      message = { v: 1, type: 'ps-stage', state: { ...state, portraits }, look: { ...source.look() } };
    }
    const idsChanged = ids.size !== this.ids.size || [...ids].some((id) => !this.ids.has(id));
    this.ids = ids;
    if (idsChanged) this.options.extras.changed();
    const json = JSON.stringify(message);
    if (json === this.lastJson) return;
    this.lastJson = json;
    this.last = message;
    sendToAdmitted(this.options.session, message);
  }
}
