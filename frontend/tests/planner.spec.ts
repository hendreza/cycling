import { test, expect, type Page } from "@playwright/test";
const runtimeErrors = new WeakMap<Page, string[]>();
test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([]);
});
import { readFileSync } from "node:fs";
const routes = JSON.parse(
  readFileSync(new URL("./fixtures/routes.json", import.meta.url), "utf8"),
);
const places = JSON.parse(
  readFileSync(new URL("./fixtures/places.json", import.meta.url), "utf8"),
);

// Real OSM-derived geometry captured from the local API; external services are not called in CI.
// Python integration tests exercise actual routing/storage; these isolate browser interactions.
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://tile.openstreetmap.org/**", (r) =>
    r.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==",
        "base64",
      ),
    }),
  );
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/data/exclusions")
      return route.fulfill({
        json: { type: "FeatureCollection", features: [] },
      });
    if (path === "/api/places") return route.fulfill({ json: places });
    if (path === "/api/data/status")
      return route.fulfill({
        json: {
          available: true,
          updating: false,
          error: null,
          timestamp: routes.data_timestamp,
          ways: 34100,
        },
      });
    if (path === "/api/locations/resolve") {
      const body = request.postDataJSON();
      const coords = body.plan[body.kind + "_coordinates"];
      return route.fulfill({
        json: {
          requested_coordinates: coords,
          coordinates: coords,
          snap_distance_m: 0,
          road_name: "Fixture selected road",
          way_id: 4940489,
          road_class: "residential",
          surface: "asphalt",
        },
      });
    }
    if (path === "/api/areas/rooihuiskraal/data")
      return route.fulfill({
        json: {
          road_count: 200,
          tagged_nodes: 40,
          eligible_segments: 201,
          road_timestamp: routes.data_timestamp,
        },
      });
    if (path === "/api/routes") return route.fulfill({ json: routes });
    if (path.endsWith("/gpx"))
      return route.fulfill({
        contentType: "application/gpx+xml",
        body: readFileSync(
          new URL("./fixtures/route.gpx", import.meta.url),
          "utf8",
        ),
      });
    if (path === "/api/reports" && request.method() === "POST")
      return route.fulfill({
        status: 201,
        json: { message: "Report saved for moderation." },
      });
    if (path === "/api/reports") return route.fulfill({ json: [] });
    return route.fulfill({
      status: 404,
      json: { detail: "Unexpected test request" },
    });
  });
});

test("real route details, profile, exact GPX and local reports", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /^[1-3] routes?$/ }),
  ).toBeVisible();
  await expect(page.getByText("Centurion cycling routes")).toBeVisible();
  await page.getByRole("button", { name: "Gravel", exact: true }).click();
  await page.getByRole("button", { name: "Calculate routes" }).click();
  await expect(
    page.getByText("Round trips · GRAVEL · Centurion"),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export GPX", exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(
    /^verge-centurion-.*\.gpx$/,
  );
  await page.getByRole("button", { name: "Add a community report" }).click();
  await page
    .getByLabel("What did you observe?")
    .fill("A road condition to inspect before riding.");
  await page.getByRole("button", { name: "Submit for moderation" }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "saved for moderation",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("map selection, remembered road exclusion and mobile layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /^[1-3] routes?$/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Choose start on map" }).click();
  await expect(page.getByLabel("Choose route location")).toContainText(
    "Tap a road on the map",
  );
  await page
    .locator(".leaflet-container")
    .click({ position: { x: 160, y: 160 } });
  await expect(page.locator(".location-match")).toContainText(
    "Fixture selected road",
  );
  await page
    .getByRole("button", { name: "Use this start", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Start: Fixture selected road",
  );
  await page.getByText(/Inspect roads & avoid a section/).click();
  await page.getByRole("button", { name: "Avoid this road" }).first().click();
  await page.locator(".ride-options summary").click();
  await expect(page.getByText(/1 mapped roads excluded/)).toBeVisible();
  const planning = page.waitForRequest(
    (r) => new URL(r.url()).pathname === "/api/routes" && r.method() === "POST",
  );
  await page.getByRole("button", { name: "Calculate routes" }).click();
  const body = (await planning).postDataJSON();
  expect(body.start_coordinates).toHaveLength(2);
  expect(body.avoid_ways).toHaveLength(1);
  await page.reload();
  await page.locator(".ride-options summary").click();
  await expect(page.getByText(/1 mapped roads excluded/)).toBeVisible();
  await page.screenshot({ path: "/tmp/veld-real-mobile.png", fullPage: true });
});

