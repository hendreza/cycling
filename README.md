# Verge · personal Centurion cycling planner

**Real OpenStreetMap roads, local route generation, GPX export.** Open the running app at http://localhost:5173. This version replaces the synthetic prototype.

**Start your installed app:** run `./START_VERGE.sh` from this folder. It opens the browser when ready; Ctrl+C stops the services it starts. See [START_HERE.md](START_HERE.md) for the launch file, optional Linux shortcut and troubleshooting.

**Plan the next version:** [mobile and release plan](docs/RELEASE_PLAN.md) · [adding areas](docs/AREA_EXPANSION_PLAN.md) · [legal review brief](docs/LEGAL_REVIEW_BRIEF.md) · [decision log](docs/planning/DECISIONS.md). These are proposals; public release remains unapproved and unfinished.

The downloaded Centurion extract contains 34,100 mapped ways. The UI displays separate road and residential-boundary source dates; the running app shows the current snapshots after each import. Routes use actual OSM node geometry. No routing API key or hosted routing service is required: your computer computes routes from a cached extract. Surface and access tags are shown. An explainable mapped-road score ranks route candidates; live traffic, security conditions and elevation remain unknown.

## Use it for your first ride

1. Select **Rooihuiskraal**, your bike and **Connected local roads**. Local rides can extend into adjoining suburbs along connected roads; administrative boundaries no longer stop them.
2. Use **Choose start on map**, tap a road and confirm the resolved road with **Use this start**. Browser GPS must report accuracy ≤20 m; road projection independently stays within 20 m.
3. Set a **5–200 km** total and choose **Best fit** under **Loop planning**. Calculate routes to search connected roads and choose laps automatically: highest mapped-road score first, then fewest laps. Alternatives show the score/lap trade-off. Best fit meets or exceeds your target by up to 3%; manual lap planning remains available.
4. Use **Refresh routes** for different roads with the same settings. The current route remains selected if no new match is found. Preview **Road map / Satellite / Routes only**, **Fit route**, **Show area** or fullscreen. **Edit route on map** supports dragging the line/numbered points, selecting a road to avoid, and undo. The score, road sections, lap count and distance update together after an accepted edit. Rejected edits retain the previous route and assessment. The selected route and editing controls survive refresh.
5. Use **Download for Android** under **Take your route** for OsmAnd turn-guidance GPX, with all laps selected by default. Choose one lap if wanted. **Send to phone over Wi-Fi → Create phone link** opens a 10-minute GPX-only QR download on your trusted local network. **Share route** appears when the browser supports sharing GPX files. Quick Share/USB remains available. **Export GPX** provides standard track geometry for other apps.
6. Open **Data & privacy → Road data, downloads & route limits** for detailed Rooihuiskraal roads, municipal boundary and a field-check worksheet. The same page provides privacy controls and the permanent public-release checklist.

For longer rides, the default widens the search across Centurion: up to three laps below 150 km and six laps from 150 km. You can choose connected local roads, a nearby radius, a single loop or a custom lap limit. Major-road junctions appear on the map and in each route assessment. Roads excluded by access/direction rules remain excluded. A 90 or 180 km single loop is not promised inside this pilot window.

The redesign uses the supplied Verge kit. Extra ride settings and time calibration are folded away until needed. The private app’s [privacy notice](docs/PRIVACY.md), [public-release checklist](docs/RELEASE_CHECKLIST.md) and [brand notes](docs/BRAND.md) record implemented controls and unfinished work.

**Mark blocked access** below the map lets you select an entrance, preview its road section and save an exclusion for every future ride. Reopen sections individually when appropriate. Old saved routes that cross a block cannot be exported.

See [the personal-use and Android instructions](docs/PERSONAL_USE.md). Map-based access is not field-verified. Device accuracy is an estimate; no absolute positioning or road-safety guarantee is claimed. The owner has completed an initial real ride and reported excessive turnarounds and unmapped access controls. The new routing changes still need another ride; Android voice/lap/off-track behaviour is not fully validated.

