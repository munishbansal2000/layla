"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ScoredActivity,
  SwipeAction,
  TripMode,
  PaceMode,
  TravelerComposition,
} from "@/types/activity-suggestion";

// Re-export as TravelersInfo for convenience
export type TravelersInfo = TravelerComposition;

// ============================================
// TYPES
// ============================================

export interface ItineraryRequest {
  destination: string;
  startDate: string;
  endDate: string;
  travelers: TravelerComposition;
  tripMode: TripMode;
  paceMode?: PaceMode;
  preferences: {
    interests: string[];
    budgetLevel: "budget" | "moderate" | "luxury";
    dietaryRestrictions?: string[];
    mobilityRequirements?: string[];
  };
}

export interface DayScheduleSlot {
  slotId: string;
  activity: ScoredActivity;
  scheduledStart: string;
  scheduledEnd: string;
  isLocked: boolean;
  swapOptions?: ScoredActivity[];
}

export interface DaySchedule {
  date: string;
  dayNumber: number;
  slots: DayScheduleSlot[];
  meals: {
    breakfast?: DayScheduleSlot;
    lunch?: DayScheduleSlot;
    dinner?: DayScheduleSlot;
  };
}

export interface Itinerary {
  id: string;
  destination: string;
  startDate: string;
  endDate: string;
  travelers: TravelersInfo;
  tripMode: TripMode;
  days: DaySchedule[];
  activityPool: ScoredActivity[];
  savedForLater: ScoredActivity[];
  rejectedActivities: string[];
  status: "draft" | "confirmed" | "in-progress" | "completed";
  createdAt: string;
  updatedAt: string;
  stats?: {
    totalActivities: number;
    averageScore: number;
    estimatedCost: number;
  };
}

export interface SwapOption {
  activity: ScoredActivity;
  reason: string;
  scoreImprovement: number;
}

export interface GenerateResponse {
  success: boolean;
  data: {
    itinerary: Itinerary;
    stats: {
      activitiesGenerated: number;
      restaurantsGenerated: number;
      averageScore: number;
    };
  };
}

// ============================================
// API FUNCTIONS
// ============================================

async function generateItinerary(
  request: ItineraryRequest
): Promise<Itinerary> {
  const response = await fetch("/api/itinerary/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error?.message || "Failed to generate itinerary");
  }
  return data.data.itinerary;
}

async function getItinerary(id: string): Promise<Itinerary> {
  const response = await fetch(`/api/itinerary/${id}`);
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error?.message || "Failed to fetch itinerary");
  }
  return data.data.itinerary;
}

async function updateItinerary(
  id: string,
  updates: Partial<Itinerary>
): Promise<Itinerary> {
  const response = await fetch(`/api/itinerary/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error?.message || "Failed to update itinerary");
  }
  return data.data.itinerary;
}

async function deleteItinerary(id: string): Promise<void> {
  const response = await fetch(`/api/itinerary/${id}`, {
    method: "DELETE",
  });

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error?.message || "Failed to delete itinerary");
  }
}

async function getSwapOptions(
  itineraryId: string,
  slotId: string
): Promise<SwapOption[]> {
  const response = await fetch(
    `/api/itinerary/${itineraryId}/slot/${slotId}?count=5`
  );
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error?.message || "Failed to fetch swap options");
  }
  return data.data.swapOptions;
}

async function swapActivity(
  itineraryId: string,
  slotId: string,
  newActivityId: string
): Promise<Itinerary> {
  const response = await fetch(
    `/api/itinerary/${itineraryId}/slot/${slotId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newActivityId }),
    }
  );

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error?.message || "Failed to swap activity");
  }
  return data.data.itinerary;
}

async function processSwipe(
  itineraryId: string,
  activityId: string,
  action: SwipeAction
): Promise<Itinerary> {
  const response = await fetch(`/api/itinerary/${itineraryId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      swipeAction: { activityId, action },
    }),
  });

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error?.message || "Failed to process swipe");
  }
  return data.data.itinerary;
}

async function lockActivity(
  itineraryId: string,
  slotId: string,
  locked: boolean
): Promise<Itinerary> {
  const response = await fetch(`/api/itinerary/${itineraryId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lockAction: { slotId, locked },
    }),
  });

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error?.message || "Failed to lock activity");
  }
  return data.data.itinerary;
}

