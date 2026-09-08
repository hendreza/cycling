import type { Route } from "./types";
export type RouteControl = { point: [number, number]; index: number };
const distance = (a: [number, number], b: [number, number]) =>
  Math.hypot((a[0] - b[0]) * Math.cos((a[1] * Math.PI) / 180), a[1] - b[1]);
export function controlPoints(route: Route): RouteControl[] {
  const points = route.coordinates;
  if (route.via_points?.length) {
    let from = 0;
    return route.via_points.map((point) => {
      let best = from;
      for (let i = from; i < points.length - 1; i++)
        if (distance(point, points[i]) < distance(point, points[best]))
          best = i;
      from = best;
      return { point: points[best], index: best };
    });
  }
  const lengths = [0];
  for (let i = 1; i < points.length; i++)
    lengths.push(lengths[i - 1] + distance(points[i - 1], points[i]));
  return [
    ...new Set(
      [0.25, 0.5, 0.75].map((f) =>
        lengths.findIndex((d) => d >= lengths.at(-1)! * f),
      ),
    ),
  ]
    .filter((i) => i > 0 && i < points.length - 1)
    .map((index) => ({ point: points[index], index }));
}
