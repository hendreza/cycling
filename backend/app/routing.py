"""Request contract and geographic utilities for the Centurion road planner."""

from math import asin, cos, radians, sin, sqrt
from typing import Literal
from pydantic import BaseModel, Field, model_validator

# Deliberate pilot rectangle, not a municipal boundary. Entire paths are clipped to it.
MAX_RIDE_DISTANCE_KM = 200
MAX_LAPS = 100

BOUNDS = (28.06, -25.985, 28.275, -25.79)
PLACES = {
    "highveld": {"name": "Highveld area", "coordinates": (28.189483790618286, -25.87852573409195)},
    "irene": {"name": "Irene area", "coordinates": (28.225484893013498, -25.8883288723314)},
    "lyttelton": {"name": "Lyttelton area", "coordinates": (28.20527989242267, -25.83566741957773)},
    "rooihuiskraal": {
        "name": "Rooihuiskraal area",
        "coordinates": (28.1537278, -25.8941384),
    },
}


def inside(c):
    return BOUNDS[0] <= c[0] <= BOUNDS[2] and BOUNDS[1] <= c[1] <= BOUNDS[3]


def km(a, b):
    lon1, lat1, lon2, lat2 = map(radians, (*a, *b))
    return 12742 * asin(
        min(
            1,
            sqrt(sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2),
        )
    )


class Plan(BaseModel):
    profile: Literal["road", "gravel", "mtb"] = "road"
    mode: Literal["loop", "point"] = "loop"
    start: str = "highveld"
    destination: str = "irene"
    start_coordinates: tuple[float, float] | None = None
    destination_coordinates: tuple[float, float] | None = None
    start_accuracy_m: float | None = Field(default=None, ge=0, le=20)
    distance: float = Field(default=20, ge=5, le=MAX_RIDE_DISTANCE_KM)
    laps: int = Field(default=1, ge=1, le=MAX_LAPS)
    best_fit: bool = False
    stay_local: bool = True
    radius_km: float = Field(default=2, ge=0.5, le=5)
    avoid_main_roads: bool = True
    rider_speed_kmh: float | None = Field(default=None, ge=8, le=40)
    preference: Literal["lower-risk", "balanced", "direct"] = "lower-risk"
    paid: bool = False
    registration: bool = False
    membership: bool = False
    difficulty: int = Field(default=1, ge=0, le=3)
    via_points: list[tuple[float, float]] = Field(default_factory=list, max_length=12)
    avoid_ways: list[int] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def validate_points(self):
        if any(not inside(c) for c in self.via_points):
            raise ValueError("Route editing points must be inside Centurion coverage.")
        if self.start_accuracy_m is not None and self.start_coordinates is None:
            raise ValueError("Location accuracy requires a chosen starting coordinate.")
        if self.mode == "point" and self.laps != 1:
            raise ValueError("Laps are available for round trips only.")
        if self.mode == "loop" and not self.best_fit and self.distance / self.laps < 2:
            raise ValueError("Choose at least 2 km per lap or reduce the number of laps.")
        for name in ("start", "destination"):
            c = getattr(self, name + "_coordinates")
            if c is None:
                if getattr(self, name) not in PLACES:
                    raise ValueError("Choose a supported area or select a point on the map.")
            elif not inside(c):
                raise ValueError("Choose a point inside the Centurion coverage rectangle.")
        if self.mode == "point" and km(self.point("start"), self.point("destination")) < 0.05:
            raise ValueError("Start and destination must be at least 50 metres apart.")
        return self

    def point(self, name):
        return getattr(self, name + "_coordinates") or PLACES[getattr(self, name)]["coordinates"]
