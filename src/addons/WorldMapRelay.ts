/**
 * The Map tab's world map: an image the GM keeps in the vault (`Daggerheart/Theme/world_map.*`), sent to every
 * admitted player as an asset id (`world-map`) and served by Connect's asset channel. A new file under that name, or
 * its removal, reaches players at once.
 */
import type { ExtraAssetProvider, ExtraAssets } from './extraAssets';
import type { AddonMessage } from './protocol';
import { sendToAdmitted, type RelaySession, type SessionHandler, type SessionPlayer, type VaultAssetIds } from './relayBase';

export interface WorldMapRelayOptions {
  session: RelaySession;
  assets: VaultAssetIds;
  extras: ExtraAssets;
  /** The world map's vault path now, or null when there is none. */
  path: () => string | null;
  /** Calls `listener` when the vault may hold a different world map; returns the stop. */
  onPathChange: (listener: () => void) => () => void;
  title?: string;
}

export class WorldMapRelay implements SessionHandler, ExtraAssetProvider {
  private readonly stops: Array<() => void> = [];
  private ids: ReadonlySet<string> = new Set();
  private last: Extract<AddonMessage, { type: 'world-map' }> = { v: 1, type: 'world-map', asset: null, title: '' };

  constructor(private readonly options: WorldMapRelayOptions) {}

  start(): void {
    if (this.stops.length > 0) return;
    this.stops.push(
      this.options.session.use(this), this.options.extras.add(this),
      this.options.assets.onChange(() => this.project()), this.options.onPathChange(() => this.project()),
    );
    this.project();
  }

  stop(): void {
    this.stops.splice(0).forEach((stop) => stop());
  }

  onAdmitted(player: SessionPlayer): void {
    if (this.last.asset) this.options.session.send(player.playerId, this.last);
  }

  assetsFor(): ReadonlySet<string> {
    return this.ids;
  }

  private project(): void {
    const asset = this.options.assets.idFor(this.options.path());
    if (asset === this.last.asset) return;
    this.ids = new Set(asset ? [asset] : []);
    this.options.extras.changed();
    this.last = { v: 1, type: 'world-map', asset, title: this.options.title ?? 'Mapa del mundo' };
    sendToAdmitted(this.options.session, this.last);
  }
}