async function confirmItinerary(itineraryId: string): Promise<Itinerary> {
  const response = await fetch(`/api/itinerary/${itineraryId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "confirmed" }),
  });

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error?.message || "Failed to confirm itinerary");
  }
  return data.data.itinerary;
}

// ============================================
// HOOKS
// ============================================

interface UseItineraryOptions {
  itineraryId?: string;
  enabled?: boolean;
  onError?: (error: Error) => void;
}

interface UseItineraryReturn {
  // Data
  itinerary: Itinerary | null;
  isLoading: boolean;
  isGenerating: boolean;
  error: Error | null;

  // Actions
  generate: (request: ItineraryRequest) => Promise<Itinerary>;
  refresh: () => Promise<void>;
  update: (updates: Partial<Itinerary>) => Promise<void>;
  remove: () => Promise<void>;

  // Slot actions
  getSwapOptions: (slotId: string) => Promise<SwapOption[]>;
  swap: (slotId: string, newActivityId: string) => Promise<void>;
  lock: (slotId: string, locked: boolean) => Promise<void>;

  // Swipe actions
  processSwipe: (activityId: string, action: SwipeAction) => Promise<void>;

  // Confirm
  confirm: () => Promise<void>;
}

export function useItinerary({
  itineraryId,
  enabled = true,
  onError,
}: UseItineraryOptions = {}): UseItineraryReturn {
  const queryClient = useQueryClient();
  const [currentId, setCurrentId] = useState<string | undefined>(itineraryId);

  // Update currentId when prop changes
  useEffect(() => {
    if (itineraryId) {
      setCurrentId(itineraryId);
    }
  }, [itineraryId]);

  // Query for fetching itinerary
  const {
    data: itinerary,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["itinerary", currentId],
    queryFn: () => getItinerary(currentId!),
    enabled: enabled && !!currentId,
    staleTime: 30 * 1000, // 30 seconds
    retry: 2,
  });

  // Mutation for generating itinerary
  const generateMutation = useMutation({
    mutationFn: generateItinerary,
    onSuccess: (data) => {
      setCurrentId(data.id);
      queryClient.setQueryData(["itinerary", data.id], data);
    },
    onError: (err: Error) => onError?.(err),
  });

  // Mutation for updating itinerary
  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Itinerary> }) =>
      updateItinerary(id, updates),
    onSuccess: (data) => {
      queryClient.setQueryData(["itinerary", data.id], data);
    },
    onError: (err: Error) => onError?.(err),
  });

  // Mutation for deleting itinerary
  const deleteMutation = useMutation({
    mutationFn: deleteItinerary,
    onSuccess: () => {
      if (currentId) {
        queryClient.removeQueries({ queryKey: ["itinerary", currentId] });
        setCurrentId(undefined);
      }
    },
    onError: (err: Error) => onError?.(err),
  });

  // Mutation for swapping activity
  const swapMutation = useMutation({
    mutationFn: ({
      itineraryId,
      slotId,
      newActivityId,
    }: {
      itineraryId: string;
      slotId: string;
      newActivityId: string;
    }) => swapActivity(itineraryId, slotId, newActivityId),
    onSuccess: (data) => {
      queryClient.setQueryData(["itinerary", data.id], data);
    },
    onError: (err: Error) => onError?.(err),
  });

  // Mutation for processing swipe
  const swipeMutation = useMutation({
    mutationFn: ({
      itineraryId,
      activityId,
      action,
    }: {
      itineraryId: string;
      activityId: string;
      action: SwipeAction;
    }) => processSwipe(itineraryId, activityId, action),
    onSuccess: (data) => {
      queryClient.setQueryData(["itinerary", data.id], data);
    },
    onError: (err: Error) => onError?.(err),
  });

  // Mutation for locking activity
  const lockMutation = useMutation({
    mutationFn: ({
      itineraryId,
      slotId,
      locked,
    }: {
      itineraryId: string;
      slotId: string;
      locked: boolean;
    }) => lockActivity(itineraryId, slotId, locked),
    onSuccess: (data) => {
      queryClient.setQueryData(["itinerary", data.id], data);
    },
    onError: (err: Error) => onError?.(err),
  });

  // Mutation for confirming itinerary
  const confirmMutation = useMutation({
    mutationFn: confirmItinerary,
    onSuccess: (data) => {
      queryClient.setQueryData(["itinerary", data.id], data);
    },
    onError: (err: Error) => onError?.(err),
  });

  // Action handlers
  const handleGenerate = useCallback(
    async (request: ItineraryRequest) => {
      return generateMutation.mutateAsync(request);
    },
    [generateMutation]
  );

  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const handleUpdate = useCallback(
    async (updates: Partial<Itinerary>) => {
      if (!currentId) throw new Error("No itinerary to update");
      await updateMutation.mutateAsync({ id: currentId, updates });
    },
    [currentId, updateMutation]
  );

  const handleDelete = useCallback(async () => {
    if (!currentId) throw new Error("No itinerary to delete");
    await deleteMutation.mutateAsync(currentId);
  }, [currentId, deleteMutation]);

  const handleGetSwapOptions = useCallback(
    async (slotId: string) => {
      if (!currentId) throw new Error("No itinerary loaded");
      return getSwapOptions(currentId, slotId);
    },
    [currentId]
  );

  const handleSwap = useCallback(
    async (slotId: string, newActivityId: string) => {
      if (!currentId) throw new Error("No itinerary loaded");
      await swapMutation.mutateAsync({
        itineraryId: currentId,
        slotId,
        newActivityId,
      });
    },
    [currentId, swapMutation]
  );

  const handleLock = useCallback(
    async (slotId: string, locked: boolean) => {
      if (!currentId) throw new Error("No itinerary loaded");
      await lockMutation.mutateAsync({
        itineraryId: currentId,
        slotId,
        locked,
      });
    },
    [currentId, lockMutation]
  );

  const handleProcessSwipe = useCallback(
    async (activityId: string, action: SwipeAction) => {
      if (!currentId) throw new Error("No itinerary loaded");
      await swipeMutation.mutateAsync({
        itineraryId: currentId,
        activityId,
        action,
      });
    },
    [currentId, swipeMutation]
  );

  const handleConfirm = useCallback(async () => {
    if (!currentId) throw new Error("No itinerary to confirm");
    await confirmMutation.mutateAsync(currentId);
  }, [currentId, confirmMutation]);

  return {
    itinerary: itinerary || null,
    isLoading,
    isGenerating: generateMutation.isPending,
    error: error as Error | null,

    generate: handleGenerate,
    refresh: handleRefresh,
    update: handleUpdate,
    remove: handleDelete,

    getSwapOptions: handleGetSwapOptions,
    swap: handleSwap,
    lock: handleLock,

    processSwipe: handleProcessSwipe,

    confirm: handleConfirm,
  };
}

// ============================================
// ITINERARY LIST HOOK
// ============================================

interface UseItineraryListReturn {
  itineraries: Itinerary[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useItineraryList(): UseItineraryListReturn {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["itineraries"],
    queryFn: async () => {
      const response = await fetch("/api/itinerary");
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error?.message || "Failed to fetch itineraries");
      }
      return data.data.itineraries as Itinerary[];
    },
    staleTime: 60 * 1000, // 1 minute
  });

  return {
    itineraries: data || [],
    isLoading,
    error: error as Error | null,
    refresh: async () => {
      await refetch();
    },
  };
}

// ============================================
// EXPORTS
// ============================================

export {
  generateItinerary,
  getItinerary,
  updateItinerary,
  deleteItinerary,
  getSwapOptions,
  swapActivity,
  processSwipe,
  lockActivity,
  confirmItinerary,
};