test("empty result and API failure are visible", async ({ page }) => {
  await page.route("**/api/routes", (r) =>
    r.fulfill({
      json: {
        routes: [],
        message: "No eligible roads match. Restricted access was not relaxed.",
      },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "No matching route yet" }),
  ).toBeVisible();
  await page.route("**/api/routes", (r) =>
    r.fulfill({ status: 503, json: { detail: "Download road data first." } }),
  );
  await page.getByRole("button", { name: "Calculate routes" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Download road data first.",
  );
});

test("desktop map render and current approach", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /^[1-3] routes?$/ }),
  ).toBeVisible();
  await expect(page.locator(".leaflet-container")).toBeVisible();
  expect(
    (await page.locator(".leaflet-container").boundingBox())!.height,
  ).toBeGreaterThan(300);
  await expect(page.getByRole("button", { name: "Map marker" })).toBeVisible();
  await page.screenshot({ path: "/tmp/veld-real-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Data & privacy" }).click();
  await page.locator(".data-details > summary").click();
  await expect(
    page.getByRole("heading", { name: "What to check before your first ride" }),
  ).toBeVisible();
});

test("satellite switching preserves the route and remembers the basemap", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Tiny neutral test tile: imagery availability is checked separately against the real provider.
  const tile = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==",
    "base64",
  );
  await page.route("https://services.arcgisonline.com/**/tile/**", (r) =>
    r.fulfill({ contentType: "image/png", body: tile }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /^[1-3] routes?$/ }),
  ).toBeVisible();
  await page.locator(".route-card").nth(1).click();
  const details = await page.locator(".route-detail").innerText();
  const imagery = page.waitForRequest((r) =>
    r.url().includes("World_Imagery/MapServer/tile/"),
  );
  await page.getByRole("button", { name: "Satellite", exact: true }).click();
  await imagery;
  await expect(page.locator(".map-shell")).toHaveAttribute(
    "data-basemap",
    "satellite",
  );
  await expect(page.locator(".route-card").nth(1)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(await page.locator(".route-detail").innerText()).toBe(details);
  await expect(page.getByRole("button", { name: "Map marker" })).toBeVisible();
  await expect(page.locator(".leaflet-control-attribution")).toContainText(
    "Esri",
  );
  await page.getByRole("button", { name: "Fit route", exact: true }).click();
  await page.getByRole("button", { name: "Enter fullscreen" }).click();
  await expect(
    page.getByRole("button", { name: "Exit fullscreen" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Satellite", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Exit fullscreen" }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Satellite", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Road map", exact: true }).click();
  await expect(page.locator(".map-shell")).toHaveAttribute(
    "data-basemap",
    "road",
  );
  expect(errors).toEqual([]);
});

test("satellite failure offers a road-map fallback on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("https://services.arcgisonline.com/**/tile/**", (r) =>
    r.abort(),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /^[1-3] routes?$/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Satellite", exact: true }).click();
  await expect(page.locator(".map-error")).toContainText(
    "Satellite imagery could not load",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Try road map", exact: true }).click();
  await expect(page.locator(".map-error")).toHaveCount(0);
  await expect(page.locator(".map-shell")).toHaveAttribute(
    "data-basemap",
    "road",
  );
});

test("refresh restores the chosen lap route, draft settings and map view without replanning", async ({
  page,
}) => {
  let plans = 0;
  await page.route("https://services.arcgisonline.com/**/tile/**", (r) =>
    r.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==",
        "base64",
      ),
    }),
  );
  await page.route("**/api/routes", (r) => {
    plans++;
    const laps = r.request().postDataJSON().laps;
    return r.fulfill({
      json: {
        ...routes,
        routes: routes.routes.map((route: any) => ({
          ...route,
          laps,
          lap_distance: route.distance,
          distance: Number((route.distance * laps).toFixed(1)),
          distance_m: route.distance_m * laps,
          lap_duration: route.duration,
          duration: route.duration * laps,
        })),
      },
    });
  });
  await page.goto("/");
  await expect(page.locator(".route-card")).toHaveCount(routes.routes.length);
  await page.getByLabel("Total ride distance").fill("60");
  await page.getByLabel("Loop planning").selectOption("manual");
  await page.getByLabel("Laps", { exact: true }).selectOption("3");
  await expect(page.locator(".lap-hint")).toContainText(
    "3 laps × approximately 20.0 km · 60 km total",
  );
  const planning = page.waitForRequest(
    (r) => new URL(r.url()).pathname === "/api/routes" && r.method() === "POST",
  );
  await page.getByRole("button", { name: "Calculate routes" }).click();
  expect((await planning).postDataJSON()).toMatchObject({
    distance: 60,
    laps: 3,
  });
  await expect(page.locator(".lap-detail")).toContainText(
    "GPX includes all 3 laps",
  );
  await page.locator(".route-card").nth(1).click();
  await page.getByRole("button", { name: "Satellite", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Gravel", exact: true }).click();
  await page.getByLabel("Total ride distance").fill("48");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("veld-session-v1")!).plan.distance,
      ),
    )
    .toBe(48);
  // Wait for Leaflet's zoom animation before recording the camera.
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("veld-map-view-v1")!).zoom,
      ),
    )
    .toBeGreaterThan(12);
  const camera = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("veld-map-view-v1")!),
  );
  const id = routes.routes[1].id;
  // Stored geometry remains usable if the local route service is temporarily unavailable.
  await page.route("**/api/routes", (r) => {
    plans++;
    return r.fulfill({ status: 503 });
  });
  const details = await page.locator(".route-detail").innerText();
  await page.reload();
  await expect(page.locator(".route-card").nth(1)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(plans).toBe(2);
  expect(await page.locator(".route-detail").innerText()).toBe(details);
  await expect(page.getByLabel("Laps", { exact: true })).toHaveValue("3");
  await expect(page.getByLabel("Total ride distance")).toHaveValue("48");
  await expect(
    page.getByRole("button", { name: "Gravel", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/Round trips · ROAD · Centurion/)).toContainText(
    "Update routes to apply your changes",
  );
  await expect(page.locator(".map-shell")).toHaveAttribute(
    "data-basemap",
    "satellite",
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("veld-map-view-v1")!),
      ),
    )
    .toEqual(camera);
  const gpx = page.waitForRequest((r) =>
    new URL(r.url()).pathname.endsWith(`/routes/${id}/gpx`),
  );
  await page.getByRole("button", { name: "Export GPX", exact: true }).click();
  await gpx;
});

