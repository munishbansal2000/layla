import { create } from "zustand";
import type { Trip, ChatMessage, DayPlan, ItineraryItem } from "@/types";
import type { ParsedItinerary } from "@/lib/itinerary-parser";

interface TripState {
  currentTrip: Trip | null;
  trips: Trip[];
  selectedDayIndex: number;
  isGenerating: boolean;
  conversation: ChatMessage[];
  conversationId: string | null;
  parsedItinerary: ParsedItinerary | null;

  // Actions
  setCurrentTrip: (trip: Trip | null) => void;
  setTrips: (trips: Trip[]) => void;
  addTrip: (trip: Trip) => void;
  updateTrip: (id: string, updates: Partial<Trip>) => void;
  deleteTrip: (id: string) => void;
  setSelectedDayIndex: (index: number) => void;
  setIsGenerating: (isGenerating: boolean) => void;
  setParsedItinerary: (itinerary: ParsedItinerary | null) => void;

  // Day Actions
  updateDay: (dayId: string, updates: Partial<DayPlan>) => void;
  addItemToDay: (dayId: string, item: ItineraryItem) => void;
  removeItemFromDay: (dayId: string, itemId: string) => void;
  reorderDayItems: (dayId: string, items: ItineraryItem[]) => void;

  // Conversation Actions
  addMessage: (message: ChatMessage) => void;
  clearConversation: () => void;
  setConversation: (messages: ChatMessage[]) => void;
  setConversationId: (id: string | null) => void;
}

export const useTripStore = create<TripState>((set) => ({
  currentTrip: null,
  trips: [],
  selectedDayIndex: 0,
  isGenerating: false,
  conversation: [],
  conversationId: null,
  parsedItinerary: null,

  setCurrentTrip: (trip) => set({ currentTrip: trip }),
  setTrips: (trips) => set({ trips }),
  addTrip: (trip) => set((state) => ({ trips: [...state.trips, trip] })),
  updateTrip: (id, updates) =>
    set((state) => ({
      trips: state.trips.map((trip) =>
        trip.id === id ? { ...trip, ...updates } : trip
      ),
      currentTrip:
        state.currentTrip?.id === id
          ? { ...state.currentTrip, ...updates }
          : state.currentTrip,
    })),
  deleteTrip: (id) =>
    set((state) => ({
      trips: state.trips.filter((trip) => trip.id !== id),
      currentTrip: state.currentTrip?.id === id ? null : state.currentTrip,
    })),
  setSelectedDayIndex: (index) => set({ selectedDayIndex: index }),
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setParsedItinerary: (itinerary) => set({ parsedItinerary: itinerary }),

  updateDay: (dayId, updates) =>
    set((state) => {
      if (!state.currentTrip) return state;
      return {
        currentTrip: {
          ...state.currentTrip,
          days: state.currentTrip.days.map((day) =>
            day.id === dayId ? { ...day, ...updates } : day
          ),
        },
      };
    }),

  addItemToDay: (dayId, item) =>
    set((state) => {
      if (!state.currentTrip) return state;
      return {
        currentTrip: {
          ...state.currentTrip,
          days: state.currentTrip.days.map((day) =>
            day.id === dayId ? { ...day, items: [...day.items, item] } : day
          ),
        },
      };
    }),

  removeItemFromDay: (dayId, itemId) =>
    set((state) => {
      if (!state.currentTrip) return state;
      return {
        currentTrip: {
          ...state.currentTrip,
          days: state.currentTrip.days.map((day) =>
            day.id === dayId
              ? { ...day, items: day.items.filter((i) => i.id !== itemId) }
              : day
          ),
        },
      };
    }),

  reorderDayItems: (dayId, items) =>
    set((state) => {
      if (!state.currentTrip) return state;
      return {
        currentTrip: {
          ...state.currentTrip,
          days: state.currentTrip.days.map((day) =>
            day.id === dayId ? { ...day, items } : day
          ),
        },
      };
    }),

  addMessage: (message) =>
    set((state) => ({ conversation: [...state.conversation, message] })),
  clearConversation: () => set({ conversation: [], conversationId: null }),
  setConversation: (messages) => set({ conversation: messages }),
  setConversationId: (id) => set({ conversationId: id }),
}));
