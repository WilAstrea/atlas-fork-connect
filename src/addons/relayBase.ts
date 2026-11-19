/** What the add-on relays share: sending a message to every admitted player, and the vault's asset ids. */
import type { SessionHandler, SessionPlayer } from '../app/online/gmSessionTypes';
import type { SceneSession } from '../app/online/scene/sceneContracts';
import { admitted } from '../app/online/scene/slotAudience';
import type { AddonMessage } from './protocol';

export interface VaultAssetIds {
  idFor(path: string | null | undefined): string | null;
  /** A fingerprint was worked out: ids asked for earlier may exist now. */
  onChange(listener: () => void): () => void;
}

export type RelaySession = Pick<SceneSession, 'use' | 'send' | 'getPlayers'>;

export function sendToAdmitted(session: RelaySession, message: AddonMessage): void {
  const ids = new Set(admitted(session.getPlayers()));
  for (const player of session.getPlayers()) if (ids.has(player.playerId)) session.send(player.playerId, message);
}

export type { SessionHandler, SessionPlayer };
