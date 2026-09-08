import { useEffect, useRef, useState } from "react";
import {
  MAX_RIDE_DISTANCE_KM,
  MAX_LAPS,
  MIN_LAP_DISTANCE_KM,
} from "./planningLimits";
import { controlPoints } from "./routeEditing";
import SafetyAssessment from "./SafetyAssessment";
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
  ArrowDownToLine,
  ArrowRight,
  Bike,
  Check,
  ChevronRight,
  CircleHelp,
  Compass,
  Flag,
  Leaf,
  Layers,
  MapPin,
  Mountain,
  Route as RouteIcon,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch("/api" + path, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      typeof body.detail === "string"
        ? body.detail
        : "Please check your selections and try again.",
    );
  }
  return response.json();
}
const post = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export default function App() {
  const [restored] = useState(restoreSession);
  const requestId = useRef(0);
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
  function trainingDistance(distance: number) {
    const currentLap =
      !dirty && route
        ? route.lap_distance_m
          ? route.lap_distance_m / 1000
          : (route.lap_distance ?? route.distance / (route.laps ?? 1))
        : plan.distance / plan.laps;
    const laps = Math.min(
      MAX_LAPS,
      Math.floor(distance / MIN_LAP_DISTANCE_KM),
      Math.max(1, Math.ceil(distance / currentLap)),
    );
    setPlan({ ...plan, distance, laps });
  }
  function enteredDistance(input: HTMLInputElement) {
    const number = Number(input.value);
    const distance =
      input.value.trim() && Number.isFinite(number)
        ? Math.max(5, Math.min(MAX_RIDE_DISTANCE_KM, Math.round(number)))
        : plan.distance;
    input.value = String(distance);
    if (distance !== plan.distance) update("distance", distance);
  }
  async function generate(p = plan) {
    setSafetyChange(null);
    const id = ++requestId.current;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ routes: Route[]; message: string }>(
        "/routes",
        post(p),
      );
      if (id !== requestId.current) return;
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
      a.download = `veld-centurion-${route.id.slice(0, 8)}${format === "osmand" ? "-android-" + laps : ""}.gpx`;
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
        <a href="#" className="brand" onClick={() => setTab("planner")}>
          <span className="brand-icon">
            <RouteIcon size={24} />
          </span>
          veld<span className="brand-period">.</span>
        </a>
        <nav aria-label="Main navigation">
          {[
            ["planner", "Route planner"],
            ["community", "Community"],
            ["about", "Data & limits"],
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
            <p>Choose a start, check the roads, and download a ride.</p>
          </div>
        </div>
        <div className="demo-banner live-banner">
          <CircleHelp size={17} />
          <span>
            Mapped gates and restricted roads are excluded. Unmapped closures,
            traffic and road conditions still need checking.
          </span>
        </div>
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
          {dataStatus?.error && <span role="alert">{dataStatus.error}</span>}
        </div>
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
            <aside className="planner">
              <div className="panel-title">
                <h2>Route setup</h2>
                <SlidersHorizontal size={18} />
              </div>
              <p className="muted small">Start and route limits</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  generate();
                }}
              >
                <label className="field-title">Bike type</label>
                <div className="profile-options">
                  {[
                    ["road", "Road", Bike],
                    ["gravel", "Gravel", RouteIcon],
                    ["mtb", "MTB", Mountain],
                  ].map(([id, label, Icon]) => (
                    <button
                      key={String(id)}
                      type="button"
                      aria-pressed={plan.profile === id}
                      className={
                        plan.profile === id ? "profile active" : "profile"
                      }
                      onClick={() => update("profile", id)}
                    >
                      <Icon size={24} />
                      {String(label)}
                    </button>
                  ))}
                </div>
                <label className="field-title">Route type</label>
                <div className="segmented">
                  {[
                    ["loop", "Round trip"],
                    ["point", "Point to point"],
                  ].map(([id, label]) => (
                    <button
                      type="button"
                      key={id}
                      onClick={() => update("mode", id)}
                      className={plan.mode === id ? "active" : ""}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="field-title" htmlFor="start">
                  Starting area
                </label>
                <div className="location-select">
                  <MapPin size={17} />
                  <select
                    id="start"
                    value={plan.start}
                    onChange={(e) => {
                      stopLocating();
                      cancelPick();
                      setLocationMessage("");
                      setFocusZoom(15);
                      setFocusPoint(
                        places.find((p) => p.id === e.target.value)
                          ?.coordinates ?? null,
                      );
                      setPlan((p) => ({
                        ...p,
                        start: e.target.value,
                        start_coordinates: null,
                        via_points: [],
                        start_accuracy_m: null,
                      }));
                    }}
                  >
                    {places.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <span className="field-hint">
                  {plan.start_coordinates
                    ? `Selected: ${plan.start_coordinates[1].toFixed(5)}, ${plan.start_coordinates[0].toFixed(5)}`
                    : "Area starts are public-road anchors, not your current location. Choose your own start below."}
                </span>
                <div className="point-actions">
                  <button
                    type="button"
                    className="outline"
                    onClick={() => beginPick("start")}
                  >
                    Choose start on map
                  </button>
                  <button
                    type="button"
                    className="outline"
                    onClick={
                      locating
                        ? () => {
                            stopLocating();
                            setLocationMessage(
                              "Location search cancelled. Choose your start on the map.",
                            );
                          }
                        : locate
                    }
                  >
                    {locating ? "Cancel location search" : "Use my location"}
                  </button>
                </div>
                {plan.mode === "point" ? (
                  <>
                    <label className="field-title" htmlFor="destination">
                      Destination
                    </label>
                    <select
                      id="destination"
                      value={plan.destination}
                      onChange={(e) =>
                        setPlan((p) => ({
                          ...p,
                          destination: e.target.value,
                          destination_coordinates: null,
                        }))
                      }
                    >
                      {places.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <span className="field-hint">
                      {plan.destination_coordinates
                        ? `Selected: ${plan.destination_coordinates[1].toFixed(5)}, ${plan.destination_coordinates[0].toFixed(5)}`
                        : "Or select a destination on the map."}
                    </span>
                    <button
                      type="button"
                      className="outline"
                      onClick={() => beginPick("destination")}
                    >
                      Choose destination on map
                    </button>
                  </>
                ) : (
                  <>
                    <label
                      className="field-title distance-label"
                      htmlFor="distance"
                    >
                      Total ride distance{" "}
                      <strong>
                        {plan.distance} <span>km</span>
                      </strong>
                    </label>
                    <input
                      id="distance"
                      type="range"
                      min="5"
                      max={MAX_RIDE_DISTANCE_KM}
                      step="1"
                      value={plan.distance}
                      onChange={(e) =>
                        update("distance", Number(e.target.value))
                      }
                    />
                    <div className="range-labels">
                      <span>5 km</span>
                      <span>{MAX_RIDE_DISTANCE_KM} km</span>
                    </div>
                    <div className="distance-entry">
                      <label htmlFor="distance-number">
                        Distance in kilometres
                      </label>
                      <input
                        id="distance-number"
                        type="number"
                        min="5"
                        max={MAX_RIDE_DISTANCE_KM}
                        step="1"
                        key={plan.distance}
                        defaultValue={plan.distance}
                        onBlur={(e) => enteredDistance(e.currentTarget)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            enteredDistance(e.currentTarget);
                          }
                        }}
                      />
                    </div>
                    <div
                      className="training-distances"
                      role="group"
                      aria-label="Training distances"
                    >
                      {[90, 100, 180, 200].map((distance) => (
                        <button
                          key={distance}
                          type="button"
                          aria-pressed={plan.distance === distance}
                          onClick={() => trainingDistance(distance)}
                        >
                          {distance} km
                        </button>
                      ))}
                    </div>
                    <p className="field-hint">
                      Training distances set your total. Best fit chooses the
                      loop and laps when you calculate; manual mode keeps
                      approximately your current loop length.
                    </p>
                    <label className="field-title" htmlFor="loop-strategy">
                      Loop planning
                    </label>
                    <select
                      id="loop-strategy"
                      value={plan.best_fit ? "best" : "manual"}
                      onChange={(e) =>
                        update("best_fit", e.target.value === "best")
                      }
                    >
                      <option value="best">
                        Best fit · risks first, then fewer laps
                      </option>
                      <option value="manual">Set the lap count myself</option>
                    </select>
                    {plan.best_fit && (
                      <p className="field-hint">
                        {plan.via_points.length
                          ? "Editing points control this route and can change its distance. Clear editing points to run best fit again."
                          : "Searches connected local roads for the highest mapped-road score, then the fewest laps. Each option reaches your distance target."}
                      </p>
                    )}
                    <label className="field-title" htmlFor="laps">
                      Laps
                    </label>
                    <select
                      id="laps"
                      value={plan.laps}
                      onChange={(e) =>
                        setPlan({
                          ...plan,
                          laps: Number(e.target.value),
                          best_fit: false,
                        })
                      }
                    >
                      {Array.from(
                        {
                          length: Math.min(
                            MAX_LAPS,
                            Math.floor(plan.distance / MIN_LAP_DISTANCE_KM),
                          ),
                        },
                        (_, i) => i + 1,
                      ).map((n) => (
                        <option key={n} value={n}>
                          {n === 1
                            ? "1 · One round trip"
                            : `${n} laps · Repeat a shorter loop`}
                        </option>
                      ))}
                    </select>
                    <p className="field-hint lap-hint">
                      {plan.laps > 1
                        ? `${plan.laps} laps × approximately ${(plan.distance / plan.laps).toFixed(1)} km per lap · ${plan.distance} km total.`
                        : "One loop for your full ride distance."}
                    </p>
                  </>
                )}
                {plan.mode === "loop" && (
                  <>
                    <label className="field-title" htmlFor="ride-area">
                      Ride area
                    </label>
                    <select
                      id="ride-area"
                      value={plan.stay_local ? "local" : "nearby"}
                      onChange={(e) => {
                        cancelPick();
                        setPlan((p) => ({
                          ...p,
                          stay_local: e.target.value === "local",
                          radius_km: e.target.value === "local" ? 2 : 5,
                        }));
                      }}
                    >
                      <option value="local">
                        Connected local roads · no major-road crossings
                      </option>
                      <option value="nearby">
                        Nearby roads · major-road junctions allowed
                      </option>
                    </select>
                    <p className="field-hint">
                      {plan.stay_local
                        ? "Follows connected roads across suburb lines. Major roads stop the route; mapped bridges and underpasses can connect it."
                        : `Allows major-road junctions within ${plan.radius_km} km of the start. These lower the mapped-road score.`}{" "}
                      Restricted roads stay excluded.
                    </p>
                    {!plan.stay_local && (
                      <>
                        <label className="field-title" htmlFor="radius">
                          Maximum distance from start
                        </label>
                        <select
                          id="radius"
                          value={plan.radius_km}
                          onChange={(e) =>
                            update("radius_km", Number(e.target.value))
                          }
                        >
                          {[2, 3, 4, 5].map((n) => (
                            <option key={n} value={n}>
                              {n} km radius
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </>
                )}
                {plan.mode === "point" && (
                  <label className="check-row road-filter">
                    <input
                      type="checkbox"
                      checked={plan.stay_local}
                      onChange={(e) => update("stay_local", e.target.checked)}
                    />
                    Keep major-road junctions out
                  </label>
                )}
                <label className="check-row road-filter">
                  <input
                    type="checkbox"
                    checked={plan.stay_local || plan.avoid_main_roads}
                    disabled={plan.stay_local}
                    onChange={(e) =>
                      update("avoid_main_roads", e.target.checked)
                    }
                  />
                  Exclude primary/secondary roads and mapped speeds over 60 km/h
                </label>

                {plan.profile === "mtb" && (
                  <>
                    <label className="field-title" htmlFor="difficulty">
                      Maximum trail difficulty
                    </label>
                    <select
                      id="difficulty"
                      value={plan.difficulty}
                      onChange={(e) =>
                        update("difficulty", Number(e.target.value))
                      }
                    >
                      {["Easy", "Moderate", "Difficult", "Expert"].map(
                        (d, i) => (
                          <option value={i} key={d}>
                            {d}
                          </option>
                        ),
                      )}
                    </select>
                  </>
                )}
                <details className="access-details">
                  <summary>
                    Access preferences <span>Optional</span>
                  </summary>
                  {[["paid", "Allow paid routes"]].map(([key, label]) => (
                    <label className="check-row" key={key}>
                      <input
                        type="checkbox"
                        checked={Boolean(plan[key as keyof Plan])}
                        onChange={(e) =>
                          update(key as keyof Plan, e.target.checked)
                        }
                      />
                      {label}
                    </label>
                  ))}
                  <p className="field-hint">
                    Known private access and unresolved gates are excluded.
                    Untagged road access is inferred from road class. Membership
                    and visitor-only routes are not enabled.
                  </p>
                </details>
                <button
                  className="primary find-button"
                  disabled={busy || !places.length || !!pickMode}
                >
                  {busy ? "Calculating routes…" : "Calculate routes"}
                  <ArrowRight size={18} />
                </button>
              </form>
              {plan.avoid_ways.length > 0 && (
                <div className="avoided-note">
                  {plan.avoid_ways.length} mapped roads excluded. Calculate
                  routes to apply changes.
                  <button
                    className="text-button"
                    onClick={() => {
                      setPlan((p) => ({ ...p, avoid_ways: [] }));
                      try {
                        localStorage.removeItem("veld-avoided-ways");
                      } catch {
                        /* storage unavailable */
                      }
                    }}
                  >
                    Clear my exclusions
                  </button>
                </div>
              )}{" "}
            </aside>
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
                  onPick={choosePoint}
                  pickMode={pickMode}
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
                  loop={plan.mode === "loop"}
                  editing={editing && !pickMode && !dirty && !busy}
                  onDragRoute={dragRoute}
                  onAvoidRoad={avoidMapRoad}
                />
                {route && !pickMode && (
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
                <span className="sort-label">
                  Mapped risks first · fewer laps next
                </span>
              </div>
              <div className="pace-panel">
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
              </div>
              {!visibleRoutes.length && !busy && !pickMode && (
                <div className="empty">
                  <Compass size={32} />
                  <h3>No matching route yet</h3>
                  <p>{message}</p>
                </div>
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
                          {r.selection ? "Best fit" : "First option"}
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
                            ? r.lap_distance
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
                        {r.laps} laps × {r.lap_distance} km per lap
                      </div>
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
                        <strong>{r.safety.score}/100</strong>
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
                          ? `Highest mapped-road score, then fewest laps among ${r.selection.candidates_checked} candidates.`
                          : "Fewer laps with a lower mapped-road score. Review the trade-off."}
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
                      disabled={exporting}
                    >
                      <ArrowDownToLine size={16} />
                      {exporting ? "Exporting…" : "Export GPX"}
                    </button>
                  </div>
                  {(route.laps ?? 1) > 1 && (
                    <p className="lap-detail">
                      Ride this {route.lap_distance} km loop {route.laps} times
                      for {route.distance} km total. The map shows one lap; the
                      GPX includes all {route.laps} laps as separate track
                      segments.
                    </p>
                  )}
                  <details className="phone-guide">
                    <summary>Use this route on Android</summary>
                    <p>
                      Download a GPX with road names and turn information for
                      OsmAnd. One lap is easiest to check before a first test
                      ride.
                    </p>
                    <div className="point-actions">
                      <button
                        className="primary"
                        disabled={exporting || !route.navigation}
                        onClick={() => download("osmand", "single")}
                      >
                        Android · one lap
                      </button>
                      <button
                        className="outline"
                        disabled={exporting || !route.navigation}
                        onClick={() => download("osmand", "all")}
                      >
                        Android · all laps
                      </button>
                    </div>
                    {!route.navigation && (
                      <p>Calculate this route again to add turn information.</p>
                    )}
                    <ol>
                      <li>
                        Install OsmAnd on Android and download the offline map
                        covering Gauteng and a voice package.
                      </li>
                      <li>
                        Transfer this file to your phone by USB or Quick Share.
                        Open the GPX with OsmAnd and import it into Tracks.
                      </li>
                      <li>
                        Open the track, choose Navigation and the cycling
                        profile, and follow it from the start. For multiple
                        laps, select all track segments.
                      </li>
                      <li>
                        Check the imported roads against this preview. Avoid
                        “Attach to roads” or reversing the route: either can
                        change the checked route. Phone recalculation after
                        leaving the track uses OsmAnd’s own rules.
                      </li>
                    </ol>
                    <p>
                      Turn information is generated from mapped road joins.
                      Check guidance on your phone before riding; physical
                      Android navigation has not yet been tested.
                    </p>
                    {route.navigation?.roundabouts_need_review && (
                      <p>
                        This route has a roundabout. Exit numbers are not
                        supplied; follow its highlighted track.
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
                            {section.score}/100{" "}
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
            <h2>Route data and limits</h2>
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
                  roads under construction are excluded. Missing access tags on
                  ordinary roads are treated as an inference, not independent
                  verification.
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
                  The mapped-road score is a published heuristic. Its deductions
                  are shown for every route. Live traffic, security conditions
                  and field checks are unknown.
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
                  {areaStats.road_count} mapped roads · {areaStats.tagged_nodes}{" "}
                  tagged points · {areaStats.eligible_segments} road segments
                  pass the default local filters. Road data:{" "}
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
                For an offline Android basemap, download the map in OsmAnd. This
                ZIP is for detailed inspection and recording your observations.
              </p>
            </div>
            <h3>What this pilot can do</h3>
            <p>
              Generate loops and point-to-point rides on actual OSM road
              geometry. Planning happens locally. Mapped private access,
              unresolved gates, motorways, cycling prohibitions and turn
              restrictions are filtered. You can choose your own map points and
              exclude roads you know you want to avoid.
            </p>
            <h3>What to check before your first ride</h3>
            <p>
              Inspect the route and its start point. Ordinary road access is
              inferred where OSM has no explicit access tag; estate boundaries
              and gates may be missing. Surface tags can be incomplete. There is
              no live traffic, verified safety score or emergency assistance.
              Android guidance uses the downloaded OsmAnd route. Roundabout exit
              numbers are not supplied; check the highlighted track.
            </p>
            <p>
              Routes and your selected coordinates stay on this computer. The
              map background is requested from OpenStreetMap or Esri; downloads
              fetch the same Centurion rectangle for everyone. Refresh road data
              periodically and after known changes.
            </p>
          </section>
        )}
        <footer>
          <span className="footer-brand">veld.</span>
          <span>Centurion route planner.</span>
          <span>Centurion personal pilot · v0.2</span>
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
