import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { Compass, Layers, Maximize, Minimize } from "lucide-react";
import {
  ROAD_TILES,
  IMAGERY_TILES,
  LABEL_TILES,
  OSM_ATTRIBUTION,
  IMAGERY_ATTRIBUTION,
  LABEL_ATTRIBUTION,
  savedBasemap,
  type Basemap,
} from "./basemaps";
import { controlPoints } from "./routeEditing";
import { savedMapView, saveMapView } from "./persistence";
import type { Place, Route } from "./types";

const latLng = ([lng, lat]: [number, number]): L.LatLngTuple => [lat, lng];
const bounds = (route: Route) => L.latLngBounds(route.coordinates.map(latLng));
const fitOptions: L.FitBoundsOptions = {
  paddingTopLeft: [45, 65],
  paddingBottomRight: [45, 70],
  maxZoom: 17,
  animate: false,
};

export default function RideMap({
  routes,
  selected,
  places,
  start,
  startCoordinates,
  boundaryVersion,
  onPick,
  pickMode,
  draftStart,
  draftDestination,
  focusPoint,
  focusZoom,
  onFocusHandled,
  candidatePoint,
  stayLocal,
  radiusKm,
  coverage,
  loop,
  editing,
  onDragRoute,
  onAvoidRoad,
}: {
  routes: Route[];
  selected: number;
  places: Place[];
  start: string;
  startCoordinates?: [number, number] | null;
  boundaryVersion?: string;
  onPick: (coordinates: [number, number]) => void;
  pickMode: "start" | "destination" | null;
  draftStart?: [number, number] | null;
  draftDestination?: [number, number] | null;
  focusPoint: [number, number] | null;
  focusZoom: number;
  onFocusHandled: () => void;
  candidatePoint: [number, number] | null;
  stayLocal: boolean;
  radiusKm: number;
  coverage?: "local" | "nearby" | "centurion";
  loop: boolean;
  editing: boolean;
  onDragRoute: (index: number, coordinates: [number, number]) => void;
  onAvoidRoad: (way: number) => void;
}) {
  const shell = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pickHandler = useRef(onPick);
  pickHandler.current = onPick;
  const editHandler = useRef(onDragRoute);
  editHandler.current = onDragRoute;
  const avoidHandler = useRef(onAvoidRoad);
  avoidHandler.current = onAvoidRoad;
  const route = routes[selected];
  const routeId = useRef<string | null>(route?.id ?? null);
  routeId.current = route?.id ?? null;
  const viewedRoute = useRef<string | null | undefined>(undefined);
  const [restoreView] = useState(savedMapView);
  const [ready, setReady] = useState(false);
  const [basemap, setBasemap] = useState<Basemap>(savedBasemap);
  const [majorRoads, setMajorRoads] =
    useState<GeoJSON.FeatureCollection | null>(null);
  const [tileFailed, setTileFailed] = useState(false);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [retry, setRetry] = useState(0);

  function changeBasemap(next: Basemap) {
    setTileFailed(false);
    setBasemap(next);
    try {
      localStorage.setItem("veld-basemap", next);
    } catch {
      /* Optional preference. */
    }
  }
  function fitRoute() {
    if (map.current && route) map.current.fitBounds(bounds(route), fitOptions);
  }
  async function fullscreen() {
    if (expanded) {
      if (document.fullscreenElement) await document.exitFullscreen();
      setExpanded(false);
    } else {
      try {
        await shell.current?.requestFullscreen();
      } catch {
        /* CSS fullscreen also works in embedded browsers. */
      }
      setExpanded(true);
    }
  }
  useEffect(() => {
    const changed = () =>
      setExpanded(document.fullscreenElement === shell.current);
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("fullscreenchange", changed);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("fullscreenchange", changed);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [expanded]);

  useEffect(() => {
    if (!container.current) return;
    // Raster images and SVG routes render even when WebGL/GPU acceleration is unavailable.
    const m = L.map(container.current, {
      zoomControl: false,
      minZoom: 3,
      maxZoom: 20,
    });
    map.current = m;
    try {
      m.setView([-25.879, 28.18], 12);
      m.attributionControl.setPrefix(false).addAttribution(OSM_ATTRIBUTION);
      L.control.zoom({ position: "bottomright" }).addTo(m);
      m.createPane("estates").style.zIndex = "350";
      m.on("click", (e: L.LeafletMouseEvent) =>
        pickHandler.current([
          Number(e.latlng.lng.toFixed(6)),
          Number(e.latlng.lat.toFixed(6)),
        ]),
      );
      m.on("moveend", () => {
        if (viewedRoute.current === undefined) return;
        const center = m.getCenter();
        saveMapView({
          routeId: routeId.current,
          center: [center.lng, center.lat],
          zoom: m.getZoom(),
        });
      });
      const resize = new ResizeObserver(() =>
        m.invalidateSize({ pan: true, animate: false }),
      );
      resize.observe(container.current);
      setReady(true);
      return () => {
        resize.disconnect();
        m.remove();
        map.current = null;
        viewedRoute.current = undefined;
      };
    } catch {
      m.remove();
      map.current = null;
      setMapUnavailable(true);
    }
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    setTileFailed(false);
    if (basemap === "none") return;
    const satellite = basemap === "satellite";
    let failed = false;
    const base = L.tileLayer(satellite ? IMAGERY_TILES : ROAD_TILES, {
      attribution: satellite ? IMAGERY_ATTRIBUTION : undefined,
      maxNativeZoom: 19,
      maxZoom: 20,
      keepBuffer: 2,
      className: satellite ? "satellite-tiles" : "road-tiles",
    });
    base.on("tileerror", () => {
      failed = true;
      setTileFailed(true);
    });
    // Report a stalled connection as well as explicit image errors.
    const timeout = window.setTimeout(() => {
      if (base.isLoading()) setTileFailed(true);
    }, 15000);
    base.on("load", () => {
      clearTimeout(timeout);
      if (!failed) setTileFailed(false);
    });
    base.addTo(m);
    const layers = [base];
    if (satellite)
      layers.push(
        L.tileLayer(LABEL_TILES, {
          attribution: LABEL_ATTRIBUTION,
          maxNativeZoom: 19,
          maxZoom: 20,
          className: "label-tiles",
        }).addTo(m),
      );
    return () => {
      clearTimeout(timeout);
      layers.forEach((layer) => {
        layer.remove();
        layer.off();
      });
    };
  }, [basemap, ready, retry]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const abort = new AbortController();
    let layer: L.GeoJSON | undefined;
    fetch("/api/data/exclusions", { signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (abort.signal.aborted) return;
        layer = L.geoJSON(data, {
          pane: "estates",
          style: {
            color: "#643312",
            weight: 1,
            opacity: 0.45,
            fillOpacity: 0.13,
          },
          onEachFeature: (feature, polygon) => {
            const label = document.createElement("span");
            label.textContent = `${feature.properties?.name}: ${feature.properties?.reason}`;
            polygon.bindPopup(label);
          },
        }).addTo(m);
      })
      .catch(() => {
        /* The server still enforces exclusions if the optional overlay is unavailable. */
      });
    return () => {
      abort.abort();
      layer?.remove();
    };
  }, [ready, boundaryVersion]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const group = L.layerGroup().addTo(m);
    // Draw the selected route last so it stays visible where alternatives overlap.
    [
      ...routes.filter((_, i) => i !== selected),
      ...(route ? [route] : []),
    ].forEach((r) => {
      const chosen = r === route;
      const points = r.coordinates.map(latLng);
      L.polyline(points, {
        color: "#f5ead8",
        weight: chosen ? 13 : 10,
        opacity: 0.9,
        interactive: false,
      }).addTo(group);
      L.polyline(points, {
        color: chosen ? "#c67139" : "#aa967b",
        weight: chosen ? 8 : 5,
        opacity: chosen ? 1 : 0.8,
        interactive: false,
        className: chosen ? "selected-route-line" : "alternative-route-line",
      }).addTo(group);
    });
    return () => {
      group.remove();
    };
  }, [routes, selected, ready, basemap]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const id = route?.id ?? null;
    if (viewedRoute.current === id) return;
    const firstView = viewedRoute.current === undefined;
    viewedRoute.current = id;
    if (firstView && restoreView?.routeId === id)
      m.setView(latLng(restoreView.center), restoreView.zoom, {
        animate: false,
      });
    else if (route) m.fitBounds(bounds(route), fitOptions);
  }, [route, ready, restoreView]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready || pickMode) return;
    const point =
      route?.coordinates[0] ||
      startCoordinates ||
      places.find((p) => p.id === start)?.coordinates;
    if (!point) return;
    const icon = (end = false) =>
      L.divIcon({
        className: `ride-pin ${end ? "end-pin" : ""}`,
        html: end
          ? "<span></span>"
          : '<span></span><b class="start-label">Start</b>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
    const markers = [
      L.marker(latLng(point), {
        icon: icon(),
        title: "Route start",
        alt: "Map marker",
      }).addTo(m),
    ];
    const end = route?.coordinates.at(-1);
    if (end && (end[0] !== point[0] || end[1] !== point[1]))
      markers.push(
        L.marker(latLng(end), {
          icon: icon(true),
          title: "Route finish",
          alt: "Route finish",
        }).addTo(m),
      );
    markers[0].getElement()?.setAttribute("aria-label", "Map marker");
    return () => {
      markers.forEach((marker) => marker.remove());
    };
  }, [places, start, startCoordinates, route, ready, pickMode]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !pickMode) return;
    const point =
      pickMode === "start"
        ? draftStart ||
          startCoordinates ||
          places.find((p) => p.id === start)?.coordinates
        : draftDestination ||
          route?.coordinates.at(-1) ||
          places.find((p) => p.id === start)?.coordinates;
    m.setView(
      point ? latLng(point) : m.getCenter(),
      Math.max(17, m.getZoom()),
      { animate: false },
    );
  }, [pickMode, ready]);
  useEffect(() => {
    if (map.current && ready && focusPoint) {
      map.current.setView(latLng(focusPoint), focusZoom, {
        animate: false,
      });
      onFocusHandled();
    }
  }, [focusPoint, ready]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const group = L.layerGroup().addTo(m);
    for (const [point, name] of [
      [candidatePoint, "Selected road point"],
      [draftStart, "Chosen start · route must begin within 20 m"],
      [draftDestination, "Chosen destination · route must end within 20 m"],
    ] as const) {
      if (!point) continue;
      L.circle(latLng(point), {
        radius: 20,
        color: "#7a8a5e",
        weight: 2,
        fillOpacity: 0.08,
        interactive: false,
      }).addTo(group);
      L.circleMarker(latLng(point), {
        radius: 5,
        color: "#fff",
        weight: 2,
        fillColor: "#7a8a5e",
        fillOpacity: 1,
        interactive: false,
      })
        .bindTooltip(name)
        .addTo(group);
    }
    return () => {
      group.remove();
    };
  }, [draftStart, draftDestination, candidatePoint, ready]);
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/data/major-roads", { signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (!abort.signal.aborted) setMajorRoads(data);
      })
      .catch(() => {});
    return () => abort.abort();
  }, [boundaryVersion]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const group = L.layerGroup().addTo(m);
    if (majorRoads)
      L.geoJSON(majorRoads, {
        pane: "estates",
        style: { color: "#643312", weight: 2.5, opacity: 0.65 },
        interactive: !pickMode,
        onEachFeature: (feature, line) => {
          const label = document.createElement("span");
          label.textContent = `${feature.properties?.name || "Major road"} · ${stayLocal ? "Local routes avoid junctions with this road; mapped bridges/underpasses may connect across it." : "Junctions with this road are included in the mapped-road score."}`;
          line.bindPopup(label);
        },
      }).addTo(group);
    if (loop && !stayLocal && coverage !== "centurion") {
      const centre =
        draftStart ||
        startCoordinates ||
        places.find((p) => p.id === start)?.coordinates;
      if (centre)
        L.circle(latLng(centre), {
          radius: radiusKm * 1000,
          color: "#737e76",
          weight: 1,
          dashArray: "5 6",
          fillOpacity: 0.015,
          interactive: false,
        }).addTo(group);
    }
    return () => {
      group.remove();
    };
  }, [
    ready,
    majorRoads,
    stayLocal,
    radiusKm,
    coverage,
    pickMode,
    loop,
    start,
    places,
    draftStart,
    startCoordinates,
  ]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !route || pickMode) return;
    const group = L.layerGroup().addTo(m);
    for (const junction of route.major_road_junctions ?? []) {
      const label = document.createElement("span");
      label.textContent = `Major-road junction: ${junction.names.join(" / ")}. Check the crossing on the ground.`;
      const marker = L.circleMarker(latLng(junction.coordinates), {
        radius: 6,
        color: "#f5ead8",
        weight: 2,
        fillColor: "#643312",
        fillOpacity: 1,
        className: "major-junction-marker",
      })
        .bindTooltip(label)
        .bindPopup(label.cloneNode(true) as HTMLElement)
        .addTo(group);
      const element = marker.getElement();
      element?.setAttribute("tabindex", "0");
      element?.setAttribute("role", "button");
      element?.setAttribute("aria-label", label.textContent);
      element?.addEventListener("keydown", (event) => {
        if (
          event instanceof KeyboardEvent &&
          (event.key === "Enter" || event.key === " ")
        ) {
          event.preventDefault();
          marker.openPopup();
        }
      });
    }
    return () => {
      group.remove();
    };
  }, [route, ready, pickMode]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !route || !editing) return;
    const group = L.layerGroup().addTo(m);
    const controls = controlPoints(route);
    function marker(index: number, point: [number, number], number: number) {
      const pin = L.marker(latLng(point), {
        draggable: true,
        autoPan: true,
        icon: L.divIcon({
          className: "route-drag-point",
          html: `<span>${number}</span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
        title: `Drag route point ${number}`,
        alt: `Drag route point ${number}`,
      }).addTo(group);
      pin.on("dragend", () => {
        const p = pin.getLatLng();
        // Keep the old route and handle until the server accepts the edit.
        pin.setLatLng(latLng(point));
        editHandler.current(index, [p.lng, p.lat]);
      });
    }
    controls.forEach((c, i) => marker(c.index, c.point, i + 1));
    const points = route.coordinates.map(latLng);
    const line = L.polyline(points, {
      color: "#fff",
      opacity: 0,
      weight: 22,
      className: "editable-route-line",
    }).addTo(group);
    function nearest(point: L.LatLng) {
      const pixel = m!.latLngToLayerPoint(point);
      let best = 1,
        gap = Infinity;
      for (let i = 1; i < points.length - 1; i++) {
        const d = m!.latLngToLayerPoint(points[i]).distanceTo(pixel);
        if (d < gap) {
          gap = d;
          best = i;
        }
      }
      return best;
    }
    let draggedAt = 0;
    function nearestSection(point: L.LatLng) {
      const pixel = m!.latLngToLayerPoint(point);
      let best = 0,
        gap = Infinity;
      for (let i = 0; i < points.length - 1; i++) {
        const a = m!.latLngToLayerPoint(points[i]),
          b = m!.latLngToLayerPoint(points[i + 1]);
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const t = Math.max(
          0,
          Math.min(
            1,
            ((pixel.x - a.x) * dx + (pixel.y - a.y) * dy) /
              (dx * dx + dy * dy || 1),
          ),
        );
        const d = pixel.distanceTo(L.point(a.x + t * dx, a.y + t * dy));
        if (d < gap) {
          gap = d;
          best = i;
        }
      }
      return best;
    }
    line.on("click", (e: L.LeafletMouseEvent) => {
      if (Date.now() - draggedAt < 300) return;
      L.DomEvent.stopPropagation(e);
      const index = nearest(e.latlng);
      const sectionIndex = nearestSection(e.latlng);
      const section = route.navigation?.segments.find(
        (s) => sectionIndex >= s.index && sectionIndex < s.index + s.count - 1,
      );
      const content = document.createElement("div");
      const label = document.createElement("strong");
      label.textContent = section?.name || "Selected route section";
      content.append(label);
      const risk = route.sections?.find(
        (s) => sectionIndex >= s.index && sectionIndex < s.index + s.count - 1,
      );
      if (risk) {
        const detail = document.createElement("p");
        detail.textContent = `Mapped-road score ${risk.score}/100 · Low confidence · ${risk.concerns.join(", ") || "No deductions in mapped fields"}`;
        content.append(detail);
      }
      const add = document.createElement("button");
      add.textContent = "Add a drag point";
      add.onclick = () => {
        marker(index, route.coordinates[index], controls.length + 1);
        m.closePopup();
      };
      content.append(add);
      if (section) {
        const avoid = document.createElement("button");
        avoid.textContent = "Avoid this mapped road";
        avoid.onclick = () => {
          m.closePopup();
          avoidHandler.current(section.way_id);
        };
        content.append(avoid);
        const note = document.createElement("small");
        note.textContent =
          "Excludes the entire selected OpenStreetMap road object.";
        content.append(note);
      }
      L.popup({ className: "route-edit-popup" })
        .setLatLng(e.latlng)
        .setContent(content)
        .openOn(m);
    });
    let origin: L.Point | null = null,
      draggedIndex = 0,
      drop: L.LatLng | null = null;
    const ghost = L.circleMarker([0, 0], {
      radius: 9,
      color: "#b76b36",
      fillOpacity: 0.8,
      interactive: false,
    });
    const move = (e: L.LeafletMouseEvent) => {
      if (!origin || m.latLngToLayerPoint(e.latlng).distanceTo(origin) < 5)
        return;
      drop = e.latlng;
      ghost.setLatLng(drop).addTo(group);
    };
    const up = (event: MouseEvent) => {
      if (!origin) return;
      const rect = m.getContainer().getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      )
        drop = null;
      origin = null;
      m.dragging.enable();
      ghost.remove();
      if (drop) {
        draggedAt = Date.now();
        editHandler.current(draggedIndex, [drop.lng, drop.lat]);
        drop = null;
      }
    };
    line.on("mousedown", (e: L.LeafletMouseEvent) => {
      if (e.originalEvent.button !== 0) return;
      L.DomEvent.stopPropagation(e);
      origin = m.latLngToLayerPoint(e.latlng);
      draggedIndex = nearest(e.latlng);
      drop = null;
      m.dragging.disable();
    });
    m.on("mousemove", move);
    document.addEventListener("mouseup", up);
    return () => {
      m.off("mousemove", move);
      document.removeEventListener("mouseup", up);
      m.dragging.enable();
      m.closePopup();
      group.remove();
    };
  }, [route, editing, ready]);
  return (
    <div
      ref={shell}
      className={`map-shell ${basemap === "satellite" ? "satellite-map" : ""} ${expanded ? "map-expanded" : ""} ${pickMode ? "picking-location" : ""}`}
      data-basemap={basemap}
    >
      <div
        ref={container}
        className="map"
        aria-label="Map of real Centurion road routes"
      />
      <div className="map-label">
        <span className="live-dot" /> CENTURION <span className="map-divider" />{" "}
        Gauteng, South Africa
      </div>
      <div className="map-toolbar">
        <div className="basemap-switch" role="group" aria-label="Basemap">
          <button
            type="button"
            aria-pressed={basemap === "road"}
            onClick={() => changeBasemap("road")}
          >
            Road map
          </button>
          <button
            type="button"
            aria-pressed={basemap === "satellite"}
            onClick={() => changeBasemap("satellite")}
          >
            Satellite
          </button>
          <button
            type="button"
            aria-pressed={basemap === "none"}
            onClick={() => changeBasemap("none")}
          >
            Routes only
          </button>
        </div>
        <button
          type="button"
          className="fit-route"
          disabled={!route || !ready}
          onClick={fitRoute}
        >
          <Compass size={14} /> Fit route
        </button>
        {loop && (
          <button
            className="fit-route"
            type="button"
            onClick={() => {
              const m = map.current;
              const place = places.find((p) => p.id === start);
              if (!m) return;
              if (coverage === "centurion") {
                m.fitBounds(
                  [
                    [-25.985, 28.06],
                    [-25.79, 28.275],
                  ],
                  fitOptions,
                );
              } else if (stayLocal && route) {
                m.fitBounds(bounds(route), fitOptions);
              } else {
                const c = draftStart || startCoordinates || place?.coordinates;
                if (c)
                  m.fitBounds(
                    L.circle(latLng(c), {
                      radius: radiusKm * 1000,
                    }).getBounds(),
                    fitOptions,
                  );
              }
            }}
          >
            Show area
          </button>
        )}
        <button
          type="button"
          className="fit-route fullscreen-button"
          aria-label={expanded ? "Exit fullscreen" : "Enter fullscreen"}
          onClick={fullscreen}
        >
          {expanded ? <Minimize size={15} /> : <Maximize size={15} />}
        </button>
      </div>
      {(mapUnavailable || tileFailed) && (
        <div className="map-error" role="status">
          <span>
            {mapUnavailable
              ? "Map display unavailable in this browser."
              : `${basemap === "satellite" ? "Satellite imagery" : "Road tiles"} could not load. Your route is still available.`}
          </span>
          {!mapUnavailable && (
            <div className="map-error-actions">
              <button onClick={() => setRetry((n) => n + 1)}>
                Retry tiles
              </button>
              <button
                onClick={() =>
                  changeBasemap(basemap === "satellite" ? "road" : "satellite")
                }
              >
                Try {basemap === "satellite" ? "road map" : "satellite"}
              </button>
            </div>
          )}
        </div>
      )}
      {pickMode && (
        <>
          <div className="map-crosshair" aria-hidden="true">
            +
          </div>
          <button
            className="use-map-centre"
            onClick={() => {
              const c = map.current?.getCenter();
              if (c) onPick([c.lng, c.lat]);
            }}
          >
            Use map centre
          </button>
        </>
      )}
      <div className="map-note">
        <Layers size={15} />
        {basemap === "none"
          ? "Local route view · no external tiles"
          : basemap === "satellite"
            ? "Satellite · Esri"
            : "OpenStreetMap basemap"}
        <span>
          {(route?.laps ?? 1) > 1
            ? `One lap shown · ride ${route!.laps} times. `
            : ""}
          {!!majorRoads?.features.length && "Brown lines: major roads"}
        </span>
      </div>
    </div>
  );
}
