"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

interface MapUpdaterWrapperProps {
  bounds: [[number, number], [number, number]] | null;
  center: { lat: number; lng: number };
}

function MapUpdaterWrapper({ bounds, center }: MapUpdaterWrapperProps) {
  const map = useMap();
  const isInitialMount = useRef(true);

  useEffect(() => {
    // Skip the initial mount to avoid issues with map initialization
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    // Small delay to ensure map is fully ready
    const timeoutId = setTimeout(() => {
      try {
        if (bounds) {
          map.fitBounds(bounds, { padding: [50, 50], animate: true });
        } else if (center) {
          map.setView([center.lat, center.lng], 13, { animate: true });
        }
      } catch (error) {
        console.warn("MapUpdater: Could not update map view", error);
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [map, bounds, center]);

  return null;
}

export default MapUpdaterWrapper;
