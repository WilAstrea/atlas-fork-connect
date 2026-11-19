/** The add-ons in Obsidian: Portrait Stage read from its plugin, and the world map from the vault. */
import { TFile, normalizePath, type App, type Plugin } from 'obsidian';
import type { AddonsPart } from '../app/online/hostedSession';
import { PortraitRelay, type PortraitSource } from './PortraitRelay';
import { WorldMapRelay } from './WorldMapRelay';

export const PORTRAIT_STAGE_ID = 'atlas-portrait-stage';
/** The world map: an image under this name in the Daggerheart theme folder. */
export const WORLD_MAP_BASE = 'Daggerheart/Theme/world_map';
const MAP_EXTENSIONS = ['webp', 'png', 'jpg', 'jpeg'];

interface PluginRegistry { getPlugin?(id: string): Plugin | null }

/** Portrait Stage while it is enabled, if it has what the relay reads (its store and its look). */
export function portraitStageOf(app: App): PortraitSource | null {
  const plugins = (app as App & { plugins?: PluginRegistry }).plugins;
  const plugin = plugins?.getPlugin?.(PORTRAIT_STAGE_ID) as (Plugin & Partial<PortraitSource>) | null | undefined;
  const store = plugin?.store;
  if (!plugin || !store || typeof store.get !== 'function' || typeof store.subscribe !== 'function' || typeof store.onPulse !== 'function'
    || typeof plugin.look !== 'function' || typeof plugin.onLookChange !== 'function') return null;
  return plugin as PortraitSource;
}

function worldMapPath(app: App): string | null {
  for (const ext of MAP_EXTENSIONS) {
    const file = app.vault.getAbstractFileByPath(normalizePath(`${WORLD_MAP_BASE}.${ext}`));
    if (file instanceof TFile) return file.path;
  }
  return null;
}

export function addonsPart(app: App): AddonsPart {
  return ({ session, assets, extras }) => {
    const portraits = new PortraitRelay({ session, assets, extras, source: () => portraitStageOf(app) });
    const worldMap = new WorldMapRelay({
      session, assets, extras,
      path: () => worldMapPath(app),
      onPathChange: (listener) => {
        const refs = [app.vault.on('create', listener), app.vault.on('delete', listener), app.vault.on('rename', listener), app.vault.on('modify', listener)];
        return () => refs.forEach((ref) => app.vault.offref(ref));
      },
    });
    return {
      start: () => { portraits.start(); worldMap.start(); },
      stop: () => { worldMap.stop(); portraits.stop(); },
    };
  };
}
