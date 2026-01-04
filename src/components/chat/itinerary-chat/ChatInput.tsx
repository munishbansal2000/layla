/**
 * Chat Input Component
 *
 * Text input area with send button for chat messages.
 */

"use client";

import { useRef, useCallback } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { ChatInputProps } from "./types";

export function ChatInput({
  value,
  onChange,
  onSubmit,
  isLoading,
  placeholder,
}: ChatInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (value.trim() && !isLoading) {
        onSubmit();
      }
    },
    [value, isLoading, onSubmit]
  );

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
    <form
      onSubmit={handleSubmit}
      className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
    >
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={3}
            disabled={isLoading}
            className="w-full px-4 py-3 text-sm rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none disabled:opacity-50"
            style={{ minHeight: "80px", maxHeight: "150px" }}
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={!value.trim() || isLoading}
          className="flex-shrink-0 h-10 w-10"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </form>
  );
}
