# Verification · 10 September 2026

## Current checks

`make dev` was smoke-tested from the repository root: both local services started and the health endpoint returned 200. It provides a single-terminal start/stop command.

- **126 Python tests pass**: access/gates, directions, turn restrictions, geometry coverage, precise start projection, loop closure, 3% distance matching, fixed/automatic lap limits, refresh fingerprints, point-route exclusions, exact GPX/OsmAnd exports, report handling and import failures.
- New privacy tests use temporary databases. They cover export without administrator secrets, confirmed deletion semantics, rejection of foreign origins/untrusted hosts, required local-action headers and preventing a prior in-flight search from recreating deleted records. No deletion test runs against the owner’s database.
- **27 browser tests pass with WebGL disabled**. The suite checks the simplified setup, long-preset scope/lap defaults, independent custom lap limits, saved routes and camera, real geometry fixtures, route-line/control dragging, live assessment replacement, Android download metadata, satellite/road rendering with WebGL disabled, no-tile mode, local fonts, route refresh/exhaustion, privacy export/delete, cancellation of a pending GPS lookup on deletion and persistent release work. External services are mocked for repeatability; every test checks for uncaught browser errors.
- Ruff lint/format and the TypeScript/Vite production build pass. TypeScript also rejects unused code left over from removed controls.
- `npm audit` and `pip-audit` against the pinned Python requirements reported **no known vulnerabilities** on 10 September. These are dependency database checks, not a penetration test or proof of security. Reports are retained in `data/exports/verge-*-audit.json`.

## Current real-data route search

`.venv/bin/python backend/scripts/verify_centurion_routes.py` checks the installed extract without changing the private route database. The report is saved as `data/exports/verge-live-verification.json`. The source snapshot is `2026-09-07T14:11:06Z`: 34,100 mapped ways and 55 estate exclusions, policy `osm-conservative-4`, assessment `mapped-roads-v1`.

From the public Hofsanger Road anchor in Rooihuiskraal, with default road-bike exclusions:

| Target and scope | Actual total / laps / one-lap length | Mapped-road score and junctions per lap |
| --- | --- | --- |
| 20 km, local | 20.4 / 8 / 2.6 km; 20.6 / 8 / 2.6 km; **20.5 / 1 / 20.5 km** | 80.0, 80.0, 78.9; zero junctions; low confidence |
| 90 km, Centurion, cap 3 | 91.9 / 3 / 30.6 km; 92.0 / 3 / 30.7 km | 41.8 and 40.7; 11 and 13 junctions; low confidence |
| 180 km, Centurion, cap 6 | 180.2 / 6 / 30.0 km; 182.8 / 5 / 36.6 km; **181.4 / 4 / 45.4 km** | 41.5, 41.2, 40.9; 11–15 junctions; low confidence |
| 200 km, Centurion, cap 6 | 200.9 / 6 / 33.5 km; 202.4 / 5 / 40.5 km; **204.5 / 4 / 51.1 km** | 41.4, 41.3, 41.1; 11–15 junctions; low confidence |
| Refreshed 90 km, cap 3 | 90.3 / 2 / 45.2 km; 90.6 / 2 / 45.3 km; 90.9 / 3 / 30.3 km | 40.7, 40.4, 39.3; 18–23 junctions; low confidence |
| 90 km, one loop | No matching route | Longest found in this bounded search: 36.4 km |

Display values are rounded. Every returned route was checked from coordinate geometry: closed loop, start within 20 m, actual total between 100% and 103% of target, allowed lap count and no invented verified score/elevation. Refreshed fingerprints differ from all original 90 km options. The wider loops include more junctions and have lower mapped-road scores; they are not described as field-verified or guaranteed suitable.

Warm searches in this run took approximately 2.6–6.9 seconds. Search seeds, scope, lap caps, start and exclusions can change the result. A “longest found” figure is not an exhaustive maximum and can differ between search configurations.

