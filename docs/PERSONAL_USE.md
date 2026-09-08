# First Rooihuiskraal ride

Open http://localhost:5173 while `make api` and `make web` are running. On a fresh checkout run `make roads`, `make area` and `make neighbourhoods` first. The workspace already has these datasets.

1. Select **Rooihuiskraal**, your bike, and **Connected local roads · no major-road crossings**. Amber lines identify major roads. Connected streets can extend across suburb names, including into The Reeds, without crossing a major road. Mapped bridges/underpasses may connect opposite sides. The default start is **Hofsanger Road**, not your home or GPS position.
2. Click **Choose start on map**. Tap a public road, or pan and choose **Use map centre**. The app checks the road and shows its name, coordinates and distance from your point. Click **Use this start** to confirm and calculate. It will not move your start more than 20 m to find a route.
3. Choose **Best fit** under **Loop planning** and set your total distance. Calculate routes. It ranks the highest mapped-road score first, then the fewest laps, and shows lower-score alternatives when they save laps. On the current extract, a 20 km request includes a **6.7 km Rooihuiskraal–The Reeds loop over three laps (20.1 km total)**; higher-scoring shorter loops appear first. These are map estimates, not field-verified ratings.
4. **Nearby roads · major-road junctions allowed** explicitly permits non-motorway/trunk junctions within your chosen 2–5 km radius. Such contacts reduce the assessment. Riding along major roads remains excluded unless you also change that separate setting. A request that cannot be met shows no route; restrictions are not silently relaxed. Point-to-point mode has its own **Keep major-road junctions out** checkbox.
5. Use **Road map / Satellite**, **Fit route**, **Show area**, and fullscreen to inspect the road geometry. Imagery dates and alignment vary. The map shows one lap. Route, controls, exclusions, settings and camera survive refresh in the same browser and address.
6. Set **Average riding speed** for a moving-time estimate. Hills, stops, surface effects and training history are not included yet. The Android export uses the selected speed as its time baseline too.

## Long training rides

The distance target ranges from **5 to 200 km**, with up to **100 laps**. Use the slider, type a distance, or choose **90 / 100 / 180 / 200 km**. Best fit searches different loop sizes and chooses the lap count, completing at least the target and at most 10% above it. **Set the lap count myself** uses your requested count and a ±10% total-distance tolerance; its requested lap length must be at least 2 km.

For 90 km, the current extract offers **91.1 km / 23 laps** at 80/100, followed by **95.5 km / 13 laps** at 79.7/100 and **91.3 km / 12 laps** at 79.4/100. The longer loops extend into The Reeds with zero mapped major-road junctions. At 180 km, the same search offers approximately 182–184 km over 46, 25 or 24 laps. These examples use the Hofsanger start and default road-bike filters; different starts and exclusions change results.

Long totals repeat local loops. The Centurion coverage and any selected nearby radius remain enforced. A single 90–180 km loop is not guaranteed. Time and GPX lap counts cover the full ride.

## Understand the assessment

**Mapped-road score** is a limited estimate based on road data, with deductions shown under **Score breakdown and unknowns**. Higher scores rank first; even a small difference takes priority over lap count. The weights are provisional and not calibrated against crashes. Live traffic, crime/security conditions, unmapped closures and field verification are unknown.

**Ride sections · roads and mapped score** groups the ride by roads instead of postcode or township boundaries. Click a road to inspect it on the map. Current approved adverse reports affect new calculations; pending and expired reports do not. Refresh restores the saved assessment. Calculate routes to assess again against the current local dataset and reports.

## Edit the route

Click **Edit route on map**. Drag one of the numbered points onto another road. On a desktop you can also drag the route line directly. Clicking the route opens a road popup where you can add another drag point or choose **Avoid this mapped road**. On Android-sized touch screens, use the draggable points.

The router must visit the control points in order, project each within 20 m of an eligible road, and retain area/access/direction/turn restrictions. The new distance is shown and can differ from the original target. While recalculating, the assessment shows an updating state. An accepted edit replaces the score and road breakdown and shows the before/after score; a rejected edit retains the old assessment. Edits more than double the requested total distance are rejected. A failed edit retains the previous route and settings. **Undo edit** restores a prior accepted edit during this session; the edited route itself survives refresh. **Clear editing points** returns to automatic loop planning. Up to 12 control points are supported.

Avoiding a road excludes the entire selected OpenStreetMap way object. This may cover several sections or only part of a named street; it does not exclude every road sharing that name. The road-inspection list also supports exclusions, followed by **Calculate routes**. Clear exclusions in setup if needed. If a retained control point sits on a road you exclude, move or clear that point.

## Android navigation

1. Install **OsmAnd** on the phone. Download the offline map covering Gauteng/South Africa and a voice package.
2. In the selected route, open **Use this route on Android** and download **Android · one lap** for the first check. **Android · all laps** includes one complete track segment per lap. Ordinary **Export GPX** remains available for other track-compatible apps.
3. Transfer the file by USB or Quick Share. From Android Files, open it with OsmAnd and import it into Tracks.
4. Open the imported track, choose Navigation and the cycling profile, and follow from the start. For the all-lap file, select all segments. Inspect the turn preview and compare the imported roads with Veld before starting.
5. Avoid **Attach to roads**, reversing, or route optimisation: those can change the reviewed route. Off-track recalculation uses OsmAnd’s own rules, which do not include Veld’s local exclusions. Check the route again if the phone recalculates it.

The OsmAnd file includes exact saved geometry, road names and calculated-route extensions with turn cues at mapped road joins. It does not invent elevation or roundabout exit numbers; follow the highlighted track through a roundabout. File structure and geometry are tested; navigation on a physical Android phone and lap announcements still need a device/field check.

References: [OsmAnd navigate by track](https://osmand.net/docs/user/navigation/setup/gpx-navigation/) and [calculated-route GPX format](https://osmand.net/docs/technical/osmand-file-formats/osmand-gpx/).

The app currently listens on this computer’s loopback interface. File transfer is the immediate phone workflow; `localhost` on the phone refers to the phone itself.

## Rooihuiskraal field data

Open **Data & limits → Download Rooihuiskraal data · ZIP**. It includes the municipal polygons, clipped roads with all source tags, gates/signals and other mapped points, default eligible road segments, estate exclusions, raw OSM context and `field-checks.csv` for your observations. The app shows counts from the current extract. The ZIP uses the municipal polygon to keep this reference download bounded; that polygon does not constrain routes. Restricted roads remain in source data for inspection and are separated from the eligible layer. This ZIP is GIS data, not a phone basemap; use OsmAnd’s map download for offline maps.

`make neighbourhoods` refreshes optional suburb labels for all 67 downloaded registered townships in the pilot window. These polygons label routes only. `make area` refreshes the Rooihuiskraal municipal reference boundary with full TLS verification and preserves the previous file on failure. The source contains 22 registered township polygons. Download time is recorded separately from survey age, which the service does not supply. `make roads` or **Download / refresh roads** updates OSM data. A new extract does not prove every physical change is mapped.

## Location and safety limits

**Use my location** waits up to 30 seconds for device-reported accuracy of 20 m or better; coarse readings leave your start unchanged. A laptop may need manual selection. Reported GPS accuracy and the independent 20 m road projection limit do not guarantee absolute physical accuracy. Roads, gates, boundaries and basemap imagery can all have errors.

Inspect surfaces, gates and major-road junctions before riding. The app filters mapped restrictions; it has no live traffic, crime statistics, verified safety score or emergency service. Record your first rides’ observations in the field worksheet. Reports entered in the app stay local and require moderation before publication in its local report list.
