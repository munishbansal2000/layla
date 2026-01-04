"use client";

/**
 * ItineraryChatPanel Component
 *
 * A chat panel for LLM-powered itinerary manipulation.
 * Displays messages, quick actions, proactive nudges, and handles
 * clarifying questions and change previews.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

import {
  MessageBubble,
  QuickActionsBar,
  ClarificationPanel,
  ChangePreviewPanel,
  ProactiveNudgeItem,
  ChatHeader,
  ChatInput,
} from "./itinerary-chat";
import type { ItineraryChatPanelProps } from "./itinerary-chat";

// Re-export for external use
export type { ItineraryChatPanelProps };

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
  onEventAction,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  className,
  placeholder = "Ask about your itinerary or request changes...",
}: ItineraryChatPanelProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatState.messages]);

  // Handle message submission
  const handleSendMessage = useCallback(() => {
    if (input.trim() && !chatState.isLoading) {
      onSendMessage(input.trim());
      setInput("");
    }
  }, [input, chatState.isLoading, onSendMessage]);

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700",
        className
      )}
    >
      {/* Header */}
      <ChatHeader
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={onUndo}
        onRedo={onRedo}
      />

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
          <EmptyState />
        ) : (
          <AnimatePresence initial={false}>
            {chatState.messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onEventAction={onEventAction}
              />
            ))}
          </AnimatePresence>
        )}

        {/* Loading indicator */}
        {chatState.isLoading && <LoadingIndicator />}

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
      {chatState.error && <ErrorDisplay error={chatState.error} />}

      {/* Input */}
      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={handleSendMessage}
        isLoading={chatState.isLoading}
        placeholder={placeholder}
      />
    </div>
  );
}

// ============================================
// HELPER COMPONENTS
// ============================================

/**
 * Empty state when no messages
 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 dark:text-gray-400">
      <Sparkles className="w-8 h-8 mb-2 text-purple-400" />
      <p className="text-sm">Ask me to modify your itinerary</p>
      <p className="text-xs mt-1 opacity-70">
        Try: &quot;Move the museum to day 2&quot; or &quot;Add a coffee
        break&quot;
      </p>
    </div>
  );
}

/**
 * Loading indicator while waiting for response
 */
function LoadingIndicator() {
  return (
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
  );
}

/**
 * Error display banner
 */
function ErrorDisplay({ error }: { error: string }) {
  return (
    <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
      <p className="text-xs text-red-700 dark:text-red-300 flex items-center gap-1">
        <AlertTriangle className="w-3 h-3" />
        {error}
      </p>
    </div>
  );
}

export default ItineraryChatPanel;
