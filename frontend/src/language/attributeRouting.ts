import { LanguageError } from "./lexer";
import type { Attribute } from "./syntax";

type ItemPass =
  "describe" | "match" | "rules" | "offset" | "holder" | "band" | "arrange" | "reject";
interface Routing {
  item: ItemPass;
  link: "link" | "reject";
  style: "style" | "reject";
  /** Free-standing layout blocks historically accept other attributes without applying them. */
  arrangement: "arrange" | "rules" | "ignore";
}

/**
 * An item attribute is handled here or delegated to its named receiving pass. Rejections are
 * explicit. Arrangement ignores preserve the accepted grammar without pretending another pass
 * applies those attributes to a stored item; an arrangement is a virtual extent, not an Item.
 */
const ROUTING = {
  word: { item: "describe", link: "link", style: "reject", arrangement: "ignore" },
  look: { item: "describe", link: "link", style: "style", arrangement: "ignore" },
  icon: { item: "describe", link: "reject", style: "reject", arrangement: "ignore" },
  at: { item: "rules", link: "reject", style: "reject", arrangement: "rules" },
  size: { item: "describe", link: "reject", style: "reject", arrangement: "ignore" },
  by: { item: "offset", link: "reject", style: "reject", arrangement: "ignore" },
  beside: { item: "rules", link: "reject", style: "reject", arrangement: "rules" },
  align: { item: "rules", link: "reject", style: "reject", arrangement: "rules" },
  match: { item: "match", link: "reject", style: "reject", arrangement: "ignore" },
  nudge: { item: "offset", link: "reject", style: "reject", arrangement: "ignore" },
  in: { item: "holder", link: "link", style: "reject", arrangement: "ignore" },
  over: { item: "band", link: "reject", style: "reject", arrangement: "ignore" },
  on: { item: "describe", link: "reject", style: "reject", arrangement: "ignore" },
  arrange: { item: "arrange", link: "reject", style: "reject", arrangement: "arrange" },
  picture: { item: "describe", link: "reject", style: "reject", arrangement: "ignore" },
  points: { item: "describe", link: "reject", style: "reject", arrangement: "ignore" },
  via: { item: "reject", link: "link", style: "reject", arrangement: "ignore" },
  label: { item: "reject", link: "link", style: "reject", arrangement: "ignore" },
  deck: { item: "describe", link: "reject", style: "reject", arrangement: "ignore" },
  free: { item: "describe", link: "reject", style: "reject", arrangement: "ignore" },
} as const satisfies Record<Attribute["kind"], Routing>;

type Context = keyof Routing;
type Kinds<Where extends Context, Pass extends Routing[Where]> = {
  [Kind in Attribute["kind"]]: (typeof ROUTING)[Kind][Where] extends Pass ? Kind : never;
}[Attribute["kind"]];
export type RoutedAttribute<Where extends Context, Pass extends Routing[Where]> = Extract<
  Attribute,
  { kind: Kinds<Where, Pass> }
>;

export function attributesFor<Where extends Context, Pass extends Routing[Where]>(
  attributes: Attribute[],
  where: Where,
  pass: Pass | readonly Pass[]
): RoutedAttribute<Where, Pass>[] {
  const passes: readonly string[] = typeof pass === "string" ? [pass] : pass;
  return attributes.filter((attribute): attribute is RoutedAttribute<Where, Pass> => {
    const receiving: string = ROUTING[attribute.kind][where];
    return passes.includes(receiving);
  });
}

export function checkAttributes(where: Context, attributes: Attribute[], line: number) {
  for (const attribute of attributes) {
    if (ROUTING[attribute.kind][where] !== "reject") continue;
    if (where === "style")
      throw new LanguageError("A style holds only look properties such as fill or dashed.", line);
    if (where === "link") throw new LanguageError(`A line cannot take "${attribute.kind}".`, line);
    const name = attribute.kind === "label" ? "label-at" : attribute.kind;
    throw new LanguageError(`Only a line takes ${name}.`, line);
  }
}
