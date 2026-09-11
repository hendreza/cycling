# Riding with Verge in Rooihuiskraal

Open http://localhost:5173 while `make dev` is running. On a fresh checkout run `make roads`, `make area` and `make neighbourhoods` first. The workspace already has these datasets.

1. Select **Rooihuiskraal**, your bike, and **Connected local roads**. Brown lines identify major roads. Connected streets can extend across suburb names, including into The Reeds, without crossing a major road. Mapped bridges/underpasses may connect opposite sides. The default start is **Hofsanger Road**, not your home or GPS position.
2. Click **Choose start on map**. Tap a public road, or pan and choose **Use map centre**. The app checks the road and shows its name, coordinates and distance from your point. Click **Use this start** to confirm and calculate. It will not move your start more than 20 m to find a route.
3. Choose **Best fit** under **Loop planning** and set your total distance. Calculate routes. It ranks the highest mapped-road score first, then the fewest laps, and also offers distinct road and fewer-lap alternatives. On the 7 September extract, a 20 km request includes a **20.1 km single local loop**; higher-scoring loops of 3.4 km over six laps and 2.6 km over eight laps appear first. All these scores have low confidence.
4. **Within a nearby radius** permits eligible junctions within 2–5 km; the radius setting is under **More ride options**. **Across Centurion** searches the whole pilot area. Riding along major roads remains excluded unless that separate setting is changed. A request that cannot be met shows no route. Local mode retains major-road junction exclusions.

5. Use **Road map / Satellite / Routes only**, **Fit route**, **Show area**, and fullscreen to inspect the road geometry. Imagery dates and alignment vary. The map shows one lap. Route, controls, exclusions, settings and camera survive refresh in the same browser and address.
6. Open **Time estimate**, then set **Average riding speed** for a moving-time estimate. Hills, stops, surface effects and training history are not included yet. The Android export uses the selected speed as its time baseline too.

## Long training rides

The total-distance target ranges from **5 to 200 km**, with up to **100 laps**. Use the slider, type a distance, or choose a preset. Best fit meets the target within 3% above it. **Choose the lap count** accepts a total within ±3%; requested lap length must be at least 2 km. Displayed distances are rounded, while matching uses actual geometry.

Long presets default to Across Centurion with a maximum of three laps below 150 km or six laps from 150 km. An explicit custom limit is remembered. Choosing local roads keeps the search local even for a long target. **One loop · no repeated laps** can return no match; the app then reports the longest loop found in that bounded search and suggests changing the area/lap choice.

Checks on 10 September, from the Hofsanger Road anchor and the 7 September extract:

| Requested | Actual options | Road information |
| --- | --- | --- |
| 90 km, max 3 laps | 90.1 km / 2 laps / 45.0 km loop | 15 major-road junctions per lap, mapped-road score 42.7/100, low confidence |
| 180 km, max 6 laps | 180.2 km / 4 laps; 182.9 km / 6; 184.5 km / 5 | 13–15 major-road junctions per lap, low confidence |
| 200 km, max 6 laps | 201.1 km / 4 laps; 205.2 km / 5; 205.7 km / 6 | 13–15 major-road junctions per lap, low confidence |

**Refresh routes** samples different roads and excludes the recent route geometries. A refreshed 90 km search found 45 km loops over two laps, with more major-road junctions. If no different match is found, your current ride stays selected. Review each new route; a different or longer loop can have more mapped concerns.

The full path remains inside the Centurion pilot rectangle. A single 90–180 km loop is not promised. Time and GPX lap counts cover the full ride; the map shows one lap. Drag edits can change the total beyond the original planning tolerance and show the recalculated distance.

## Understand the assessment

**Mapped-road score** is a limited estimate based on road data, with deductions shown under **Score breakdown and unknowns**. Higher scores rank first; even a small difference takes priority over lap count. The weights are provisional and not calibrated against crashes. Live traffic, crime/security conditions, unmapped closures and field verification are unknown.

**Ride sections · roads and mapped score** groups the ride by roads instead of postcode or township boundaries. Click a road to inspect it on the map. Current approved adverse reports affect new calculations; pending and expired reports do not. Refresh restores the saved assessment. Calculate routes to assess again against the current local dataset and reports.

## Edit the route

Click **Edit route on map**. Drag one of the numbered points onto another road. On a desktop you can also drag the route line directly. Clicking the route opens a road popup where you can add another drag point or choose **Avoid this mapped road**. On Android-sized touch screens, use the draggable points.

The router must visit the control points in order, project each within 20 m of an eligible road, and retain area/access/direction/turn restrictions. The new distance is shown and can differ from the original target. While recalculating, the assessment shows an updating state. An accepted edit replaces the score and road breakdown and shows the before/after score; a rejected edit retains the old assessment. Edits more than double the requested total distance are rejected. A failed edit retains the previous route and settings. **Undo edit** restores a prior accepted edit during this session; the edited route itself survives refresh. **Clear editing points** returns to automatic loop planning. Up to 12 control points are supported.

Avoiding a road excludes the entire selected OpenStreetMap way object. This may cover several sections or only part of a named street; it does not exclude every road sharing that name. The road-inspection list also supports exclusions, followed by **Calculate routes**. Clear exclusions in setup if needed. If a retained control point sits on a road you exclude, move or clear that point.

