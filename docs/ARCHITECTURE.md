# Current architecture: real roads, personal local use

React/TypeScript + Vite → local FastAPI → directed graph from a cached OSM JSON extract. SQLite stores immutable selected routes, reports and audit events. Leaflet displays SVG road routes over ordinary raster-image tiles from OpenStreetMap or Esri World Imagery with reference labels, without requiring WebGL or GPU acceleration. Switching replaces only tile layers, preserving routes, estates, markers, selection and camera. ResizeObserver keeps the map sized and centred when its container or fullscreen state changes. Tile errors and stalled requests offer retry and alternate-basemap controls. Satellite tiles use Esri's `{z}/{y}/{x}` order and keep both imagery and OSM route-data attribution visible.

## Data import

`backend/app/osm.py` downloads highway ways, their nodes and local restriction relations through a bounded Overpass query. Source timestamp and import time are retained. The importer rejects empty/partial responses, constructs the graph as validation and replaces the old extract atomically. Data is not sent to a routing provider. `backend/scripts/download_roads.py` and the UI use the same import function.

Coverage is a fixed Centurion rectangle. Nodes outside it are removed, and sequences interrupted by outside nodes are split rather than connected across missing geometry. Way geometry is compressed between junctions/tagged nodes, keeping intermediate coordinates and geodesic lengths. The present extract has 34,100 ways, 212,772 in-bounds nodes and approximately 59,239 compressed edges before profile filtering.

## Eligibility and direction

The local policy `osm-conservative-4` filters before pathfinding. Ordinary public road classes and cycleways can be candidates without explicit access tags; that is a documented inference. Explicit unknown or non-public access is rejected. Service roads and trails need explicit permissive access. No personal checkbox can turn a private road public.

Barrier nodes split geometry and exclude incident edges when unresolved. One-way and bicycle direction tags control directed adjacency. Node-via turn restrictions are checked against the incoming OSM way in Dijkstra state. Via-way and conditional restriction cases exclude their incoming way conservatively. This can over-exclude connections, including some same-way U-turn cases; it favors missing a candidate over ignoring a known restriction.

This is not a complete implementation of all OSM routing semantics. Unmapped gates, missing estate boundaries, malformed/missing tags, seasonal conditions and some specialized restrictions are not independently verified. There is no field-confirmed security-estate database yet.

Residential polygons are fetched alongside roads. Shapely checks each complete compressed road geometry against an indexed exclusion layer, so an edge with both endpoints outside an estate is still rejected if it crosses the interior. Explicit gated/private areas and named estates with unresolved passage are excluded. Multipolygon holes are retained. Invalid selected boundaries fail the import instead of silently disappearing. At the latest verification, coverage includes 55 excluded polygons and removes 4,177 compressed edges; the UI reports the current import.

## Candidate generation

Point routes use weighted Dijkstra and penalise used edges for alternatives. Loop searches sample up to 64 representative pivots across distance bands/directions, add three-leg connections and extend candidates towards useful lap lengths. Closed loops must be at least 2 km, obey the complete turn sequence and use at most 18% repeated-edge distance. Fixed-lap totals fit within ±3%; automatic laps use `ceil(target / actual_lap_length)` and totals of 100–103% by default. The tolerance is explicit in the API. Wider searches retain valid local candidates.

Candidates rank lexicographically by descending mapped-road score, ascending lap count, then distance above target. Up to three distinct options include the first-ranked candidate, a useful fewest-laps alternative and another road alternative where available. Similar road sets are suppressed using 0.82 Jaccard overlap. This is a bounded search, not proof of global optimality. Empty results never relax restrictions.

Search costs use road class and mapped cycling infrastructure to favour lower-order roads. Current approved adverse reports multiply affected edge costs by 12; the final route ranking uses the separate assessment below. Legacy API distance/balanced preferences remain available; best fit always searches with lower-risk road weights.

Surface mix includes explicit unknown coverage. `timing.py` uses selected average moving speed (8–40 km/h), with profile defaults of 20/16/12 km/h. The UI slider updates time without rerouting. Model metadata marks hills, surface adjustment, stops and training history as unused. No hill or fitness model is claimed. Legacy verified safety, elevation and traffic fields remain null; the new `safety` object holds the distinct mapped-road heuristic.

Starts and destinations project onto eligible road polylines within a strict 20 m geodesic distance. Interior projections split the selected directed edge in a request-local network, preserving shape, access, direction and OSM way IDs for turn restrictions. Splits never modify the shared cached graph or merge separate roads at geometric crossings. The GPX starts on the projected road point; no off-road connector is invented. GPS acquisition requires reported accuracy ≤20 m, uses fresh high-accuracy readings, tolerates temporary signal loss and stops after 30 seconds or cancellation. Device accuracy is a confidence estimate, not a guarantee of true position.

