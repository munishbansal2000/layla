"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import type {
  StructuredItineraryData,
  DayWithOptions,
  ActivityOption,
  AccommodationInfo,
} from "@/types/structured-itinerary";

// Dynamically import Leaflet components to avoid SSR issues
const MapContainer = dynamic(
  () => import("react-leaflet").then((mod) => mod.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((mod) => mod.TileLayer),
  { ssr: false }
);
const Marker = dynamic(
  () => import("react-leaflet").then((mod) => mod.Marker),
  { ssr: false }
);
const Popup = dynamic(() => import("react-leaflet").then((mod) => mod.Popup), {
  ssr: false,
});
const Polyline = dynamic(
  () => import("react-leaflet").then((mod) => mod.Polyline),
  { ssr: false }
);

// Dynamically import MarkerClusterGroup for clustering overlapping markers
const MarkerClusterGroup = dynamic(
  () => import("react-leaflet-cluster").then((mod) => mod.default),
  { ssr: false }
);

// MapUpdater component - dynamically import the whole module to avoid SSR issues
const MapUpdaterWrapper = dynamic(() => import("./MapUpdaterWrapper"), {
  ssr: false,
});

// ============================================
// TYPES
// ============================================

interface MapMarker {
  id: string;
  name: string;
  description: string;
  coordinates: { lat: number; lng: number };
  slotType: string;
  dayNumber: number;
  order: number;
  category: string;
}

interface ItineraryMapProps {
  itinerary: StructuredItineraryData;
  activeDayNumber?: number;
  selectedSlotId?: string;
  modifiedSlotIds?: string[]; // Slots that were recently modified
  height?: string;
  className?: string;
  showRoute?: boolean;
  onMarkerClick?: (marker: MapMarker) => void;
}

// ============================================
// SLOT TYPE COLORS (Enhanced for visibility)
// ============================================

const SLOT_TYPE_COLORS: Record<string, string> = {
  morning: "#f59e0b", // amber
  breakfast: "#f97316", // orange
  lunch: "#22c55e", // green
  afternoon: "#3b82f6", // blue
  dinner: "#8b5cf6", // purple
  evening: "#ec4899", // pink
};

// Colors for change states
const CHANGE_COLORS = {
  selected: "#10b981", // emerald - currently selected/active
  modified: "#f59e0b", // amber - recently modified
  added: "#22c55e", // green - newly added
  default: "#6366f1", // indigo - normal state
};

const ROUTE_COLOR = "#6366f1"; // indigo

// ============================================
// CUSTOM MARKER ICONS
// ============================================

function createCustomIcon(color: string, order: number) {
  if (typeof window === "undefined") return null;

  const L = require("leaflet");

  return L.divIcon({
    className: "custom-marker",
    html: `
      <div style="
        width: 32px;
        height: 32px;
        background: ${color};
        border: 3px solid white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: 14px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      ">
        ${order}
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

function createHotelIcon() {
  if (typeof window === "undefined") return null;

  const L = require("leaflet");

  return L.divIcon({
    className: "hotel-marker",
    html: `
      <div style="
        width: 36px;
        height: 36px;
        background: #1f2937;
        border: 3px solid #fbbf24;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      ">
        🏨
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function extractMarkersFromDay(day: DayWithOptions): MapMarker[] {
  const markers: MapMarker[] = [];
  let order = 1;

  for (const slot of day.slots) {
    // Get selected option or first option
    const option = slot.selectedOptionId
      ? slot.options.find((o) => o.id === slot.selectedOptionId)
      : slot.options[0];

    if (option?.activity.place?.coordinates) {
      const coords = option.activity.place.coordinates;
      if (coords.lat !== 0 && coords.lng !== 0) {
        markers.push({
          id: `${day.dayNumber}-${slot.slotId}`,
          name: option.activity.name,
          description: option.activity.description,
          coordinates: coords,
          slotType: slot.slotType,
          dayNumber: day.dayNumber,
          order,
          category: option.activity.category,
        });
        order++;
      }
    }
  }

  return markers;
}

function calculateCenter(markers: MapMarker[]): { lat: number; lng: number } {
  if (markers.length === 0) {
    return { lat: 35.6762, lng: 139.6503 }; // Default to Tokyo
  }

  const sumLat = markers.reduce((sum, m) => sum + m.coordinates.lat, 0);
  const sumLng = markers.reduce((sum, m) => sum + m.coordinates.lng, 0);

  return {
    lat: sumLat / markers.length,
    lng: sumLng / markers.length,
  };
}

function calculateBounds(
  markers: MapMarker[]
): [[number, number], [number, number]] | null {
  if (markers.length === 0) return null;

  let minLat = markers[0].coordinates.lat;
  let maxLat = markers[0].coordinates.lat;
  let minLng = markers[0].coordinates.lng;
  let maxLng = markers[0].coordinates.lng;

  for (const marker of markers) {
    minLat = Math.min(minLat, marker.coordinates.lat);
    maxLat = Math.max(maxLat, marker.coordinates.lat);
    minLng = Math.min(minLng, marker.coordinates.lng);
    maxLng = Math.max(maxLng, marker.coordinates.lng);
  }

  // Add padding
  const latPad = (maxLat - minLat) * 0.1 || 0.01;
  const lngPad = (maxLng - minLng) * 0.1 || 0.01;

  return [
    [minLat - latPad, minLng - lngPad],
    [maxLat + latPad, maxLng + lngPad],
  ];
}

// ============================================
// MAP COMPONENT
// ============================================

export function ItineraryMap({
  itinerary,
  activeDayNumber = 1,
  selectedSlotId,
  height = "400px",
  className,
  showRoute = true,
  onMarkerClick,
}: ItineraryMapProps) {
  const [isClient, setIsClient] = useState(false);
  const [leafletLoaded, setLeafletLoaded] = useState(false);

  // Only render on client side
  useEffect(() => {
    setIsClient(true);

    // Import Leaflet CSS
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
    link.crossOrigin = "";
    document.head.appendChild(link);

    setLeafletLoaded(true);

    return () => {
      document.head.removeChild(link);
    };
  }, []);

  // Get markers for active day
  const activeDay = useMemo(() => {
    return itinerary.days.find((d) => d.dayNumber === activeDayNumber);
  }, [itinerary.days, activeDayNumber]);

  const markers = useMemo(() => {
    return activeDay ? extractMarkersFromDay(activeDay) : [];
  }, [activeDay]);

  // Get hotel/accommodation for the active day
  const accommodation = useMemo(() => {
    return activeDay?.accommodation;
  }, [activeDay]);

  const center = useMemo(() => {
    // Include hotel in center calculation if available
    if (accommodation && markers.length > 0) {
      const allPoints = [
        ...markers.map((m) => m.coordinates),
        accommodation.coordinates,
      ];
      const sumLat = allPoints.reduce((sum, c) => sum + c.lat, 0);
      const sumLng = allPoints.reduce((sum, c) => sum + c.lng, 0);
      return {
        lat: sumLat / allPoints.length,
        lng: sumLng / allPoints.length,
      };
    }
    return calculateCenter(markers);
  }, [markers, accommodation]);

  const bounds = useMemo(() => {
    // Include hotel in bounds calculation if available
    if (accommodation && markers.length > 0) {
      const allCoords = [
        ...markers.map((m) => m.coordinates),
        accommodation.coordinates,
      ];
      let minLat = allCoords[0].lat;
      let maxLat = allCoords[0].lat;
      let minLng = allCoords[0].lng;
      let maxLng = allCoords[0].lng;

      for (const coord of allCoords) {
        minLat = Math.min(minLat, coord.lat);
        maxLat = Math.max(maxLat, coord.lat);
        minLng = Math.min(minLng, coord.lng);
        maxLng = Math.max(maxLng, coord.lng);
      }

      const latPad = (maxLat - minLat) * 0.1 || 0.01;
      const lngPad = (maxLng - minLng) * 0.1 || 0.01;

      return [
        [minLat - latPad, minLng - lngPad],
        [maxLat + latPad, maxLng + lngPad],
      ] as [[number, number], [number, number]];
    }
    return calculateBounds(markers);
  }, [markers, accommodation]);

  // Create route path including hotel at start and end
  const routePath = useMemo(() => {
    const activityPath = markers.map(
      (m) => [m.coordinates.lat, m.coordinates.lng] as [number, number]
    );

    // Add hotel at start and end if available
    if (accommodation && activityPath.length > 0) {
      const hotelCoord: [number, number] = [
        accommodation.coordinates.lat,
        accommodation.coordinates.lng,
      ];
      return [hotelCoord, ...activityPath, hotelCoord];
    }

    return activityPath;
  }, [markers, accommodation]);

  if (!isClient || !leafletLoaded) {
    return (
      <div
        className={cn(
          "bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center",
          className
        )}
        style={{ height }}
      >
        <div className="text-gray-500 dark:text-gray-400">Loading map...</div>
      </div>
    );
  }

  if (markers.length === 0) {
    return (
      <div
        className={cn(
          "bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center",
          className
        )}
        style={{ height }}
      >
        <div className="text-center text-gray-500 dark:text-gray-400">
          <p className="text-lg mb-2">📍</p>
          <p>No location data available for this day</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("rounded-xl overflow-hidden shadow-md", className)}
      style={{ height }}
    >
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
      >
        {/* Map view updater - handles updating the map when day changes */}
        <MapUpdaterWrapper bounds={bounds} center={center} />

        {/* OpenStreetMap tiles - FREE! */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Route line connecting markers */}
        {showRoute && routePath.length > 1 && (
          <Polyline
            positions={routePath}
            color={ROUTE_COLOR}
            weight={4}
            opacity={0.7}
            dashArray="10, 10"
          />
        )}

        {/* Activity markers with clustering for overlapping locations */}
        <MarkerClusterGroup
          chunkedLoading
          spiderfyOnMaxZoom={true}
          showCoverageOnHover={false}
          maxClusterRadius={40}
          disableClusteringAtZoom={16}
          iconCreateFunction={(cluster: { getChildCount: () => number }) => {
            if (typeof window === "undefined") return null;
            const L = require("leaflet");
            const count = cluster.getChildCount();
            return L.divIcon({
              className: "custom-cluster",
              html: `
                <div style="
                  width: 40px;
                  height: 40px;
                  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
                  border: 3px solid white;
                  border-radius: 50%;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: white;
                  font-weight: bold;
                  font-size: 14px;
                  box-shadow: 0 2px 10px rgba(99, 102, 241, 0.5);
                ">
                  ${count}
                </div>
              `,
              iconSize: [40, 40],
              iconAnchor: [20, 20],
            });
          }}
        >
          {markers.map((marker) => {
            const color = SLOT_TYPE_COLORS[marker.slotType] || "#6b7280";
            const icon = createCustomIcon(color, marker.order);

            return (
              <Marker
                key={marker.id}
                position={[marker.coordinates.lat, marker.coordinates.lng]}
                icon={icon}
                eventHandlers={{
                  click: () => onMarkerClick?.(marker),
                }}
              >
                <Popup>
                  <div className="min-w-[200px]">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ backgroundColor: color }}
                      >
                        {marker.order}
                      </span>
                      <span className="text-xs uppercase text-gray-500">
                        {marker.slotType}
                      </span>
                    </div>
                    <h3 className="font-semibold text-gray-900">
                      {marker.name}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                      {marker.description}
                    </p>
                    <div className="mt-2 text-xs text-gray-400">
                      {marker.category}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MarkerClusterGroup>

        {/* Hotel/Accommodation marker */}
        {accommodation && (
          <Marker
            key="hotel"
            position={[
              accommodation.coordinates.lat,
              accommodation.coordinates.lng,
            ]}
            icon={createHotelIcon()}
          >
            <Popup>
              <div className="min-w-[200px]">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">🏨</span>
                  <span className="text-xs uppercase text-amber-600 font-medium">
                    Accommodation
                  </span>
                </div>
                <h3 className="font-semibold text-gray-900">
                  {accommodation.name}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  {accommodation.address}
                </p>
                {accommodation.neighborhood && (
                  <p className="text-xs text-gray-400 mt-1">
                    📍 {accommodation.neighborhood}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                  {accommodation.checkIn && (
                    <span>Check-in: {accommodation.checkIn}</span>
                  )}
                  {accommodation.checkOut && (
                    <span>Check-out: {accommodation.checkOut}</span>
                  )}
                </div>
                {accommodation.rating && (
                  <div className="mt-1 text-xs text-amber-600">
                    ⭐ {accommodation.rating}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}

// ============================================
// MINI MAP FOR ACTIVITY CARDS
// ============================================

interface MiniMapProps {
  coordinates: { lat: number; lng: number };
  name: string;
  height?: string;
  className?: string;
}

export function MiniMap({
  coordinates,
  name,
  height = "150px",
  className,
}: MiniMapProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient || !coordinates || coordinates.lat === 0) {
    return (
      <div
        className={cn("bg-gray-100 dark:bg-gray-800 rounded-lg", className)}
        style={{ height }}
      />
    );
  }

  return (
    <div
      className={cn("rounded-lg overflow-hidden", className)}
      style={{ height }}
    >
      <MapContainer
        center={[coordinates.lat, coordinates.lng]}
        zoom={15}
        style={{ height: "100%", width: "100%" }}
        zoomControl={false}
        dragging={false}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[coordinates.lat, coordinates.lng]}>
          <Popup>{name}</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}

// ============================================
// EXPORTS
// ============================================

export default ItineraryMap;
