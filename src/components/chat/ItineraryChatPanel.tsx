"use client";

/**
 * ItineraryChatPanel Component
 *
 * A chat panel for LLM-powered itinerary manipulation.
 * Displays messages, quick actions, proactive nudges, and handles
 * clarifying questions and change previews.
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Loader2,
  Undo2,
  Redo2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Lightbulb,
  Info,
  ChevronDown,
  Sparkles,
  X,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type {
  ItineraryChatMessage,
  QuickAction,
  ProactiveNudge,
  ClarifyingQuestion,
  ChangePreview,
  ConstraintViolation,
} from "@/types/itinerary-chat";
import type { ChatState } from "@/hooks/useItineraryChat";

// ============================================
// TYPES
// ============================================

interface ItineraryChatPanelProps {
  chatState: ChatState;
  onSendMessage: (message: string) => void;
  onExecuteAction: (action: QuickAction["action"]) => void;
  onConfirmPreview: () => void;
  onRejectPreview: () => void;
  onAnswerClarification: (answer: string) => void;
  onDismissNudge: (index: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  className?: string;
  placeholder?: string;
}

// ============================================
// SUB-COMPONENTS
// ============================================

interface MessageBubbleProps {
  message: ItineraryChatMessage;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  // Format timestamp for client-side only rendering
  const [formattedTime, setFormattedTime] = useState<string>("");

  useEffect(() => {
    setFormattedTime(
      new Date(message.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  }, [message.timestamp]);

  if (isSystem) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-center my-2"
      >
        <div className="px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-xs text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
          <Info className="w-3 h-3" />
          {message.content}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={cn(
        "flex gap-2 mb-3",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-medium",
          isUser
            ? "bg-purple-600"
            : "bg-gradient-to-br from-purple-500 to-pink-500"
        )}
      >
        {isUser ? "U" : "L"}
      </div>

      {/* Message Content */}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5",
          isUser
            ? "bg-purple-600 text-white"
            : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm border border-gray-100 dark:border-gray-700"
        )}
      >
        <div className="whitespace-pre-wrap text-sm leading-relaxed">
          {message.content}
        </div>

        {/* Constraint Analysis */}
        {message.constraintAnalysis && (
          <ConstraintAnalysisDisplay analysis={message.constraintAnalysis} />
        )}

        {/* Applied Changes Badge */}
        {message.appliedChanges && (
          <div className="flex items-center gap-1 mt-2 text-xs text-green-600 dark:text-green-400">
            <CheckCircle className="w-3 h-3" />
            Changes applied
          </div>
        )}

        {/* Timestamp */}
        <div
          className={cn(
            "text-xs mt-1.5 opacity-60",
            isUser ? "text-right" : "text-left"
          )}
        >
          {formattedTime}
        </div>
      </div>
    </motion.div>
  );
}

interface ConstraintAnalysisDisplayProps {
  analysis: ItineraryChatMessage["constraintAnalysis"];
}

