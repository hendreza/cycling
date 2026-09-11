import { useEffect, useRef, useState } from "react";
import { api, post } from "./api";
export type AccessSection = {
  edge_id: string;
  way_id: number;
  road_name: string;
  coordinates: [number, number];
  geometry: [number, number][];
  snap_distance_m: number;
};
export type AccessBlock = AccessSection & {
  id: string;
  note: string;
  created_at: string;
};

export function useAccessBlocks(
  routeId: string | undefined,
  onChanged: () => void,
) {
  const [blocks, setBlocks] = useState<AccessBlock[]>([]);
  const [marking, setMarking] = useState(false);
  const [candidate, setCandidate] = useState<AccessSection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<{ key: string; problem: string } | null>(
    null,
  );
  const operation = useRef(0);
  const changed = useRef(onChanged);
  changed.current = onChanged;
  const key = `${routeId ?? ""}:${revision}`;
  useEffect(() => {
    let current = true;
    api<AccessBlock[]>("/access-blocks")
      .then((b) => {
        if (current) setBlocks(b);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [revision]);
  useEffect(() => {
    if (!routeId) return;
    let current = true;
    api<{ blocked: boolean; current_policy: boolean }>(
      `/routes/${routeId}/access`,
    )
      .then((result) => {
        if (current)
          setStatus({
            key,
            problem: result.blocked
              ? "This route crosses a saved access block. Recalculate before riding or exporting."
              : !result.current_policy
                ? "Route rules have improved. Recalculate this saved ride before exporting."
                : "",
          });
      })
      .catch((e) => {
        if (current) setStatus({ key, problem: e.message });
      });
    return () => {
      current = false;
    };
  }, [routeId, key]);
  // Changes in another tab must not leave a previously prepared file ready to share.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") setRevision((r) => r + 1);
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  function cancel() {
    operation.current++;
    setMarking(false);
    setCandidate(null);
    setBusy(false);
  }
  function begin() {
    cancel();
    setError("");
    setMessage("");
    setMarking(true);
  }
  async function pick(coordinates: [number, number]) {
    if (!marking) return;
    const id = ++operation.current;
    setBusy(true);
    setCandidate(null);
    setError("");
    try {
      const result = await api<AccessSection>(
        "/access-blocks/resolve",
        post({ coordinates }),
      );
      if (id === operation.current) setCandidate(result);
    } catch (e) {
      if (id === operation.current) setError((e as Error).message);
    } finally {
      if (id === operation.current) setBusy(false);
    }
  }
  async function save(note: string) {
    if (!candidate || busy) return;
    setBusy(true);
    setError("");
    try {
      await api(
        "/access-blocks",
        post({
          edge_id: candidate.edge_id,
          coordinates: candidate.coordinates,
          note,
        }),
      );
      changed.current();
      setRevision((r) => r + 1);
      cancel();
      setMessage(
        "Access block saved for every future ride. Recalculate to apply it to the current route.",
      );
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function reopen(block: AccessBlock) {
    setBusy(true);
    setError("");
    try {
      await api(`/access-blocks/${block.id}`, { method: "DELETE" });
      changed.current();
      setRevision((r) => r + 1);
      setMessage(`${block.road_name} reopened for future searches.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function reset() {
    cancel();
    setBlocks([]);
    setMessage("");
    setError("");
    setRevision((r) => r + 1);
  }
  return {
    blocks,
    marking,
    candidate,
    busy,
    error,
    message,
    begin,
    cancel,
    pick,
    save,
    reopen,
    reset,
    exportProblem: routeId
      ? status?.key === key
        ? status.problem
        : "Checking saved access…"
      : "",
    revision,
  };
}

export default function AccessControls({
  model,
  onBegin,
  onFocus,
  onRecalculate,
  calculating,
}: {
  model: ReturnType<typeof useAccessBlocks>;
  onBegin: () => void;
  onFocus: (coordinates: [number, number]) => void;
  onRecalculate: () => void;
  calculating: boolean;
}) {
  const [note, setNote] = useState("Access controlled");
  return (
    <section className="access-controls" aria-label="Saved access blocks">
      <div className="point-actions">
        <button
          className="outline"
          aria-pressed={model.marking}
          disabled={model.busy}
          onClick={onBegin}
        >
          Mark blocked access
        </button>
        {(model.blocks.length > 0 || model.exportProblem) && (
          <button
            className="outline"
            disabled={calculating || model.busy}
            onClick={onRecalculate}
          >
            Recalculate route
          </button>
        )}
      </div>
      {model.marking && (
        <div className="access-picker">
          <strong>Mark the entrance you couldn’t use</strong>
          <p>
            Zoom in and tap the road at the gate, or use the map centre. Check
            the highlighted section before saving. Stop riding before marking a
            point.
          </p>
          {model.busy && <p role="status">Checking the road section…</p>}
          {model.candidate && (
            <>
              <strong>{model.candidate.road_name}</strong>
              <p>
                {model.candidate.snap_distance_m} m from your point ·{" "}
                {model.candidate.coordinates[1].toFixed(6)},{" "}
                {model.candidate.coordinates[0].toFixed(6)}
              </p>
              <p>
                Only the highlighted section is blocked in both directions. This
                does not mark the whole estate or other entrances.
              </p>
              <label>
                Note
                <input
                  value={note}
                  maxLength={500}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <button
                className="primary"
                disabled={model.busy}
                onClick={() => model.save(note)}
              >
                Save access block
              </button>
            </>
          )}
          <button
            className="outline"
            disabled={model.busy}
            onClick={model.cancel}
          >
            Cancel marking
          </button>
        </div>
      )}
      {model.error && <p role="alert">{model.error}</p>}
      {model.message && <p role="status">{model.message}</p>}
      {model.exportProblem && (
        <p className="access-warning" role="status">
          {model.exportProblem}
        </p>
      )}
      {!!model.blocks.length && (
        <details>
          <summary>
            {model.blocks.length} saved access{" "}
            {model.blocks.length === 1 ? "block" : "blocks"}
          </summary>
          <p>
            Your observations, stored on this computer until reopened or
            deleted. These exclusions apply to every ride.
          </p>
          <ul>
            {model.blocks.map((block) => (
              <li key={block.id}>
                <strong>{block.road_name}</strong>
                <p>{block.note}</p>
                <div className="point-actions">
                  <button
                    className="outline"
                    onClick={() => onFocus(block.coordinates)}
                  >
                    Show entrance
                  </button>
                  <button
                    className="outline"
                    disabled={model.busy}
                    onClick={() => model.reopen(block)}
                  >
                    Reopen section
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
