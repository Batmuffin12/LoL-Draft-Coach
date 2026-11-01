import { communityDragonAsset, type DataDragon } from "@ldc/ddragon";
import type { LcuConnector } from "@ldc/lcu";
import type { ChampionId, Position } from "@ldc/shared";
import type { Identity } from "./profile-source";

/** A Riot ID from .env ("Name#TAG"); null when it doesn't look like one. */
export function parseRiotId(riotId: string): Identity | null {
  const i = riotId.lastIndexOf("#");
  const gameName = riotId.slice(0, i).trim();
  const tagLine = riotId.slice(i + 1).trim();
  return i < 0 || !gameName || !tagLine ? null : { gameName, tagLine };
}

/** What the coach knows from the League client, kept between reads. */
export class ClientFacts {
  /** Riot's recommended positions per champion, read from the client. */
  intendedPositions = new Map<ChampionId, Position[]>();
  /** Rune and stat shard names from the client (Data Dragon has no shards), with mirror icons. */
  perks = new Map<number, { name: string; iconUrl: string | null }>();
  /** The stat shard rows (offense, flex, defense) from the client, for drawing the whole rune page. */
  shardRows: number[][] = [];
  /** Champions you own, from the client (null until read: ownership unknown). */
  owned: Set<ChampionId> | null = null;

  constructor(private readonly ddragon: Pick<DataDragon, "statShards">) {}

  /** Reads the client; returns your own summoner and ranked stats. */
  async read(connector: LcuConnector): Promise<Pick<Awaited<ReturnType<typeof readClientState>>, "me" | "ranked">> {
    const { me, ranked, intendedPositions, perks, shardRows, owned } = await readClientState(connector);
    this.intendedPositions = intendedPositions;
    this.perks = perks;
    this.shardRows = shardRows;
    this.owned = owned;
    if (!this.shardRows.length) await this.loadShardsFallback();
    return { me, ranked };
  }

  /** Stat shards from CommunityDragon when the client doesn't list them (an older client, the mock client). */
  async loadShardsFallback(): Promise<void> {
    const s = await this.ddragon.statShards().catch(() => null);
    if (!s) return;
    this.shardRows = s.rows;
    for (const [id, p] of s.perks) if (!this.perks.has(id)) this.perks.set(id, p);
  }
}

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