test("lap count follows distance limits and point-to-point resets to one", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".route-card").first()).toBeVisible();
  await page.getByLabel("Loop planning").selectOption("manual");
  await page.getByLabel("Laps", { exact: true }).selectOption("8");
  await page.getByLabel("Total ride distance").fill("5");
  await expect(page.getByLabel("Laps", { exact: true })).toHaveValue("2");
  await page
    .getByRole("button", { name: "Point to point", exact: true })
    .click();
  await expect(page.getByLabel("Laps", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Ride area", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Keep major-road junctions out")).toBeChecked();
  const request = page.waitForRequest(
    (r) => new URL(r.url()).pathname === "/api/routes" && r.method() === "POST",
  );
  await page.getByRole("button", { name: "Calculate routes" }).click();
  expect((await request).postDataJSON()).toMatchObject({
    mode: "point",
    laps: 1,
  });
});

test("damaged saved state recovers and unavailable storage is reported", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "veld-session-v1",
      JSON.stringify({ version: 1, routes: [{ coordinates: null }] }),
    );
  });
  await page.goto("/");
  await expect(page.locator(".route-card").first()).toBeVisible();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Storage unavailable", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: "Gravel", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "could not save your ride",
  );
});

test("road and satellite tiles and route SVG render with WebGL disabled", async ({
  page,
}) => {
  await page.route("https://services.arcgisonline.com/**/tile/**", (r) =>
    r.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==",
        "base64",
      ),
    }),
  );
  await page.goto("/");
  expect(
    await page.evaluate(() =>
      document.createElement("canvas").getContext("webgl"),
    ),
  ).toBeNull();
  await expect(
    page.locator(".road-tiles img.leaflet-tile-loaded").first(),
  ).toBeVisible();
  await expect(page.locator("svg .selected-route-line")).toBeVisible();
  await page.getByRole("button", { name: "Satellite", exact: true }).click();
  await expect(
    page.locator(".satellite-tiles img.leaflet-tile-loaded").first(),
  ).toBeVisible();
  await expect(
    page.locator(".label-tiles img.leaflet-tile-loaded").first(),
  ).toBeVisible();
  await expect(page.locator("svg .selected-route-line")).toHaveAttribute(
    "stroke",
    "#c67139",
  );
  await expect(page.locator(".map-error")).toHaveCount(0);
  await page.getByRole("button", { name: "Enter fullscreen" }).click();
  await expect
    .poll(
      async () =>
        (await page.locator(".leaflet-container").boundingBox())!.height,
    )
    .toBeGreaterThan(500);
  await page.getByRole("button", { name: "Fit route", exact: true }).click();
  await page.getByRole("button", { name: "Exit fullscreen" }).click();
  await page.getByRole("button", { name: "Road map", exact: true }).click();
  await page.getByRole("button", { name: "Fit route", exact: true }).click();
  await expect(page.locator("svg .selected-route-line")).toHaveAttribute(
    "stroke",
    "#c67139",
  );
});

test("coarse GPS is rejected until a fix within 20 metres arrives", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    longitude: 28.18948,
    latitude: -25.87852,
    accuracy: 1500,
  });
  await page.goto("/");
  await expect(page.locator(".route-card").first()).toBeVisible();
  await page
    .getByRole("button", { name: "Use my location", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "only accurate to ±1500 m",
  );
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("veld-session-v1")!).plan
          .start_coordinates,
    ),
  ).toBeUndefined();
  await context.setGeolocation({
    longitude: 28.18948,
    latitude: -25.87852,
    accuracy: 8,
  });
  await expect(page.getByRole("status")).toContainText(
    "reported accuracy ±8 m",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("veld-session-v1")!).plan
            .start_accuracy_m,
      ),
    )
    .toBe(8);
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("veld-map-view-v1")!).zoom,
      ),
    )
    .toBe(18);
  const planning = page.waitForRequest(
    (r) => new URL(r.url()).pathname === "/api/routes" && r.method() === "POST",
  );
  await page.getByRole("button", { name: "Calculate routes" }).click();
  expect((await planning).postDataJSON()).toMatchObject({
    start_coordinates: [28.18948, -25.87852],
    start_accuracy_m: 8,
  });
});