For loops, requested distance is the full ride distance. The distance target ranges from 5–200 km. In manual mode, `laps` (1–100, at least 2 km requested per lap) divides the search target. Best fit selects its own lap count from the candidate geometry. `coordinates` and the road breakdown describe one lap; `distance`, `distance_m` and `duration` cover all laps, with separate `lap_distance`, `lap_distance_m`, `lap_duration` and `laps` fields. Point routes require one lap. GPX writes one complete track segment per lap.

## Persistence

`POST /api/routes` computes and saves each returned candidate with a UUID, request, path, source timestamp and policy version. `GET /api/routes/{id}/gpx` exports that exact saved path without recalculating it. New road data cannot silently change a viewed route's export. Exports from an older access-policy version are refused and require replanning.

Reports refer to real OSM way IDs. Publication still requires local administrator approval, with an audit entry. Reports do not bypass access restrictions or mutate saved routes. Approved, unexpired adverse reports influence new searches and assessments; pending, rejected, expired and positive reports are ignored by the risk model. Browser-local `avoid_ways` provide explicit personal exclusions, sent with subsequent plans. Exclusions apply to OSM ways, not all identically named streets.

A validated, versioned browser snapshot restores full route geometry, selected route, draft and applied form values, pace, laps and tab synchronously. Refresh does not request new routes after a completed search, even if the API is temporarily offline. A separate camera snapshot restores centre/zoom for the same route ID. Corrupt storage falls back cleanly; unavailable storage is reported.

Route snapshots include personal coordinates and are retained in local SQLite and browser local storage. There is not yet a saved-ride library UI, retention UI or public account service. Loopback binding is intentional for this personal version.

## Why no Valhalla/PostGIS yet

A local OSM graph provides immediate real-road use without requiring Docker, an API key, a public routing service or deployment. The current algorithm is replaceable behind the request/result contract. Valhalla and PostGIS remain useful next steps for richer routing and spatial estate/gate validation, but are not dependencies of this personal release.

## References

