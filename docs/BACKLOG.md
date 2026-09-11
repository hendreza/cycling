# Verge remaining work

**Private testing continues. Public release is not ready.** The owner requested that legal and operational work remain visible. The authoritative open list is [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md), repeated in the app under Data & privacy. No checklist item is silently closed by this redesign.


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

- [x] Direction-aware search with block/roundabout turnarounds and no immediate U-turn at leg/lap joins.
- [x] Saved section-level access blocks, map preview/reopen, routing and export enforcement, privacy lifecycle.
- [x] Prepared Android download with lap choice and native file sharing where supported.

## Next for personal usefulness

- [ ] Validate the revised routing and export on Android, including spoken turns, repeated laps and off-track behaviour; initial owner transfer/ride completed with access and U-turn feedback.

- [ ] Continue field checks after the initial owner ride; review the reported gate once its location is supplied.
- [ ] Add personal exclusion polygons for estates and unrecorded barriers, with explicit boundary-crossing validation.
- [x] Snap onto eligible edge interiors within 20 m, preserving direction and mapped gate exclusions.
- [x] Reject coarse GPS readings and show the chosen start radius.
- [x] Road/satellite overview without WebGL, lap loops, persistent current route and adjustable moving-time estimates.
- [ ] Import rider training data and calibrate segment times against sourced elevation, road/surface tags and rider history, retaining model provenance and uncertainty.
- [x] Extend bounded loop search, preserve useful fewer-lap alternatives, tighten distance matching and add genuine route refresh.
- [ ] Continue improving search completeness for difficult networks without weakening access constraints.
- [ ] Add sourced elevation and a height profile, preserving missing coverage.
- [x] Add local data export/deletion, privacy notice and a visible public-release checklist.
- [x] Apply the supplied Verge brand kit, local fonts, route outlines and score/confidence components.
- [ ] Add a saved-rides library, favourite starts and a configurable retention schedule.
- [ ] Add route-distance progress and full import progress/error diagnostics.
- [x] Optional expiring GPX-only Wi-Fi QR transfer; see [the transfer scope](PHONE_TRANSFER_PROPOSAL.md).
- [ ] Check QR scanning, local Wi-Fi reachability and the full import flow on the owner’s Android phone.
- [ ] Improve phone-side capture of blocked entrances while retaining precise scope and private storage.

## Before a public community pilot

Verified accounts, email verification, anti-abuse controls, role-based moderation, privacy/retention policy, field-verified gates and estate geometry, versioned migrations, backups, operations monitoring and calibrated confidence. The mapped-road heuristic needs field evidence and calibration before any verified safety interpretation; traffic/crime claims require separate sourced evidence.

PostGIS and Valhalla can replace the local graph when spatial access evidence and routing complexity warrant them. No payments, live navigation, emergency response, national coverage or external partner outreach has been added.
