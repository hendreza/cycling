import { useEffect, useRef, useState } from "react";
import { controlPoints } from "./routeEditing";
import SafetyAssessment from "./SafetyAssessment";
import PrivacyPanel from "./PrivacyPanel";
import AccessControls, { useAccessBlocks } from "./AccessControls";
import PhoneExport from "./PhoneExport";
import { api, post } from "./api";
import { initial } from "./types";
import PlannerSetup from "./PlannerSetup";
import { Logo, ScoreBar, Notice } from "./Brand";
import RideMap from "./RideMap";
import { usePreciseLocation } from "./usePreciseLocation";
import { riderSpeed, movingMinutes } from "./timing";
import {
  type Plan,
  type Route,
  type Place,
  type Report,
  type DataStatus,
  type LocationMatch,
} from "./types";
import { restoreSession, saveSession } from "./persistence";
import {
  RefreshCw,
  ArrowDownToLine,
  ArrowRight,
  Bike,
  Check,
  ChevronRight,
  Compass,
  Flag,
  Leaf,
  Layers,
  MapPin,
  ShieldCheck,
  X,
} from "lucide-react";

const lapKm = (r: Route) =>
  ((r.lap_distance_m ?? (r.lap_distance ?? r.distance) * 1000) / 1000).toFixed(
    2,
  );