## Turnarounds and blocked entrances

New routes reject immediate road reversals, including at editing controls and where laps join. The planner looks for eligible connected roads around a block or a mapped roundabout. A hard editing point in a dead end can make a route impossible; move or remove that point. Sharp joins of 160° or more are conservatively excluded. Missing or inaccurate map geometry can still disagree with the physical road. Saved rides from the previous routing policy remain visible but need recalculation before export.

Use **Mark blocked access** below the map after encountering an entrance you cannot use:

1. Zoom to the entrance and tap its road, or pan and choose **Use map centre**. The road must be within 20 m of the point.
2. Check the highlighted road section and its name. Add a note, then **Save access block**. This excludes that section in both directions for every future ride. It does not infer the estate boundary or mark other entrances.
3. Click **Recalculate route** to get new choices and updated scores. The original route remains visible for reference if no replacement fits, but an affected route cannot be exported. Move editing controls away from the blocked section if necessary.
4. Open **saved access blocks** to show a marked entrance or **Reopen section**. Blocks survive refresh and restarts until reopened or deleted in Data & privacy.

These are private owner observations and take effect without report moderation. General condition reports keep their existing moderation process. Stop before using the phone; if planning on the computer, record the entrance coordinates in your navigation app and mark the matching road on Verge afterwards. An OSM road can have several sections; the highlight defines this block’s scope.

## Android navigation

1. Once per phone, install **OsmAnd**, download the offline map for Gauteng and a voice package.
2. Under **Take your route**, click **Download for Android**. All laps are included by default; select **One lap** to check a single circuit. The file is prepared automatically when the route is ready.
3. From the computer, open **Send to phone over Wi-Fi**, read the short privacy note, and click **Create phone link**. Scan the QR with your Android camera and tap **Download for OsmAnd**. Keep both devices on the same trusted Wi-Fi and the computer running. The link expires after 10 minutes; **Close link now** ends it sooner. If needed, choose the Wi-Fi interface rather than a VPN. The app does not change firewall/router rules.
4. If **Share route** appears, it can send the prepared file to an app you choose in the operating system’s share menu. Browser support for GPX sharing varies. Download plus Quick Share/USB remains a fallback.
5. On Android, open the downloaded GPX with OsmAnd. Open its track and choose **Navigation** with the cycling profile; select all track segments for multiple laps.

The file contains the exact checked road geometry and calculated turn information. Check the imported track matches the preview. Attaching to roads, reversing or recalculating in OsmAnd can change it. Roundabout exit numbers are not supplied. A cancelled share does not discard the file; Download remains available.

The owner’s initial ride confirmed that transfer works but involves too many steps. The revised download/share controls are browser-tested; physical Android behaviour still needs checking on the owner’s device. The [optional Wi-Fi QR flow](PHONE_TRANSFER_PROPOSAL.md) is tested with a loopback listener; the owner’s network/phone still needs a check. It is available through native `make dev`; Docker Compose disables the listener. A changed route/lap choice or saved access block closes an old phone link.

See [OsmAnd’s track navigation guide](https://osmand.net/docs/user/navigation/setup/gpx-navigation/) and [Web Share browser requirements](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API).

## Rooihuiskraal field data

Open **Data & privacy → Road data, downloads & route limits → Download Rooihuiskraal data · ZIP**. It includes the municipal polygons, clipped roads with all source tags, gates/signals and other mapped points, default eligible road segments, estate exclusions, raw OSM context and `field-checks.csv` for your observations. The app shows counts from the current extract. The ZIP uses the municipal polygon to keep this reference download bounded; that polygon does not constrain routes. Restricted roads remain in source data for inspection and are separated from the eligible layer. This ZIP is GIS data, not a phone basemap; use OsmAnd’s map download for offline maps.

`make neighbourhoods` refreshes optional suburb labels for all 67 downloaded registered townships in the pilot window. These polygons label routes only. `make area` refreshes the Rooihuiskraal municipal reference boundary with full TLS verification and preserves the previous file on failure. The source contains 22 registered township polygons. Download time is recorded separately from survey age, which the service does not supply. `make roads` or **Download / refresh roads** updates OSM data. A new extract does not prove every physical change is mapped.

## Location and safety limits

**Use my location** waits up to 30 seconds for device-reported accuracy of 20 m or better; coarse readings leave your start unchanged. A laptop may need manual selection. Reported GPS accuracy and the independent 20 m road projection limit do not guarantee absolute physical accuracy. Roads, gates, boundaries and basemap imagery can all have errors.

Inspect surfaces, gates and major-road junctions before riding. The app filters mapped restrictions; it has no live traffic, crime statistics, verified safety score or emergency service. Record your first rides’ observations in the field worksheet. Reports entered in the app stay local and require moderation before publication in its local report list.

## Privacy and public-release work

Data & privacy provides the current notice, local JSON export and confirmed deletion of app records. Downloaded files, other browsers and backups remain separate. The public-release checklist stays visible on that page and in [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md); personal testing does not mark those tasks complete.