test("cancelled coarse location leaves the chosen start unchanged", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    longitude: 28.18948,
    latitude: -25.87852,
    accuracy: 1500,
  });
  await page.goto("/");
  await expect(page.locator(".route-card").first()).toBeVisible();
  await page
    .getByRole("button", { name: "Use my location", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "only accurate to ±1500 m",
  );
  await page
    .getByRole("button", { name: "Cancel location search", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("cancelled");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("veld-session-v1")!).plan
          .start_coordinates,
    ),
  ).toBeUndefined();
});

test("rider pace immediately updates moving time and persists without changing the route", async ({
  page,
}) => {
  let requests = 0;
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/routes") requests++;
  });
  await page.goto("/");
  await expect(page.locator(".route-card").first()).toBeVisible();
  await page.locator(".route-card").nth(1).click();
  const time = page
    .locator(".route-card")
    .nth(1)
    .locator(".stats > div")
    .nth(2);
  await page.locator(".pace-panel > summary").click();
  await page.getByLabel("Average riding speed").fill("10");
  const distance = routes.routes[1].distance_m / 1000;
  await expect(time).toContainText(`${Math.round((distance / 10) * 60)} min`);
  await page.getByLabel("Average riding speed").fill("30");
  await expect(time).toContainText(`${Math.round((distance / 30) * 60)} min`);
  await expect(
    page.getByText(/Update routes to apply your changes/),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("veld-session-v1")!).plan
            .rider_speed_kmh,
      ),
    )
    .toBe(30);
  await page.reload();
  await expect(page.getByLabel("Average riding speed")).toHaveValue("30");
  await expect(page.locator(".route-card").nth(1)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(time).toContainText(`${Math.round((distance / 30) * 60)} min`);
  expect(requests).toBe(1);
});

test("area changes move the map and a start needs explicit confirmation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".route-card").first()).toBeVisible();
  await page.getByLabel("Starting area").selectOption("highveld");
  await expect(page.locator(".route-card")).toHaveCount(0);
  await page.getByLabel("Starting area").selectOption("rooihuiskraal");
  const anchor = places.find((p: any) => p.id === "rooihuiskraal").coordinates;
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("veld-map-view-v1")!).center,
      ),
    )
    .toEqual(anchor);
  await page.getByRole("button", { name: "Choose start on map" }).click();
  await page.getByRole("button", { name: "Use map centre" }).click();
  await expect(page.locator(".location-match")).toContainText(
    "Fixture selected road",
  );
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("veld-session-v1")!).plan
          .start_coordinates,
    ),
  ).toBeNull();
  const request = page.waitForRequest(
    (r) => new URL(r.url()).pathname === "/api/routes" && r.method() === "POST",
  );
  await page
    .getByRole("button", { name: "Use this start", exact: true })
    .click();
  const body = (await request).postDataJSON();
  expect(body.start).toBe("rooihuiskraal");
  expect(body.start_coordinates[0]).toBeCloseTo(anchor[0], 5);
  expect(body.start_coordinates[1]).toBeCloseTo(anchor[1], 5);
  await expect(page.locator(".location-picker")).toHaveCount(0);
  await page.reload();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("veld-session-v1")!).plan
          .start_coordinates,
    ),
  ).toEqual(body.start_coordinates);
});

test("local laps and nearby radius are explicit setup choices", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".route-card").first()).toBeVisible();
  await expect(page.getByLabel("Ride area", { exact: true })).toHaveValue(
    "local",
  );
  await page.getByLabel("Ride area", { exact: true }).selectOption("nearby");
  await page.locator(".ride-options summary").click();
  await page.getByLabel("Maximum distance from start").selectOption("3");
  const request = page.waitForRequest(
    (r) => new URL(r.url()).pathname === "/api/routes" && r.method() === "POST",
  );
  await page.getByRole("button", { name: "Calculate routes" }).click();
  expect((await request).postDataJSON()).toMatchObject({
    stay_local: false,
    radius_km: 3,
    avoid_main_roads: true,
  });
  await page.reload();
  await expect(page.getByLabel("Ride area", { exact: true })).toHaveValue(
    "nearby",
  );
  await expect(page.getByLabel("Maximum distance from start")).toHaveValue("3");
});

async function dragFirstPoint(page: Page) {
  await page.locator(".map-shell").scrollIntoViewIfNeeded();
  const b = (await page.locator(".route-drag-point").first().boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 35, b.y + b.height / 2 + 20, {
    steps: 6,
  });
  await page.mouse.up();
}

