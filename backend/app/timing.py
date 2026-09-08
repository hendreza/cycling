"""Manual moving-time baseline, separate from route preference/risk costs.

Future imported ride calibration should replace this estimator using each segment's
road/surface/grade and rider history. Until those inputs exist, do not imply that
hills, stops or a rider's training history have been measured.
"""

DEFAULT_SPEED_KMH = {"road": 20, "gravel": 16, "mtb": 12}


def estimate_time(lap_distance_km, plan):
    speed = plan.rider_speed_kmh or DEFAULT_SPEED_KMH[plan.profile]
    lap_minutes = lap_distance_km / speed * 60
    return {
        "duration": round(lap_minutes * plan.laps),
        "lap_duration": round(lap_minutes),
        "time_estimate": {
            "model": "manual-average-v1",
            "speed_kmh": speed,
            "source": "rider-selected" if plan.rider_speed_kmh is not None else "profile-default",
            "hills_included": False,
            "surface_adjusted": False,
            "training_data_used": False,
            "stops_included": False,
        },
    }