## Visual and interaction checks

The supplied HTML brand reference was rendered and compared with the implementation. Unmocked desktop Chromium loaded the local API, local fonts and actual OSM road tiles; a 1440 px viewport had no horizontal overflow. A final unmocked 90 km search returned the two current 30 km loop choices, displayed 11 junction markers for the selected option, loaded actual Esri imagery and labels (a separate check confirmed all visible imagery tiles loaded without an error), and restored identical route geometry after refresh. A 390 px viewport had no horizontal overflow, all seven grouped public-release items remained in the page, and there were no uncaught browser errors. The result is retained in `data/exports/verge-browser-verification.json`; a fully loaded satellite preview is in `data/exports/verge-satellite-preview.jpg`. Score/confidence panels and map casing were checked visually. The layout preserves a direct mobile jump to the selected map, while extra settings, calibration and source data are collapsible.

## Earlier field-data and browser checks (9 September)

The following results predate the new search. They record previously checked exports and editing behaviour, not the current recommended route set.

The 20.1 km extension is approximately **6.7 km per lap over three laps**. Fresh one-lap and all-lap OsmAnd files were checked for exact saved coordinates, native calculated-route metadata and track-segment counts. Files are in `data/exports/rooihuiskraal-the-reeds-android-single.gpx` and `data/exports/rooihuiskraal-the-reeds-android-all.gpx`, with the saved route JSON beside them.

The refreshed Rooihuiskraal field ZIP opens without errors and contains 408 clipped road objects, 69 tagged points and 321 default eligible compressed road segments, plus source/provenance, estates and a field worksheet. Eligible side-road geometry may reach a junction which local routing cannot traverse; the archive explains that distinction.

## Live browser check

An unmocked Chromium browser with WebGL disabled used the running API and actual OpenStreetMap/Esri tiles. It selected the Rooihuiskraal–The Reeds option, loaded road and satellite overviews, and dragged a control approximately 73 m onto **Skimmer Street**. The accepted route included that road, changed the total to **16.4 km over three laps**, and updated the mapped-road score from **79.4 to 80.0**. It retained zero mapped major-road junctions. The edited-distance result is explicit; hard editing points can shorten a route below its original target.

Refresh restored identical route geometry and score. A 390 px viewport had no horizontal overflow. There were no uncaught browser errors. The structured result is stored in `data/exports/live-road-cell-browser.json`. These are browser checks, not physical Android or on-bike verification.

## Practical limits

- The mapped-road score is a provisional, explainable heuristic. It is not a verified safety rating, crash probability or measure of cumulative crash exposure. Unknown live traffic, crime/security, unmapped closures and field conditions remain explicit. See the [model weights and meaning](ARCHITECTURE.md#mapped-road-assessment).
- Road classification, geometry and bridge/access tags can be wrong or incomplete. Device-reported GPS accuracy and the separate 20 m road projection limit do not guarantee absolute physical positioning.
- Physical Android import, spoken turns, repeated-lap guidance, off-track recalculation and an actual field ride remain untested. Roundabout exit ordinals are not supplied. OsmAnd recalculation uses its own rules.
- Edited controls and road exclusions can change other connecting roads and total distance. Exclusions apply to an entire OSM way. Undo history resets on refresh; accepted geometry, controls and assessments persist.
- Saved assessments retain their source snapshot. Calculate routes to assess against current cached roads and approved reports. A higher score does not establish that a road is safe to ride.
- Time remains distance divided by selected average moving speed. Hills, stops, road effects and rider training history are not modelled yet.
- External map tiles require internet; Routes only and local fonts do not. exports require the local API/database. Browser state is specific to its origin. Older-policy saved routes require recalculation before export.
- Docker runtime/CSP and physical phone navigation remain unverified. Public launch remains gated by [the release checklist](RELEASE_CHECKLIST.md). Two existing Starlette/AnyIO deprecation warnings do not fail the test suite.