## Start locally

Requires Python 3.13 and Node 22. From the repository root:

```sh
make setup
# On a fresh checkout, download the Centurion road extract once:
.venv/bin/python backend/scripts/download_roads.py
.venv/bin/python backend/scripts/download_area.py
.venv/bin/python backend/scripts/download_neighbourhoods.py
```

Start both services and open the browser:

```sh
./START_VERGE.sh
```

`make dev` remains available without automatically opening a browser. Keep that terminal open; Ctrl+C stops both services started by it. Alternatively, run each service in its own terminal:

```sh
make api
```

```sh
make web
```

Open **http://localhost:5173**. API documentation: http://127.0.0.1:8000/docs.

You can also use **Download / refresh roads** in the app. It downloads a bounded Centurion extract from Overpass, validates it and atomically replaces the old file. A failed or partial response preserves the last working copy. Routing works without internet after download; background map tiles need a connection; fonts are local and Routes only works without external tiles. Satellite imagery uses Esri World Imagery with place labels and visible source credits. Imagery dates vary; it is a visual preview rather than live road-condition data.

The covered rectangle is 28.06–28.275° E and 25.985–25.79° S. It is a deliberate local pilot window, not an official municipal boundary. The full route stays inside it. Nearby destinations outside it are not supported.

## Local data and privacy

- `data/centurion-osm.json`: cached OSM extract, ignored by Git.
- `data/areas/rooihuiskraal.json`: City of Tshwane registered township polygons, source attribution and download date; ignored by Git. Refresh with `make area`.
- `data/areas/centurion-neighbourhoods.json`: optional City of Tshwane suburb names for route descriptions, never routing limits. Refresh with `make neighbourhoods`.
- `data/pilot.db`: saved route snapshots, local reports and moderation audit. Routes include selected coordinates and are retained locally until explicitly deleted using Data & privacy. Export/deletion covers reports and audit too; downloaded files/backups remain separate.
- Browser local storage: `veld-session-v1` retains the current routes (including geometry and chosen coordinates), selected option, draft/applied settings, laps and pace; `veld-map-view-v1` retains map position; `veld-basemap` retains the background; `veld-avoided-ways` retains legacy exclusions. Storage is specific to the browser and origin, so `localhost` and `127.0.0.1` have separate sessions. Clearing site data removes these preferences; storage failure is reported in the UI. Administrator credentials are not saved.
- Route requests stay between your browser and the local API. The selected map tile provider (OpenStreetMap or Esri) can infer the displayed map area from tile requests. Road imports always request the same pilot rectangle.

Environment options:

| Variable | Purpose |
| --- | --- |
| `OSM_DATA_PATH` | Road extract path; defaults to repository `data/centurion-osm.json` |
| `VELD_AREA_PATH` | Municipal reference/download cache; defaults to `data/areas/rooihuiskraal.json` |
| `VELD_NEIGHBOURHOODS_PATH` | Optional suburb-label cache; defaults to `data/areas/centurion-neighbourhoods.json` |
| `OVERPASS_URL` | Configurable extract endpoint; default `https://overpass-api.de/api/interpreter` |
| `DATABASE_PATH` | SQLite path; defaults to `data/pilot.db` relative to the backend working directory |
| `VERGE_ALLOWED_HOSTS` | Optional explicit hostnames for a deliberately configured private deployment; never use a wildcard |
| `VERGE_ALLOWED_ORIGINS` | Optional exact trusted browser origins; does not add authentication |
| `ADMIN_KEY` | Enables local report moderation when set; no default secret |

Reports attach to real OSM ways. They remain pending until moderated. Current approved adverse reports penalise the affected ways during new searches and lower their mapped-road assessment. Pending, rejected, expired and positive reports do not change the score. Saved geometry and assessments remain snapshots; Calculate routes refreshes them. Personal road exclusions remove a way explicitly. This remains a personal local app, not a verified public community service.

