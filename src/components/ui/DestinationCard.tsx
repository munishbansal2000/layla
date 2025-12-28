"use client";

import { motion } from "framer-motion";
import { MapPin, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { Destination } from "@/types";

interface DestinationCardProps {
  destination: Destination;
  onSelect: (destination: Destination) => void;
}

export function DestinationCard({
  destination,
  onSelect,
}: DestinationCardProps) {
  return (
    <Card
      hover
      onClick={() => onSelect(destination)}
      className="overflow-hidden"
    >
      <div className="relative h-48">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={destination.imageUrl}
          alt={destination.name}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
          <h3 className="font-bold text-lg">{destination.name}</h3>
          <div className="flex items-center gap-1 text-sm text-white/80">
            <MapPin className="w-3.5 h-3.5" />
            {destination.country}
          </div>
        </div>
      </div>
      <div className="p-4">
        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-3">
          {destination.description}
        </p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {destination.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">
            From{" "}
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              ${destination.averageBudget}
            </span>
            /day
          </span>
          <motion.span
            whileHover={{ x: 4 }}
            className="flex items-center gap-1 text-purple-600 dark:text-purple-400 font-medium"
          >
            Plan trip <ArrowRight className="w-4 h-4" />
          </motion.span>
        </div>
      </div>
    </Card>
  );
}

interface DestinationGridProps {
  destinations: Destination[];
  onSelectDestination: (destination: Destination) => void;
}

export function DestinationGrid({
  destinations,
  onSelectDestination,
}: DestinationGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {destinations.map((destination, index) => (
        <motion.div
          key={destination.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
        >
          <DestinationCard
            destination={destination}
            onSelect={onSelectDestination}
          />
        </motion.div>
      ))}
    </div>
  );
}
