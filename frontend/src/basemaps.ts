export type Basemap = "road" | "satellite";
export const OSM_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
export const IMAGERY_TILES =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const LABEL_TILES =
  "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

export function savedBasemap(): Basemap {
  try {
    return localStorage.getItem("veld-basemap") === "satellite"
      ? "satellite"
      : "road";
  } catch {
    return "road";
  }
}

export const ROAD_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const IMAGERY_ATTRIBUTION =
  'Imagery: <a href="https://www.esri.com/">Esri</a>, Vantor, Earthstar Geographics, and the GIS User Community';
export const LABEL_ATTRIBUTION =
  "Labels: Esri, HERE, Garmin, OpenStreetMap contributors, and the GIS user community";