function ConstraintAnalysisDisplay({
  analysis,
}: ConstraintAnalysisDisplayProps) {
  if (!analysis) return null;

  const { violations, autoAdjustments } = analysis;
  if (violations.length === 0 && autoAdjustments.length === 0) return null;

  return (
    <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
      {/* Violations */}
      {violations.length > 0 && (
        <div className="space-y-1">
          {violations.map((v, i) => (
            <div
              key={i}
              className={cn(
                "text-xs flex items-start gap-1.5 p-1.5 rounded",
                v.severity === "error" &&
                  "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300",
                v.severity === "warning" &&
                  "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300",
                v.severity === "info" &&
                  "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
              )}
            >
              <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-medium capitalize">{v.layer}:</span>{" "}
                {v.message}
                {v.resolution && (
                  <span className="block text-[10px] opacity-80 mt-0.5">
                    💡 {v.resolution}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Auto-adjustments */}
      {autoAdjustments.length > 0 && (
        <div className="mt-1.5 text-xs text-gray-600 dark:text-gray-400">
          <span className="font-medium">Auto-adjusted:</span>
          <ul className="list-disc list-inside mt-0.5">
            {autoAdjustments.map((adj, i) => (
              <li key={i}>{adj.adjustment}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface QuickActionsBarProps {
  actions: QuickAction[];
  onExecute: (action: QuickAction["action"]) => void;
}

function QuickActionsBar({ actions, onExecute }: QuickActionsBarProps) {
  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
      <span className="text-xs text-gray-500 dark:text-gray-400 self-center mr-1">
        Quick actions:
      </span>
      {actions.map((action) => (
        <motion.button
          key={action.id}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onExecute(action.action)}
          className={cn(
            "px-2.5 py-1 text-xs rounded-full transition-colors",
            action.isPrimary
              ? "bg-purple-600 text-white hover:bg-purple-700"
              : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:border-purple-400"
          )}
          title={action.description}
        >
          {action.label}
        </motion.button>
      ))}
    </div>
  );
}

interface ClarificationPanelProps {
  question: ClarifyingQuestion;
  onAnswer: (answer: string) => void;
}

function ClarificationPanel({ question, onAnswer }: ClarificationPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border-t border-blue-200 dark:border-blue-800"
    >
      <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
        {question.question}
      </p>
      <div className="flex flex-wrap gap-2">
        {question.options.map((option, i) => (
          <Button
            key={i}
            variant="secondary"
            size="sm"
            onClick={() => onAnswer(option.value)}
            className="text-xs"
          >
            {option.label}
          </Button>
        ))}
      </div>
    </motion.div>
  );
}

interface ChangePreviewPanelProps {
  preview: ChangePreview;
  onConfirm: () => void;
  onReject: () => void;
}

function ChangePreviewPanel({
  preview,
  onConfirm,
  onReject,
}: ChangePreviewPanelProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-200 dark:border-amber-800"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            Proposed Changes
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
            {preview.description}
          </p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-amber-600 hover:text-amber-700"
        >
          <ChevronDown
            className={cn(
              "w-4 h-4 transition-transform",
              expanded && "rotate-180"
            )}
          />
        </button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 pt-2 border-t border-amber-200 dark:border-amber-700 text-xs"
          >
            <div className="grid grid-cols-2 gap-2 text-amber-800 dark:text-amber-200">
              <div>
                <span className="font-medium">Before:</span>
                <p className="mt-0.5 opacity-80">{preview.beforeSummary}</p>
              </div>
              <div>
                <span className="font-medium">After:</span>
                <p className="mt-0.5 opacity-80">{preview.afterSummary}</p>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-3 text-[10px] text-amber-600 dark:text-amber-400">
              <span>
                Travel time: {preview.impact.travelTimeChange > 0 ? "+" : ""}
                {preview.impact.travelTimeChange}min
              </span>
              <span>Risk: {preview.impact.riskLevel}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-2 mt-3">
        <Button
          variant="primary"
          size="sm"
          onClick={onConfirm}
          className="flex-1 text-xs"
        >
          <CheckCircle className="w-3 h-3 mr-1" />
          Apply Changes
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onReject}
          className="text-xs"
        >
          <XCircle className="w-3 h-3 mr-1" />
          Discard
        </Button>
      </div>
    </motion.div>
  );
}

interface ProactiveNudgeItemProps {
  nudge: ProactiveNudge;
  index: number;
  onDismiss: (index: number) => void;
  onExecute?: (action: ProactiveNudge["suggestedAction"]) => void;
}

function ProactiveNudgeItem({
  nudge,
  index,
  onDismiss,
  onExecute,
}: ProactiveNudgeItemProps) {
  const iconMap = {
    pacing: Lightbulb,
    weather: AlertTriangle,
    cluster: Info,
    conflict: AlertTriangle,
    booking: Info,
  };
  const Icon = iconMap[nudge.type] || Lightbulb;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={cn(
        "flex items-start gap-2 p-2.5 rounded-lg text-xs",
        nudge.type === "conflict" || nudge.type === "weather"
          ? "bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200"
          : "bg-purple-50 dark:bg-purple-900/20 text-purple-800 dark:text-purple-200"
      )}
    >
      <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p>{nudge.message}</p>
        {nudge.suggestedAction && onExecute && (
          <button
            onClick={() => onExecute(nudge.suggestedAction)}
            className="mt-1 text-[10px] underline hover:no-underline"
          >
            Apply suggestion
          </button>
        )}
      </div>
      <button
        onClick={() => onDismiss(index)}
        className="text-gray-400 hover:text-gray-600"
      >
        <X className="w-3 h-3" />
      </button>
    </motion.div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function ItineraryChatPanel({
  chatState,
  onSendMessage,
  onExecuteAction,
  onConfirmPreview,
  onRejectPreview,
  onAnswerClarification,
  onDismissNudge,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  className,
  placeholder = "Ask about your itinerary or request changes...",
}: ItineraryChatPanelProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatState.messages]);

  // Handle form submission
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (input.trim() && !chatState.isLoading) {
        onSendMessage(input.trim());
        setInput("");
      }
    },
    [input, chatState.isLoading, onSendMessage]
  );

  // Handle Enter key
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e);
      }
    },
    [handleSubmit]
  );

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-purple-600" />
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Itinerary Assistant
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className={cn(
              "p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors",
              !canUndo && "opacity-40 cursor-not-allowed"
            )}
            title="Undo"
          >
            <Undo2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className={cn(
              "p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors",
              !canRedo && "opacity-40 cursor-not-allowed"
            )}
            title="Redo"
          >
            <Redo2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
        </div>
      </div>

      {/* Proactive Nudges */}
      <AnimatePresence>
        {chatState.proactiveNudges.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-3 py-2 space-y-2 bg-gray-100 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700"
          >
            {chatState.proactiveNudges.map((nudge, i) => (
              <ProactiveNudgeItem
                key={`nudge-${i}`}
                nudge={nudge}
                index={i}
                onDismiss={onDismissNudge}
                onExecute={
                  nudge.suggestedAction
                    ? () => onExecuteAction(nudge.suggestedAction!)
                    : undefined
                }
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {chatState.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 dark:text-gray-400">
            <Sparkles className="w-8 h-8 mb-2 text-purple-400" />
            <p className="text-sm">Ask me to modify your itinerary</p>
            <p className="text-xs mt-1 opacity-70">
              Try: &quot;Move the museum to day 2&quot; or &quot;Add a coffee
              break&quot;
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {chatState.messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </AnimatePresence>
        )}

        {/* Loading indicator */}
        {chatState.isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-2 mb-3"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-sm">
              L
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl px-4 py-2.5 shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Thinking...</span>
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Change Preview Panel */}
      <AnimatePresence>
        {chatState.pendingPreview && (
          <ChangePreviewPanel
            preview={chatState.pendingPreview}
            onConfirm={onConfirmPreview}
            onReject={onRejectPreview}
          />
        )}
      </AnimatePresence>

      {/* Clarification Panel */}
      <AnimatePresence>
        {chatState.pendingClarification && (
          <ClarificationPanel
            question={chatState.pendingClarification}
            onAnswer={onAnswerClarification}
          />
        )}
      </AnimatePresence>

      {/* Quick Actions */}
      <QuickActionsBar
        actions={chatState.quickActions}
        onExecute={onExecuteAction}
      />

      {/* Error Display */}
      {chatState.error && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
          <p className="text-xs text-red-700 dark:text-red-300 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {chatState.error}
          </p>
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="p-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
      >
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={1}
              disabled={chatState.isLoading}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none disabled:opacity-50"
              style={{ minHeight: "40px", maxHeight: "100px" }}
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!input.trim() || chatState.isLoading}
            className="flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}

export default ItineraryChatPanel;
