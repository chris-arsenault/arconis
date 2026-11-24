import { ancestors, projectWork, type Work } from "./work";
import { currentDocuments, type Project } from "./project";
import { describeLink } from "./references";

export const deliveryInstructions =
  "Read the selected work and inherited guidance before editing. On handoff, link the design sections, dataset rows and diagram objects the work relies on. Record observations against the exact result and attach its evidence. Use direct field edits and batch related changes. Preserve decisions and unrelated work.";

export const walkthrough = [
  "Trace the requested behavior through existing entry points, owners, contracts, state and consumers. Name the paths you could not verify.",
  "Identify the applicable pattern or existing idiom. Record its participants, rationale and trade-offs in Technical details.",
  "Group implementation, callers and verification around each deliverable. Split work at a real dependency, decision or delivery boundary.",
  "Reconcile the synopsis, decisions and delivery order after changes. Link governing sources and the exact result under review.",
  "Record the hypothesis, observation and result separately from acceptance. For an example, preserve the case and explain what varies and which behavior should hold.",
];

export function effectiveContext(project: Project, item: Work) {
  const { items, entries, links } = projectWork(project.work);
  const chain = [...ancestors(item, items), item];
  const ids = new Set(chain.map((work) => work.id));
  let number = 0;
  const guidance = chain.map((work) => ({
    title: work.title,
    id: work.id,
    outcome: work.outcome,
    entries: Array.from(entries.values())
      .filter((entry) => !entry.retired && entry.item === work.id)
      .map((entry) => ({ ...entry, number: ++number })),
  }));
  const related = Array.from(links.values()).filter(
    (link) => link.from === `work:${item.id}` || link.to === `work:${item.id}`
  );
  const documents = currentDocuments(project);
  const linked = new Set(
    related.flatMap((link) => [link.from.split("#")[0], link.to.split("#")[0]])
  );
  const relevant = project.work
    .filter((change) => {
      if (change.type === "entry.add") return ids.has(change.entry.item);
      if (change.type === "entry.edit") return ids.has(entries.get(change.entry)?.item ?? "");
      if (change.type === "work.edit")
        return (
          ids.has(change.item) &&
          Object.keys(change.changes).some((k) => !["status", "note", "next", "rank"].includes(k))
        );
      return change.type === "work.add" && ids.has(change.item.id);
    })
    .map((change) => change.id);
  const snapshot = [
    ...relevant,
    ...documents.filter((doc) => linked.has(`file:${doc.document}`)).map((doc) => doc.id),
  ];
  return { guidance, related, snapshot };
}
export function reviewedWork(project: Project, item: Work, review: boolean) {
  const { guidance, related, snapshot } = effectiveContext(project, item);
  const links = [...projectWork(project.work).links.values()];
  const results = project.work.flatMap((change) =>
    change.type === "result" && change.item === item.id
      ? [
          {
            ...change,
            stale: JSON.stringify(change.snapshot) !== JSON.stringify(snapshot),
            reviews: project.work
              .filter((review) => review.type === "review")
              .filter((review) => review.result === change.id),
            artifacts: links.filter((link) => link.from === `result:${change.id}`),
          },
        ]
      : []
  );
  const linksWithTargets = related.map((link) => describeLink(project, link));
  return {
    item,
    guidance,
    related: linksWithTargets,
    result: results.at(-1) ?? null,
    unresolved: linksWithTargets.filter((link) => !link.source.live || !link.target.live),
    ...(review ? { walkthrough, instructions: deliveryInstructions } : {}),
  };
}
