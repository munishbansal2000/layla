/**
 * useItineraryChat Hook
 *
 * Custom React hook for managing LLM-powered chat interactions with the itinerary builder.
 * Handles message state, API calls, undo/redo history, and itinerary mutations.
 */

import { useState, useCallback, useRef } from "react";
import type {
  StructuredItineraryData,
  ItinerarySlotType,
} from "@/types/structured-itinerary";
import type {
  ItineraryChatMessage,
  ItineraryChatRequest,
  ItineraryChatResponse,
  ItineraryIntent,
  QuickAction,
  ProactiveNudge,
  ClarifyingQuestion,
  ChangePreview,
  ConstraintAnalysis,
} from "@/types/itinerary-chat";
import type { QueuedEvent } from "@/lib/execution/execution-queue";

// ============================================
// TYPES
// ============================================

export interface UseItineraryChatOptions {
  /** Initial itinerary data */
  initialItinerary: StructuredItineraryData;
  /** Callback when itinerary is updated */
  onItineraryChange?: (itinerary: StructuredItineraryData) => void;
  /** Enable strict constraint mode */
  strictMode?: boolean;
  /** Enable auto-adjustments */
  autoAdjust?: boolean;
  /** Maximum history size for undo/redo */
  maxHistorySize?: number;
}

export interface ChatState {
  messages: ItineraryChatMessage[];
  isLoading: boolean;
  error: string | null;
  quickActions: QuickAction[];
  proactiveNudges: ProactiveNudge[];
  pendingClarification: ClarifyingQuestion | null;
  pendingPreview: ChangePreview | null;
  pendingUiAction: ItineraryChatResponse["uiAction"] | null;
}

export interface UseItineraryChatReturn {
  // State
  chatState: ChatState;
  itinerary: StructuredItineraryData;

  // Actions
  sendMessage: (message: string) => Promise<void>;
  executeAction: (action: ItineraryIntent) => Promise<void>;
  confirmPreview: () => Promise<void>;
  rejectPreview: () => void;
  answerClarification: (answer: string) => Promise<void>;

  // History
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;

  // Context
  setCurrentDayIndex: (index: number) => void;
  setSelectedSlotId: (slotId: string | null) => void;
  currentDayIndex: number;
  selectedSlotId: string | null;

  // Utility
  clearMessages: () => void;
  dismissNudge: (index: number) => void;
  clearPendingUiAction: () => void;

  // External message injection (for execution events)
  addAgentMessage: (content: string, options?: { actions?: QuickAction[]; executionEvent?: QueuedEvent }) => void;
  addSystemMessage: (content: string) => void;
}

interface HistoryEntry {
  itinerary: StructuredItineraryData;
  message: string;
  undoAction?: ItineraryIntent;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createUserMessage(content: string): ItineraryChatMessage {
  return {
    id: generateMessageId(),
    role: "user",
    content,
    timestamp: new Date(),
  };
}

function createAssistantMessage(
  content: string,
  intent?: ItineraryIntent,
  constraintAnalysis?: ConstraintAnalysis,
  appliedChanges?: boolean
): ItineraryChatMessage {
  return {
    id: generateMessageId(),
    role: "assistant",
    content,
    timestamp: new Date(),
    intent,
    constraintAnalysis,
    appliedChanges,
  };
}

function createSystemMessage(content: string): ItineraryChatMessage {
  return {
    id: generateMessageId(),
    role: "system",
    content,
    timestamp: new Date(),
  };
}

// ============================================
// HOOK IMPLEMENTATION
// ============================================

export function useItineraryChat(
  options: UseItineraryChatOptions
): UseItineraryChatReturn {
  const {
    initialItinerary,
    onItineraryChange,
    strictMode = false,
    autoAdjust = true,
    maxHistorySize = 50,
  } = options;

  // Current itinerary state
  const [itinerary, setItinerary] =
    useState<StructuredItineraryData>(initialItinerary);

  // Chat state
  const [chatState, setChatState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    error: null,
    quickActions: [],
    proactiveNudges: [],
    pendingClarification: null,
    pendingPreview: null,
    pendingUiAction: null,
  });

  // Context state
  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  // History for undo/redo
  const historyRef = useRef<HistoryEntry[]>([]);
  const historyIndexRef = useRef(-1);
  const [historyVersion, setHistoryVersion] = useState(0); // Force re-render on history change

  // Pending preview data
  const pendingPreviewDataRef = useRef<{
    intent: ItineraryIntent;
    newItinerary: StructuredItineraryData;
    undoAction: ItineraryIntent;
  } | null>(null);

