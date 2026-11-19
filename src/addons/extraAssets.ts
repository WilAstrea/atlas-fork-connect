/**
 * Images players may fetch beyond their scene's: Portrait Stage's portraits and the world map. The asset server
 * already serves a running cutscene's files on top of each player's scene; this joins any number of such providers to
 * that one hook, so Connect's server stays as it is.
 */
export interface ExtraAssetProvider {
  /** The asset ids `playerId` may fetch now. */
  assetsFor(playerId: string): ReadonlySet<string>;
}

export interface AllowedExtras {
  assetsFor(playerId: string): ReadonlySet<string>;
  onAssetsChange(listener: () => void): () => void;
}

export class ExtraAssets implements AllowedExtras {
  private readonly providers = new Set<ExtraAssetProvider>();
  private readonly listeners = new Set<() => void>();

  add(provider: ExtraAssetProvider): () => void {
    this.providers.add(provider);
    this.changed();
    return () => {
      this.providers.delete(provider);
      this.changed();
    };
  }

  assetsFor(playerId: string): ReadonlySet<string> {
    const ids = new Set<string>();
    for (const provider of this.providers) for (const id of provider.assetsFor(playerId)) ids.add(id);
    return ids;
  }

  onAssetsChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** A provider's ids changed: the server checks running transfers again. */
  changed(): void {
    for (const listener of this.listeners) listener();
  }
}

/** The cutscene's files and the extras, as the one `cutscene` hook the asset server takes. */
export function withExtras(cutscene: AllowedExtras | undefined, extras: AllowedExtras): AllowedExtras {
  return {
    assetsFor: (playerId) => {
      const own = cutscene?.assetsFor(playerId);
      const more = extras.assetsFor(playerId);
      return own && own.size > 0 ? new Set([...own, ...more]) : more;
    },
    onAssetsChange: (listener) => {
      const stops = [extras.onAssetsChange(listener), ...(cutscene ? [cutscene.onAssetsChange(listener)] : [])];
      return () => stops.forEach((stop) => stop());
    },
  };
}
