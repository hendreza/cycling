import {
  Bike,
  MapPin,
  LocateFixed,
  ArrowRight,
  Mountain,
  Route as RouteIcon,
} from "lucide-react";
import type { Plan, Place } from "./types";

type Props = {
  plan: Plan;
  places: Place[];
  busy: boolean;
  picking: boolean;
  locating: boolean;
  onPlan: (plan: Plan) => void;
  onArea: (id: string) => void;
  onPick: (kind: "start" | "destination") => void;
  onLocate: () => void;
  onCalculate: () => void;
};
export default function PlannerSetup({
  plan,
  places,
  busy,
  picking,
  locating,
  onPlan,
  onArea,
  onPick,
  onLocate,
  onCalculate,
}: Props) {
  const coverage = plan.coverage || (plan.stay_local ? "local" : "nearby");
  const set = (patch: Partial<Plan>) => onPlan({ ...plan, ...patch });
  function distance(value: number) {
    const next = Math.round(Math.max(5, Math.min(200, value)));
    if (!Number.isFinite(next)) return;
    const broaden = next >= 50 && !plan.coverage;
    set({
      distance: next,
      laps: Math.min(plan.laps, Math.floor(next / 2)),
      ...(broaden ? { coverage: "centurion", stay_local: false } : {}),
      ...(!plan.lap_limit_custom && (broaden || coverage === "centurion")
        ? { max_laps: next >= 150 ? 6 : 3 }
        : {}),
    });
  }
  const loopMode = plan.best_fit ? "best" : plan.laps === 1 ? "one" : "manual";
  return (
    <aside className="planner">
      <div className="panel-title">
        <h2>Your ride</h2>
        <span className="private-chip">Private preview</span>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onCalculate();
        }}
      >
        <label className="field-title" htmlFor="start">
          Starting area
        </label>
        <div className="location-select">
          <MapPin size={18} />
          <select
            id="start"
            value={plan.start}
            onChange={(e) => onArea(e.target.value)}
          >
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <p className="field-hint start-hint">
          {plan.start_coordinates
            ? `${plan.start_coordinates[1].toFixed(6)}, ${plan.start_coordinates[0].toFixed(6)}`
            : "Choose your exact start on a road."}
        </p>
        <div className="point-actions">
          <button
            type="button"
            className="outline"
            onClick={() => onPick("start")}
          >
            <MapPin size={16} />
            Choose start on map
          </button>
          <button
            type="button"
            className="outline location-button"
            onClick={onLocate}
            aria-label={locating ? "Cancel location search" : "Use my location"}
            title={locating ? "Cancel location search" : "Use my location"}
          >
            <LocateFixed size={19} />
          </button>
        </div>
        <div className="profile-options" aria-label="Bike type">
          {[
            ["road", "Road", Bike],
            ["gravel", "Gravel", RouteIcon],
            ["mtb", "MTB", Mountain],
          ].map(([id, label, Icon]) => (
            <button
              type="button"
              key={String(id)}
              className={plan.profile === id ? "profile active" : "profile"}
              aria-pressed={plan.profile === id}
              onClick={() => set({ profile: String(id) })}
            >
              <Icon size={17} />
              {String(label)}
            </button>
          ))}
        </div>
        <p className="field-hint bike-hint">
          {plan.profile === "road"
            ? "Known unpaved roads excluded."
            : plan.profile === "gravel"
              ? "Unpaved roads allowed where access permits."
              : "Mapped trails allowed where access and grade permit."}
        </p>
        <div className="segmented route-mode">
          {[
            ["loop", "Round trip"],
            ["point", "Point to point"],
          ].map(([id, label]) => (
            <button
              type="button"
              key={id}
              className={plan.mode === id ? "active" : ""}
              aria-pressed={plan.mode === id}
              onClick={() =>
                set({
                  mode: id,
                  laps: id === "point" ? 1 : plan.laps,
                  via_points: [],
                })
              }
            >
              {label}
            </button>
          ))}
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
                set({
                  destination: e.target.value,
                  destination_coordinates: null,
                })
              }
            >
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="outline"
              onClick={() => onPick("destination")}
            >
              Choose destination on map
            </button>
          </>
        ) : (
          <div className="distance-control">
            <label className="field-title" htmlFor="distance-number">
              Total ride distance
            </label>
            <div className="distance-number">
              <input
                id="distance-number"
                aria-label="Distance in kilometres"
                type="number"
                min="5"
                max="200"
                step="1"
                key={plan.distance}
                defaultValue={plan.distance}
                onBlur={(e) =>
                  distance(Number(e.target.value) || plan.distance)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    distance(Number(e.currentTarget.value) || plan.distance);
                  }
                }}
              />
              <span>km</span>
            </div>
            <input
              aria-label="Total ride distance"
              id="distance"
              type="range"
              min="5"
              max="200"
              step="1"
              value={plan.distance}
              onChange={(e) => distance(Number(e.target.value))}
            />
            <div
              className="training-distances"
              role="group"
              aria-label="Training distances"
            >
              {[20, 50, 90, 100, 180, 200].map((km) => (
                <button
                  type="button"
                  key={km}
                  aria-pressed={plan.distance === km}
                  onClick={() => distance(km)}
                >
                  {km} km
                </button>
              ))}
            </div>
          </div>
        )}
        {plan.mode === "loop" ? (
          <>
            <label className="field-title" htmlFor="ride-area">
              Ride area
            </label>
            <select
              id="ride-area"
              value={coverage}
              onChange={(e) =>
                set({
                  coverage: e.target.value as Plan["coverage"],
                  stay_local: e.target.value === "local",
                  radius_km: 5,
                  lap_limit_custom: false,
                  via_points: [],
                  max_laps:
                    e.target.value === "local"
                      ? 100
                      : plan.distance >= 150
                        ? 6
                        : 3,
                })
              }
            >
              <option value="local">Connected local roads</option>
              <option value="centurion">Across Centurion</option>
              <option value="nearby">Within a nearby radius</option>
            </select>
            <p className="field-hint">
              {coverage === "local"
                ? "Stay between major roads. No suburb boundary cut-offs."
                : coverage === "centurion"
                  ? "Explore the full pilot area. Review major-road junctions on each option."
                  : `Stay within ${plan.radius_km} km of your start. Junctions may be included.`}
            </p>
          </>
        ) : (
          <label className="check-row">
            <input
              type="checkbox"
              checked={plan.stay_local}
              onChange={(e) =>
                set({
                  stay_local: e.target.checked,
                  coverage: e.target.checked ? "local" : "centurion",
                })
              }
            />
            Keep major-road junctions out
          </label>
        )}
        {plan.mode === "loop" && (
          <>
            <label className="field-title" htmlFor="loop-strategy">
              Loop planning
            </label>
            <select
              id="loop-strategy"
              value={loopMode}
              onChange={(e) =>
                set({
                  best_fit: e.target.value === "best",
                  laps:
                    e.target.value === "one"
                      ? 1
                      : e.target.value === "manual"
                        ? Math.max(2, plan.laps)
                        : plan.laps,
                })
              }
            >
              <option value="best">Best fit with laps</option>
              <option value="one">One loop · no repeated laps</option>
              <option value="manual">Choose the lap count</option>
            </select>
            {plan.best_fit ? (
              <div className="inline-field">
                <label htmlFor="max-laps">Maximum laps</label>
                <select
                  id="max-laps"
                  value={plan.max_laps ?? 100}
                  onChange={(e) => {
                    set({
                      max_laps: Number(e.target.value),
                      lap_limit_custom: true,
                    });
                  }}
                >
                  {[1, 2, 3, 4, 6, 10, 20, 50, 100].map((n) => (
                    <option value={n} key={n}>
                      {n === 100 ? "As many as needed" : n}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="inline-field">
                <label htmlFor="laps">Laps</label>
                <select
                  id="laps"
                  value={plan.laps}
                  onChange={(e) =>
                    set({ laps: Number(e.target.value), best_fit: false })
                  }
                >
                  {Array.from(
                    { length: Math.min(100, Math.floor(plan.distance / 2)) },
                    (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {i + 1}
                      </option>
                    ),
                  )}
                </select>
              </div>
            )}
            <p className="field-hint lap-hint">
              {plan.via_points.length
                ? "Editing points set the path. Clear them to search freely again."
                : plan.best_fit
                  ? "Compare total distance and loop length before choosing."
                  : `${plan.laps} ${plan.laps === 1 ? "loop" : "laps"} × approximately ${(plan.distance / plan.laps).toFixed(1)} km · ${plan.distance} km total.`}
            </p>
          </>
        )}
        <details className="ride-options">
          <summary>
            More ride options
            {plan.avoid_ways.length
              ? ` · ${plan.avoid_ways.length} roads excluded`
              : ""}
          </summary>
          {plan.mode === "loop" && coverage === "nearby" && (
            <>
              <label className="field-title" htmlFor="radius">
                Maximum distance from start
              </label>
              <select
                id="radius"
                value={plan.radius_km}
                onChange={(e) => set({ radius_km: Number(e.target.value) })}
              >
                {[2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} km radius
                  </option>
                ))}
              </select>
            </>
          )}
          <label className="check-row">
            <input
              type="checkbox"
              checked={plan.stay_local || plan.avoid_main_roads}
              disabled={plan.stay_local}
              onChange={(e) => set({ avoid_main_roads: e.target.checked })}
            />
            Exclude primary/secondary roads and mapped speeds over 60 km/h
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={plan.paid}
              onChange={(e) => set({ paid: e.target.checked })}
            />
            Allow roads with a mapped fee
          </label>
          {plan.profile === "mtb" && (
            <>
              <label htmlFor="difficulty">Maximum mapped MTB grade</label>
              <select
                id="difficulty"
                value={plan.difficulty}
                onChange={(e) => set({ difficulty: Number(e.target.value) })}
              >
                {[0, 1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    Grade {n}
                  </option>
                ))}
              </select>
            </>
          )}
          <p className="field-hint">
            Private access and unresolved gates remain excluded.
          </p>
          {!!plan.avoid_ways.length && (
            <p className="avoided-note">
              {plan.avoid_ways.length} mapped roads excluded.{" "}
              <button
                type="button"
                className="text-button"
                onClick={() => set({ avoid_ways: [] })}
              >
                Clear my exclusions
              </button>
            </p>
          )}
        </details>
        <button
          className="primary find-button"
          aria-label="Calculate routes"
          disabled={busy || !places.length || picking}
        >
          {busy ? "Finding your routes…" : "Find routes"}
          <ArrowRight size={19} />
        </button>
      </form>
    </aside>
  );
}
