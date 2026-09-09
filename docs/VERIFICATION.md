# Verification · 2026-09-09

## Automated checks

- **111 Python tests pass**: access/gates, direction and turn restrictions, full geometry coverage, strict 20 m point projection, request-local edge splitting, ordered editing points, immutable GPX exports, Android segment/index/type tables, repeated laps, report moderation and import failure handling.
- Road-based policy tests cover shared major-road junctions, geometric crossings, explicit bridge/tunnel separation, invalid layers, motorway/trunk contacts, starting inside a side road near a blocked junction, and consistent speed evidence across barriers and road exclusions.
- Best-fit tests cover 20/90/180/200 km totals, automatic lap counts, exact loop closure, score-before-laps ordering, retention of better local candidates when expanding the search, and road-section geometry. Assessment tests cover active approved adverse reports, immutable prior scores, and repeat visits to a junction.
- **23 browser tests pass with WebGL disabled**: road/satellite layers, fullscreen/fit, mobile layout, tile errors, confirmed start selection, stale location responses, GPS accuracy/cancellation, laps, pace, route-line/control dragging, road exclusions, undo, rejected edits, Android downloads, reports and refresh persistence. New checks cover suburb extensions, the amber road overlay, best-fit lap selection, road-section focus, and score/lap updates after accepted edits. Every test checks for uncaught browser errors.
- Ruff lint/format and the TypeScript/Vite production build pass. Browser API fixtures use captured real-road geometry; external services are mocked in the automated suite. The separate live checks below use actual local data and map providers.

## Sources and policy

The road/access snapshot is `2026-09-07T14:11:06Z`, with 34,100 mapped ways and 55 estate/private-area exclusions. Routes use policy `osm-conservative-4` and assessment model `mapped-roads-v1`.

The municipal reference cache contains 22 registered Rooihuiskraal township polygons. An optional label cache contains 67 registered township names across the pilot window, downloaded on 2026-09-08 with full TLS verification. Municipal polygons label routes and bound the field-data ZIP; they do not cut the routing graph. Source survey age is unknown.

The Rooihuiskraal anchor is **Hofsanger Road, 28.1537278 E, 25.8941384 S**. Real-data checks use this start and the default road-bike/local settings. They explicitly verify that the extended route leaves the old municipal polygon while retaining zero mapped major-road contacts and a start projection within 20 m.

## Live best-fit results

Options appear in score-first order. Distances below are rounded for display; tests validate totals from stored geometry.

| Requested total | Returned options: total / laps / mapped-road score |
| --- | --- |
| 20 km | 20.6 km / 8 / 80.0; 21.9 km / 6 / 79.6; **20.1 km / 3 / 79.4** |
| 90 km | 91.1 km / 23 / 80.0; **95.5 km / 13 / 79.7**; **91.3 km / 12 / 79.4** |
| 180 km | 182.3 km / 46 / 80.0; **183.6 km / 25 / 79.7**; **182.6 km / 24 / 79.4** |
| 200 km | 202.1 km / 51 / 80.0; **205.6 km / 28 / 79.7**; **205.4 km / 27 / 79.4** |

Bold options extend from **Rooihuiskraal into The Reeds**. Every listed option closes, meets 100–110% of the requested total and has zero mapped major-road junctions. A 90 km nearby search retains the 91.1 km / 23-lap / 80.0 local option. The search took approximately 0.7–0.9 seconds once the graph was loaded in this run; the first request took 4.9 seconds. This is bounded candidate search, not a global optimum guarantee.

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
- Map tiles require internet; exports require the local API/database. Browser state is specific to its origin. Older-policy saved routes require recalculation before export.
- Docker and physical phone navigation remain unverified. Two existing Starlette/AnyIO deprecation warnings do not fail the test suite.
