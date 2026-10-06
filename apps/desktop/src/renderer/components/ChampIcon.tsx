import { cx, initials } from "../format";

export interface IconLike {
  name: string;
  iconUrl: string | null;
}

export interface ChampIconProps {
  champ: IconLike | null;
  size?: number;
  framed?: boolean;
  round?: boolean;
  state?: "picked" | "hover" | "empty" | "banned";
  /** Items, runes and spells: smaller corner radius. */
  kind?: "champ" | "game";
  me?: boolean;
  acting?: boolean;
  title?: string;
}

/** Champion, item, rune or spell art from Data Dragon; a monogram on track when there is no image. */
export function ChampIcon({ champ, size = 56, framed, round, state, kind = "champ", me, acting, title }: ChampIconProps) {
  const shown = state ?? (champ ? "picked" : "empty");
  const style = { width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.32)) };
  const className = cx("icon", kind === "game" && "game", round && "round", framed && "framed", shown !== "picked" && shown, me && "me", acting && "acting");
  if (!champ || shown === "empty") return <span className={className} style={style} aria-hidden="true" />;
  return (
    <span className={className} style={style} title={title ?? champ.name}>
      {champ.iconUrl ? <img src={champ.iconUrl} alt={champ.name} width={size} height={size} /> : initials(champ.name)}
    </span>
  );
}
