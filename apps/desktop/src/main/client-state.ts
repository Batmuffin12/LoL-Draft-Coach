import { communityDragonAsset } from "@ldc/ddragon";
import type { LcuConnector } from "@ldc/lcu";
import type { ChampionId, Position } from "@ldc/shared";

/**
 * What the coach reads from the League client once it connects: your own summoner and ranked
 * stats, Riot's recommended positions, rune and shard names, and the champions you own. Every
 * read but the summoner tolerates a failure (an older client, the mock client).
 */
export async function readClientState(connector: LcuConnector) {
  const me = await connector.getCurrentSummoner();
  const ranked = await connector.getRankedStats().catch(() => null);
  const intendedPositions = await connector.getRecommendedPositions().catch(() => new Map<ChampionId, Position[]>());
  const perks = await connector.getPerks().catch(() => []);
  const shardRows = await connector.getStatShardRows().catch(() => []);
  const owned = await connector.getOwnedChampionIds().catch(() => []);
  return {
    me,
    ranked,
    intendedPositions,
    /** Rune and stat shard names from the client (Data Dragon has no shards), with mirror icons. */
    perks: new Map(perks.map((p) => [p.id, { name: p.name, iconUrl: communityDragonAsset(p.iconPath) }])),
    shardRows,
    /** Null when the client listed none (ownership unknown). */
    owned: owned.length ? new Set(owned) : null,
  };
}