test("drag route includes control points, recalculates, persists and can be undone", async ({
  page,
}) => {
  await page.route("**/api/routes", (r) => {
    const p = r.request().postDataJSON();
    return r.fulfill({
      json: {
        ...routes,
        routes: routes.routes.map((route: any) => ({
          ...route,
          id: p.via_points?.length ? "edited-" + route.id : route.id,
          via_points: p.via_points,
          edited: !!p.via_points?.length,
        })),
      },
    });
  });
  await page.goto("/");
  await expect(page.locator(".route-card").first()).toBeVisible();
  await page.getByRole("button", { name: "Edit route on map" }).click();
  await expect(page.locator(".route-drag-point")).toHaveCount(3);
  const request = page.waitForRequest(
    (r) => new URL(r.url()).pathname === "/api/routes" && r.method() === "POST",
  );
  await dragFirstPoint(page);
  const p = (await request).postDataJSON();
  expect(p.via_points).toHaveLength(3);
  expect(p).toMatchObject({
    start: "rooihuiskraal",
    stay_local: true,
    avoid_main_roads: true,
  });
  await expect(page.getByRole("button", { name: "Undo edit" })).toBeEnabled();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("veld-session-v1")!).routes[0].id,
      ),
    )
    .toMatch(/^edited-/);
  await page.getByRole("button", { name: "Undo edit" }).click();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("veld-session-v1")!).plan.via_points,
    ),
  ).toEqual([]);
  await dragFirstPoint(page);
  await expect(page.getByRole("button", { name: "Undo edit" })).toBeEnabled();
  await page.reload();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("veld-session-v1")!).plan.via_points,
    ),
  ).toHaveLength(3);
  await page.getByRole("button", { name: "Edit route on map" }).click();
  await expect(page.locator(".route-drag-point")).toHaveCount(3);
});

test("rejected drag preserves route and controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".route-card").first()).toBeVisible();
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("veld-session-v1")!),
  );
  await page.route("**/api/routes", (r) =>
    r.fulfill({
      status: 422,
      json: { detail: "No eligible road within 20 m of your chosen point." },
    }),
  );
  await page.getByRole("button", { name: "Edit route on map" }).click();
  await dragFirstPoint(page);
  await expect(page.getByRole("alert")).toContainText(
    "Your previous route is still selected",
  );
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("veld-session-v1")!),
  );
  expect(after.routes).toEqual(before.routes);
  expect(after.plan).toEqual(before.plan);
  await expect(page.getByRole("button", { name: "Undo edit" })).toBeDisabled();
  await expect(page.locator(".route-drag-point")).toHaveCount(3);
});

test("Android one-lap and all-lap exports request navigation metadata", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".route-card").first()).toBeVisible();
  await page.getByText("Use this route on Android", { exact: true }).click();
  for (const laps of ["single", "all"]) {
    const request = page.waitForRequest(
      (r) =>
        r.url().includes("format=osmand") && r.url().includes("laps=" + laps),
    );
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: laps === "single" ? "Android · one lap" : "Android · all laps",
        exact: true,
      })
      .click();
    await request;
    expect((await download).suggestedFilename()).toContain("-android-" + laps);
  }
});

async function routePixel(page: Page, point: number[]) {
  const camera = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("veld-map-view-v1")!),
  );
  const box = (await page.locator(".leaflet-container").boundingBox())!;
  const world = ([lon, lat]: number[]) => {
    const scale = 256 * 2 ** camera.zoom,
      sine = Math.sin((lat * Math.PI) / 180);
    return [
      ((lon + 180) / 360) * scale,
      (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * scale,
    ];
  };
  const a = world(point),
    b = world(camera.center);
  return {
    x: box.x + box.width / 2 + a[0] - b[0],
    y: box.y + box.height / 2 + a[1] - b[1],
  };
}

test("route line drag and road popup send precise include and exclude edits", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".route-card").first()).toBeVisible();
  await page.getByRole("button", { name: "Edit route on map" }).click();
  await page.locator(".map-shell").scrollIntoViewIfNeeded();
  const route = routes.routes[0],
    c = route.coordinates;
  const pairs = c
    .slice(1)
    .map((b: number[], i: number) => ({
      i,
      point: [(c[i][0] + b[0]) / 2, (c[i][1] + b[1]) / 2],
      length: Math.hypot(c[i][0] - b[0], c[i][1] - b[1]),
    }))
    .sort((a: any, b: any) => b.length - a.length);
  const pair = pairs.find((p: any) => p.i > 2 && p.i < c.length - 3);
  const pixel = await routePixel(page, pair.point);
  await page.mouse.click(pixel.x, pixel.y);
  const section = route.navigation.segments.find(
    (s: any) => pair.i >= s.index && pair.i < s.index + s.count - 1,
  );
  await expect(page.locator(".route-edit-popup")).toContainText(section.name);
  const avoided = page.waitForRequest(
    (r) => new URL(r.url()).pathname === "/api/routes" && r.method() === "POST",
  );
  await page
    .getByRole("button", { name: "Avoid this mapped road", exact: true })
    .click();
  expect((await avoided).postDataJSON().avoid_ways).toContain(section.way_id);
  await expect(page.getByRole("button", { name: "Undo edit" })).toBeEnabled();
  await page.getByRole("button", { name: "Undo edit" }).click();
  await expect(page.locator(".route-drag-point")).toHaveCount(3);
  await page.locator(".map-shell").scrollIntoViewIfNeeded();
  const dragPixel = await routePixel(page, pair.point);
  const request = page.waitForRequest(
    (r) => new URL(r.url()).pathname === "/api/routes" && r.method() === "POST",
  );
  await page.mouse.move(dragPixel.x, dragPixel.y);
  await page.mouse.down();
  await page.mouse.move(dragPixel.x + 22, dragPixel.y + 18, { steps: 5 });
  await page.mouse.up();
  const body = (await request).postDataJSON();
  expect(body.via_points.length).toBeGreaterThanOrEqual(3);
  expect(body.avoid_ways).toEqual([]);
});

