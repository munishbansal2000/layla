"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export function Card({
  children,
  className,
  hover = false,
  onClick,
}: CardProps) {
  return (
    <motion.div
      whileHover={
        hover ? { y: -4, boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1)" } : {}
      }
      onClick={onClick}
      className={cn(
        "bg-white dark:bg-gray-800 rounded-2xl shadow-md overflow-hidden",
        "border border-gray-100 dark:border-gray-700",
        hover && "cursor-pointer",
        className
      )}
    >
      {children}
    </motion.div>
  );
}

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function CardHeader({ children, className }: CardHeaderProps) {
  return (
    <div
      className={cn(
        "px-6 py-4 border-b border-gray-100 dark:border-gray-700",
        className
      )}
    >
      {children}
    </div>
  );
}

interface CardContentProps {
  children: React.ReactNode;
  className?: string;
}

export function CardContent({ children, className }: CardContentProps) {
  return <div className={cn("px-6 py-4", className)}>{children}</div>;
}

interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function CardFooter({ children, className }: CardFooterProps) {
  return (
    <div
      className={cn(
        "px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50",
        className
      )}
    >
      {children}
    </div>
  );
}
