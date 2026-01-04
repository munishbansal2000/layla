"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Play,
  Pause,
  SkipForward,
  Clock,
  AlertTriangle,
  CloudRain,
  MapPin,
  Utensils,
  Sunrise,
  Moon,
  Zap,
  RefreshCcw,
  Send,
  Trash2,
  CheckCircle,
  XCircle,
  Navigation,
  Timer,
  FastForward,
  RotateCcw,
  Link,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/Badge";
import { Separator } from "@/components/ui/separator";
import type {
  QueuedEvent,
  ExecutionState,
} from "@/lib/execution/execution-queue";
import type { StructuredItineraryData } from "@/types/structured-itinerary";

// Default sample itinerary for testing (used when no tripId is provided)
const SAMPLE_ITINERARY: StructuredItineraryData = {
  tripId: "sample-TEST",
  destination: "Tokyo",
  country: "Japan",
  days: [
    {
      dayNumber: 1,
      date: new Date().toISOString().split("T")[0],
      city: "Tokyo",
      title: "Tokyo Day 1",
      slots: [
        {
          slotId: "slot-1",
          slotType: "morning",
          timeRange: { start: "09:00", end: "11:00" },
          options: [
            {
              id: "opt-1",
              rank: 1,
              score: 0.9,
              activity: {
                name: "Senso-ji Temple",
                description: "Ancient Buddhist temple in Asakusa",
                category: "temple",
                duration: 120,
                place: {
                  name: "Senso-ji Temple",
                  address: "2-3-1 Asakusa, Taito City, Tokyo",
                  neighborhood: "Asakusa",
                  coordinates: { lat: 35.7148, lng: 139.7967 },
                },
                isFree: true,
                tags: ["temple", "historical", "cultural"],
                source: "google-places",
              },
              matchReasons: ["Top temple in Tokyo"],
              tradeoffs: [],
            },
          ],
          selectedOptionId: "opt-1",
        },
        {
          slotId: "slot-2",
          slotType: "lunch",
          timeRange: { start: "12:00", end: "13:00" },
          options: [
            {
              id: "opt-2",
              rank: 1,
              score: 0.85,
              activity: {
                name: "Tsukiji Outer Market",
                description: "Fresh sushi and street food",
                category: "food",
                duration: 60,
                place: {
                  name: "Tsukiji Outer Market",
                  address: "4-16-2 Tsukiji, Chuo City, Tokyo",
                  neighborhood: "Tsukiji",
                  coordinates: { lat: 35.6654, lng: 139.7706 },
                },
                isFree: false,
                estimatedCost: { amount: 2500, currency: "JPY" },
                tags: ["sushi", "market", "lunch"],
                source: "google-places",
              },
              matchReasons: ["Famous fish market"],
              tradeoffs: [],
            },
          ],
          selectedOptionId: "opt-2",
        },
        {
          slotId: "slot-3",
          slotType: "afternoon",
          timeRange: { start: "14:00", end: "17:00" },
          options: [
            {
              id: "opt-3",
              rank: 1,
              score: 0.95,
              activity: {
                name: "teamLab Borderless",
                description: "Digital art museum",
                category: "museum",
                duration: 180,
                place: {
                  name: "teamLab Borderless",
                  address: "Azabudai Hills, Tokyo",
                  neighborhood: "Azabudai",
                  coordinates: { lat: 35.6586, lng: 139.7454 },
                },
                isFree: false,
                estimatedCost: { amount: 3200, currency: "JPY" },
                tags: ["museum", "art", "digital"],
                source: "google-places",
              },
              matchReasons: ["World-famous digital art experience"],
              tradeoffs: ["Requires advance booking"],
            },
          ],
          selectedOptionId: "opt-3",
        },
        {
          slotId: "slot-4",
          slotType: "dinner",
          timeRange: { start: "18:00", end: "19:30" },
          options: [
            {
              id: "opt-4",
              rank: 1,
              score: 0.8,
              activity: {
                name: "Ramen Street",
                description: "Tokyo Station underground ramen shops",
                category: "food",
                duration: 90,
                place: {
                  name: "Tokyo Ramen Street",
                  address: "B1F Tokyo Station, Chiyoda City",
                  neighborhood: "Marunouchi",
                  coordinates: { lat: 35.6812, lng: 139.7669 },
                },
                isFree: false,
                estimatedCost: { amount: 1200, currency: "JPY" },
                tags: ["ramen", "dinner"],
                source: "google-places",
              },
              matchReasons: ["Convenient dinner location"],
              tradeoffs: [],
            },
          ],
          selectedOptionId: "opt-4",
        },
      ],
    },
  ],
};

// Venue data with coordinates for location simulation
interface VenueLocation {
  slotId: string;
  name: string;
  lat: number;
  lng: number;
  timeRange: { start: string; end: string };
  category: string;
}