- [OSM access model](https://wiki.openstreetmap.org/wiki/Key:access)
- [OSM one-way and restriction tagging](https://wiki.openstreetmap.org/wiki/Restriction)
- [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)
- [Leaflet API](https://leafletjs.com/reference)
- [Browser geolocation accuracy](https://developer.mozilla.org/en-US/docs/Web/API/GeolocationCoordinates/accuracy)
- [Valhalla public demo policy](https://github.com/valhalla/valhalla#demo-server), reviewed as an alternative; the app does not use that server.

## Named areas and route editing

`areas.py` distinguishes a connected road cell from an explicit nearby radius capped at 5 km. Municipal polygons do not prune routes or validate starts. `neighbourhoods.py` optionally intersects the returned route with cached registered township polygons to supply names in route order. Missing label data does not prevent routing. City of Tshwane survey age is unknown; download date is recorded.

`road_safety.py` builds an STRtree from all raw major-road shapes before access/estate exclusions. Major roads are motorway/trunk/primary/secondary classes (including links) or numeric mapped speeds above 60 km/h. Every eligible edge is checked for geometric contacts. In local mode, major-road travel is excluded and at-grade junction nodes stop traversal. Interior at-grade or ambiguous overlaps remove that edge. An interior start can split a side-road edge and ride away from a blocked junction; a start at the junction itself is rejected. Nearby mode permits non-critical contacts but retains motorway/trunk at-grade barriers. Point routes expose the same major-junction exclusion setting.

Crossing geometry needs known different layers and an explicit bridge or tunnel to count as separated. A shared OSM node, ambiguous overlap, malformed layer, or an unsupported layer-only assumption cannot bypass the barrier. Graph connectivity still requires shared OSM nodes; bridge crossings do not create imaginary turns. The amber overlay shows source major roads, with the grade-separation exception explained in its popup.

`POST /api/locations/resolve` checks the proposed plan, returns a ≤20 m projection and source road identity, and does not change a route. The browser applies the chosen start only on confirmation and ignores stale responses. Area changes hide the previous area’s route immediately.

`via_points` supplies at most 12 ordered editing controls. All points project into the same request-local eligible network before searching. Each leg carries its incoming OSM way into the next search; the closing leg enforces the turn into the next lap. This preserves turn restrictions across waypoints and loop closure. Edits use hard waypoints and penalise reused edges; the automatic planning distance band is replaced by an explicit edited-distance result with a maximum twice the requested ride distance. Every accepted edit recalculates route and per-road assessments, active-report exposure, distance and lap count. The UI hides the old score while updating and shows its before/after change when accepted. Rejected edits retain browser plan/routes and their assessment. Draft setup changes are explicitly marked as not yet applied to the displayed score. Accepted routes remain immutable SQLite snapshots. Undo history is session-memory only; applied control points and edited geometry persist.

## Android and area exports

`navigation.py` derives turn cues from directed road geometry at edge joins and stores them with segment indices, tags and manual-speed timing. `/api/routes/{id}/gpx?format=osmand&laps=single|all&speed_kmh=20` exports OsmAnd calculated-route segments, type/name tables and exact track geometry. Neighbouring segments share their endpoint; each lap gets its own track segment and route endpoints with matching indices. The validated speed override adjusts only timing. Standard GPX remains the default. No phone-side road matching is required by the file format, but actual Android import/navigation remains a device verification step. Roundabout exit ordinals are not inferred.

`/api/areas/rooihuiskraal/data` reports source counts; `/api/areas/rooihuiskraal/download` packages source boundary polygons, clipped road GeoJSON, tagged nodes, default eligible segments, estate exclusions, raw OSM context and a field worksheet. It never bulk-downloads raster tiles. The boundary script uses the municipal service’s full TLS chain with a bundled, system-verified public GeoTrust intermediate (the service omits it). Failed downloads preserve the prior cache.

Sources: [City of Tshwane Land Boundaries](https://e-gis003.tshwane.gov.za/server/rest/services/Other_WS/Land_Boundaries/MapServer/1), [OsmAnd GPX format](https://osmand.net/docs/technical/osmand-file-formats/osmand-gpx/).


## Mapped-road assessment

Model `mapped-roads-v1` starts at 100, subtracts the following penalties, clamps at zero and rounds to one decimal. Percentages use unrounded edge lengths from one complete lap. This is a provisional prioritisation heuristic, not a calibrated accident or personal-security model. Weights must change with the model version.

| Factor | Deduction |
| --- | --- |
| Unique at-grade major-road contacts per lap | 8 each, maximum 35 |
| Major-road distance share | percentage × 0.35 |
| Mapped speed above 60 km/h | percentage × 0.15 |
| Tertiary/tertiary-link/unclassified connectors | percentage × 0.15 |
| Missing surface tags | percentage × 0.15 |
| No explicit access or bicycle tag | percentage × 0.10 |
| Missing numeric speed, excluding dedicated cycling/walking paths | percentage × 0.10 |
| Poor mapped smoothness | percentage × 0.20 |
| Unique ways with current approved adverse reports | 10 each, maximum 30 |

A major-road contact means the path meets mapped major-road geometry; it is not necessarily a straight crossing. Scoring deduplicates contacts by location per lap. The visit count separately counts each encounter, deduplicating shared edge joins but retaining later returns to the same junction, then multiplies by laps. The score describes the loop's mapped characteristics, not cumulative crash exposure over a longer ride. Repeating a loop does not improve its score. Road sections group consecutive edges of the same OSM way; their scores use the same model. Missing source tags cause deductions; live traffic, crime/security, unmapped closures and field verification remain separate unknowns.

The assessment stores source road timestamp, model, deductions, coverage, junction locations and active report details with the immutable route. Refresh restores that snapshot; a new calculation uses the current local extract/reports. These data do not prove actual road conditions. OSM highway class describes road function/importance and is used here as a proxy, not a traffic measurement. See [highway classification](https://wiki.openstreetmap.org/wiki/Key:highway), [layer](https://wiki.openstreetmap.org/wiki/Key:layer) and [bridge](https://wiki.openstreetmap.org/wiki/Key:bridge).

## Verge route search and private-data controls (10 September 2026)

`coverage` distinguishes local road cells, nearby radius and the Centurion pilot rectangle. Legacy `stay_local` remains compatible. `max_laps` constrains automatic best fit; manual `laps` is authoritative in fixed-lap mode. Totals are checked against actual geometry with 3% default tolerance. `variation` seeds the bounded loop search, while `exclude_routes` remembers up to 60 geometry fingerprints. Fingerprints ignore reversal/start rotation, so reversing the same loop does not count as a different road choice. Refresh never merely replaces UUIDs to suggest novelty.

Loop extension replaces short path sections with legal directed connections through other graph nodes. Every closed candidate validates its complete turn sequence, including the lap join. The 18% repeated-edge ceiling remains. The first option follows score/lap priority; a distinct fewest-laps alternative is also retained before the third option. A wider search retains valid local candidates. Search bounds are not a proof that a longer route cannot exist.

Private data controls require an explicit browser header, reject foreign origins and use the same SQLite store as exports/reports. Deletion invalidates searches already in progress to prevent them restoring records afterward. Two route calculations can run concurrently; further searches receive 429. These are single-process, local-owner controls. They are not a public multi-user authentication or data-isolation design. Docker adds CSP and security headers; Vite adds appropriate development headers. Map tiles are never placed in an offline service-worker cache.