  // Original message for clarification follow-up
  const pendingClarificationContextRef = useRef<string>("");

  // ============================================
  // HISTORY MANAGEMENT
  // ============================================

  const pushHistory = useCallback(
    (entry: HistoryEntry) => {
      // If we're not at the end of history, truncate future entries
      if (historyIndexRef.current < historyRef.current.length - 1) {
        historyRef.current = historyRef.current.slice(
          0,
          historyIndexRef.current + 1
        );
      }

      historyRef.current.push(entry);

      // Trim history if it exceeds max size
      if (historyRef.current.length > maxHistorySize) {
        historyRef.current = historyRef.current.slice(-maxHistorySize);
      }

      historyIndexRef.current = historyRef.current.length - 1;
      setHistoryVersion((v) => v + 1);
    },
    [maxHistorySize]
  );

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  const undo = useCallback(() => {
    if (!canUndo) return;

    historyIndexRef.current -= 1;
    const entry = historyRef.current[historyIndexRef.current];

    setItinerary(entry.itinerary);
    onItineraryChange?.(entry.itinerary);

    setChatState((prev) => ({
      ...prev,
      messages: [
        ...prev.messages,
        createSystemMessage(`↩️ Undid: ${entry.message}`),
      ],
    }));

    setHistoryVersion((v) => v + 1);
  }, [canUndo, onItineraryChange]);

  const redo = useCallback(() => {
    if (!canRedo) return;

    historyIndexRef.current += 1;
    const entry = historyRef.current[historyIndexRef.current];

    setItinerary(entry.itinerary);
    onItineraryChange?.(entry.itinerary);

    setChatState((prev) => ({
      ...prev,
      messages: [
        ...prev.messages,
        createSystemMessage(`↪️ Redid: ${entry.message}`),
      ],
    }));

    setHistoryVersion((v) => v + 1);
  }, [canRedo, onItineraryChange]);

  // ============================================
  // API CALLS
  // ============================================

  const callChatAPI = useCallback(
    async (message: string): Promise<ItineraryChatResponse> => {
      const request: ItineraryChatRequest = {
        message,
        itinerary,
        context: {
          currentDayIndex,
          selectedSlotId: selectedSlotId ?? undefined,
          viewMode: "day",
          conversationHistory: chatState.messages.slice(-10), // Last 10 messages for context
          constraintSettings: {
            strictMode,
            autoAdjust,
            respectClusters: true,
            weatherAware: true,
          },
        },
      };

      const response = await fetch("/api/itinerary/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || errorData.error || `API error: ${response.status}`);
      }

      // The API returns { success: boolean, data: ItineraryChatResponse }
      const apiResponse = await response.json();
      if (!apiResponse.success) {
        throw new Error(apiResponse.error?.message || "Request failed");
      }
      return apiResponse.data;
    },
    [
      itinerary,
      currentDayIndex,
      selectedSlotId,
      chatState.messages,
      strictMode,
      autoAdjust,
    ]
  );

  // ============================================
  // MESSAGE HANDLING
  // ============================================

