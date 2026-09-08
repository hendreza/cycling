import type { Plan, Route } from "./types";
export const defaultSpeed: Record<string, number> = {
  road: 20,
  gravel: 16,
  mtb: 12,
};
export const riderSpeed = (plan: Plan) =>
  plan.rider_speed_kmh ?? defaultSpeed[plan.profile];
// Manual average moving speed only. Future calibrated estimates must use their own model
// rather than rescaling hill/surface-aware estimates as though they were a flat average.
export const movingMinutes = (route: Route, speed: number) =>
  Math.round(
    ((route.distance_m !== undefined
      ? route.distance_m / 1000
      : route.distance) /
      speed) *
      60,
  );