test("late road match cannot replace the last point selected", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".route-card").first()).toBeVisible();
  let release: () => void = () => {};
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  await page.route("**/api/locations/resolve", async (r) => {
    const call = ++calls,
      p = r.request().postDataJSON().plan.start_coordinates;
    if (call === 1) await delayed;
    await r.fulfill({
      json: {
        requested_coordinates: p,
        coordinates: p,
        snap_distance_m: 0,
        road_name: call === 1 ? "First road" : "Last selected road",
        way_id: 1,
      },
    });
  });
  await page.getByRole("button", { name: "Choose start on map" }).click();
  await page.getByRole("button", { name: "Use map centre" }).click();
  await expect.poll(() => calls).toBe(1);
  await page.getByRole("button", { name: "Use map centre" }).click();
  await expect(page.locator(".location-match")).toContainText(
    "Last selected road",
  );
  const firstResponse = page.waitForResponse((r) =>
    r.url().includes("/locations/resolve"),
  );
  release();
  await firstResponse;
  await expect(page.locator(".location-match")).toContainText(
    "Last selected road",
  );
});

test("long training defaults widen coverage and remember explicit lap choices", async ({
  page,
}) => {
  let plans = 0;
  await page.route("**/api/routes", (r) => {
    plans++;
    return r.fulfill({ json: routes });
  });
  await page.goto("/");
  await expect(page.locator(".route-card").first()).toBeVisible();
  for (const [distance, cap] of [
    [90, 3],
    [180, 6],
  ]) {
    await page
      .getByRole("button", { name: `${distance} km`, exact: true })
      .click();
    await expect(page.getByLabel("Total ride distance")).toHaveValue(
      String(distance),
    );
    await expect(page.getByLabel("Ride area", { exact: true })).toHaveValue(
      "centurion",
    );
    await expect(page.getByLabel("Maximum laps", { exact: true })).toHaveValue(
      String(cap),
    );
    const request = page.waitForRequest(
      (r) =>
        new URL(r.url()).pathname === "/api/routes" && r.method() === "POST",
    );
    await page.getByRole("button", { name: "Calculate routes" }).click();
    expect((await request).postDataJSON()).toMatchObject({
      distance,
      max_laps: cap,
      coverage: "centurion",
      stay_local: false,
      avoid_main_roads: true,
    });
    await expect(page.locator(".route-card").first()).toBeVisible();
  }
  const snapshot = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("veld-session-v1")!),
  );
  await page.reload();
  await expect(page.getByLabel("Maximum laps", { exact: true })).toHaveValue(
    "6",
  );
  expect(plans).toBe(3);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("veld-session-v1")!).routes,
    ),
  ).toEqual(snapshot.routes);
  await page.getByLabel("Maximum laps", { exact: true }).selectOption("2");
  await page.getByRole("button", { name: "90 km", exact: true }).click();
  await expect(page.getByLabel("Maximum laps", { exact: true })).toHaveValue(
    "2",
  );
  await page.getByRole("button", { name: "200 km", exact: true }).click();
  await page.getByLabel("Loop planning").selectOption("manual");
  await page.getByLabel("Laps", { exact: true }).selectOption("100");
  await expect(page.locator(".lap-hint")).toContainText(
    "100 laps × approximately 2.0 km",
  );
  await page.getByLabel("Distance in kilometres").fill("94");
  await page.getByLabel("Distance in kilometres").press("Enter");
  await expect(page.getByLabel("Laps", { exact: true })).toHaveValue("47");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

const bestFit = JSON.parse(
  readFileSync(
    new URL("./fixtures/best-fit-routes.json", import.meta.url),
    "utf8",
  ),
);
const majorRoads = JSON.parse(
  readFileSync(new URL("./fixtures/major-roads.json", import.meta.url), "utf8"),
);

