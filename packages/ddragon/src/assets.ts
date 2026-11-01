/** CommunityDragon's public mirror of the client's own static art. No Node in here: the panel's renderer can import this file. */
export const COMMUNITY_DRAGON_STATIC_ASSETS = "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/";

/** The client's icon for a position, by the position's id from the game's data ("middle", "utility"). */
export function positionIconUrl(position: string, base = COMMUNITY_DRAGON_STATIC_ASSETS): string {
  return `${base}svg/position-${encodeURIComponent(position.toLowerCase())}.svg`;
}
