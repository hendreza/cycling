import type { ReactNode } from "react";

export function Logo({
  variant = "primary",
  tone = "light",
}: {
  variant?: "primary" | "stacked" | "icon" | "wordmark";
  tone?: "light" | "dark" | "mono";
}) {
  return (
    <span
      className={`verge-logo logo-${variant} logo-${tone}`}
      aria-label="Verge"
    >
      {variant !== "wordmark" && (
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <path
            className="logo-lane"
            d="M35 80L45 20"
            strokeWidth="26"
            strokeLinecap="round"
          />
          <path
            className="logo-verge"
            d="M61 82L71 18"
            strokeWidth="10"
            strokeLinecap="round"
          />
        </svg>
      )}
      {variant !== "icon" && (
        <span className={variant === "wordmark" ? "wordmark" : "logo-strap"}>
          <span>VERGE</span>
        </span>
      )}
    </span>
  );
}
export type ConfidenceLevel = "high" | "medium" | "low";
export function Confidence({ level }: { level: ConfidenceLevel }) {
  const count = { high: 3, medium: 2, low: 1 }[level];
  return (
    <span className="confidence" aria-label={`${level} confidence`}>
      <span className="confidence-dots" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <i key={i} className={i <= count ? "filled" : ""} />
        ))}
      </span>
      {level} confidence
    </span>
  );
}
export function ScoreBar({
  score,
  confidence,
  compact = false,
}: {
  score: number;
  confidence: ConfidenceLevel;
  compact?: boolean;
}) {
  // Bands describe the mapped evidence, never observed traffic or a guaranteed outcome.
  const band =
    score >= 80
      ? "Fewer mapped concerns"
      : score >= 60
        ? "Some mapped concerns"
        : score >= 40
          ? "Several mapped concerns"
          : "Review closely";
  return (
    <span className={`score-bar ${compact ? "score-compact" : ""}`}>
      <span className="score-top">
        <span className="score-number">
          {score}
          <small>/100</small>
        </span>
        {!compact && <span className="score-band">{band}</span>}
      </span>
      {!compact && (
        <span className="score-tracks" aria-hidden="true">
          <i>
            <b style={{ width: `${score}%` }} />
          </i>
          <i>
            <b style={{ width: `${score}%` }} />
          </i>
        </span>
      )}
      <Confidence level={confidence} />
    </span>
  );
}
export function Notice({
  title,
  source,
  children,
}: {
  title: string;
  source: string;
  children: ReactNode;
}) {
  return (
    <aside className="notice">
      <span className="notice-eyebrow">Road information</span>
      <strong>{title}</strong>
      <div>{children}</div>
      <small>{source}</small>
    </aside>
  );
}
