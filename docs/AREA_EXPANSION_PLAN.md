# Adding areas to Verge

Proposed design · 14 September 2026 · No additional coverage is activated by this document.

Start by turning the current Centurion extract into the first repeatable region package. Add one further region only when there is a local person available to check it. A place appearing in a dropdown must mean we have usable road data and a way to correct it.

## Names, coverage and riding limits are different

| Concept | Meaning | Routing effect |
| --- | --- | --- |
| Named start | A recognisable place and a checked public-road anchor | Helps choose a start; never substitutes for the rider confirming their actual start |
| Source coverage | The area for which we hold usable road data | Requests and complete route geometry must be supported; do not invent a connection beyond the extract |
| Connected local riding area | Eligible roads reachable under the selected major-road/junction policy | Can extend from Rooihuiskraal into an adjoining suburb without crossing a major road |
| Access restriction | A mapped or reviewed prohibition, gate or blocked section | Excludes the affected geometry according to explicit policy, independently of suburb names |

Do not restore hard suburb/postcode boundaries. For wider rides, let graph connectivity and the selected major-road policy determine expansion. Continue ranking mapped-road evidence before fewer laps. If eligible geometry cannot meet a long target, show honest lap choices or no fit; never relax access restrictions to fill kilometres.

## Two paths for a requested area

**Inside current coverage:** verify the name, anchor and nearby graph; inspect public access and starts near coverage edges; add it to the region’s supported-start list. This is a relatively small data/configuration change, but the anchor still needs local checking.

**Outside current coverage:** create a candidate region or extend an existing one. This requires importer configuration, storage, API/UI coverage discovery and removal of Centurion-specific assumptions. A database label alone is insufficient. The current hard-coded bounds, place list, road cache, refresh scripts and local health/startup assumptions must be audited together when implementing this design.

A package should contain:

| Field | Purpose |
| --- | --- |
| Stable region ID, display name and status | Proposed → candidate → invited pilot → available, or suspended |
| Supported planning footprint and import buffer | Keep complete junctions and restriction relations around edges; the buffer is not automatically advertised coverage |
| Dataset version, source date, licence and checksum | Reproduce a route and trace a faulty source update |
| Import recipe and validation report | Repeat the import with the same access/direction policy |
| Named starts and eligible profile coverage | Tell riders which locations and ride types are actually supported |
| Restricted geometry and observation versions | Keep source restrictions separate from reviewed reports and private rider blocks |
| Local reviewer, last field-check date and known limitations | Identify who maintains the region and what remains uncertain |
| Resource budget and rollback version | Bound disk/RAM/import time and restore the last working graph |

## Source and import design

For a small candidate, a bounded OSM query can remain useful if its provider permits the workload. For larger or repeated regional builds, assess regional PBF extracts and updates. Geofabrik supplies regional OSM extracts and change files; the import pipeline would need to support that format before using them. [Geofabrik downloads](https://www.geofabrik.de/data/download.html), [technical notes](https://download.geofabrik.de/technical.html).

Retain nodes, complete ways, access/barrier tags, relevant polygons and restriction relations. Build an isolated candidate graph, validate it, then switch versions atomically. A failed or partial update must retain the last working package. Choose update frequency from provider terms, observed changes and the operator’s capacity; do not label it “live”.

For neighbouring regions, deduplicate by source identifiers and reconcile versions before connecting graphs. Preserve one-way/access/turn rules at the join. If cross-region planning is not supported yet, say so rather than clipping a route or joining nearby endpoints artificially. Stored reports need reassessment when OSM ways split or change; retain evidence and mark ambiguous matches for review.

The operator controls activation in the first pilot. Riders can request an area; a request does not make it available immediately. Record source attribution and the ODbL assessment for distributed databases or derivative outputs. [OSM copyright and licence](https://www.openstreetmap.org/copyright).

## Evidence before activation

1. **Inspect access:** review major junctions, bridges/tunnels, gates, estates, service roads and disconnected components. Ordinary road appearance does not prove public access. Keep unknowns visible.
2. **Run candidate checks:** connected geometry, direction and turn restrictions; no physical reversals at joins/lap closures; score recalculation after edits; blocks enforced on new and saved exports; full route distance/lap totals and bounds correct.
3. **Exercise representative starts:** choose at least ten spread across the candidate coverage, including edges and gated surroundings. Try local, wider and long training requests where applicable. Record honest no-fit results as well as successes.
4. **Ride selected examples:** a local volunteer checks several different routes and problem junctions while following normal road rules. Stop before reporting. Record section, date, observation and uncertainty; do not request unrestricted uploads of home-to-home ride history.
5. **Approve limited coverage:** the maintainer records the evidence, supported ride profiles, unresolved gaps and package version. Legal/map-provider readiness and support capacity must also permit the invitation.
6. **Monitor and withdraw:** complaints can trigger a temporary section exclusion or region suspension. Recheck routes at planning/export and show when old downloads may be stale. Previously exported GPX files cannot be remotely corrected reliably.

These are proposed acceptance checks, not proof that every road is safe or accessible. Expand in stages when field coverage is thin.

## What “download an area” should mean

Distinguish a route GPX, a source/reference GIS download, an offline display map and an offline routing engine. The current reference download is not a complete navigable offline phone map.

For the first phone pilot, propose downloadable route files plus OsmAnd’s separately managed maps. A later Verge region pack needs version/size/update controls, compatible phone rendering/routing and explicit offline licences. Public OSM standard tiles prohibit bulk/offline downloading; do not use “download area” to scrape them. [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/). Satellite offline use needs its own permission; endpoint availability is not a licence.

## Area request to complete before implementation

- **Requested place and reason:** ___
- **Inside existing coverage, extension or separate region:** ___
- **Named public-road starting anchors:** ___
- **Ride profiles and typical/long target distances:** ___
- **Local reviewer and available checking time:** ___
- **Known gates, estates and major-road concerns:** ___
- **Data/providers/licences to assess:** ___
- **Success evidence and supported footprint:** ___
- **Estimated upkeep and funding:** ___
- **Decision, owner and review date:** ___

The next region has not been selected. First action: agree the place and reviewer, then assess data and scope without advertising it as supported.
