"use client";

import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Undo2, X, CheckCircle2 } from "lucide-react";

// ============================================
// UNDO TOAST COMPONENT
// ============================================

interface UndoToastProps {
  isVisible: boolean;
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  autoHideDelay?: number;
  showUndoButton?: boolean;
}

export function UndoToast({
  isVisible,
  message,
  onUndo,
  onDismiss,
  autoHideDelay = 5000,
  showUndoButton = true,
}: UndoToastProps) {
  const [progress, setProgress] = useState(100);

  // Auto-hide timer
  useEffect(() => {
    if (!isVisible || autoHideDelay <= 0) return;

    const startTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / autoHideDelay) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        clearInterval(timer);
        onDismiss();
      }
    }, 50);

    return () => clearInterval(timer);
  }, [isVisible, autoHideDelay, onDismiss]);

  // Reset progress when visibility changes
  useEffect(() => {
    if (isVisible) {
      setProgress(100);
    }
  }, [isVisible]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className={cn(
            "fixed bottom-6 left-1/2 -translate-x-1/2 z-50",
            "min-w-[320px] max-w-md"
          )}
        >
          <div
            className={cn(
              "relative overflow-hidden",
              "bg-gray-900 dark:bg-gray-800 rounded-xl shadow-2xl",
              "border border-gray-700 dark:border-gray-600"
            )}
          >
            {/* Progress bar */}
            {autoHideDelay > 0 && (
              <div className="absolute top-0 left-0 right-0 h-1 bg-gray-800">
                <motion.div
                  className="h-full bg-purple-500"
                  initial={{ width: "100%" }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.1, ease: "linear" }}
                />
              </div>
            )}

            {/* Content */}
            <div className="px-4 py-3 flex items-center gap-3">
              <div className="flex-shrink-0 p-1.5 rounded-lg bg-green-500/20">
                <CheckCircle2 className="h-4 w-4 text-green-400" />
              </div>

              <span className="flex-1 text-sm text-white">{message}</span>

              <div className="flex items-center gap-2">
                {showUndoButton && (
                  <button
                    onClick={onUndo}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
                      "text-sm font-medium text-purple-400",
                      "hover:bg-purple-500/20 transition-colors"
                    )}
                  >
                    <Undo2 className="h-4 w-4" />
                    <span>Undo</span>
                  </button>
                )}

                <button
                  onClick={onDismiss}
                  className={cn(
                    "p-1.5 rounded-lg",
                    "text-gray-400 hover:text-white",
                    "hover:bg-gray-700 transition-colors"
                  )}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================
// SUCCESS TOAST (NO UNDO)
// ============================================

interface SuccessToastProps {
  isVisible: boolean;
  message: string;
  onDismiss: () => void;
  autoHideDelay?: number;
  icon?: React.ReactNode;
}

export function SuccessToast({
  isVisible,
  message,
  onDismiss,
  autoHideDelay = 3000,
  icon,
}: SuccessToastProps) {
  useEffect(() => {
    if (!isVisible || autoHideDelay <= 0) return;

    const timer = setTimeout(() => {
      onDismiss();
    }, autoHideDelay);

    return () => clearTimeout(timer);
  }, [isVisible, autoHideDelay, onDismiss]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className={cn(
            "fixed bottom-6 left-1/2 -translate-x-1/2 z-50",
            "min-w-[280px] max-w-md"
          )}
        >
          <div
            className={cn(
              "px-4 py-3 flex items-center gap-3",
              "bg-gray-900 dark:bg-gray-800 rounded-xl shadow-2xl",
              "border border-gray-700 dark:border-gray-600"
            )}
          >
            <div className="flex-shrink-0 p-1.5 rounded-lg bg-green-500/20">
              {icon || <CheckCircle2 className="h-4 w-4 text-green-400" />}
            </div>
            <span className="flex-1 text-sm text-white">{message}</span>
            <button
              onClick={onDismiss}
              className={cn(
                "p-1.5 rounded-lg",
                "text-gray-400 hover:text-white",
                "hover:bg-gray-700 transition-colors"
              )}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================
// TOAST PROVIDER & HOOK
// ============================================

interface ToastState {
  isVisible: boolean;
  message: string;
  type: "undo" | "success";
  onUndo?: () => void;
}

interface ToastContextValue {
  showUndoToast: (message: string, onUndo: () => void) => void;
  showSuccessToast: (message: string) => void;
  hideToast: () => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState>({
    isVisible: false,
    message: "",
    type: "success",
  });

  const showUndoToast = useCallback((message: string, onUndo: () => void) => {
    setToast({
      isVisible: true,
      message,
      type: "undo",
      onUndo,
    });
  }, []);

  const showSuccessToast = useCallback((message: string) => {
    setToast({
      isVisible: true,
      message,
      type: "success",
    });
  }, []);

  const hideToast = useCallback(() => {
    setToast((prev) => ({ ...prev, isVisible: false }));
  }, []);

  const handleUndo = useCallback(() => {
    if (toast.onUndo) {
      toast.onUndo();
    }
    hideToast();
  }, [toast.onUndo, hideToast]);

  return (
    <ToastContext.Provider
      value={{ showUndoToast, showSuccessToast, hideToast }}
    >
      {children}

      {toast.type === "undo" ? (
        <UndoToast
          isVisible={toast.isVisible}
          message={toast.message}
          onUndo={handleUndo}
          onDismiss={hideToast}
        />
      ) : (
        <SuccessToast
          isVisible={toast.isVisible}
          message={toast.message}
          onDismiss={hideToast}
        />
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

// ============================================
// EXPORTS
// ============================================

export type { UndoToastProps, SuccessToastProps, ToastContextValue };
