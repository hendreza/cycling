# Veld · personal Centurion cycling planner

**Real OpenStreetMap roads, local route generation, GPX export.** Open the running app at http://localhost:5173. This version replaces the synthetic prototype.

The downloaded Centurion extract contains 34,100 mapped ways. The UI displays separate road and residential-boundary source dates; the running app shows the current snapshots after each import. Routes use actual OSM node geometry. No routing API key or hosted routing service is required: your computer computes routes from a cached extract. Surface and access tags are shown. An explainable mapped-road score ranks route candidates; live traffic, security conditions and elevation remain unknown.

## Use it for your first ride

1. Select **Rooihuiskraal**, your bike and **Connected local roads · no major-road crossings**. Local rides can extend into adjoining suburbs along connected roads; administrative boundaries no longer stop them.
2. Use **Choose start on map**, tap a road and confirm the resolved road with **Use this start**. Browser GPS must report accuracy ≤20 m; road projection independently stays within 20 m.
3. Set a **5–200 km** total and choose **Best fit** under **Loop planning**. Calculate routes to search connected roads and choose laps automatically: highest mapped-road score first, then fewest laps. Alternatives show the score/lap trade-off. Best fit meets or exceeds your target by up to 10%; manual lap planning remains available.
4. Preview **Road map / Satellite**, **Fit route**, **Show area** or fullscreen. **Edit route on map** supports dragging the line/numbered points, selecting a road to avoid, and undo. The score, road sections, lap count and distance update together after an accepted edit. Rejected edits retain the previous route and assessment. The selected route and editing controls survive refresh.
5. Open **Use this route on Android** for OsmAnd turn-guidance GPX, one lap or all laps. Transfer by USB/Quick Share and check the imported track on your phone. **Export GPX** provides standard track geometry for other apps.
6. Open **Data & limits** to download detailed Rooihuiskraal roads, municipal boundary and a field-check worksheet.

See [the first-ride and Android instructions](docs/PERSONAL_USE.md). Map-based access is not field-verified. Device accuracy is an estimate; no absolute positioning or road-safety guarantee is claimed. Native Android handling still needs a physical-device check.

## Start locally

Requires Python 3.13 and Node 22. From the repository root:

```sh
make setup
# On a fresh checkout, download the Centurion road extract once:
.venv/bin/python backend/scripts/download_roads.py
.venv/bin/python backend/scripts/download_area.py
.venv/bin/python backend/scripts/download_neighbourhoods.py
```

Run each service in its own terminal:

```sh
make api
```

```sh
make web
```

Open **http://localhost:5173**. API documentation: http://127.0.0.1:8000/docs.

You can also use **Download / refresh roads** in the app. It downloads a bounded Centurion extract from Overpass, validates it and atomically replaces the old file. A failed or partial response preserves the last working copy. Routing works without internet after download; background map tiles and fonts still need a connection. Satellite imagery uses Esri World Imagery with place labels and visible source credits. Imagery dates vary; it is a visual preview rather than live road-condition data.

The covered rectangle is 28.06–28.275° E and 25.985–25.79° S. It is a deliberate local pilot window, not an official municipal boundary. The full route stays inside it. Nearby destinations outside it are not supported.

## Local data and privacy

- `data/centurion-osm.json`: cached OSM extract, ignored by Git.
- `data/areas/rooihuiskraal.json`: City of Tshwane registered township polygons, source attribution and download date; ignored by Git. Refresh with `make area`.
- `data/areas/centurion-neighbourhoods.json`: optional City of Tshwane suburb names for route descriptions, never routing limits. Refresh with `make neighbourhoods`.
- `data/pilot.db`: saved route snapshots, local reports and moderation audit. Routes include selected coordinates and are retained locally until this database is removed or managed explicitly.
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
| `ADMIN_KEY` | Enables local report moderation when set; no default secret |

Reports attach to real OSM ways. They remain pending until moderated. Current approved adverse reports penalise the affected ways during new searches and lower their mapped-road assessment. Pending, rejected, expired and positive reports do not change the score. Saved geometry and assessments remain snapshots; Calculate routes refreshes them. Personal road exclusions remove a way explicitly. This remains a personal local app, not a verified public community service.

## How routing works

The importer builds a directed graph, retaining actual road shapes and lengths. Shared nodes form junctions; crossing lines at different OSM nodes do not create false intersections. Eligibility is checked before routing:

- Local routes follow the connected road network, stopping at major roads and their at-grade junctions. Explicitly mapped grade separation can permit passage beneath or above a major road. Municipal polygons supply names and downloadable reference data only.
- Major roads are primary/secondary classes (including links), motorways/trunks, or mapped speeds above 60 km/h. Nearby mode explicitly permits non-motorway/trunk junctions within the chosen 2–5 km radius. Riding along major roads is a separate option, off by default; local mode always excludes it.
- Exclude motorways, trunks, construction, steps, motorroads and mapped cycling prohibitions.
- Exclude explicit private/restricted/unknown access even when bicycle tags appear permissive.
- Exclude complete road geometry intersecting mapped gated/private or named-estate residential areas. These appear shaded on the map. Estate-name matching is conservative: it excludes unverified passage rather than asserting legal ownership.
- Exclude unresolved gates and barriers; honor explicit bicycle access where supported.
- Exclude unverified service roads, driveways and parking aisles.
- Honor one-way and bicycle-specific direction tags and mapped node turn restrictions. Complex via-way or conditional restrictions conservatively exclude the incoming way.
- Road excludes known unpaved surfaces; off-road routes require stronger access and difficulty evidence.

Best fit samples loops at several distances and directions, including three-leg connections into adjoining roads. It ranks the candidates it found, not every possible loop. Wider searches retain valid local candidates. The mapped-road score starts at 100 and deducts for major-road contacts, road class, speed, missing surface/access/speed tags, poor mapped smoothness and current adverse reports. It is not a crash probability or a verified safety rating. [The weights and limits are documented](docs/ARCHITECTURE.md#mapped-road-assessment). Gravel/MTB may return paved routes when eligible off-road connections are missing.

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
