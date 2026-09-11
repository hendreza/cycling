import { useEffect, useState } from "react";
import type { Route } from "./types";
import WifiTransfer from "./WifiTransfer";

export default function PhoneExport({
  route,
  speed,
  disabled,
  revision,
}: {
  route: Route;
  speed: number;
  disabled: boolean;
  revision: number;
}) {
  const [laps, setLaps] = useState("all");
  const [prepared, setPrepared] = useState<{ key: string; file: File } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [sharing, setSharing] = useState(false);
  const [retry, setRetry] = useState(0);
  const key = `${route.id}:${speed}:${laps}:${revision}:${retry}`;
  const file = !disabled && prepared?.key === key ? prepared.file : null;
  useEffect(() => {
    setError("");
    setMessage("");
    setPrepared(null);
    if (disabled) return;
    const controller = new AbortController();
    fetch(
      `/api/routes/${route.id}/gpx?format=osmand&laps=${laps}&speed_kmh=${speed}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw Error(
            body.detail || "Could not prepare the Android route. Try again.",
          );
        }
        const blob = await response.blob();
        if (!controller.signal.aborted)
          setPrepared({
            key,
            file: new File(
              [blob],
              `verge-centurion-${route.id.slice(0, 8)}-android-${laps}.gpx`,
              { type: "application/gpx+xml" },
            ),
          });
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [key, disabled]);
  let canShare = false;
  try {
    canShare = !!file && !!navigator.canShare?.({ files: [file] });
  } catch {
    /* Browser restrictions. */
  }
  function download() {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage(
      "Downloaded. On Android, open the file with OsmAnd, then choose Navigation.",
    );
  }
  async function share() {
    if (!file || !canShare) return;
    setSharing(true);
    setError("");
    try {
      // File is prepared before this click, preserving the browser's required user activation.
      await navigator.share({ files: [file], title: "Verge cycling route" });
      setMessage(
        "Route handed to your chosen app. Open the GPX with OsmAnd to navigate.",
      );
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setError("Sharing was unavailable. Use Download for Android instead.");
    } finally {
      setSharing(false);
    }
  }
  return (
    <section className="phone-export" aria-label="Take your route">
      <div>
        <h3>Take your route</h3>
        <p>Ready for OsmAnd, with turn guidance and the roads shown here.</p>
      </div>
      {(route.laps ?? 1) > 1 && (
        <label>
          Include
          <select
            aria-label="Android download laps"
            value={laps}
            onChange={(e) => setLaps(e.target.value)}
          >
            <option value="all">All {route.laps} laps</option>
            <option value="single">One lap</option>
          </select>
        </label>
      )}
      <div className="point-actions">
        <button
          className="primary"
          disabled={!file || sharing}
          onClick={download}
        >
          Download for Android
        </button>
        {canShare && (
          <button className="outline" disabled={sharing} onClick={share}>
            Share route
          </button>
        )}
        {error && (
          <button className="outline" onClick={() => setRetry((r) => r + 1)}>
            Retry download preparation
          </button>
        )}
      </div>
      {!disabled && !file && !error && (
        <p role="status">Preparing your route…</p>
      )}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      <WifiTransfer
        routeId={route.id}
        speed={speed}
        laps={laps}
        disabled={disabled}
        revision={revision}
      />
      <details>
        <summary>First time using OsmAnd?</summary>
        <ol>
          <li>
            Install OsmAnd and download the Gauteng map and a voice package.
          </li>
          <li>
            On your phone, open the downloaded GPX with OsmAnd. From a computer,
            use “Share route” if available, or transfer the downloaded file with
            Quick Share or USB.
          </li>
          <li>
            Open the track and choose Navigation with the cycling profile.
            Select all segments for multiple laps.
          </li>
        </ol>
        <p>
          Check the imported track matches this map. “Attach to roads”,
          reversing the route or recalculating in OsmAnd can change the route.
          Stop to operate your phone.
        </p>
        {route.navigation?.roundabouts_need_review && (
          <p>
            At roundabouts, follow the highlighted track. Exit numbers are not
            supplied.
          </p>
        )}
        <a
          href="https://osmand.net/docs/user/navigation/setup/gpx-navigation/"
          target="_blank"
          rel="noreferrer"
        >
          OsmAnd track navigation guide
        </a>
      </details>
    </section>
  );
}
