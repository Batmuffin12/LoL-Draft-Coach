import type { DataDragon, StaticData } from "@ldc/ddragon";
import type { MetaIndex } from "@ldc/engine";
import type { ChampionId, Position } from "@ldc/shared";
import type { ExploreChampionView, ExploreList, MyGames } from "../shared/explore";
import type { ClientFacts } from "./client-state";
import type { LoadedConfig } from "./config";
import type { ChampionLookup } from "./draft-view";
import { exploreChampionView, exploreListView, memoByInputs, myGamesView } from "./explore-view";
import type { PersonalProfile } from "./profile";
import { roleLabels } from "./view-copy";

/** What looking things up reads from the coach, as it is when the panel asks. */
export interface ExploreSourceDeps {
  index: () => MetaIndex | null;
  profile: () => PersonalProfile | null;
  config: () => LoadedConfig;
  minGames: () => number;
  client: ClientFacts;
  ddragon: Pick<DataDragon, "data">;
  lookup: ChampionLookup;
}

/**
 * Champions > Browse and Me > My games: answers on demand over IPC, from the snapshot and your
 * games already on this PC. Nothing here goes in the view state, or asks the server for anything.
 */
export class ExploreSource {
  private readonly memo = memoByInputs<ExploreList>();

  constructor(private readonly d: ExploreSourceDeps) {}

  /** Data Dragon's static data, or null before it is loaded. */
  private data(): StaticData | null {
    try {
      return this.d.ddragon.data;
    } catch {
      return null;
    }
  }

  /** The band's numbers per champion and role, or null without a snapshot. Worked out once per snapshot and history. */
  list(): ExploreList | null {
    const index = this.d.index();
    if (!index) return null;
    const profile = this.d.profile();
    const config = this.d.config();
    return this.memo([index.snapshot, profile, this.data(), config], () =>
      exploreListView(index, { games: profile?.games ?? [], lookup: this.d.lookup, bands: config.bands, roleLabels: roleLabels(config.explain.templates) }),
    );
  }

  /** One champion in one role. With the client closed the shard rows come from CommunityDragon, like a draft's. */
  async champion(championId: ChampionId, role: Position): Promise<ExploreChampionView | null> {
    const index = this.d.index();
    if (!index) return null;
    const { client, lookup } = this.d;
    if (!client.shardRows.length) await client.loadShardsFallback();
    const { engine, explain, bands } = this.d.config();
    const data = this.data();
    return exploreChampionView(index, championId, role, {
      games: this.d.profile()?.games ?? [],
      lookup,
      loadout: engine.loadout,
      minGames: this.d.minGames(),
      data,
      templates: explain.templates,
      championName: (id) => lookup(id)?.name ?? `#${id}`,
      bands,
      perk: (id) => client.perks.get(id),
      shardRows: client.shardRows,
      runeMechanics: engine.loadout.runeMechanics,
      itemMechanics: engine.loadout.itemMechanics,
      buildsFrom: (id) => data?.itemInfo.get(id)?.from ?? [],
    });
  }

  /** Your own games, from the history on this PC. */
  games(): MyGames {
    return myGamesView(this.d.profile()?.matches ?? [], this.d.lookup, roleLabels(this.d.config().explain.templates));
  }
}