## How routing works

The importer builds a directed graph, retaining actual road shapes and lengths. Shared nodes form junctions; crossing lines at different OSM nodes do not create false intersections. Eligibility is checked before routing:

- Local routes follow the connected road network, stopping at major roads and their at-grade junctions. Explicitly mapped grade separation can permit passage beneath or above a major road. Municipal polygons supply names and downloadable reference data only.
- Major roads are primary/secondary classes (including links), motorways/trunks, or mapped speeds above 60 km/h. Nearby mode permits eligible junctions within the chosen 2–5 km radius; Across Centurion searches the full downloaded pilot area. Riding along major roads is a separate option, off by default; local mode always excludes it.
- Exclude motorways, trunks, construction, steps, motorroads and mapped cycling prohibitions.
- Exclude explicit private/restricted/unknown access even when bicycle tags appear permissive.
- Exclude complete road geometry intersecting mapped gated/private or named-estate residential areas. These appear shaded on the map. Estate-name matching is conservative: it excludes unverified passage rather than asserting legal ownership.
- Exclude unresolved gates and barriers; honor explicit bicycle access where supported.
- Exclude unverified service roads, driveways and parking aisles.
- Honor one-way and bicycle-specific direction tags and mapped node turn restrictions. Complex via-way or conditional restrictions conservatively exclude the incoming way.
- Road excludes known unpaved surfaces; off-road routes require stronger access and difficulty evidence.

Best fit samples loops at several distances and directions, then extends candidates along eligible road connections towards useful lap lengths. It offers the highest-ranked option, a distinct option with fewer laps and another road alternative when available. Every extended lap is checked for continuity, directions and turn restrictions including the closing junction. Direction-aware search rejects immediate road reversals and road-join turns of 160° or more. Turnarounds must follow eligible connected roads around a block or mapped circle; no artificial detour or access exception is inserted. It ranks the candidates it found, not every possible loop. Wider searches retain valid local candidates. The mapped-road score starts at 100 and deducts for major-road contacts, road class, speed, missing surface/access/speed tags, poor mapped smoothness and current adverse reports. It is not a crash probability or a verified safety rating. [The weights and limits are documented](docs/ARCHITECTURE.md#mapped-road-assessment). Gravel/MTB may return paved routes when eligible off-road connections are missing.

See [architecture](docs/ARCHITECTURE.md), [personal-use notes](docs/PERSONAL_USE.md), [verification](docs/VERIFICATION.md) and [remaining work](docs/BACKLOG.md).

## Tests

```sh
cd backend
../.venv/bin/pytest
../.venv/bin/ruff check .
../.venv/bin/ruff format --check .
cd ../frontend
npm run build
npx playwright install chromium
npx playwright test
```

Python tests exercise graph topology, access, turn restrictions, saved exports, import failure and reporting. Browser tests use captured real-road API fixtures to check UI behavior without downloading public data in CI. A live local-extract API/GPX smoke test was also performed.

## Docker alternative

```sh
cp .env.example .env
# Optionally set ADMIN_KEY.
docker compose up --build
```

Open http://localhost:8080 and select **Download / refresh roads**. SQLite and OSM data persist in the shared `/data` volume. Docker is unavailable in the implementation environment, so runtime behavior remains unverified locally. Development and Compose ports bind to loopback.

Road data and captured route fixtures: © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright). See [OSM access tagging](https://wiki.openstreetmap.org/wiki/Key:access) and [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) for the upstream data model and service.

For Docker, after building the stack run `docker compose exec backend python scripts/download_roads.py` and `docker compose exec backend python scripts/download_area.py`. Run `docker compose exec backend python scripts/download_neighbourhoods.py` for optional suburb labels. All caches use the persistent `/data` volume. Docker execution has not been verified in this environment.
