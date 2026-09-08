# Remaining work after the personal real-road release

## Completed

- [x] Download and cache a real bounded Centurion OSM road extract.
- [x] Route locally on actual node geometry and lengths.
- [x] Respect common bicycle access, mapped gates, direction and turn restrictions.
- [x] Keep complete path geometry inside the pilot rectangle.
- [x] Exclude full geometry crossing mapped estate/private-area boundaries and show these on the map.
- [x] Support map-selected and browser-location starts and map-selected destinations.
- [x] Generate strict-distance loops and point routes, with an explicit no-route state.
- [x] Export immutable saved GPX tracks.
- [x] Inspect source road tags and remember personal OSM way exclusions.
- [x] Replace fabricated scores, traffic and elevation with missing-data indicators.
- [x] Keep the last working dataset if refresh fails.

- [x] Confirm resolved start road before applying it.
- [x] Rooihuiskraal municipal reference and detailed field-data download.
- [x] Major-road-based local areas across suburb boundaries, with grade-separated connections.
- [x] Best fit across connected roads, ranking mapped-road score before lap count, including 90–200 km totals.
- [x] Explainable provisional mapped-road assessments and per-road sections, updated transactionally after edits.
- [x] Optional municipal suburb labels, including Rooihuiskraal–The Reeds extensions.
- [x] Map drag editing, explicit road avoidance, transactional failures and undo.
- [x] OsmAnd calculated-route GPX, turn list and Android transfer instructions.

## Next for personal usefulness

- [ ] Verify OsmAnd import, spoken turns, repeated laps and off-track behaviour on a physical Android phone.

- [ ] Field-check frequently used routes and retain private access evidence.
- [ ] Add personal exclusion polygons for estates and unrecorded barriers, with explicit boundary-crossing validation.
- [x] Snap onto eligible edge interiors within 20 m, preserving direction and mapped gate exclusions.
- [x] Reject coarse GPS readings and show the chosen start radius.
- [x] Road/satellite overview without WebGL, lap loops, persistent current route and adjustable moving-time estimates.
- [ ] Import rider training data and calibrate segment times against sourced elevation, road/surface tags and rider history, retaining model provenance and uncertainty.
- [ ] Improve loop generation for constrained networks and richer alternative diversity.
- [ ] Add sourced elevation and a height profile, preserving missing coverage.
- [ ] Add a saved-rides library, favourite starts and data-retention controls.
- [ ] Add route-distance progress and full import progress/error diagnostics.
- [ ] Add secure phone access if desired; current transfer method is GPX.

## Before a public community pilot

Verified accounts, email verification, anti-abuse controls, role-based moderation, privacy/retention policy, field-verified gates and estate geometry, versioned migrations, backups, operations monitoring and calibrated confidence. The mapped-road heuristic needs field evidence and calibration before any verified safety interpretation; traffic/crime claims require separate sourced evidence.

PostGIS and Valhalla can replace the local graph when spatial access evidence and routing complexity warrant them. No payments, live navigation, emergency response, national coverage or external partner outreach has been added.
