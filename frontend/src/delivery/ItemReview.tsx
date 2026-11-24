import { reviewedWork, walkthrough } from "./review";
import { describeLink } from "./references";
import { projectWork, type Work } from "./work";
import type { Project } from "./project";
import { boardLink } from "./BoardProject";

export type Linked = ReturnType<typeof describeLink>;
export function References({
  project,
  item,
  links,
  anchor = item.id,
}: Readonly<{
  project: Project;
  item: Work;
  links: Linked[];
  anchor?: string;
}>) {
  if (!links.length) return null;
  return (
    <ul className="delivery-references">
      {links.map((link) => {
        const source = link.source.id === anchor || link.source.kind === "result";
        const other = source ? link.target : link.source;
        const to =
          other.kind === "work"
            ? boardLink(project.id, other.id)
            : boardLink(project.id, item.id, other.id, other.fragment);
        return (
          <li key={link.id}>
            <span>{link.purpose}</span>{" "}
            {other.live ? (
              <a href={to}>
                {other.label}
                {other.fragment && ` · ${other.fragment}`}
              </a>
            ) : (
              <span>{other.label} · unavailable</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function ItemReview({ item, project }: Readonly<{ item: Work; project: Project }>) {
  const view = reviewedWork(project, item, false);
  const history = project.work.filter((change) => "item" in change && change.item === item.id);
  const entries = view.guidance.flatMap((group) =>
    group.entries.map((entry) => ({ ...entry, owner: group.title }))
  );
  const { items } = projectWork(project.work);
  const children = [...items.values()].filter((work) => work.parent === item.id && !work.retired);
  const completed = children.filter((work) => work.status === "completed").length;
  return (
    <article>
      <header className="delivery-item-header">
        <h2>{item.title}</h2>
        <span className={`delivery-status delivery-status--${item.status}`}>
          {item.status.replaceAll("_", " ")}
        </span>
      </header>
      {item.summary && <p>{item.summary}</p>}
      {item.outcome && (
        <p>
          <strong>Outcome</strong> {item.outcome}
        </p>
      )}
      {children.length > 0 && (
        <p>
          {completed} of {children.length} child items complete
        </p>
      )}
      {item.next && (
        <section>
          <h3>Next action</h3>
          <p>{item.next}</p>
        </section>
      )}
      {item.note && (
        <p>
          <strong>{item.status === "blocked" ? "Blocker" : "Progress"}</strong> {item.note}
        </p>
      )}
      {entries.length > 0 && (
        <section>
          <h3>Governing guidance</h3>
          <ul>
            {entries.map((entry) => (
              <li key={entry.id}>
                <strong>{entry.kind}</strong> {entry.text}{" "}
                <small>
                  {[entry.owner, entry.attribution, entry.source].filter(Boolean).join(" · ")}
                </small>
                {entry.rationale && <p>{entry.rationale}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <References project={project} item={item} links={view.related} />
      <LatestResult item={item} project={project} result={view.result} />
      <details>
        <summary>Technical details and acceptance</summary>
        <p>{item.technical}</p>
        <p>{item.implementation}</p>
        <p>{item.acceptance}</p>
      </details>
      <details>
        <summary>Guided review</summary>
        <ol>
          {walkthrough.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </details>
      <WorkHistory history={history} />
    </article>
  );
}
function LatestResult({
  item,
  project,
  result,
}: Readonly<{ item: Work; project: Project; result: ReturnType<typeof reviewedWork>["result"] }>) {
  if (!result) return null;
  return (
    <section>
      <h3>Latest result</h3>
      <p>{result.observation}</p>
      {result.stale && <p role="status">The design basis has changed since this result.</p>}
      <References
        project={project}
        item={item}
        links={result.artifacts.map((l) => describeLink(project, l))}
      />
      {result.reviews.map((review) => (
        <div key={review.id}>
          {review.accepted && (
            <p>
              <strong>Accepted</strong> {review.accepted}
            </p>
          )}
          {review.remaining && (
            <p>
              <strong>Remaining</strong> {review.remaining}
            </p>
          )}
        </div>
      ))}
    </section>
  );
}
function WorkHistory({ history }: Readonly<{ history: Project["work"] }>) {
  return (
    <details>
      <summary>History</summary>
      <ol>
        {history.map((change) => (
          <li key={change.id}>
            <time dateTime={change.at}>{new Date(change.at).toLocaleString()}</time> ·{" "}
            {change.actor} · {change.type}
            {"observation" in change && <p>{change.observation}</p>}
            {"accepted" in change && (
              <>
                <p>{change.accepted}</p>
                <p>{change.remaining}</p>
              </>
            )}
            {"changes" in change && (
              <ul>
                {Object.entries(change.changes).map(([field, value]) => (
                  <li key={field}>
                    {field} · {JSON.stringify(value)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}
