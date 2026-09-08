import { MAX_RIDE_DISTANCE_KM, MAX_LAPS } from "./planningLimits";
import { initial, type Plan, type Route } from "./types";

export const SESSION_KEY = "veld-session-v1";
export type Session = {
  version: 1;
  plan: Plan;
  usedPlan: Plan;
  routes: Route[];
  selected: number;
  message: string;
  tab: string;
  hasResult: boolean;
};
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");
const point = (v: unknown) =>
  Array.isArray(v) &&
  v.length === 2 &&
  v.every(finite) &&
  Math.abs(v[0]) <= 180 &&
  Math.abs(v[1]) <= 90;

function validPlan(v: unknown): v is Plan {
  return (
    object(v) &&
    ["road", "gravel", "mtb"].includes(String(v.profile)) &&
    ["loop", "point"].includes(String(v.mode)) &&
    typeof v.start === "string" &&
    typeof v.destination === "string" &&
    (v.start_accuracy_m == null ||
      (finite(v.start_accuracy_m) &&
        v.start_accuracy_m >= 0 &&
        v.start_accuracy_m <= 20)) &&
    (v.rider_speed_kmh == null ||
      (finite(v.rider_speed_kmh) &&
        v.rider_speed_kmh >= 8 &&
        v.rider_speed_kmh <= 40)) &&
    (v.best_fit === undefined || typeof v.best_fit === "boolean") &&
    (v.stay_local === undefined || typeof v.stay_local === "boolean") &&
    (v.avoid_main_roads === undefined ||
      typeof v.avoid_main_roads === "boolean") &&
    (v.radius_km === undefined ||
      (finite(v.radius_km) && v.radius_km >= 0.5 && v.radius_km <= 5)) &&
    (v.via_points === undefined ||
      (Array.isArray(v.via_points) &&
        v.via_points.length <= 12 &&
        v.via_points.every(point))) &&
    finite(v.distance) &&
    v.distance >= 5 &&
    v.distance <= MAX_RIDE_DISTANCE_KM &&
    finite(v.laps) &&
    Number.isInteger(v.laps) &&
    v.laps >= 1 &&
    v.laps <= MAX_LAPS &&
    (v.mode === "point"
      ? v.laps === 1
      : v.best_fit === true || v.distance / v.laps >= 2) &&
    ["lower-risk", "balanced", "direct"].includes(String(v.preference)) &&
    [v.paid, v.registration, v.membership].every(
      (x) => typeof x === "boolean",
    ) &&
    finite(v.difficulty) &&
    v.difficulty >= 0 &&
    v.difficulty <= 3 &&
    Array.isArray(v.avoid_ways) &&
    v.avoid_ways.length <= 200 &&
    v.avoid_ways.every(Number.isSafeInteger) &&
    [v.start_coordinates, v.destination_coordinates].every(
      (x) => x == null || point(x),
    )
  );
}
function validRoute(v: unknown): v is Route {
  if (!object(v)) return false;
  return (
    [v.id, v.name, v.data_timestamp, v.confidence].every(
      (x) => typeof x === "string",
    ) &&
    [
      v.distance,
      v.duration,
      v.major_road_percent,
      v.snap_start_m,
      v.snap_end_m,
    ].every(finite) &&
    Array.isArray(v.coordinates) &&
    v.coordinates.length >= 2 &&
    v.coordinates.length <= 50000 &&
    v.coordinates.every(point) &&
    [v.warnings, v.access, v.segment_ids, v.explanations].every(strings) &&
    (v.safety === undefined ||
      (object(v.safety) &&
        finite(v.safety.score) &&
        v.safety.score >= 0 &&
        v.safety.score <= 100 &&
        typeof v.safety.model === "string" &&
        typeof v.safety.confidence === "string" &&
        typeof v.safety.data_timestamp === "string" &&
        strings(v.safety.unknowns) &&
        typeof v.safety.basis === "string" &&
        [
          v.safety.major_junctions_per_lap,
          v.safety.major_junction_visits,
          v.safety.separated_crossings,
        ].every(finite) &&
        Array.isArray(v.safety.factors) &&
        v.safety.factors.every(
          (f) =>
            object(f) &&
            typeof f.label === "string" &&
            finite(f.deduction) &&
            typeof f.detail === "string",
        ) &&
        Array.isArray(v.safety.reports) &&
        v.safety.reports.every(
          (r) =>
            object(r) &&
            finite(r.way_id) &&
            typeof r.category === "string" &&
            typeof r.detail === "string",
        ))) &&
    (v.local_areas === undefined ||
      (Array.isArray(v.local_areas) &&
        v.local_areas.every(
          (a) =>
            object(a) &&
            typeof a.name === "string" &&
            finite(a.distance_km) &&
            typeof a.source === "string",
        ))) &&
    (v.sections === undefined ||
      (Array.isArray(v.sections) &&
        v.sections.every(
          (s) =>
            object(s) &&
            [s.index, s.count, s.way_id, s.distance_m, s.score].every(finite) &&
            typeof s.name === "string" &&
            strings(s.concerns),
        ))) &&
    (v.selection === undefined ||
      (object(v.selection) &&
        typeof v.selection.explanation === "string" &&
        finite(v.selection.candidates_checked))) &&
    object(v.surface) &&
    Object.values(v.surface).every(finite) &&
    [
      v.elevation,
      v.score,
      v.traffic,
      v.difficulty,
      v.weakest_score,
      v.penalty,
    ].every((x) => x === null || finite(x)) &&
    (v.laps === undefined ||
      (finite(v.laps) &&
        Number.isInteger(v.laps) &&
        v.laps >= 1 &&
        v.laps <= MAX_LAPS &&
        finite(v.lap_distance))) &&
    Array.isArray(v.roads) &&
    v.roads.every(
      (road) =>
        object(road) &&
        finite(road.way_id) &&
        finite(road.distance) &&
        [
          road.name,
          road.highway,
          road.surface,
          road.access,
          road.bicycle,
          road.url,
        ].every((x) => typeof x === "string"),
    )
  );
}
export function restoreSession(): Session & { saved: boolean } {
  const fallback: Session & { saved: boolean } = {
    version: 1,
    plan: { ...initial, avoid_ways: [] },
    usedPlan: initial,
    routes: [],
    selected: 0,
    message: "",
    tab: "planner",
    hasResult: false,
    saved: false,
  };
  try {
    const v: unknown = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (
      object(v) &&
      v.version === 1 &&
      validPlan(v.plan) &&
      validPlan(v.usedPlan) &&
      Array.isArray(v.routes) &&
      v.routes.length <= 3 &&
      v.routes.every(validRoute) &&
      finite(v.selected) &&
      Number.isInteger(v.selected) &&
      v.selected >= 0 &&
      v.selected < Math.max(1, v.routes.length) &&
      typeof v.message === "string" &&
      typeof v.hasResult === "boolean" &&
      ["planner", "community", "about"].includes(String(v.tab))
    ) {
      const migrate = (p: Plan): Plan => ({
        ...p,
        best_fit: p.best_fit ?? false,
        via_points: p.via_points ?? [],
        stay_local: p.stay_local ?? true,
        radius_km: p.radius_km ?? 2,
        avoid_main_roads: p.avoid_main_roads ?? true,
      });
      return {
        ...(v as Session),
        plan: migrate(v.plan),
        usedPlan: migrate(v.usedPlan),
        saved: v.hasResult,
      };
    }
  } catch {
    /* A damaged or older snapshot must not prevent opening the planner. */
  }
  try {
    const avoided: unknown = JSON.parse(
      localStorage.getItem("veld-avoided-ways") || "[]",
    );
    if (Array.isArray(avoided))
      fallback.plan.avoid_ways = avoided
        .filter(Number.isSafeInteger)
        .slice(0, 200);
  } catch {
    /* Legacy preferences are optional. */
  }
  return fallback;
}
export function saveSession(value: Session): boolean {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export type MapView = {
  routeId: string | null;
  center: [number, number];
  zoom: number;
};
export function savedMapView(): MapView | null {
  try {
    const v = JSON.parse(localStorage.getItem("veld-map-view-v1") || "null");
    return object(v) &&
      (v.routeId === null || typeof v.routeId === "string") &&
      point(v.center) &&
      finite(v.zoom) &&
      v.zoom >= 3 &&
      v.zoom <= 20
      ? (v as MapView)
      : null;
  } catch {
    return null;
  }
}
export function saveMapView(value: MapView) {
  try {
    localStorage.setItem("veld-map-view-v1", JSON.stringify(value));
  } catch {
    /* Route storage reports unavailable storage in the planner. */
  }
}
