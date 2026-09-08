"""Conservative exclusion polygons from mapped residential areas."""

from shapely.geometry import LineString, Polygon, mapping
from shapely.ops import polygonize, unary_union
from shapely import STRtree


def build_zones(elements):
    geometries = []
    features = []
    for element in elements:
        tags = element.get("tags", {})
        name = tags.get("name", "Unnamed residential area")
        explicit = (
            tags.get("access") in {"private", "no", "residents", "permit"}
            or tags.get("residential") == "gated"
        )
        estate = any(
            word in name.lower() for word in ("estate", "landgoed", "midstream", "heritage hill")
        )
        if not explicit and not estate:
            continue
        reason = (
            "Mapped gated/private residential area"
            if explicit
            else "Named estate; public passage unverified"
        )
        geometry = None
        if element["type"] == "way":
            coordinates = [(p["lon"], p["lat"]) for p in element.get("geometry", [])]
            if len(coordinates) >= 4 and coordinates[0] == coordinates[-1]:
                geometry = Polygon(coordinates)
        elif element["type"] == "relation":
            outers = []
            inners = []
            for member in element.get("members", []):
                coordinates = [(p["lon"], p["lat"]) for p in member.get("geometry", [])]
                if len(coordinates) > 1:
                    (inners if member.get("role") == "inner" else outers).append(
                        LineString(coordinates)
                    )
            if outers:
                geometry = unary_union(list(polygonize(unary_union(outers))))
                if inners:
                    geometry = geometry.difference(
                        unary_union(list(polygonize(unary_union(inners))))
                    )
        if geometry is None or geometry.is_empty or not geometry.is_valid:
            raise ValueError(f"Incomplete boundary for {name}; existing extract was preserved.")
        geometries.append(geometry)
        features.append(
            {
                "type": "Feature",
                "geometry": mapping(geometry),
                "properties": {
                    "name": name,
                    "reason": reason,
                    "source": f"https://www.openstreetmap.org/{element['type']}/{element['id']}",
                },
            }
        )
    return STRtree(geometries), features
