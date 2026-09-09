export type Plan = {
  start_accuracy_m?: number | null;
  start_coordinates?: [number, number] | null;
  destination_coordinates?: [number, number] | null;
  via_points: [number, number][];
  avoid_ways: number[];
  profile: string;
  mode: string;
  start: string;
  destination: string;
  distance: number;
  laps: number;
  best_fit: boolean;
  coverage?: "local" | "nearby" | "centurion";
  max_laps?: number;
  variation?: number;
  exclude_routes?: string[];
  distance_tolerance?: number;
  stay_local: boolean;
  radius_km: number;
  avoid_main_roads: boolean;
  rider_speed_kmh?: number | null;
  preference: string;
  paid: boolean;
  registration: boolean;
  membership: boolean;
  difficulty: number;
};
export type Road = {
  way_id: number;
  name: string;
  highway: string;
  surface: string;
  access: string;
  bicycle: string;
  maxspeed: string | null;
  distance: number;
  url: string;
};
export type DataStatus = {
  available: boolean;
  updating: boolean;
  error: string | null;
  timestamp?: string;
  ways?: number;
  edges?: number;
  excluded_estates?: number;
  access_timestamp?: string;
};
export type Safety = {
  model: string;
  score: number;
  confidence: string;
  data_timestamp: string;
  factors: { label: string; deduction: number; detail: string }[];
  major_junctions_per_lap: number;
  major_junction_visits: number;
  separated_crossings: number;
  reports: { way_id: number; category: string; detail: string }[];
  unknowns: string[];
  basis: string;
};
export type Route = {
  fingerprint?: string;
  requested_distance?: number;
  distance_difference_km?: number;
  safety?: Safety;
  best_fit?: boolean;
  selection?: {
    strategy: string;
    explanation: string;
    candidates_checked: number;
    exhaustive: boolean;
  };
  local_areas?: { name: string; distance_km: number; source: string }[];
  sections?: {
    index: number;
    count: number;
    way_id: number;
    name: string;
    distance_m: number;
    score: number;
    concerns: string[];
  }[];
  via_points?: [number, number][];
  edited?: boolean;
  locality?: {
    enforced: boolean;
    kind: string;
    name: string;
    max_distance_from_start_km: number;
    boundary_source: string | null;
  };
  major_road_junctions?: { coordinates: [number, number]; names: string[] }[];
  start_road?: string;
  navigation?: {
    roundabouts_need_review: boolean;
    segments: { index: number; count: number; way_id: number; name: string }[];
    cues: {
      index: number;
      distance_m: number;
      instruction: string;
      turn: string;
    }[];
  };
  roads: Road[];
  data_timestamp: string;
  major_road_percent: number;
  snap_start_m: number;
  snap_end_m: number;
  warnings: string[];
  id: string;
  name: string;
  distance: number;
  distance_m?: number;
  duration: number;
  laps?: number;
  lap_distance?: number;
  lap_distance_m?: number;
  lap_duration?: number;
  elevation: number | null;
  score: number | null;
  confidence: string;
  surface: Record<string, number>;
  traffic: number | null;
  access: string[];
  difficulty: number | null;
  weakest_score: number | null;
  penalty: number | null;
  coordinates: [number, number][];
  segment_ids: string[];
  explanations: string[];
};
export type Area = {
  id: string;
  name: string;
  source: string;
  source_url: string;
  downloaded_at: string;
  anchor: [number, number];
  anchor_road: string;
  bounds: [number, number, number, number];
  boundary: GeoJSON.Feature;
};
export type Place = {
  id: string;
  name: string;
  coordinates: [number, number];
  area?: Area | null;
};
export type Report = {
  id: number;
  segment_id: string;
  category: string;
  detail: string;
  status: string;
};
export const initial: Plan = {
  profile: "road",
  mode: "loop",
  start: "rooihuiskraal",
  avoid_ways: [],
  via_points: [],
  destination: "irene",
  distance: 20,
  laps: 4,
  best_fit: true,
  stay_local: true,
  radius_km: 2,
  avoid_main_roads: true,
  preference: "lower-risk",
  paid: false,
  registration: false,
  membership: false,
  difficulty: 1,
};

export type LocationMatch = {
  requested_coordinates: [number, number];
  coordinates: [number, number];
  snap_distance_m: number;
  road_name: string;
  way_id: number;
  road_class: string;
  surface: string;
};