export default function App() {
  const [restored] = useState(restoreSession);
  const requestId = useRef(0);
  const variationId = useRef(restored.plan.variation ?? 0);
  const [plan, setPlanState] = useState<Plan>(restored.plan);
  function setPlan(value: Plan | ((p: Plan) => Plan)) {
    requestId.current++;
    setBusy(false);
    setPlanState(value);
  }
  const [hasResult, setHasResult] = useState(restored.hasResult);
  const [storageError, setStorageError] = useState("");
  const [dataStatus, setDataStatus] = useState<DataStatus | null>(null);
  const [pickMode, setPickMode] = useState<"start" | "destination" | null>(
    null,
  );
  const [locationMessage, setLocationMessage] = useState("");
  const initialized = useRef(false);
  async function checkData() {
    try {
      setDataStatus(await api<DataStatus>("/data/status"));
    } catch {
      setError("Could not load road data status.");
    }
  }
  useEffect(() => {
    if (!dataStatus?.updating) return;
    const timer = setInterval(checkData, 3000);
    return () => clearInterval(timer);
  }, [dataStatus?.updating]);
  function avoidRoad(way: number) {
    const next = Array.from(new Set([...plan.avoid_ways, way]));
    setPlan((p) => ({ ...p, avoid_ways: next }));
    try {
      localStorage.setItem("veld-avoided-ways", JSON.stringify(next));
    } catch {
      /* Private browsing can disable storage. */
    }
  }
  const [candidate, setCandidate] = useState<LocationMatch | null>(null);
  const [candidatePoint, setCandidatePoint] = useState<[number, number] | null>(
    null,
  );
  const [resolving, setResolving] = useState(false);
  const resolveId = useRef(0);
  const mapSection = useRef<HTMLDivElement>(null);
  function beginPick(kind: "start" | "destination") {
    stopLocating();
    access.cancel();
    setCandidate(null);
    setCandidatePoint(null);
    setLocationMessage("");
    resolveId.current++;
    setResolving(false);
    setPickMode(kind);
    requestAnimationFrame(() =>
      mapSection.current?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      }),
    );
  }
  function cancelPick() {
    resolveId.current++;
    setPickMode(null);
    setCandidate(null);
    setCandidatePoint(null);
    setResolving(false);
  }
  async function choosePoint(coordinates: [number, number]) {
    if (!pickMode) return;
    const id = ++resolveId.current;
    setCandidatePoint(coordinates);
    setCandidate(null);
    setResolving(true);
    setLocationMessage("");
    const proposed = {
      ...plan,
      [pickMode + "_coordinates"]: coordinates,
      ...(pickMode === "start" ? { start_accuracy_m: null } : {}),
    };
    try {
      const match = await api<LocationMatch>(
        "/locations/resolve",
        post({ plan: proposed, kind: pickMode }),
      );
      if (id === resolveId.current) setCandidate(match);
    } catch (e) {
      if (id === resolveId.current) setLocationMessage((e as Error).message);
    } finally {
      if (id === resolveId.current) setResolving(false);
    }
  }
  function confirmPoint() {
    if (!pickMode || !candidate || resolving) return;
    const next = {
      ...plan,
      [pickMode + "_coordinates"]: candidate.requested_coordinates,
      ...(pickMode === "start" ? { start_accuracy_m: null } : {}),
    };
    setPlan(next);
    setLocationMessage(
      `${pickMode === "start" ? "Start" : "Destination"}: ${candidate.road_name}. Road offset ${candidate.snap_distance_m} m.`,
    );
    cancelPick();
    generate(next);
  }
  const [focusZoom, setFocusZoom] = useState(15);
  const [focusPoint, setFocusPoint] = useState<[number, number] | null>(null);
  const {
    locate,
    stop: stopLocating,
    locating,
  } = usePreciseLocation((coordinates, accuracy) => {
    if (
      coordinates[0] < 28.06 ||
      coordinates[0] > 28.275 ||
      coordinates[1] < -25.985 ||
      coordinates[1] > -25.79
    ) {
      setLocationMessage(
        "Your location is outside this Centurion pilot. Choose a point on the map.",
      );
      return;
    }
    setPlan((p) => ({
      ...p,
      start_coordinates: coordinates,
      start_accuracy_m: accuracy,
    }));
    setFocusZoom(18);
    setFocusPoint(coordinates);
    setPickMode(null);
    setLocationMessage(
      `Start selected (reported accuracy ±${Math.ceil(accuracy)} m). Calculate routes to use this point; the route must start within 20 m of it.`,
    );
  }, setLocationMessage);
  const [usedPlan, setUsedPlan] = useState<Plan>(restored.usedPlan);
  const [areaStats, setAreaStats] = useState<{
    road_count: number;
    tagged_nodes: number;
    eligible_segments: number;
    road_timestamp: string;
  } | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [routes, setRoutes] = useState<Route[]>(restored.routes);
  const [selected, setSelected] = useState(restored.selected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [searchLimits, setSearchLimits] = useState<{
    longest_loop_km: number;
    minimum_laps: number | null;
    max_laps: number;
  } | null>(null);
  const [message, setMessage] = useState(restored.message);
  const [tab, setTab] = useState(restored.tab);
  const [modal, setModal] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (modal) dialogRef.current?.showModal();
  }, [modal]);
  const [reportStatus, setReportStatus] = useState("");
  const [reports, setReports] = useState<Report[]>([]);
  const [adminKey, setAdminKey] = useState("");
  const [adminReports, setAdminReports] = useState<Report[]>([]);
  const [adminMessage, setAdminMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const locationDirty =
    plan.stay_local !== usedPlan.stay_local ||
    plan.coverage !== usedPlan.coverage ||
    plan.radius_km !== usedPlan.radius_km ||
    plan.mode !== usedPlan.mode ||
    plan.start !== usedPlan.start ||
    JSON.stringify(plan.start_coordinates ?? null) !==
      JSON.stringify(usedPlan.start_coordinates ?? null) ||
    (plan.mode === "point" &&
      (plan.destination !== usedPlan.destination ||
        JSON.stringify(plan.destination_coordinates ?? null) !==
          JSON.stringify(usedPlan.destination_coordinates ?? null)));
  const visibleRoutes = locationDirty ? [] : routes;
  const route = visibleRoutes[selected];
  const access = useAccessBlocks(route?.id, () => {
    requestId.current++;
    setBusy(false);
    setEditHistory([]);
  });
  const speed = riderSpeed(plan);
  const dirty =
    JSON.stringify({ ...plan, rider_speed_kmh: null }) !==
    JSON.stringify({ ...usedPlan, rider_speed_kmh: null });
  const update = (key: keyof Plan, value: unknown) =>
    setPlan((p) => {
      const next = { ...p, [key]: value };
      if (next.mode === "point") next.laps = 1;
      else next.laps = Math.min(next.laps, Math.floor(next.distance / 2));
      return next;
    });
  async function generate(p = plan, different = false, preserveEmpty = false) {
    if (!different) p = { ...p, exclude_routes: [] };
    setSafetyChange(null);
    const id = ++requestId.current;
    setBusy(true);
    setError("");
    try {
      const result = await api<{
        routes: Route[];
        message: string;
        limits?: {
          longest_loop_km: number;
          minimum_laps: number | null;
          max_laps: number;
        };
      }>("/routes", post(p));
      if (id !== requestId.current) return;
      setSearchLimits(result.limits ?? null);
      if (preserveEmpty && !result.routes.length) {
        setMessage(
          result.message +
            " Your previous route remains for reference; blocked routes cannot be exported.",
        );
        return;
      }
      if (different && !result.routes.length) {
        setMessage(
          "No different route met these choices. Your current route is still selected. Try a wider area or a different lap limit.",
        );
        return;
      }
      setPlanState(p);
      setEditHistory([]);
      setRoutes(result.routes);
      setSelected(0);
      const applied =
        p.best_fit && p.mode === "loop" && result.routes.length
          ? { ...p, laps: result.routes[0].laps ?? p.laps }
          : p;
      if (applied.laps !== p.laps) setPlan(applied);
      setUsedPlan({ ...applied });
      setMessage(result.message);
      setHasResult(true);
      if (
        window.matchMedia("(max-width: 760px)").matches &&
        result.routes.length
      )
        mapSection.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    } catch (e) {
      if (id === requestId.current)
        setError(e instanceof Error ? e.message : "Route service unavailable.");
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    checkData();
    api<typeof areaStats>("/areas/rooihuiskraal/data")
      .then(setAreaStats)
      .catch(() => {});
    api<Place[]>("/places")
      .then(setPlaces)
      .catch(() =>
        setError("Cannot connect to the API. Start the backend on port 8000."),
      );
    if (!restored.saved) generate(restored.plan);
  }, []);
  useEffect(() => {
    const saved = saveSession({
      version: 1,
      plan,
      usedPlan,
      routes,
      selected,
      message,
      tab,
      hasResult,
    });
    setStorageError(
      saved
        ? ""
        : "This browser could not save your ride. Refresh may lose it; enable browser storage or export your GPX.",
    );
  }, [plan, usedPlan, routes, selected, message, tab, hasResult]);
  useEffect(() => {
    if (tab === "community")
      api<Report[]>("/reports")
        .then(setReports)
        .catch(() => setError("Could not load community reports."));
  }, [tab]);
  async function download(format = "gpx", laps = "all") {
    if (access.exportProblem || busy) return;
    setExporting(true);
    setError("");
    try {
      const res = await fetch(
        `/api/routes/${route.id}/gpx?format=${format}&laps=${laps}&speed_kmh=${speed}`,
      );
      if (!res.ok) {
        const failure = await res.json().catch(() => ({}));
        throw new Error(
          failure.detail || "GPX export failed. Please try again.",
        );
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `verge-centurion-${route.id.slice(0, 8)}${format === "osmand" ? "-android-" + laps : ""}.gpx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  const [editing, setEditing] = useState(false);
  const [safetyChange, setSafetyChange] = useState<{
    from: number;
    to: number;
  } | null>(null);
  const [editHistory, setEditHistory] = useState<
    { plan: Plan; routes: Route[]; selected: number; message: string }[]
  >([]);
  async function editRoute(next: Plan) {
    if (!route || busy || dirty) return;
    const id = ++requestId.current;
    const previous = { plan: usedPlan, routes, selected, message };
    setBusy(true);
    setError("");
    try {
      const result = await api<{ routes: Route[]; message: string }>(
        "/routes",
        post(next),
      );
      if (id !== requestId.current) return;
      if (!result.routes.length) throw new Error(result.message);
      setEditHistory((h) => [...h.slice(-19), previous]);
      setSafetyChange(
        route.safety && result.routes[0].safety
          ? { from: route.safety.score, to: result.routes[0].safety.score }
          : null,
      );
      const applied = { ...next, laps: result.routes[0].laps ?? next.laps };
      setPlan(applied);
      setUsedPlan(applied);
      setRoutes(result.routes);
      setSelected(0);
      setMessage(result.message);
    } catch (e) {
      if (id === requestId.current)
        setError(
          `${(e as Error).message} Your previous route is still selected.`,
        );
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }
  function dragRoute(index: number, coordinates: [number, number]) {
    if (!route) return;
    const controls = controlPoints(route);
    const existing = controls.find((c) => c.index === index);
    if (existing) existing.point = coordinates;
    else controls.push({ index, point: coordinates });
    if (controls.length > 12) {
      setError(
        "Use up to 12 route editing points. Clear points to start again.",
      );
      return;
    }
    editRoute({
      ...plan,
      via_points: controls
        .sort((a, b) => a.index - b.index)
        .map((c) => c.point),
    });
  }
  function avoidMapRoad(way: number) {
    if (!route) return;
    editRoute({
      ...plan,
      via_points: plan.via_points,
      avoid_ways: [...new Set([...plan.avoid_ways, way])],
    });
  }
  function undoEdit() {
    const previous = editHistory.at(-1);
    if (!previous || busy) return;
    setPlan(previous.plan);
    setUsedPlan(previous.plan);
    setRoutes(previous.routes);
    setSelected(previous.selected);
    setMessage(previous.message);
    setError("");
    setSafetyChange(null);
    setEditHistory((h) => h.slice(0, -1));
  }
  async function loadQueue() {
    try {
      setAdminReports(
        await api<Report[]>("/admin/reports", {
          headers: { "X-Admin-Key": adminKey },
        }),
      );
      setAdminMessage("Queue loaded.");
    } catch (e) {
      setAdminMessage((e as Error).message);
    }
  }
  return (
    <>
      <header className="header">
        <button
          className="brand"
          onClick={() => setTab("planner")}
          aria-label="Verge route planner"
        >
          <Logo />
        </button>
        <nav aria-label="Main navigation">
          {[
            ["planner", "Route planner"],
            ["community", "Road reports"],
            ["about", "Data & privacy"],
          ].map(([id, label]) => (
            <button
              className={tab === id ? "nav-active" : ""}
              key={id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="header-location">
          <MapPin size={15} /> Centurion{" "}
          <span className="pilot-tag">PILOT</span>
        </div>
      </header>
      <main>
        <div className="intro">
          <div>
            <h1>Centurion cycling routes</h1>
            <p>
              Choose a start, compare the roads, and take your route with you.
            </p>
          </div>
        </div>
        {tab === "planner" && route && (
          <button
            className="outline mobile-route-jump"
            onClick={() =>
              mapSection.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              })
            }
          >
            <Compass size={16} />
            View selected route · {route.distance} km
          </button>
        )}
        {storageError && (
          <div className="error" role="status">
            {storageError}
          </div>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {tab === "planner" ? (
          <div className="workspace">
            <PlannerSetup
              plan={plan}
              places={places}
              busy={busy}
              picking={!!pickMode}
              locating={locating}
              onPlan={setPlan}
              onPick={beginPick}
              onCalculate={() => generate()}
              onLocate={
                locating
                  ? () => {
                      stopLocating();
                      setLocationMessage(
                        "Location search cancelled. Choose your start on the map.",
                      );
                    }
                  : locate
              }
              onArea={(start) => {
                stopLocating();
                cancelPick();
                access.cancel();
                setLocationMessage("");
                setFocusZoom(15);
                setFocusPoint(
                  places.find((p) => p.id === start)?.coordinates ?? null,
                );
                setPlan((p) => ({
                  ...p,
                  start,
                  start_coordinates: null,
                  via_points: [],
                  start_accuracy_m: null,
                }));
              }}
            />
            <section className="results">
              {locationDirty && !pickMode && (
                <div className="pick-message">
                  Start changed to{" "}
                  {places.find((p) => p.id === plan.start)?.name || plan.start}.
                  Choose the exact start or calculate a route from the area
                  anchor.
                </div>
              )}
              <div ref={mapSection}>
                <RideMap
                  routes={visibleRoutes}
                  selected={selected}
                  places={places}
                  start={plan.start}
                  startCoordinates={plan.start_coordinates}
                  boundaryVersion={dataStatus?.access_timestamp}
                  onPick={access.marking ? access.pick : choosePoint}
                  pickMode={access.marking ? "access" : pickMode}
                  accessBlocks={access.blocks}
                  accessCandidate={access.candidate}
                  draftStart={plan.start_coordinates}
                  draftDestination={
                    plan.mode === "point" ? plan.destination_coordinates : null
                  }
                  focusPoint={focusPoint}
                  focusZoom={focusZoom}
                  onFocusHandled={() => setFocusPoint(null)}
                  candidatePoint={candidate?.coordinates ?? candidatePoint}
                  stayLocal={plan.stay_local}
                  radiusKm={plan.radius_km}
                  coverage={plan.coverage}
                  loop={plan.mode === "loop"}
                  editing={
                    editing && !pickMode && !access.marking && !dirty && !busy
                  }
                  onDragRoute={dragRoute}
                  onAvoidRoad={avoidMapRoad}
                />
                <AccessControls
                  model={access}
                  calculating={busy}
                  onBegin={() => {
                    stopLocating();
                    cancelPick();
                    setEditing(false);
                    access.begin();
                  }}
                  onFocus={(point) => {
                    setFocusPoint(point);
                    setFocusZoom(18);
                  }}
                  onRecalculate={() => generate(plan, false, true)}
                />
                {route && !pickMode && !access.marking && (
                  <div className="route-edit-panel">
                    <div className="point-actions">
                      <button
                        className="outline"
                        aria-pressed={editing}
                        disabled={busy || dirty}
                        onClick={() => setEditing((e) => !e)}
                      >
                        {editing ? "Finish editing" : "Edit route on map"}
                      </button>
                      <button
                        className="outline"
                        disabled={busy || !editHistory.length || dirty}
                        onClick={undoEdit}
                      >
                        Undo edit
                      </button>
                      {!!plan.via_points.length && (
                        <button
                          className="outline"
                          disabled={busy || dirty}
                          onClick={() => editRoute({ ...plan, via_points: [] })}
                        >
                          Clear editing points
                        </button>
                      )}
                    </div>
                    {editing && (
                      <p>
                        Drag a numbered point onto a road. Click the route to
                        add a point or avoid that road. Each change recalculates
                        within your area and access limits; the distance can
                        change.
                      </p>
                    )}
                    {busy && editing && (
                      <p role="status">Recalculating the edited route…</p>
                    )}
                  </div>
                )}
                {pickMode && (
                  <div
                    className="location-picker"
                    aria-label="Choose route location"
                  >
                    <div>
                      <strong>Choose {pickMode}</strong>
                      <p>
                        Tap a road on the map, or pan the map and use its
                        centre. Confirm the road below.
                      </p>
                    </div>
                    {resolving && (
                      <p role="status">
                        Checking road access and start offset…
                      </p>
                    )}
                    {candidate && (
                      <div className="location-match" role="status">
                        <strong>{candidate.road_name}</strong>
                        <span>
                          {candidate.coordinates[1].toFixed(6)},{" "}
                          {candidate.coordinates[0].toFixed(6)} ·{" "}
                          {candidate.snap_distance_m} m from your point
                        </span>
                      </div>
                    )}
                    {locationMessage && <p role="alert">{locationMessage}</p>}
                    <div className="point-actions">
                      <button
                        className="primary"
                        disabled={!candidate || resolving}
                        onClick={confirmPoint}
                      >
                        Use this {pickMode}
                      </button>
                      <button className="outline" onClick={cancelPick}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {!pickMode && locationMessage && (
                <div className="pick-message" role="status">
                  {locationMessage}
                </div>
              )}
              <div className="results-heading">
                <div>
                  <h2>
                    {busy
                      ? "Calculating routes…"
                      : `${visibleRoutes.length} ${visibleRoutes.length === 1 ? "route" : "routes"}`}
                  </h2>
                  <span className="muted small">
                    {usedPlan.mode === "loop"
                      ? "Round trips"
                      : "Point to point"}{" "}
                    · {usedPlan.profile.toUpperCase()} · Centurion{" "}
                    {dirty ? "· Update routes to apply your changes" : ""}
                  </span>
                </div>
                <button
                  className="outline refresh-routes"
                  disabled={
                    busy ||
                    dirty ||
                    !route ||
                    !!pickMode ||
                    !!plan.via_points.length
                  }
                  title={
                    plan.via_points.length
                      ? "Clear editing points to search for a different ride"
                      : "Find different roads with the same ride setup"
                  }
                  onClick={() =>
                    generate(
                      {
                        ...plan,
                        variation: (variationId.current =
                          (variationId.current + 1) % 2147483647),
                        exclude_routes: [
                          ...new Set([
                            ...(plan.exclude_routes ?? []),
                            ...routes
                              .map((r) => r.fingerprint)
                              .filter((x): x is string => !!x),
                          ]),
                        ].slice(-60),
                      },
                      true,
                    )
                  }
                >
                  <RefreshCw size={17} />
                  Refresh routes
                </button>
              </div>
              <details className="pace-panel">
                <summary>Time estimate · {speed} km/h average</summary>
                <label className="distance-label" htmlFor="rider-speed">
                  Average riding speed{" "}
                  <strong>
                    {speed} <span>km/h</span>
                  </strong>
                </label>
                <input
                  id="rider-speed"
                  type="range"
                  min="8"
                  max="40"
                  step="0.5"
                  value={speed}
                  onChange={(e) =>
                    update("rider_speed_kmh", Number(e.target.value))
                  }
                />
                <div className="range-labels">
                  <span>Easy · 8 km/h</span>
                  <span>Fast · 40 km/h</span>
                </div>
                <p>
                  Slide to update ride times immediately. Estimates use distance
                  and your average moving speed. Hills, stops, surface effects
                  and training history are not included yet.
                </p>
              </details>
              {!visibleRoutes.length && !busy && !pickMode && (
                <div className="empty">
                  <Compass size={32} />
                  <h3>No matching route yet</h3>
                  <p>{message}</p>
                  {searchLimits && searchLimits.longest_loop_km > 0 && (
                    <p>
                      Longest loop found:{" "}
                      <strong>{searchLimits.longest_loop_km} km</strong>. Try
                      more laps or a wider area.
                    </p>
                  )}
                </div>
              )}
              {message.startsWith("No different route") && (
                <p className="search-message" role="status">
                  {message}
                </p>
              )}
              <div className="route-cards">
                {visibleRoutes.map((r, i) => (
                  <button
                    key={r.id}
                    className={`route-card ${selected === i ? "selected" : ""}`}
                    disabled={busy}
                    onClick={() => {
                      setSelected(i);
                      setSafetyChange(null);
                      if (!dirty && plan.best_fit && r.laps) {
                        setPlan({ ...plan, laps: r.laps });
                        setUsedPlan({ ...usedPlan, laps: r.laps });
                      }
                    }}
                    aria-pressed={selected === i}
                  >
                    <div className="card-top">
                      <span className="option-label">OPTION 0{i + 1}</span>
                      {i === 0 ? (
                        <span className="recommended">
                          <Leaf size={11} />{" "}
                          {r.selection ? "Best match" : "First option"}
                        </span>
                      ) : (
                        <span className="selection-dot">
                          {selected === i && <Check size={10} />}
                        </span>
                      )}
                    </div>
                    <h3>{r.name}</h3>
                    <div className="stats">
                      <div>
                        <strong>
                          {r.distance}
                          <small> km</small>
                        </strong>
                        <span>
                          {(r.laps ?? 1) > 1 ? "total distance" : "distance"}
                        </span>
                      </div>
                      <div>
                        <strong>
                          {(r.laps ?? 1) > 1
                            ? lapKm(r)
                            : (r.locality?.max_distance_from_start_km.toFixed(
                                1,
                              ) ?? "—")}
                          <small> km</small>
                        </strong>
                        <span>
                          {(r.laps ?? 1) > 1
                            ? "per lap"
                            : "farthest from start"}
                        </span>
                      </div>
                      <div>
                        <strong>
                          {movingMinutes(r, speed)}
                          <small> min</small>
                        </strong>
                        <span>est. moving time</span>
                      </div>
                    </div>
                    {(r.laps ?? 1) > 1 && (
                      <div className="lap-summary">
                        {r.laps} laps × approx. {lapKm(r)} km per lap
                      </div>
                    )}
                    {r.requested_distance != null && (
                      <p className="distance-fit">
                        {r.requested_distance} km requested ·{" "}
                        {r.distance_difference_km! >= 0 ? "+" : ""}
                        {r.distance_difference_km?.toFixed(1)} km difference
                      </p>
                    )}
                    <div className="surface-bar">
                      {Object.entries(r.surface).map(([s, value]) => (
                        <span
                          key={s}
                          className={s}
                          style={{ width: value + "%" }}
                        />
                      ))}
                    </div>
                    <div className="surface-text">
                      {Object.entries(r.surface)
                        .filter(([, v]) => v > 0)
                        .map(([s, v]) => `${v}% ${s}`)
                        .join(" · ")}
                    </div>
                    {r.safety && (
                      <div className="card-safety">
                        <ScoreBar
                          score={r.safety.score}
                          confidence="low"
                          compact
                        />
                        <span>Mapped-road score</span>
                        <small>
                          {r.safety.major_junctions_per_lap} major-road
                          junctions per lap
                        </small>
                      </div>
                    )}
                    {!!r.local_areas?.length && (
                      <div className="route-areas">
                        {r.local_areas.map((a) => a.name).join(" → ")}
                      </div>
                    )}
                    {r.selection && (
                      <p className="fit-explanation">
                        {i === 0
                          ? "First by mapped-road score, then lap count."
                          : "Different roads. Compare the loop, junctions and score."}
                      </p>
                    )}
                    <div className="score-row">
                      <span>
                        {r.locality?.name ||
                          "Previous route · recalculate for local limits"}
                      </span>
                    </div>
                    {r.locality && (
                      <div className="surface-text">
                        Farthest point:{" "}
                        {r.locality.max_distance_from_start_km.toFixed(2)} km
                        from start · {r.major_road_junctions?.length ?? 0}{" "}
                        major-road junctions
                      </div>
                    )}
                  </button>
                ))}
              </div>
              {route && (
                <section className="route-detail">
                  <Notice
                    title={
                      route.major_road_junctions?.length
                        ? `${route.major_road_junctions.length} major-road ${route.major_road_junctions.length === 1 ? "junction" : "junctions"} to review`
                        : "Check the road before riding"
                    }
                    source={`OpenStreetMap · ${route.data_timestamp.slice(0, 10)} · Not field verified`}
                  >
                    {route.major_road_junctions?.length
                      ? Array.from(
                          new Set(
                            route.major_road_junctions.flatMap((j) => j.names),
                          ),
                        ).join(", ")
                      : "Mapped restrictions are excluded. Traffic, closures and physical access can change."}
                  </Notice>
                  <SafetyAssessment
                    route={route}
                    updating={busy}
                    dirty={dirty}
                    change={safetyChange}
                  />
                  <div className="detail-heading">
                    <div>
                      <div className="eyebrow">ROUTE DETAILS</div>
                      <h2>Roads, access and location</h2>
                    </div>
                    <button
                      className="outline"
                      onClick={() => download()}
                      disabled={exporting || busy || !!access.exportProblem}
                    >
                      <ArrowDownToLine size={16} />
                      {exporting ? "Exporting…" : "Export GPX"}
                    </button>
                  </div>
                  {(route.laps ?? 1) > 1 && (
                    <p className="lap-detail">
                      Ride this approximately {lapKm(route)} km loop{" "}
                      {route.laps} times for {route.distance} km total. The map
                      shows one lap; the GPX includes all {route.laps} laps as
                      separate track segments.
                    </p>
                  )}
                  <PhoneExport
                    key={route.id}
                    route={route}
                    speed={speed}
                    revision={access.revision}
                    disabled={!!access.exportProblem || busy}
                  />
                  {route.navigation?.physical_uturns_per_lap === 0 && (
                    <p className="route-flow-note">
                      No mapped U-turns, including the lap join. Turnarounds
                      follow connected roads.
                    </p>
                  )}
                  {!!route.sections?.length && (
                    <details className="turn-list route-sections">
                      <summary>Ride sections · roads and mapped score</summary>
                      <p>
                        Suburb names describe where you ride. Road connections
                        determine where a local loop can go.
                      </p>
                      <ol>
                        {route.sections.map((section, i) => (
                          <li key={i}>
                            <button
                              className="section-focus"
                              onClick={() => {
                                setFocusZoom(17);
                                setFocusPoint(route.coordinates[section.index]);
                                mapSection.current?.scrollIntoView({
                                  block: "center",
                                  behavior: "smooth",
                                });
                              }}
                            >
                              {section.name}
                            </button>{" "}
                            · {(section.distance_m / 1000).toFixed(2)} km ·{" "}
                            <ScoreBar
                              score={section.score}
                              confidence="low"
                              compact
                            />{" "}
                            <small>
                              {section.concerns.join(" · ") ||
                                "No deductions in mapped fields"}
                            </small>
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                  {route.navigation && (
                    <details className="turn-list">
                      <summary>Turns · one lap</summary>
                      <ol>
                        {route.navigation.cues.map((c, i) => (
                          <li key={i}>
                            <span>{(c.distance_m / 1000).toFixed(2)} km</span>{" "}
                            {c.instruction}
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                  <div className="detail-grid">
                    <div>
                      <h4>
                        <ShieldCheck size={17} /> Mapped road data
                      </h4>
                      <ul>
                        {route.explanations.slice(0, 3).map((e) => (
                          <li key={e}>{e}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4>
                        <Flag size={17} /> Checks before riding
                      </h4>
                      <p>
                        Start: {route.start_road || "saved road position"}.{" "}
                        {route.coordinates[0][1].toFixed(6)},{" "}
                        {route.coordinates[0][0].toFixed(6)}
                      </p>
                      {route.locality && (
                        <p>
                          {route.locality.name} · maximum{" "}
                          {route.locality.max_distance_from_start_km.toFixed(2)}{" "}
                          km from start.
                        </p>
                      )}
                      {!!route.major_road_junctions?.length && (
                        <p>
                          Review {route.major_road_junctions.length} junctions
                          with major roads:{" "}
                          {Array.from(
                            new Set(
                              route.major_road_junctions.flatMap(
                                (j) => j.names,
                              ),
                            ),
                          ).join(", ")}
                          .
                        </p>
                      )}
                      <p>
                        {route.major_road_percent}% primary / secondary roads.
                        Live traffic unknown.
                      </p>
                      <p>
                        Start snapped {route.snap_start_m} m to a mapped road
                        position
                        {usedPlan.mode === "point"
                          ? `; destination ${route.snap_end_m} m`
                          : ""}
                        . The GPX begins at that road position.
                        {route.snap_start_m > 20 || route.snap_end_m > 20
                          ? " This saved route predates the 20 m limit. Calculate routes again to use a precise start."
                          : " Start and finish offsets are within the 20 m limit."}
                      </p>
                      <p>
                        OSM snapshot: {route.data_timestamp.slice(0, 10)}.
                        Geometry follows roads; surface and access may be
                        incomplete.
                      </p>
                      <button
                        className="text-button"
                        onClick={() => {
                          setReportStatus("");
                          setModal(true);
                        }}
                      >
                        Add a community report <ChevronRight size={15} />
                      </button>
                    </div>
                  </div>
                  <details className="road-list">
                    <summary>
                      Inspect roads &amp; avoid a section ({route.roads.length})
                    </summary>
                    <p className="small muted">
                      Exclusions stay in this browser and apply when you find
                      routes again. OSM links let you inspect the original tags.
                      {(route.laps ?? 1) > 1 &&
                        " Road distances below are for one lap."}
                    </p>
                    {route.roads.map((road) => (
                      <article key={road.way_id}>
                        <div>
                          <a href={road.url} target="_blank" rel="noreferrer">
                            {road.name} ↗
                          </a>
                          <span>
                            {road.distance} km · {road.highway} · surface:{" "}
                            {road.surface}
                            {road.maxspeed
                              ? ` · ${road.maxspeed} km/h limit`
                              : " · speed limit unknown"}
                          </span>
                          <span>
                            Access: {road.access}; bicycle: {road.bicycle}
                          </span>
                        </div>
                        <button
                          className="outline"
                          disabled={plan.avoid_ways.includes(road.way_id)}
                          onClick={() => avoidRoad(road.way_id)}
                        >
                          {plan.avoid_ways.includes(road.way_id)
                            ? "Avoided"
                            : "Avoid this road"}
                        </button>
                      </article>
                    ))}
                  </details>
                </section>
              )}
            </section>
          </div>
        ) : tab === "community" ? (
          <section className="content-panel">
            <div className="eyebrow">ROAD REPORTS</div>
            <h2>Reported road conditions</h2>
            <p>
              Share a surface issue, access change or positive observation on a
              mapped road. Reports are stored locally and reviewed before
              appearing here. For your own rides, “Avoid this road” excludes a
              road immediately after replanning.
            </p>
            <button
              className="primary"
              disabled={!route}
              onClick={() => {
                setReportStatus("");
                setModal(true);
              }}
            >
              Add a road report <Flag size={17} />
            </button>
            <h3>Reviewed reports</h3>
            {reports.length ? (
              reports.map((r) => (
                <article className="report-item" key={r.id}>
                  <span className="eyebrow">
                    {r.category.replaceAll("-", " ")} · {r.segment_id}
                  </span>
                  <p>{r.detail}</p>
                </article>
              ))
            ) : (
              <div className="empty">No approved reports yet.</div>
            )}
            <details className="admin">
              <summary>Local administrator</summary>
              <p className="small muted">
                Set ADMIN_KEY on the backend to enable moderation. Key stays in
                this page’s memory.
              </p>
              <label htmlFor="admin-key">Administrator key</label>
              <input
                id="admin-key"
                type="password"
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
              />
              <button className="outline" onClick={loadQueue}>
                Load moderation queue
              </button>
              <p role="status">{adminMessage}</p>
              {adminReports.map((r) => (
                <div className="report-item" key={r.id}>
                  <strong>
                    #{r.id} · {r.category} · {r.status}
                  </strong>
                  <p>{r.detail}</p>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const data = new FormData(e.currentTarget);
                      try {
                        await api("/admin/reports/" + r.id, {
                          ...post({
                            status: data.get("status"),
                            reason: data.get("reason"),
                          }),
                          headers: {
                            "Content-Type": "application/json",
                            "X-Admin-Key": adminKey,
                          },
                        });
                        await loadQueue();
                        setReports(await api<Report[]>("/reports"));
                      } catch (err) {
                        setAdminMessage((err as Error).message);
                      }
                    }}
                  >
                    <input
                      aria-label={`Moderation reason for report ${r.id}`}
                      name="reason"
                      required
                      minLength={5}
                      placeholder="Reason for this decision"
                    />
                    <select
                      aria-label={`Decision for report ${r.id}`}
                      name="status"
                    >
                      <option value="approved">Approve</option>
                      <option value="rejected">Reject</option>
                    </select>
                    <button className="outline">Save decision</button>
                  </form>
                </div>
              ))}
            </details>
          </section>
        ) : (
          <section className="content-panel about">
            <h2>Data & privacy</h2>
            <PrivacyPanel
              onDeleted={() => {
                stopLocating();
                cancelPick();
                access.reset();
                setFocusPoint(null);
                setLocationMessage("");
                setAdminKey("");
                setModal(false);
                requestId.current++;
                setBusy(false);
                setPlanState({ ...initial, avoid_ways: [] });
                setUsedPlan({ ...initial, avoid_ways: [] });
                setRoutes([]);
                setSelected(0);
                setHasResult(true);
                setEditHistory([]);
                setSafetyChange(null);
                setReports([]);
                setAdminReports([]);
                setMessage("");
                setError("");
              }}
            />
            <details className="data-details">
              <summary>Road data, downloads & route limits</summary>
              <div className="data-status">
                <span>
                  {dataStatus?.available
                    ? `OSM road data · ${dataStatus.timestamp?.slice(0, 10)} · ${dataStatus.ways?.toLocaleString()} mapped ways · ${dataStatus.excluded_estates ?? 0} estate exclusions${dataStatus.access_timestamp ? ` (boundary map ${dataStatus.access_timestamp.slice(0, 10)})` : ""}`
                    : "Road data has not been downloaded yet."}
                </span>
                <button
                  className="text-button"
                  disabled={dataStatus?.updating}
                  onClick={async () => {
                    try {
                      await api("/data/refresh", post({}));
                      setDataStatus((d) => ({
                        ...d,
                        available: d?.available ?? false,
                        error: null,
                        updating: true,
                      }));
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  {dataStatus?.updating
                    ? "Downloading roads…"
                    : "Download / refresh roads"}
                </button>
                {dataStatus?.error && (
                  <span role="alert">{dataStatus.error}</span>
                )}
              </div>

              <p>
                Routes use a downloaded OpenStreetMap road network. Local routes
                follow connected roads across suburb boundaries, stopping at
                major-road junctions. Mapped bridges and underpasses can connect
                roads on opposite sides. Suburb names describe the ride; they do
                not cut it into separate areas.
              </p>
              <div className="principles">
                <article>
                  <ShieldCheck />
                  <h3>Road access</h3>
                  <p>
                    Mapped private and prohibited access, unresolved gates and
                    roads under construction are excluded. Missing access tags
                    on ordinary roads are treated as an inference, not
                    independent verification.
                  </p>
                </article>
                <article>
                  <Bike />
                  <h3>Bike profiles</h3>
                  <p>
                    Road profiles exclude known unpaved surfaces. Gravel allows
                    suitable unpaved roads. MTB only adds access-eligible trails
                    with compatible mapped difficulty.
                  </p>
                </article>
                <article>
                  <Layers />
                  <h3>Missing data</h3>
                  <p>
                    The mapped-road score is a published heuristic. Its
                    deductions are shown for every route. Live traffic, security
                    conditions and field checks are unknown.
                  </p>
                </article>
              </div>
              <div className="area-download">
                <h3>Rooihuiskraal field data</h3>
                <p>
                  Download the municipal boundary, detailed road geometry and
                  tags, mapped gates and signals, excluded estates, and a
                  worksheet for your test rides.
                </p>
                {areaStats && (
                  <p>
                    {areaStats.road_count} mapped roads ·{" "}
                    {areaStats.tagged_nodes} tagged points ·{" "}
                    {areaStats.eligible_segments} road segments pass the default
                    local filters. Road data:{" "}
                    {new Date(areaStats.road_timestamp).toLocaleDateString()}.
                  </p>
                )}
                <p>
                  Includes Rooihuiskraal’s registered township extensions.
                  Rooihuiskraal Noord is separate. These are map records, not a
                  field survey.
                </p>
                <p>
                  <a
                    href="https://e-gis003.tshwane.gov.za/server/rest/services/Other_WS/Land_Boundaries/MapServer/1"
                    target="_blank"
                    rel="noreferrer"
                  >
                    City of Tshwane boundary source
                  </a>{" "}
                  · Boundary download:{" "}
                  {places.find((p) => p.id === "rooihuiskraal")?.area
                    ?.downloaded_at
                    ? new Date(
                        places.find((p) => p.id === "rooihuiskraal")!.area!
                          .downloaded_at,
                      ).toLocaleDateString()
                    : "unavailable"}
                  . Survey date is not supplied.
                </p>
                <a
                  className="outline"
                  href="/api/areas/rooihuiskraal/download"
                  download
                >
                  Download Rooihuiskraal data · ZIP
                </a>
                <p>
                  For an offline Android basemap, download the map in OsmAnd.
                  This ZIP is for detailed inspection and recording your
                  observations.
                </p>
              </div>

              <h3>What this pilot can do</h3>
              <p>
                Generate loops and point-to-point rides on actual OSM road
                geometry. Planning happens locally. Mapped private access,
                unresolved gates, motorways, cycling prohibitions and turn
                restrictions are filtered. You can choose your own map points
                and exclude roads you know you want to avoid.
              </p>
              <h3>What to check before your first ride</h3>
              <p>
                Inspect the route and its start point. Ordinary road access is
                inferred where OSM has no explicit access tag; estate boundaries
                and gates may be missing. Surface tags can be incomplete. There
                is no live traffic, verified safety score or emergency
                assistance. Android guidance uses the downloaded OsmAnd route.
                Roundabout exit numbers are not supplied; check the highlighted
                track.
              </p>
              <p>
                Routes and your selected coordinates stay on this computer. The
                map background is requested from OpenStreetMap or Esri;
                downloads fetch the same Centurion rectangle for everyone.
                Refresh road data periodically and after known changes.
              </p>
            </details>
          </section>
        )}
        <footer>
          <Logo variant="wordmark" />
          <button className="text-button" onClick={() => setTab("about")}>
            Privacy, terms & release checklist
          </button>
          <span>Private preview · Public-release work remains open</span>
        </footer>
      </main>
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(false);
          }}
        >
          <dialog
            ref={dialogRef}
            aria-labelledby="report-title"
            onCancel={() => setModal(false)}
          >
            <button
              className="close"
              aria-label="Close report"
              onClick={() => setModal(false)}
            >
              <X size={20} />
            </button>
            <div className="eyebrow">ADD YOUR LOCAL KNOWLEDGE</div>
            <h2 id="report-title">Leave a road report</h2>
            <p className="muted small">
              Your report is stored on this computer. Avoid names, personal
              details and precise location histories.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                try {
                  const result = await api<{ message: string }>(
                    "/reports",
                    post({
                      segment_id: data.get("segment"),
                      category: data.get("category"),
                      detail: data.get("detail"),
                    }),
                  );
                  setReportStatus(result.message);
                } catch (err) {
                  setReportStatus((err as Error).message);
                }
              }}
            >
              <label className="field-title" htmlFor="segment">
                OSM road
              </label>
              <select id="segment" name="segment">
                {Array.from(new Set(route?.segment_ids)).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <label className="field-title" htmlFor="category">
                What did you notice?
              </label>
              <select name="category" id="category">
                {[
                  "dangerous-traffic",
                  "potholes",
                  "closure",
                  "access-change",
                  "dogs",
                  "harassment",
                  "security-concern",
                  "poor-maintenance",
                  "good-surface",
                  "low-traffic",
                  "good-signage",
                  "confirmed-open",
                ].map((c) => (
                  <option key={c} value={c}>
                    {c.replaceAll("-", " ")}
                  </option>
                ))}
              </select>
              <label className="field-title" htmlFor="detail">
                What did you observe?
              </label>
              <textarea
                autoFocus
                required
                minLength={10}
                maxLength={1000}
                name="detail"
                id="detail"
                placeholder="Describe your observation (at least 10 characters)…"
              />
              <button className="primary">
                Submit for moderation <ArrowRight size={16} />
              </button>
              <p role="status">{reportStatus}</p>
            </form>
          </dialog>
        </div>
      )}
    </>
  );
}