  const sendMessage = useCallback(
    async (message: string) => {
      if (!message.trim()) return;

      // Add user message
      const userMessage = createUserMessage(message);
      setChatState((prev) => ({
        ...prev,
        messages: [...prev.messages, userMessage],
        isLoading: true,
        error: null,
        pendingClarification: null,
        pendingPreview: null,
      }));

      try {
        const response = await callChatAPI(message);

        // Handle blocked action
        if (response.blocked) {
          setChatState((prev) => ({
            ...prev,
            isLoading: false,
            messages: [
              ...prev.messages,
              createAssistantMessage(
                `⚠️ ${response.message}`,
                response.intent ?? undefined
              ),
            ],
            quickActions: response.suggestedActions || [],
          }));
          return;
        }

        // Handle clarifying question
        if (response.clarifyingQuestion) {
          pendingClarificationContextRef.current = message;
          setChatState((prev) => ({
            ...prev,
            isLoading: false,
            messages: [
              ...prev.messages,
              createAssistantMessage(response.message),
            ],
            pendingClarification: response.clarifyingQuestion ?? null,
            quickActions: response.suggestedActions || [],
          }));
          return;
        }

        // Handle change preview (needs confirmation)
        if (response.changePreview && response.appliedChanges) {
          pendingPreviewDataRef.current = {
            intent: response.intent!,
            newItinerary: response.appliedChanges.newItinerary,
            undoAction: response.appliedChanges.undoAction,
          };

          setChatState((prev) => ({
            ...prev,
            isLoading: false,
            messages: [
              ...prev.messages,
              createAssistantMessage(
                response.message,
                response.intent ?? undefined,
                response.constraintAnalysis
              ),
            ],
            pendingPreview: response.changePreview ?? null,
            quickActions: response.suggestedActions || [],
          }));
          return;
        }

        // Handle applied changes (direct mutation)
        if (response.appliedChanges) {
          const { newItinerary, undoAction } = response.appliedChanges;
          console.log("[useItineraryChat] Applied changes:", {
            intent: response.intent?.type,
            slotsAdded: newItinerary.days.map(d => d.slots.length)
          });

          // Save to history before updating
          pushHistory({
            itinerary,
            message:
              response.intent?.type ||
              message.slice(0, 50) + (message.length > 50 ? "..." : ""),
            undoAction,
          });

          setItinerary(newItinerary);
          onItineraryChange?.(newItinerary);

          setChatState((prev) => ({
            ...prev,
            isLoading: false,
            messages: [
              ...prev.messages,
              createAssistantMessage(
                response.message,
                response.intent ?? undefined,
                response.constraintAnalysis,
                true
              ),
            ],
            quickActions: response.suggestedActions || [],
            proactiveNudges: response.proactiveNudges || [],
          }));
          return;
        }

        // Handle UI action (e.g., open fill-slot panel)
        if (response.uiAction) {
          setChatState((prev) => ({
            ...prev,
            isLoading: false,
            messages: [
              ...prev.messages,
              createAssistantMessage(
                response.message,
                response.intent ?? undefined
              ),
            ],
            quickActions: response.suggestedActions || [],
            proactiveNudges: response.proactiveNudges || [],
            pendingUiAction: response.uiAction,
          }));
          return;
        }

        // Handle question/info response (no mutation)
        setChatState((prev) => ({
          ...prev,
          isLoading: false,
          messages: [
            ...prev.messages,
            createAssistantMessage(
              response.message,
              response.intent ?? undefined
            ),
          ],
          quickActions: response.suggestedActions || [],
          proactiveNudges: response.proactiveNudges || [],
          pendingUiAction: null,
        }));
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        setChatState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
          messages: [
            ...prev.messages,
            createAssistantMessage(
              `❌ Sorry, something went wrong: ${errorMessage}`
            ),
          ],
        }));
      }
    },
    [callChatAPI, itinerary, onItineraryChange, pushHistory]
  );

  // ============================================
  // ACTION EXECUTION
  // ============================================

  const executeAction = useCallback(
    async (action: ItineraryIntent) => {
      // Handle special actions
      if (action.type === "UNDO") {
        undo();
        return;
      }
      if (action.type === "REDO") {
        redo();
        return;
      }

      // Convert action to natural language for the API
      const actionDescription = getActionDescription(action);
      await sendMessage(actionDescription);
    },
    [sendMessage, undo, redo]
  );

  // ============================================
  // PREVIEW HANDLING
  // ============================================

  const confirmPreview = useCallback(async () => {
    const previewData = pendingPreviewDataRef.current;
    if (!previewData) return;

    // Save to history
    pushHistory({
      itinerary,
      message: previewData.intent.type,
      undoAction: previewData.undoAction,
    });

    // Apply the changes
    setItinerary(previewData.newItinerary);
    onItineraryChange?.(previewData.newItinerary);

    // Clear pending state
    pendingPreviewDataRef.current = null;
    setChatState((prev) => ({
      ...prev,
      pendingPreview: null,
      messages: [
        ...prev.messages,
        createSystemMessage("✅ Changes applied successfully"),
      ],
    }));
  }, [itinerary, onItineraryChange, pushHistory]);

  const rejectPreview = useCallback(() => {
    pendingPreviewDataRef.current = null;
    setChatState((prev) => ({
      ...prev,
      pendingPreview: null,
      messages: [
        ...prev.messages,
        createSystemMessage("❌ Changes discarded"),
      ],
    }));
  }, []);

  // ============================================
  // CLARIFICATION HANDLING
  // ============================================

  const answerClarification = useCallback(
    async (answer: string) => {
      const originalContext = pendingClarificationContextRef.current;
      pendingClarificationContextRef.current = "";

      // Combine original context with the answer
      const combinedMessage = `${originalContext} - ${answer}`;
      await sendMessage(combinedMessage);
    },
    [sendMessage]
  );

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================

  const clearMessages = useCallback(() => {
    setChatState((prev) => ({
      ...prev,
      messages: [],
      error: null,
      pendingClarification: null,
      pendingPreview: null,
    }));
  }, []);

  const dismissNudge = useCallback((index: number) => {
    setChatState((prev) => ({
      ...prev,
      proactiveNudges: prev.proactiveNudges.filter((_, i) => i !== index),
    }));
  }, []);

  const clearPendingUiAction = useCallback(() => {
    setChatState((prev) => ({
      ...prev,
      pendingUiAction: null,
    }));
  }, []);

  // Add agent message externally (for execution events)
  const addAgentMessage = useCallback(
    (content: string, options?: { actions?: QuickAction[]; executionEvent?: QueuedEvent }) => {
      const message = createAssistantMessage(content);
      // If an executionEvent is provided, attach it to the message for interactive rendering
      if (options?.executionEvent) {
        message.executionEvent = options.executionEvent;
      }
      setChatState((prev) => ({
        ...prev,
        messages: [...prev.messages, message],
        quickActions: options?.actions || prev.quickActions,
      }));
    },
    []
  );

  // Add system message externally
  const addSystemMessage = useCallback((content: string) => {
    setChatState((prev) => ({
      ...prev,
      messages: [...prev.messages, createSystemMessage(content)],
    }));
  }, []);

  // Initialize history with initial state
  if (historyRef.current.length === 0) {
    historyRef.current.push({
      itinerary: initialItinerary,
      message: "Initial state",
    });
    historyIndexRef.current = 0;
  }

  return {
    // State
    chatState,
    itinerary,

    // Actions
    sendMessage,
    executeAction,
    confirmPreview,
    rejectPreview,
    answerClarification,

    // History
    canUndo,
    canRedo,
    undo,
    redo,

    // Context
    setCurrentDayIndex,
    setSelectedSlotId,
    currentDayIndex,
    selectedSlotId,

    // Utility
    clearMessages,
    dismissNudge,
    clearPendingUiAction,

    // External message injection (for execution events)
    addAgentMessage,
    addSystemMessage,
  };
}

