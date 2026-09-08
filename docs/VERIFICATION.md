# Verification · 2026-09-08

## Automated checks

- **84 Python tests pass**: access and gates, direction and turn restrictions, full geometry bounds and polygon holes, local/nearby limits, primary/secondary and speed filtering, strict 20 m point resolution, request-local edge splitting, loops/laps, ordered editing points, turn restrictions across editing points, saved GPX geometry, OsmAnd segment/index/type tables, repeated laps, speed-only export changes, municipal feature selection, area ZIP provenance, reporting and import failure handling.
- **21 browser tests pass with WebGL disabled**: street/satellite tiles and SVG paths, fullscreen/fit, mobile width, tile errors, confirmed start selection, immediate area change, local/nearby options, stale location-response rejection, GPS accuracy/cancellation, laps, speed slider, direct route-line and control-point dragging, road popup exclusions, undo, rejected edits, Android downloads, reports and persistent route/settings/camera. Every test also checks for uncaught browser errors.
- Ruff lint/format and the TypeScript/Vite production build pass. Browser API fixtures use actual Rooihuiskraal geometry; external network requests are mocked in CI. Separate live checks are described below.

Long-distance coverage also verifies 90/180/200 km requests, 100-lap Android exports, minimum lap length, totals and time across every lap, typed distance entry, training presets and restoration of routes with more than 12 laps.

Live Rooihuiskraal long-training checks: 90 km / 20 laps returned **91.6 and 88.6 km** totals; 180 km / 40 laps returned **183.2 and 177.1 km**; 200 km / 44 laps returned **201.5 and 194.8 km**. All kept the local boundary and default road restrictions. Targets remain approximate (±10%); the actual total is shown for each option.

## Real data checks

The OSM road/access snapshot is `2026-09-07T14:11:06Z`, with 34,100 ways, 212,773 in-bounds nodes, 55,053 retained compressed edges and 55 estate/private-area exclusions removing 4,177 edges.

The City of Tshwane boundary was re-downloaded on 2026-09-08 with full TLS verification. It combines **22 registered ROOIHUISKRAAL township polygons**, excluding ROOIHUISKRAAL NOORD and unregistered extensions. Source survey age is not provided. The previous Sacharia Street anchor was outside this boundary; the corrected anchor is **Hofsanger Road, 28.1537278 E, 25.8941384 S**.

Live local API results:

- Rooihuiskraal, Road, 20 km / four laps: **18.3 km total**, approximately **4.6 km per lap**, entirely inside the municipal polygon; farthest point **1.524 km** from the start.
- 20 km / five laps: **18.9 and 19.3 km totals**, approximately **3.8 and 3.9 km per lap**; farthest points about **1.28 km** from the start. Total distance uses unrounded geometry.
- A 10 km per-lap nearby request with main roads excluded returned no matching route. It did not relax the restrictions. Larger loops are not guaranteed in this constrained network.
- The Rooihuiskraal ZIP contains **408 clipped road objects, 69 tagged nodes and 321 compressed segments passing the default local road-bike filters**. Source roads retain private/access tags; eligibility is supplied separately. The archive opens and contains geometry, source metadata, municipal polygons, estate exclusions and the field worksheet.
- Standard and OsmAnd GPX retain the saved route coordinates. One-lap and five-lap Android files were saved to `data/exports/`, alongside the field pack and route metadata.

## Live browser check

An unmocked Chromium browser, with WebGL disabled, used the running local API and actual OpenStreetMap/Esri tiles. It:

1. Confirmed Hofsanger Road as the selected start with a 0 m mapped-road offset.
2. Dragged a route control point onto **Opperman Road**, approximately 50 m from the old control. The server included the requested road, produced an **18.0 km edited total**, and retained the Rooihuiskraal boundary.
3. Undid the edit, loaded real satellite imagery and reference labels, fit the route, and restored identical saved geometry after refresh.
4. Downloaded the OsmAnd one-lap file and checked a 390 px mobile viewport with no horizontal overflow.

There were no uncaught browser errors. Visual review artifacts were saved as `/tmp/veld-rooihuiskraal-satellite.jpg` and `/tmp/veld-rooihuiskraal-mobile.jpg`.

## Practical limits

- Physical Android import, spoken turns, repeated-lap guidance, off-track recalculation and a field ride have **not** been tested. OsmAnd files follow its documented calculated-route format. Roundabout exit numbers are not supplied; a route with roundabouts flags them for visual review.
- Reported GPS accuracy ≤20 m and road projection ≤20 m are independent checks, not an absolute physical accuracy guarantee. Source roads, boundaries and imagery can contain errors.
- No independent gate/access survey, live traffic, crime statistics, verified safety score, elevation or training-data timing model is available. Time remains distance divided by selected moving speed.
- Nearby routes remain bounded and retain access limits. Constraints may leave no valid loop. The router may also miss possible loops; it uses bounded candidate search rather than exhaustive enumeration.
- Route editing recalculates through ordered controls and may change other connecting roads and total distance. Road exclusions apply to an entire OSM way object, not every street sharing its name. Undo history resets on page refresh; accepted edited routes and controls persist.
- Map tiles need internet. GPX export needs the local API/database. Browser state is specific to the browser and origin. Old-policy saved routes require recalculation before exporting.
- Docker is unavailable locally. Two existing Starlette/AnyIO dependency deprecation warnings do not fail the tests.