// Extract venue locations from an itinerary for a specific day
const getVenueLocationsFromItinerary = (
  itinerary: StructuredItineraryData,
  dayIndex: number = 0
): VenueLocation[] => {
  const slots = itinerary.days[dayIndex]?.slots || [];
  return slots.map((slot) => {
    const selectedOpt =
      slot.options?.find((o) => o.id === slot.selectedOptionId) ||
      slot.options?.[0];
    return {
      slotId: slot.slotId,
      name: selectedOpt?.activity?.name || slot.slotId,
      lat: selectedOpt?.activity?.place?.coordinates?.lat || 35.6762,
      lng: selectedOpt?.activity?.place?.coordinates?.lng || 139.6503,
      timeRange: slot.timeRange,
      category: selectedOpt?.activity?.category || "activity",
    };
  });
};

// Parse time string to minutes since midnight
const parseTimeToMinutes = (timeStr: string): number => {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
};

// Format minutes to time string
const formatMinutesToTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins
    .toString()
    .padStart(2, "0")}`;
};

// Calculate distance between two coordinates (Haversine formula)
const calculateDistance = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number => {
  const R = 6371000; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

interface EventButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: "default" | "destructive" | "warning" | "success";
  disabled?: boolean;
}

function EventButton({
  icon,
  label,
  onClick,
  variant = "default",
  disabled,
}: EventButtonProps) {
  const variantClasses = {
    default: "bg-gray-100 hover:bg-gray-200 text-gray-700",
    destructive: "bg-red-100 hover:bg-red-200 text-red-700",
    warning: "bg-yellow-100 hover:bg-yellow-200 text-yellow-700",
    success: "bg-green-100 hover:bg-green-200 text-green-700",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${variantClasses[variant]} disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {icon}
      {label}
    </button>
  );
}

// Timeline component showing slots and current time
interface TimelineProps {
  venues: VenueLocation[];
  currentTimeMinutes: number;
  currentLocation: VenueLocation | null;
  slotStatuses: Record<string, string>;
  onTimeClick: (minutes: number) => void;
  onLocationClick: (venue: VenueLocation) => void;
}

function Timeline({
  venues,
  currentTimeMinutes,
  currentLocation,
  slotStatuses,
  onTimeClick,
  onLocationClick,
}: TimelineProps) {
  const startMinutes = parseTimeToMinutes("08:00");
  const endMinutes = parseTimeToMinutes("21:00");
  const totalMinutes = endMinutes - startMinutes;

  const getPositionPercent = (minutes: number) => {
    return ((minutes - startMinutes) / totalMinutes) * 100;
  };

  const currentTimePercent = getPositionPercent(currentTimeMinutes);

  return (
    <div className="relative bg-gray-100 rounded-lg p-4">
      {/* Time labels */}
      <div className="flex justify-between text-xs text-gray-500 mb-2">
        <span>8:00</span>
        <span>12:00</span>
        <span>16:00</span>
        <span>20:00</span>
      </div>

      {/* Timeline bar */}
      <div
        className="relative h-16 bg-gray-200 rounded-lg overflow-visible cursor-pointer"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const percent = x / rect.width;
          const minutes = startMinutes + percent * totalMinutes;
          onTimeClick(Math.round(minutes));
        }}
      >
        {/* Slot blocks */}
        {venues.map((venue) => {
          const startPercent = getPositionPercent(
            parseTimeToMinutes(venue.timeRange.start)
          );
          const endPercent = getPositionPercent(
            parseTimeToMinutes(venue.timeRange.end)
          );
          const width = endPercent - startPercent;
          const status = slotStatuses[venue.slotId];
          const isCurrentLocation = currentLocation?.slotId === venue.slotId;

          return (
            <div
              key={venue.slotId}
              className={`absolute top-1 bottom-1 rounded cursor-pointer transition-all ${
                status === "completed"
                  ? "bg-green-400"
                  : status === "skipped"
                  ? "bg-red-300"
                  : status === "in_progress"
                  ? "bg-blue-400"
                  : "bg-purple-300"
              } ${
                isCurrentLocation ? "ring-2 ring-yellow-400 ring-offset-1" : ""
              }`}
              style={{ left: `${startPercent}%`, width: `${width}%` }}
              onClick={(e) => {
                e.stopPropagation();
                onLocationClick(venue);
              }}
              title={`${venue.name} (${venue.timeRange.start}-${venue.timeRange.end})`}
            >
              <div className="text-[10px] text-white font-medium truncate px-1 py-0.5">
                {venue.name.split(" ")[0]}
              </div>
            </div>
          );
        })}

        {/* Current time indicator */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
          style={{ left: `${Math.min(Math.max(currentTimePercent, 0), 100)}%` }}
        >
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[10px] px-1 rounded">
            {formatMinutesToTime(currentTimeMinutes)}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-2 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-purple-300 rounded" />
          <span>Upcoming</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-blue-400 rounded" />
          <span>In Progress</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-green-400 rounded" />
          <span>Completed</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-red-300 rounded" />
          <span>Skipped</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 border-2 border-yellow-400 rounded" />
          <span>Current Location</span>
        </div>
      </div>
    </div>
  );
}

export default function ExecutionSimulatorPage() {
  // Trip ID state - can be entered by user to connect with /trip page
  const [tripIdInput, setTripIdInput] = useState("");
  const [tripId, setTripId] = useState("sample-TEST");
  const [itinerary, setItinerary] =
    useState<StructuredItineraryData>(SAMPLE_ITINERARY);
  const [isLoadingTrip, setIsLoadingTrip] = useState(false);
  const [tripLoadError, setTripLoadError] = useState<string | null>(null);
  const [savedTrips, setSavedTrips] = useState<string[]>([]);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);

  const [isInitialized, setIsInitialized] = useState(false);
  const [state, setState] = useState<ExecutionState | null>(null);
  const [events, setEvents] = useState<QueuedEvent[]>([]);
  const [polledEvents, setPolledEvents] = useState<QueuedEvent[]>([]);
  const [customMessage, setCustomMessage] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);

  // Time & Location simulation state
  const [simulatedTimeMinutes, setSimulatedTimeMinutes] = useState(
    parseTimeToMinutes("08:30")
  );
  const [timeSpeed, setTimeSpeed] = useState(1);
  const [isTimePlaying, setIsTimePlaying] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<VenueLocation | null>(
    null
  );
  const [previousLocation, setPreviousLocation] =
    useState<VenueLocation | null>(null);

  // Get venue locations from the current itinerary for the selected day
  const venues = getVenueLocationsFromItinerary(itinerary, selectedDayIndex);
  const currentDay = itinerary.days[selectedDayIndex];
  const slots = currentDay?.slots || [];
  const timeIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load saved trips list on mount
  useEffect(() => {
    const loadSavedTrips = async () => {
      try {
        const res = await fetch("/api/trips/save");
        const data = await res.json();
        if (data.success) {
          setSavedTrips(data.trips);
        }
      } catch (err) {
        console.error("Failed to load saved trips:", err);
      }
    };
    loadSavedTrips();
  }, []);

  // Load trip by ID
  const loadTrip = async (id: string) => {
    if (!id) return;

    setIsLoadingTrip(true);
    setTripLoadError(null);

    try {
      const res = await fetch(`/api/trips/save?tripId=${id}`);
      const data = await res.json();

      if (data.success && data.itinerary) {
        setItinerary(data.itinerary);
        setTripId(id);
        setTripIdInput(id);

        // Reset execution state for new trip
        if (isInitialized) {
          await endSession();
        }

        console.log("[SimPage] Loaded trip:", id, data.itinerary.destination);
      } else {
        setTripLoadError(data.error || "Trip not found");
      }
    } catch (err) {
      console.error("Failed to load trip:", err);
      setTripLoadError("Failed to load trip");
    }

    setIsLoadingTrip(false);
  };

  // Connect to an existing execution (from /trip page)
  const connectToExecution = async (id: string) => {
    try {
      const res = await fetch(`/api/execution/start?tripId=${id}`);
      const data = await res.json();

      if (data.isActive) {
        setTripId(id);
        setTripIdInput(id);
        setIsInitialized(true);
        setState(data.state);
        if (data.itinerary) {
          setItinerary(data.itinerary);
        }
        await refreshEvents();
        console.log("[SimPage] Connected to active execution:", id);
      } else {
        // No active execution, try loading the trip from disk
        await loadTrip(id);
      }
    } catch (err) {
      console.error("Failed to connect to execution:", err);
      setTripLoadError("Failed to connect");
    }
  };

  // Time progression effect
  useEffect(() => {
    if (isTimePlaying && isInitialized) {
      timeIntervalRef.current = setInterval(() => {
        setSimulatedTimeMinutes((prev) => {
          const newTime = prev + 1; // Add 1 minute
          // Cap at 23:59
          return Math.min(newTime, 23 * 60 + 59);
        });
      }, 1000 / timeSpeed); // Speed up the interval based on timeSpeed

      return () => {
        if (timeIntervalRef.current) {
          clearInterval(timeIntervalRef.current);
        }
      };
    }
  }, [isTimePlaying, timeSpeed, isInitialized]);

  // Auto-generate events based on time and location changes
  useEffect(() => {
    if (!isInitialized || !state) return;

    const currentVenue = venues.find((v) => {
      const start = parseTimeToMinutes(v.timeRange.start);
      const end = parseTimeToMinutes(v.timeRange.end);
      return simulatedTimeMinutes >= start && simulatedTimeMinutes <= end;
    });

    // Check for time-based events
    venues.forEach((venue) => {
      const start = parseTimeToMinutes(venue.timeRange.start);
      const end = parseTimeToMinutes(venue.timeRange.end);
      const status = state.slotStatuses[venue.slotId];

      // Duration warning: 10 minutes before scheduled end
      if (
        simulatedTimeMinutes === end - 10 &&
        status === "in_progress" &&
        currentLocation?.slotId === venue.slotId
      ) {
        enqueueFactory("durationWarning", [
          venue.slotId,
          venue.name,
          end - start,
          venues[venues.indexOf(venue) + 1]?.name,
        ]);
      }

      // Activity starting soon: 15 minutes before start
      if (
        simulatedTimeMinutes === start - 15 &&
        status === "upcoming" &&
        !state.lockedSlotIds?.includes(venue.slotId)
      ) {
        enqueueCustomEvent({
          type: "activity_starting",
          source: "timer",
          priority: "normal",
          slotId: venue.slotId,
          title: "⏰ Coming Up",
          message: `${venue.name} starts in 15 minutes at ${venue.timeRange.start}`,
          actions: [{ id: "ok", label: "Got it", type: "dismiss" }],
        });
      }
    });
  }, [simulatedTimeMinutes, isInitialized, state]);

  // Handle location change events
  useEffect(() => {
    if (!isInitialized || !state) return;

    // Arrival event
    if (currentLocation && currentLocation !== previousLocation) {
      const status = state.slotStatuses[currentLocation.slotId];
      if (status !== "completed" && status !== "skipped") {
        enqueueFactory("arrival", [
          currentLocation.slotId,
          currentLocation.name,
          `You're at ${currentLocation.name}! Enjoy your visit.`,
        ]);
      }
    }

    // Departure event
    if (previousLocation && previousLocation !== currentLocation) {
      const nextVenue = venues[venues.indexOf(previousLocation) + 1];
      enqueueFactory("departure", [
        previousLocation.slotId,
        previousLocation.name,
        nextVenue?.name,
        nextVenue ? 15 : undefined,
      ]);
    }

    setPreviousLocation(currentLocation);
  }, [currentLocation, isInitialized, state]);

  // Initialize execution with current itinerary and selected day
  const initExecution = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/execution/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          itinerary,
          dayIndex: selectedDayIndex,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsInitialized(true);
        setState(data.state);
        await refreshEvents();
      }
    } catch (err) {
      console.error("Failed to initialize:", err);
    }
    setLoading(false);
  };

  // Refresh events list
  const refreshEvents = async () => {
    try {
      const res = await fetch(
        `/api/execution/queue?tripId=${tripId}&peek=true`
      );
      const data = await res.json();
      if (data.success) {
        setEvents(data.events);
        setState(data.state);
      }
    } catch (err) {
      console.error("Failed to refresh events:", err);
    }
  };

  // Poll for events (consume them)
  const pollEvents = async () => {
    try {
      const res = await fetch(`/api/execution/queue?tripId=${tripId}&limit=5`);
      const data = await res.json();
      if (data.success && data.events.length > 0) {
        setPolledEvents((prev) => [...prev, ...data.events]);
        await refreshEvents();
      }
    } catch (err) {
      console.error("Failed to poll events:", err);
    }
  };

  // Enqueue event using factory
  const enqueueFactory = async (factoryType: string, args: unknown[]) => {
    try {
      const res = await fetch("/api/execution/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          factory: { type: factoryType, args },
        }),
      });
      await res.json();
      await refreshEvents();
    } catch (err) {
      console.error("Failed to enqueue:", err);
    }
  };

  // Enqueue custom event
  const enqueueCustomEvent = async (event: {
    type: string;
    source: string;
    priority: string;
    slotId?: string;
    title: string;
    message: string;
    actions?: Array<{ id: string; label: string; type: string }>;
  }) => {
    try {
      const res = await fetch("/api/execution/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          custom: event,
        }),
      });
      await res.json();
      await refreshEvents();
    } catch (err) {
      console.error("Failed to enqueue custom:", err);
    }
  };

  // Enqueue custom message from form
  const enqueueCustom = async () => {
    if (!customTitle || !customMessage) return;
    await enqueueCustomEvent({
      type: "agent_message",
      source: "simulator",
      priority: "normal",
      title: customTitle,
      message: customMessage,
      actions: [{ id: "ok", label: "Got it", type: "dismiss" }],
    });
    setCustomTitle("");
    setCustomMessage("");
  };

  // Execute action
  const executeAction = async (
    action: string,
    payload?: Record<string, unknown>
  ) => {
    try {
      const res = await fetch("/api/execution/queue/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          action,
          payload,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setState(data.state);
      }
    } catch (err) {
      console.error("Failed to execute action:", err);
    }
  };

  // End session
  const endSession = async () => {
    try {
      await fetch(`/api/execution/start?tripId=${tripId}`, {
        method: "DELETE",
      });
      setIsInitialized(false);
      setState(null);
      setEvents([]);
      setPolledEvents([]);
      setCurrentLocation(null);
      setPreviousLocation(null);
      setIsTimePlaying(false);
      setSimulatedTimeMinutes(parseTimeToMinutes("08:30"));
    } catch (err) {
      console.error("Failed to end session:", err);
    }
  };

  // Reset time to beginning
  const resetTime = () => {
    setSimulatedTimeMinutes(parseTimeToMinutes("08:30"));
    setIsTimePlaying(false);
  };

  // Jump to specific time
  const jumpToTime = (minutes: number) => {
    setSimulatedTimeMinutes(minutes);
  };

  // Set location
  const setLocation = (venue: VenueLocation | null) => {
    setCurrentLocation(venue);
  };

  // Auto-poll toggle
  const toggleAutoPoll = useCallback(() => {
    if (pollInterval) {
      clearInterval(pollInterval);
      setPollInterval(null);
    } else {
      const interval = setInterval(pollEvents, 3000);
      setPollInterval(interval);
    }
  }, [pollInterval]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollInterval) clearInterval(pollInterval);
      if (timeIntervalRef.current) clearInterval(timeIntervalRef.current);
    };
  }, [pollInterval]);

  // Check if already initialized
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/execution/start?tripId=${tripId}`);
        const data = await res.json();
        if (data.isActive) {
          setIsInitialized(true);
          setState(data.state);
          await refreshEvents();
        }
      } catch (err) {
        console.error("Failed to check status:", err);
      }
    };
    checkStatus();
  }, [tripId]);

  // slots is now computed above based on selectedDayIndex

  // Find expected venue based on current time
  const expectedVenue = venues.find((v) => {
    const start = parseTimeToMinutes(v.timeRange.start);
    const end = parseTimeToMinutes(v.timeRange.end);
    return simulatedTimeMinutes >= start && simulatedTimeMinutes <= end;
  });

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">
          Execution Queue Simulator v2
        </h1>
        <p className="text-gray-600 mb-4">
          Simulate time and location to test the execution event system
        </p>

        {/* Trip ID Connection Panel */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Link className="w-5 h-5" />
              Connect to Trip
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              {/* Trip ID Input */}
              <div className="flex-1">
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter Trip ID (e.g., tokyo-A3F2)"
                    value={tripIdInput}
                    onChange={(e) => setTripIdInput(e.target.value)}
                    className="flex-1 font-mono"
                  />
                  <Button
                    onClick={() => connectToExecution(tripIdInput)}
                    disabled={!tripIdInput || isLoadingTrip}
                  >
                    {isLoadingTrip ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Link className="w-4 h-4 mr-2" />
                    )}
                    Connect
                  </Button>
                </div>
                {tripLoadError && (
                  <p className="text-red-500 text-sm mt-1">{tripLoadError}</p>
                )}
              </div>

              {/* Saved Trips Dropdown */}
              {savedTrips.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">or select:</span>
                  <select
                    className="border rounded px-3 py-2 text-sm font-mono"
                    value={tripId}
                    onChange={(e) => loadTrip(e.target.value)}
                  >
                    <option value="">-- Saved Trips --</option>
                    {savedTrips.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Current Trip Info */}
            <div className="mt-4 p-3 bg-gray-100 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-gray-500">Current Trip: </span>
                  <span className="font-mono font-semibold text-purple-600">
                    {tripId}
                  </span>
                </div>
                <div className="text-sm text-gray-500">
                  {itinerary.destination} • {itinerary.days.length} day(s)
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Day Selector - shows loaded itinerary days */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Itinerary Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 mb-4">
              {itinerary.days.map((day, idx) => (
                <Button
                  key={idx}
                  variant={selectedDayIndex === idx ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setSelectedDayIndex(idx)}
                  className="flex flex-col items-start py-2 px-3 h-auto"
                >
                  <span className="font-medium">Day {day.dayNumber}</span>
                  <span className="text-xs opacity-70">
                    {day.date || day.city}
                  </span>
                </Button>
              ))}
            </div>

            {/* Current Day Slots */}
            {currentDay && (
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-gray-900">
                    Day {currentDay.dayNumber}:{" "}
                    {currentDay.title || currentDay.city}
                  </h3>
                  <Badge variant="info">{slots.length} slots</Badge>
                </div>
                <div className="space-y-2">
                  {slots.map((slot, idx) => {
                    const selectedOpt =
                      slot.options?.find(
                        (o) => o.id === slot.selectedOptionId
                      ) || slot.options?.[0];
                    const status = state?.slotStatuses[slot.slotId];
                    return (
                      <div
                        key={slot.slotId}
                        className={`flex items-center gap-3 p-2 rounded-lg border ${
                          status === "completed"
                            ? "bg-green-50 border-green-200"
                            : status === "skipped"
                            ? "bg-red-50 border-red-200"
                            : status === "in_progress"
                            ? "bg-blue-50 border-blue-200"
                            : "bg-white border-gray-200"
                        }`}
                      >
                        <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-medium">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {selectedOpt?.activity?.name || slot.slotId}
                          </div>
                          <div className="text-xs text-gray-500">
                            {slot.timeRange.start} - {slot.timeRange.end} •{" "}
                            {slot.slotType}
                          </div>
                        </div>
                        <Badge
                          variant={
                            status === "completed"
                              ? "success"
                              : status === "skipped"
                              ? "error"
                              : status === "in_progress"
                              ? "info"
                              : "default"
                          }
                          size="sm"
                        >
                          {status || "upcoming"}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Timeline (shows when initialized) */}
        {isInitialized && state && (
          <div className="mb-6">
            <Timeline
              venues={venues}
              currentTimeMinutes={simulatedTimeMinutes}
              currentLocation={currentLocation}
              slotStatuses={state.slotStatuses}
              onTimeClick={jumpToTime}
              onLocationClick={setLocation}
            />
          </div>
        )}

        {/* Debug Panel */}
        <div className="mb-6 p-4 bg-gray-800 text-white rounded-lg font-mono text-sm">
          <div className="font-bold text-yellow-400 mb-2">🐛 Debug Info:</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              tripId: <span className="text-green-400">{tripId}</span>
            </div>
            <div>
              isInitialized:{" "}
              <span
                className={isInitialized ? "text-green-400" : "text-red-400"}
              >
                {String(isInitialized)}
              </span>
            </div>
            <div>
              simTime:{" "}
              <span className="text-blue-400">
                {formatMinutesToTime(simulatedTimeMinutes)}
              </span>
            </div>
            <div>
              timeSpeed: <span className="text-purple-400">{timeSpeed}x</span>
            </div>
            <div>
              currentLocation:{" "}
              <span className="text-yellow-400">
                {currentLocation?.name || "None"}
              </span>
            </div>
            <div>
              expectedLocation:{" "}
              <span className="text-cyan-400">
                {expectedVenue?.name || "None"}
              </span>
            </div>
            <div>
              pendingEvents:{" "}
              <span className="text-blue-400">{events.length}</span>
            </div>
            <div>
              deliveredEvents:{" "}
              <span className="text-blue-400">{polledEvents.length}</span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Column 1: Session & Time Control */}
          <div className="space-y-6">
            {/* Session Control */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Session
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!isInitialized ? (
                  <Button
                    onClick={initExecution}
                    disabled={loading}
                    className="w-full"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    {loading ? "Starting..." : "Start Execution"}
                  </Button>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-medium">Session Active</span>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={endSession}
                      className="w-full bg-red-100 hover:bg-red-200 text-red-700"
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      End Session
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Time Control */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Time Simulation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Current Time Display */}
                <div className="text-center">
                  <div className="text-4xl font-mono font-bold text-purple-600">
                    {formatMinutesToTime(simulatedTimeMinutes)}
                  </div>
                  <div className="text-sm text-gray-500">Simulated Time</div>
                </div>

                {/* Play/Pause Controls */}
                <div className="flex justify-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetTime}
                    disabled={!isInitialized}
                  >
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={isTimePlaying ? "secondary" : "primary"}
                    size="sm"
                    onClick={() => setIsTimePlaying(!isTimePlaying)}
                    disabled={!isInitialized}
                    className={
                      isTimePlaying ? "bg-yellow-100 text-yellow-700" : ""
                    }
                  >
                    {isTimePlaying ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setSimulatedTimeMinutes((t) => Math.min(t + 15, 23 * 60))
                    }
                    disabled={!isInitialized}
                  >
                    <FastForward className="w-4 h-4" />
                    +15m
                  </Button>
                </div>

                {/* Speed Control */}
                <div className="flex justify-center gap-1">
                  {[1, 10, 30, 60].map((speed) => (
                    <Button
                      key={speed}
                      variant={timeSpeed === speed ? "primary" : "outline"}
                      size="sm"
                      onClick={() => setTimeSpeed(speed)}
                      disabled={!isInitialized}
                      className="text-xs px-2"
                    >
                      {speed}x
                    </Button>
                  ))}
                </div>

                {/* Quick Time Jumps */}
                <div className="grid grid-cols-2 gap-2">
                  {["08:00", "12:00", "15:00", "18:00"].map((time) => (
                    <Button
                      key={time}
                      variant="ghost"
                      size="sm"
                      onClick={() => jumpToTime(parseTimeToMinutes(time))}
                      disabled={!isInitialized}
                      className="text-xs"
                    >
                      Jump to {time}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Location Control */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  Location Simulation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm text-gray-600 mb-2">
                  Click to simulate arrival at venue:
                </div>
                <Button
                  variant={currentLocation === null ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setLocation(null)}
                  disabled={!isInitialized}
                  className="w-full mb-2"
                >
                  <Navigation className="w-4 h-4 mr-2" />
                  In Transit (No Location)
                </Button>
                {venues.map((venue) => {
                  const isSelected = currentLocation?.slotId === venue.slotId;
                  const status = state?.slotStatuses[venue.slotId];
                  return (
                    <Button
                      key={venue.slotId}
                      variant={isSelected ? "primary" : "outline"}
                      size="sm"
                      onClick={() => setLocation(venue)}
                      disabled={!isInitialized}
                      className={`w-full justify-start ${
                        status === "completed"
                          ? "opacity-50"
                          : status === "skipped"
                          ? "opacity-30"
                          : ""
                      }`}
                    >
                      <MapPin
                        className={`w-4 h-4 mr-2 ${
                          isSelected ? "text-yellow-400" : ""
                        }`}
                      />
                      <span className="truncate flex-1 text-left">
                        {venue.name}
                      </span>
                      <span className="text-xs opacity-70">
                        {venue.timeRange.start}
                      </span>
                    </Button>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          {/* Column 2: Event Injection */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quick Events</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-gray-600 mb-2">
                  Location Events
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <EventButton
                    icon={<MapPin className="w-4 h-4" />}
                    label="Arrival"
                    onClick={() =>
                      enqueueFactory("arrival", [
                        currentLocation?.slotId || "slot-1",
                        currentLocation?.name || "Senso-ji Temple",
                        "Enjoy your visit!",
                      ])
                    }
                    disabled={!isInitialized}
                  />
                  <EventButton
                    icon={<SkipForward className="w-4 h-4" />}
                    label="Departure"
                    onClick={() =>
                      enqueueFactory("departure", [
                        currentLocation?.slotId || "slot-1",
                        currentLocation?.name || "Senso-ji Temple",
                        venues[
                          venues.findIndex(
                            (v) => v.slotId === currentLocation?.slotId
                          ) + 1
                        ]?.name,
                        15,
                      ])
                    }
                    disabled={!isInitialized}
                  />
                </div>

                <div className="text-sm text-gray-600 mb-2">Time Events</div>
                <div className="grid grid-cols-2 gap-2">
                  <EventButton
                    icon={<Sunrise className="w-4 h-4" />}
                    label="Morning Brief"
                    onClick={() =>
                      enqueueFactory("morningBriefing", [
                        0,
                        "Tokyo",
                        venues.map((v) => v.name),
                      ])
                    }
                    variant="success"
                    disabled={!isInitialized}
                  />
                  <EventButton
                    icon={<Moon className="w-4 h-4" />}
                    label="Day Recap"
                    onClick={() =>
                      enqueueFactory("dayRecap", [
                        0,
                        "Tokyo",
                        state?.completedCount || 0,
                        venues.length,
                        state?.skippedCount || 0,
                      ])
                    }
                    variant="success"
                    disabled={!isInitialized}
                  />
                  <EventButton
                    icon={<Clock className="w-4 h-4" />}
                    label="Duration Warn"
                    onClick={() =>
                      enqueueFactory("durationWarning", [
                        currentLocation?.slotId || "slot-1",
                        currentLocation?.name || "Current Activity",
                        90,
                        "Next Activity",
                      ])
                    }
                    variant="warning"
                    disabled={!isInitialized}
                  />
                  <EventButton
                    icon={<Timer className="w-4 h-4" />}
                    label="Booking Reminder"
                    onClick={() =>
                      enqueueFactory("bookingReminder", [
                        "slot-3",
                        "teamLab Borderless",
                        30,
                      ])
                    }
                    variant="warning"
                    disabled={!isInitialized}
                  />
                </div>

                <div className="text-sm text-gray-600 mb-2">Alert Events</div>
                <div className="grid grid-cols-2 gap-2">
                  <EventButton
                    icon={<CloudRain className="w-4 h-4" />}
                    label="Rain Alert"
                    onClick={() =>
                      enqueueFactory("weatherAlert", [
                        "rain",
                        formatMinutesToTime(simulatedTimeMinutes + 60),
                      ])
                    }
                    variant="destructive"
                    disabled={!isInitialized}
                  />
                  <EventButton
                    icon={<AlertTriangle className="w-4 h-4" />}
                    label="Closure"
                    onClick={() =>
                      enqueueFactory("closureAlert", [
                        expectedVenue?.slotId || "slot-3",
                        expectedVenue?.name || "teamLab Borderless",
                        "Unexpected maintenance",
                      ])
                    }
                    variant="destructive"
                    disabled={!isInitialized}
                  />
                  <EventButton
                    icon={<Utensils className="w-4 h-4" />}
                    label="Transit Delay"
                    onClick={() =>
                      enqueueFactory("transitDelay", [15, "JR Yamanote Line"])
                    }
                    variant="warning"
                    disabled={!isInitialized}
                  />
                  <EventButton
                    icon={<Clock className="w-4 h-4" />}
                    label="Late Wakeup"
                    onClick={() =>
                      enqueueFactory("lateWakeup", [45, venues[0]?.name])
                    }
                    variant="warning"
                    disabled={!isInitialized}
                  />
                </div>

                <Separator />

                <div className="text-sm text-gray-600 mb-2">
                  Slot Actions (Day {currentDay?.dayNumber || 1})
                </div>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {slots.map((slot) => {
                    const selectedOpt =
                      slot.options?.find(
                        (o) => o.id === slot.selectedOptionId
                      ) || slot.options?.[0];
                    const status = state?.slotStatuses[slot.slotId];
                    return (
                      <div
                        key={slot.slotId}
                        className="flex items-center gap-2"
                      >
                        <span className="text-sm flex-1 truncate">
                          {selectedOpt?.activity?.name || slot.slotId}
                        </span>
                        <Badge
                          variant={
                            status === "completed"
                              ? "success"
                              : status === "skipped"
                              ? "error"
                              : "default"
                          }
                          size="sm"
                        >
                          {status || "upcoming"}
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            executeAction("complete", { slotId: slot.slotId })
                          }
                          disabled={!isInitialized || status === "completed"}
                        >
                          <CheckCircle className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            executeAction("skip", { slotId: slot.slotId })
                          }
                          disabled={!isInitialized || status === "skipped"}
                        >
                          <XCircle className="w-3 h-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Custom Event */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Custom Message</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder="Event title..."
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  disabled={!isInitialized}
                />
                <Textarea
                  placeholder="Event message..."
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  rows={3}
                  disabled={!isInitialized}
                />
                <Button
                  onClick={enqueueCustom}
                  disabled={!isInitialized || !customTitle || !customMessage}
                  className="w-full"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Send Custom Event
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Column 3: Pending Events */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    Pending Events
                    <Badge>{events.length}</Badge>
                  </span>
                  <Button size="sm" variant="ghost" onClick={refreshEvents}>
                    <RefreshCcw className="w-4 h-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {events.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-4">
                      No pending events
                    </p>
                  ) : (
                    events.map((event) => (
                      <div
                        key={event.id}
                        className={`p-3 rounded-lg border ${
                          event.priority === "urgent"
                            ? "border-red-300 bg-red-50"
                            : event.priority === "high"
                            ? "border-yellow-300 bg-yellow-50"
                            : "border-gray-200 bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium text-sm">
                              {event.title}
                            </div>
                            <div className="text-xs text-gray-600 mt-1 line-clamp-2">
                              {event.message}
                            </div>
                          </div>
                          <Badge size="sm">{event.type}</Badge>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Poll Controls */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Event Polling</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Button
                    onClick={pollEvents}
                    disabled={!isInitialized}
                    variant="outline"
                    className="flex-1"
                  >
                    Poll Once
                  </Button>
                  <Button
                    onClick={toggleAutoPoll}
                    disabled={!isInitialized}
                    variant={pollInterval ? "secondary" : "primary"}
                    className={
                      pollInterval
                        ? "flex-1 bg-red-100 hover:bg-red-200 text-red-700"
                        : "flex-1"
                    }
                  >
                    {pollInterval ? "Stop Auto" : "Auto Poll"}
                  </Button>
                </div>
                <p className="text-xs text-gray-500">
                  Polling consumes events (marks as delivered)
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Column 4: Delivered Events (Chat Preview) */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    Delivered (Chat)
                    <Badge variant="info">{polledEvents.length}</Badge>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPolledEvents([])}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {polledEvents.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-4">
                      Poll to see events here (simulates chat)
                    </p>
                  ) : (
                    polledEvents.map((event) => (
                      <div
                        key={event.id}
                        className="p-3 rounded-lg bg-blue-50 border border-blue-200"
                      >
                        <div className="font-medium text-sm text-blue-900">
                          {event.title}
                        </div>
                        <div className="text-xs text-blue-700 mt-1">
                          {event.message}
                        </div>
                        {event.tip && (
                          <div className="text-xs text-blue-600 mt-1 italic">
                            💡 {event.tip}
                          </div>
                        )}
                        {event.actions && event.actions.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {event.actions.map((action) => (
                              <Button
                                key={action.id}
                                size="sm"
                                variant="outline"
                                className="h-6 text-xs"
                              >
                                {action.label}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Execution State */}
            {state && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Execution State</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Completed</span>
                    <span className="font-medium text-green-600">
                      {state.completedCount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Skipped</span>
                    <span className="font-medium text-red-600">
                      {state.skippedCount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Delay</span>
                    <span className="font-medium text-yellow-600">
                      {state.accumulatedDelayMinutes} min
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
