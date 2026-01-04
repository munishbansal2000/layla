/**
 * Types for the Itinerary Chat Panel
 */

import type {
  ItineraryChatMessage,
  QuickAction,
  ProactiveNudge,
  ClarifyingQuestion,
  ChangePreview,
} from "@/types/itinerary-chat";
import type { ChatState } from "@/hooks/useItineraryChat";
import type {
  QueuedEvent,
  QueuedEventAction,
} from "@/lib/execution/execution-queue";

export interface ItineraryChatPanelProps {
  chatState: ChatState;
  onSendMessage: (message: string) => void;
  onExecuteAction: (action: QuickAction["action"]) => void;
  onConfirmPreview: () => void;
  onRejectPreview: () => void;
  onAnswerClarification: (answer: string) => void;
  onDismissNudge: (index: number) => void;
  /** Handler for execution event actions (skip, extend, navigate, etc.) */
  onEventAction?: (event: QueuedEvent, action: QueuedEventAction) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  className?: string;
  placeholder?: string;
}

export interface MessageBubbleProps {
  message: ItineraryChatMessage;
  onEventAction?: (event: QueuedEvent, action: QueuedEventAction) => void;
}

export interface EventMessageBubbleProps {
  event: QueuedEvent;
  onAction?: (action: QueuedEventAction) => void;
  formattedTime: string;
}

export interface QuickActionsBarProps {
  actions: QuickAction[];
  onExecute: (action: QuickAction["action"]) => void;
}

export interface ClarificationPanelProps {
  question: ClarifyingQuestion;
  onAnswer: (answer: string) => void;
}

export interface ChangePreviewPanelProps {
  preview: ChangePreview;
  onConfirm: () => void;
  onReject: () => void;
}

export interface ProactiveNudgeItemProps {
  nudge: ProactiveNudge;
  index: number;
  onDismiss: (index: number) => void;
  onExecute?: (action: ProactiveNudge["suggestedAction"]) => void;
}

export interface ChatHeaderProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  placeholder: string;
}

export interface ConstraintAnalysisDisplayProps {
  analysis: ItineraryChatMessage["constraintAnalysis"];
}

// Re-export for convenience
export type { QueuedEvent, QueuedEventAction };
