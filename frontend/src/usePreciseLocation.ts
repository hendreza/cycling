import { useEffect, useRef, useState } from "react";

// Browser-reported accuracy is an estimate, not a guarantee of the true position.
// Reject coarse/Wi-Fi fixes instead of silently accepting a distant start.
export function usePreciseLocation(
  onLocation: (point: [number, number], accuracy: number) => void,
  onMessage: (message: string) => void,
) {
  const [locating, setLocating] = useState(false);
  const cleanup = useRef<(() => void) | null>(null);
  const stop = () => {
    cleanup.current?.();
    cleanup.current = null;
    setLocating(false);
  };
  useEffect(
    () => () => {
      cleanup.current?.();
    },
    [],
  );
  function locate() {
    stop();
    if (!navigator.geolocation) {
      onMessage(
        "Location is unavailable in this browser. Choose your start on the map.",
      );
      return;
    }
    setLocating(true);
    onMessage("Waiting for a precise location (20 m or better)…");
    let active = true;
    let bestAccuracy = Infinity;
    const timeout = window.setTimeout(() => {
      stop();
      onMessage(
        `Could not get a location accurate to 20 m${Number.isFinite(bestAccuracy) ? ` (best reading ±${Math.ceil(bestAccuracy)} m)` : ""}. Your start was not changed. Zoom in and choose it on the map.`,
      );
    }, 30000);
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        if (!active) return;
        const { accuracy, longitude, latitude } = position.coords;
        if (!Number.isFinite(accuracy) || accuracy < 0) return;
        bestAccuracy = Math.min(bestAccuracy, accuracy);
        if (accuracy > 20) {
          onMessage(
            `Location is only accurate to ±${Math.ceil(accuracy)} m. Waiting for 20 m or better; you can choose the start on the map.`,
          );
          return;
        }
        stop();
        onLocation([longitude, latitude], accuracy);
      },
      (error) => {
        if (!active) return;
        if (error.code === 2) {
          onMessage(
            "Location signal temporarily unavailable. Still waiting for a reading accurate to 20 m; you can choose the start on the map.",
          );
          return;
        }
        stop();
        onMessage(
          "Precise location unavailable. Your start was not changed. Choose a public road on the map.",
        );
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 },
    );
    cleanup.current = () => {
      active = false;
      clearTimeout(timeout);
      navigator.geolocation.clearWatch(watch);
    };
  }
  return { locate, stop, locating };
}