// ============================================
// HELPER: ACTION TO DESCRIPTION
// ============================================

function getActionDescription(action: ItineraryIntent): string {
  switch (action.type) {
    case "ADD_ACTIVITY":
      return `Add ${action.params.activityDescription}${action.params.dayNumber ? ` to day ${action.params.dayNumber}` : ""}`;

    case "REMOVE_ACTIVITY":
      return `Remove ${action.params.activityName || "the activity"}${action.params.dayNumber ? ` from day ${action.params.dayNumber}` : ""}`;

    case "MOVE_ACTIVITY":
      return `Move ${action.params.activityName} to day ${action.params.toDay}${action.params.toTime ? ` at ${action.params.toTime}` : ""}`;

    case "SWAP_ACTIVITIES":
      return `Swap ${action.params.activity1Name} with ${action.params.activity2Name}`;

    case "PRIORITIZE":
      return `Make ${action.params.activityName} a priority (must-do)`;

    case "DEPRIORITIZE":
      return `Make ${action.params.activityName} optional`;

    case "LOCK_SLOT":
      return `Lock this time slot`;

    case "UNLOCK_SLOT":
      return `Unlock this time slot`;

    case "OPTIMIZE_ROUTE":
      return `Optimize the route${action.params.dayNumber ? ` for day ${action.params.dayNumber}` : " for all days"}`;

    case "OPTIMIZE_CLUSTERS":
      return `Group nearby activities together${action.params.dayNumber ? ` on day ${action.params.dayNumber}` : ""}`;

    case "BALANCE_PACING":
      return `Balance the pacing${action.params.dayNumber ? ` for day ${action.params.dayNumber}` : " across all days"}`;

    case "ADD_DAY":
      return `Add a new day${action.params.city ? ` in ${action.params.city}` : ""}`;

    case "REMOVE_DAY":
      return `Remove day ${action.params.dayNumber}`;

    case "SWAP_DAYS":
      return `Swap day ${action.params.day1} with day ${action.params.day2}`;

    case "ASK_QUESTION":
      return action.params.question;

    case "SUGGEST_ALTERNATIVES":
      return `Suggest alternatives${action.params.preferences ? ` - ${action.params.preferences}` : ""}`;

    case "SUGGEST_FROM_REPLACEMENT_POOL":
      return `Show replacement options for this slot`;

    default:
      return `Execute ${action.type}`;
  }
}