test("best fit explains road-connected suburbs and remembers the chosen lap trade-off", async ({
  page,
}) => {
  let plans = 0;
  await page.route("**/api/routes", (r) => {
    plans++;
    return r.fulfill({ json: bestFit });
  });
  await page.route("**/api/data/major-roads", (r) =>
    r.fulfill({ json: majorRoads }),
  );
  await page.goto("/");
  await expect(page.locator(".route-card")).toHaveCount(3);
  await expect(page.getByLabel("Loop planning")).toHaveValue("best");
  await expect(page.locator(".route-card.selected")).toContainText(
    `${bestFit.routes[0].laps} laps`,
  );
  await expect(page.locator(".route-card").first()).toContainText(
    "First by mapped-road score, then lap count.",
  );
  await expect(page.locator('path[stroke="#643312"]').first()).toBeAttached();
  // Only roads are drawn in the reference overlay; municipal polygon fills are absent.
  expect(
    await page
      .locator(".leaflet-estates-pane path")
      .evaluateAll((paths) =>
        paths.every(
          (p) =>
            p.getAttribute("stroke") === "#643312" &&
            p.getAttribute("fill") === "none",
        ),
      ),
  ).toBe(true);
  const choice = bestFit.routes[2];
  await page.locator(".route-card").nth(2).click();
  await expect(page.locator(".route-card").nth(2)).toContainText(
    "Rooihuiskraal → The Reeds",
  );
  await expect(page.locator(".route-card.selected")).toContainText(
    `${choice.laps} laps`,
  );
  await expect(page.locator(".safety-value .score-number")).toHaveText(
    `${choice.safety.score}/100`,
  );
  await page.getByText("Score breakdown and unknowns", { exact: true }).click();
  await expect(page.getByLabel("Mapped-road assessment")).toContainText(
    "Security/crime conditions",
  );
  await expect(page.getByLabel("Mapped-road assessment")).toContainText(
    "0 major-road junctions per lap",
  );
  await page
    .getByText("Ride sections · roads and mapped score", { exact: true })
    .click();
  await page.locator(".route-sections button").first().click();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("veld-map-view-v1")!).zoom,
      ),
    )
    .toBe(17);
  const previous = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("veld-session-v1")!),
  );
  expect(previous.plan.laps).toBe(choice.laps);
  expect(previous.usedPlan.laps).toBe(choice.laps);
  await page.reload();
  await expect(page.locator(".route-card").nth(2)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".safety-value .score-number")).toHaveText(
    `${choice.safety.score}/100`,
  );
  expect(plans).toBe(1);
});

test("accepted edits replace the assessment and laps together; failed edits preserve both", async ({
  page,
}) => {
  await page.route("**/api/routes", (r) => r.fulfill({ json: bestFit }));
  await page.goto("/");
  await expect(page.locator(".safety-value .score-number")).toHaveText(
    `${bestFit.routes[0].safety.score}/100`,
  );
  await page
    .getByRole("button", { name: "Edit route on map", exact: true })
    .click();
  let release: () => void = () => {};
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/routes", async (r) => {
    const p = r.request().postDataJSON();
    await delayed;
    await r.fulfill({
      json: {
        ...bestFit,
        routes: [
          {
            ...bestFit.routes[1],
            id: "score-edit",
            via_points: p.via_points,
            edited: true,
          },
        ],
      },
    });
  });
  await dragFirstPoint(page);
  await expect(page.getByLabel("Mapped-road assessment")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect(page.locator(".safety-value")).toHaveText("…");
  release();
  const score = bestFit.routes[1].safety.score;
  await expect(page.locator(".safety-value .score-number")).toHaveText(
    `${score}/100`,
  );
  await expect(page.locator(".safety-change")).toContainText(
    `Edit: ${bestFit.routes[0].safety.score}/100 → ${score}/100`,
  );
  await expect(page.locator(".route-card.selected")).toContainText(
    `${bestFit.routes[1].laps} laps`,
  );
  const accepted = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("veld-session-v1")!),
  );
  expect(accepted.plan.laps).toBe(accepted.routes[0].laps);
  await page.route("**/api/routes", (r) =>
    r.fulfill({
      status: 422,
      json: { detail: "A major road prevents this connection." },
    }),
  );
  await dragFirstPoint(page);
  await expect(page.getByRole("alert")).toContainText(
    "Your previous route is still selected",
  );
  await expect(page.locator(".safety-value .score-number")).toHaveText(
    `${score}/100`,
  );
  const failed = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("veld-session-v1")!),
  );
  expect(failed.plan).toEqual(accepted.plan);
  expect(failed.routes).toEqual(accepted.routes);
  await page.reload();
  await expect(page.locator(".safety-value .score-number")).toHaveText(
    `${score}/100`,
  );
  await expect(page.locator(".route-card.selected")).toContainText(
    `${bestFit.routes[1].laps} laps`,
  );
});

test("refresh requests different roads, saves the selection and preserves it when exhausted", async ({
  page,
}) => {
  const novel = bestFit.routes.find(
    (r: any) =>
      !routes.routes.some((old: any) => old.fingerprint === r.fingerprint),
  );
  expect(novel).toBeTruthy();
  let calls = 0;
  const requests: any[] = [];
  await page.route("**/api/routes", (r) => {
    calls++;
    requests.push(r.request().postDataJSON());
    return r.fulfill({
      json:
        calls === 1
          ? routes
          : calls === 2
            ? { ...bestFit, routes: [novel] }
            : { routes: [], message: "No further alternatives" },
    });
  });
  await page.goto("/");
  await expect(page.locator(".route-card")).toHaveCount(routes.routes.length);
  await page
    .getByRole("button", { name: "Refresh routes", exact: true })
    .click();
  await expect(page.locator(".route-card")).toHaveCount(1);
  expect(requests[1].exclude_routes).toEqual(
    routes.routes.map((r: any) => r.fingerprint),
  );
  expect(requests[1].variation).toBe(1);
  await expect(page.locator(".route-card.selected")).toContainText(novel.name);
  await page.reload();
  await expect(page.locator(".route-card.selected")).toContainText(novel.name);
  expect(calls).toBe(2);
  const previous = await page.evaluate(
    () => JSON.parse(localStorage.getItem("veld-session-v1")!).routes,
  );
  await page
    .getByRole("button", { name: "Refresh routes", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Your current route is still selected",
  );
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("veld-session-v1")!).routes,
    ),
  ).toEqual(previous);
  await page
    .getByRole("button", { name: "Refresh routes", exact: true })
    .click();
  await expect.poll(() => calls).toBe(4);
  expect(requests[3].variation).toBeGreaterThan(requests[2].variation);
});

