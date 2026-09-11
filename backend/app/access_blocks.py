"""Owner observations: exclude the highlighted road section, never infer an estate boundary."""

from math import cos, radians, hypot
from shapely import STRtree
from shapely.geometry import LineString, Point
from pydantic import BaseModel, Field, field_validator
from .routing import inside, km

SCALE_X = 111_320 * cos(radians(-25.89))
SCALE_Y = 111_320


def metric_line(points):
    return LineString([(x * SCALE_X, y * SCALE_Y) for x, y in points])


class AccessMask:
    def __init__(self, blocks):
        self.lines = [metric_line(b["geometry"]) for b in blocks]
        self.buffers = [line.buffer(1) for line in self.lines]
        self.tree = STRtree(self.buffers)
        self.segments = [
            [(a, b, LineString([a, b])) for a, b in zip(line.coords, list(line.coords)[1:])]
            for line in self.lines
        ]

    def matches(self, points):
        if not self.buffers:
            return False
        line = metric_line(points)
        # Match distance along the highlighted road, not mere proximity to a
        # point. A road touching the junction or crossing above/below remains
        # available. The tolerance handles projected splits and minor remapping.
        for i in self.tree.query(line, predicate="intersects"):
            for a, b in zip(line.coords, list(line.coords)[1:]):
                dx, dy = b[0] - a[0], b[1] - a[1]
                length = hypot(dx, dy)
                if not length:
                    continue
                for c, d, blocked in self.segments[i]:
                    ux, uy = d[0] - c[0], d[1] - c[1]
                    span = hypot(ux, uy)
                    if not span or abs(dx * ux + dy * uy) / (length * span) < cos(radians(10)):
                        continue
                    first = ((a[0] - c[0]) * ux + (a[1] - c[1]) * uy) / span
                    last = ((b[0] - c[0]) * ux + (b[1] - c[1]) * uy) / span
                    overlap = min(span, max(first, last)) - max(0, min(first, last))
                    if (
                        overlap > min(0.05, length * 0.5)
                        and LineString([a, b]).distance(blocked) <= 1
                    ):
                        return True
        return False


class AccessPoint(BaseModel):
    coordinates: tuple[float, float]
    edge_id: str | None = Field(default=None, max_length=120)

    @field_validator("coordinates")
    @classmethod
    def in_coverage(cls, point):
        if not inside(point):
            raise ValueError("Choose a point inside the Centurion map coverage.")
        return point


class SaveAccessBlock(AccessPoint):
    edge_id: str = Field(min_length=1, max_length=120)
    note: str = Field(default="Access controlled", max_length=500)


def resolve(graph, request):
    point = Point(request.coordinates[0] * SCALE_X, request.coordinates[1] * SCALE_Y)
    best = None
    for edge in graph.edges:
        if request.edge_id and edge.id != request.edge_id:
            continue
        # Bounding box before constructing the local metric line.
        if not (
            min(p[0] for p in edge.points) - 0.00025
            <= request.coordinates[0]
            <= max(p[0] for p in edge.points) + 0.00025
            and min(p[1] for p in edge.points) - 0.0002
            <= request.coordinates[1]
            <= max(p[1] for p in edge.points) + 0.0002
        ):
            continue
        line = metric_line(edge.points)
        projected = line.interpolate(line.project(point))
        coordinates = (projected.x / SCALE_X, projected.y / SCALE_Y)
        distance = km(request.coordinates, coordinates) * 1000
        if distance <= 20 and (best is None or distance < best[0]):
            best = distance, edge, coordinates
    if best is None:
        raise ValueError(
            "No mapped road section within 20 m. Zoom in and select the road at the entrance."
        )
    distance, edge, coordinates = best
    return {
        "edge_id": edge.id,
        "way_id": edge.way,
        "road_name": edge.tags.get("name", "Unnamed road"),
        "coordinates": coordinates,
        "geometry": edge.points,
        "snap_distance_m": round(distance, 1),
    }
