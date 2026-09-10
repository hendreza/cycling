import { ScoreBar, Confidence } from "./Brand";
import type { Route } from "./types";
export default function SafetyAssessment({
  route,
  updating,
  dirty,
  change,
}: {
  route: Route;
  updating: boolean;
  dirty: boolean;
  change: { from: number; to: number } | null;
}) {
  const safety = route.safety;
  return (
    <section
      className="safety-assessment"
      aria-label="Mapped-road assessment"
      aria-busy={updating}
    >
      <div className="safety-heading">
        <div>
          <strong>Mapped-road score</strong>
          <p>
            {updating
              ? "Updating route and assessment…"
              : safety?.confidence ||
                "Calculate this route to check mapped road data."}
          </p>
        </div>
        {updating ? (
          <strong className="safety-value">…</strong>
        ) : safety ? (
          <span className="safety-value">
            <ScoreBar score={safety.score} confidence="low" />
          </span>
        ) : (
          <strong className="safety-value">—</strong>
        )}
      </div>
      {change && !updating && (
        <p className="safety-change" role="status">
          Edit: {change.from}/100 → {change.to}/100
          {change.to < change.from
            ? " · More mapped concerns or missing data"
            : change.to > change.from
              ? " · Fewer mapped deductions"
              : " · Same mapped score"}
          . <Confidence level="low" />
        </p>
      )}
      {dirty && (
        <p>
          The assessment belongs to the displayed route. Calculate routes to
          apply your changed setup.
        </p>
      )}
      {safety && !updating && (
        <>
          <div className="safety-facts">
            <span>
              {safety.major_junctions_per_lap} major-road junctions per lap
            </span>
            <span>
              {safety.major_junction_visits} visits over the full ride
            </span>
            <span>{safety.reports.length} active local reports</span>
          </div>
          <p>
            Based on mapped roads and local reports. This is an estimate, not a
            field-verified rating.
          </p>
          <details>
            <summary>Score breakdown and unknowns</summary>
            <p>
              Starts at 100. The deductions below reduce the score. Higher
              scores rank first. Scores are not crash probabilities.
            </p>
            <ul>
              {safety.factors.map((f) => (
                <li key={f.label}>
                  <span>
                    <strong>{f.label}</strong> · {f.detail}
                  </span>
                  <b>−{f.deduction}</b>
                </li>
              ))}
            </ul>
            <p>
              <strong>Unknown:</strong> {safety.unknowns.join(", ")}.
            </p>
            {safety.reports.map((r, i) => (
              <p key={i}>
                Local report: {r.category.replaceAll("-", " ")} · {r.detail}
              </p>
            ))}
            <small>
              Road snapshot {safety.data_timestamp.slice(0, 10)} · model{" "}
              {safety.model}
            </small>
          </details>
        </>
      )}
    </section>
  );
}