test("routes-only map and local fonts make no external requests", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("veld-basemap", "none"));
  const external: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).origin !== "http://127.0.0.1:5173")
      external.push(r.url());
  });
  await page.goto("/");
  await expect(page.locator(".selected-route-line")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Routes only", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(
      () =>
        document.fonts.check("16px Figtree") &&
        document.fonts.check("24px Caprasimo"),
    ),
  ).toBe(true);
  expect(external).toEqual([]);
  await expect(page.locator(".leaflet-tile")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".selected-route-line")).toBeVisible();
  await expect(page.locator(".leaflet-tile")).toHaveCount(0);
});

test("privacy controls export locally, require deletion confirmation and keep release work visible", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      value: {
        watchPosition(success: (p: any) => void) {
          (window as any).sendLateLocation = () =>
            success({
              coords: {
                longitude: 28.1537278,
                latitude: -25.8941384,
                accuracy: 5,
              },
            });
          return 1;
        },
        clearWatch() {
          (window as any).locationWatchCleared = true;
        },
      },
    });
  });
  let deletions = 0,
    exports = 0;
  await page.route("**/api/privacy/**", async (r) => {
    expect(await r.request().headerValue("x-verge-local-action")).toBe("1");
    if (r.request().method() === "DELETE") {
      deletions++;
      return r.fulfill({ json: { message: "Deleted" } });
    }
    if (r.request().url().endsWith("/export")) {
      exports++;
      return r.fulfill({
        json: {
          app: "Verge",
          data: {
            saved_routes: [{ id: "local-record" }],
            reports: [],
            audit: [],
          },
        },
      });
    }
    return r.fulfill({
      json: { saved_routes: deletions ? 0 : 5, reports: 0, audit: 0 },
    });
  });
  await page.goto("/");
  await expect(page.locator(".route-card").first()).toBeVisible();
  await page
    .getByRole("button", { name: "Use my location", exact: true })
    .click();
  await page.evaluate(() =>
    localStorage.setItem("unrelated-app-key", "keep-me"),
  );
  await page
    .getByRole("button", { name: "Data & privacy", exact: true })
    .click();
  await expect(page.getByText("5 saved route snapshots")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Work that stays on the list" }),
  ).toBeVisible();
  await expect(page.locator(".release-checklist .open-tag")).toHaveCount(7);
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export my app data", exact: true })
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("verge-private-data.json");
  const data = JSON.parse(readFileSync((await file.path())!, "utf8"));
  expect(data.data.saved_routes[0].id).toBe("local-record");
  expect(
    JSON.parse(data.browser["veld-session-v1"]).routes.length,
  ).toBeGreaterThan(0);
  expect(exports).toBe(1);
  await page
    .getByRole("button", { name: "Delete my app data", exact: true })
    .click();
  expect(deletions).toBe(0);
  await page
    .getByRole("group", { name: "Confirm data deletion" })
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect(deletions).toBe(0);
  await page
    .getByRole("button", { name: "Delete my app data", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete all app records", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "App records and this browser’s ride history cleared",
  );
  expect(deletions).toBe(1);
  expect(
    await page.evaluate(() => localStorage.getItem("unrelated-app-key")),
  ).toBe("keep-me");
  expect(await page.evaluate(() => (window as any).locationWatchCleared)).toBe(
    true,
  );
  await page.evaluate(() => (window as any).sendLateLocation());
  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("veld-session-v1")!),
  );
  expect(state.routes).toEqual([]);
  expect(state.plan.start_coordinates).toBeUndefined();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Work that stays on the list" }),
  ).toBeVisible();
  await expect(page.locator(".release-checklist .open-tag")).toHaveCount(7);
  await expect(page.getByText("0 saved route snapshots")).toBeVisible();
});

test("major-road junction markers show the selected route's actual crossing points", async ({
  page,
}) => {
  const option = {
    ...routes.routes[0],
    major_road_junctions: [
      {
        coordinates: routes.routes[0].coordinates[5],
        names: ["Fixture main road"],
      },
    ],
  };
  await page.route("**/api/routes", (r) =>
    r.fulfill({ json: { ...routes, routes: [option] } }),
  );
  await page.goto("/");
  await expect(page.locator(".major-junction-marker")).toHaveCount(1);
  await page.locator(".major-junction-marker").hover();
  await expect(
    page.getByText("Major-road junction: Fixture main road.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".notice")).toContainText(
    "1 major-road junction to review",
  );
});
