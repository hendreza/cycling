# Centurion personal release · v0.2

The immediate goal is a useful route planner for one local rider: choose a real start, generate a route on real roads, inspect it, exclude known unsuitable roads and take a GPX file on a ride.

Scope stays within the fixed Centurion pilot rectangle. This is not an official municipal boundary or an expansion to nearby venues. Road, gravel and MTB refer to allowed surfaces and difficulty; they do not guarantee off-road options where the mapped network lacks eligible connections.

Access, road preference and evidence remain separate. Known private/prohibited access and unresolved mapped gates are excluded before search. Missing explicit access tags on ordinary roads are handled through road-class inference and disclosed. This replaces the earlier synthetic demo rule set; there is still no independent gate verification database.

The mapped-road score is an explainable provisional heuristic based on actual route tags, major-road contacts, missing observations and current approved adverse reports. It is not a verified safety rating, crash probability or crime estimate. Unknown live traffic, security and field conditions remain explicit. Surface percentages include unknown coverage. Duration is a manual-speed moving-time estimate.

Up to three routes is a ceiling, not a quota. Local routes use major roads and junctions as limits, across administrative boundaries. A loop must close. Best fit searches candidate loop sizes, completes 100–110% of the total target and ranks mapped-road score before lap count. Manual lap plans retain a ±10% tolerance. All returned geometry stays in coverage. Exported GPX always matches the stored selected path. Personal road exclusions persist in the browser and require replanning.

The first release is local and personal. Community reports remain a locally stored, manually moderated capability. Current approved adverse reports penalise ways during new searches and reduce their assessment. Saved routes remain immutable snapshots. Public accounts, trusted contributors, verified venues and public deployment are deferred.

Success for the next personal trial is a route the user can inspect, understand and export, with no known prohibited crossings. Record access contradictions and surface surprises, exclude affected sections, and use that evidence to improve local policy and source data. Actual riding validation has not been performed by the implementation agent.
