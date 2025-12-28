"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Filter, MapPin, TrendingUp } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { DestinationGrid } from "@/components/ui/DestinationCard";
import { popularDestinations } from "@/data/mock-data";
import type { Destination } from "@/types";

export default function ExplorePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = [
    { id: "romantic", label: "Romantic", icon: "💕" },
    { id: "adventure", label: "Adventure", icon: "🏔️" },
    { id: "beach", label: "Beach", icon: "🏖️" },
    { id: "culture", label: "Culture", icon: "🏛️" },
    { id: "food", label: "Foodie", icon: "🍜" },
    { id: "nature", label: "Nature", icon: "🌲" },
  ];

  const filteredDestinations = popularDestinations.filter((destination) => {
    const matchesSearch =
      destination.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      destination.country.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      !selectedCategory || destination.tags.includes(selectedCategory);
    return matchesSearch && matchesCategory;
  });

  const handleSelectDestination = (destination: Destination) => {
    window.location.href = `/?destination=${encodeURIComponent(
      destination.name
    )}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />

      <main className="pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Explore Destinations
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Discover amazing places around the world and start planning your
            next adventure.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <div className="flex flex-col sm:flex-row gap-4 max-w-2xl mx-auto">
            <div className="flex-1">
              <Input
                placeholder="Search destinations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="w-5 h-5" />}
              />
            </div>
            <Button
              variant="secondary"
              leftIcon={<Filter className="w-5 h-5" />}
            >
              Filters
            </Button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-10"
        >
          <div className="flex flex-wrap justify-center gap-3">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() =>
                  setSelectedCategory(
                    selectedCategory === category.id ? null : category.id
                  )
                }
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                  selectedCategory === category.id
                    ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg"
                    : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700"
                }`}
              >
                <span>{category.icon}</span>
                {category.label}
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-12"
        >
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp className="w-5 h-5 text-purple-600" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {selectedCategory
                ? `${
                    categories.find((c) => c.id === selectedCategory)?.label
                  } Destinations`
                : "Trending Destinations"}
            </h2>
          </div>
          <DestinationGrid
            destinations={filteredDestinations}
            onSelectDestination={handleSelectDestination}
          />
        </motion.div>

        {filteredDestinations.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
          >
            <MapPin className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              No destinations found matching your criteria.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory(null);
              }}
            >
              Clear Filters
            </Button>
          </motion.div>
        )}
      </main>
    </div>
  );
}
