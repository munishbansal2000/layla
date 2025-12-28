"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Search, Filter, MapPin, X } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { BookableActivityGrid } from "@/components/activities/BookableActivityCard";

interface BookableActivity {
  id: string;
  name: string;
  description: string;
  type: "activity";
  imageUrl: string;
  rating?: number;
  reviewCount?: number;
  priceLevel: 1 | 2 | 3 | 4;
  duration?: number;
  bookingUrl: string;
  tags: string[];
  viatorProductCode: string;
  price?: {
    amount: number;
    currency: string;
  };
}

const CATEGORIES = [
  { id: "tours", label: "Tours", icon: "🚶" },
  { id: "day-trips", label: "Day Trips", icon: "🚗" },
  { id: "food-tours", label: "Food & Drink", icon: "🍷" },
  { id: "cultural-tours", label: "Cultural", icon: "🏛️" },
  { id: "outdoor-activities", label: "Outdoor", icon: "🏔️" },
  { id: "water-sports", label: "Water Sports", icon: "🏄" },
  { id: "museums", label: "Museums", icon: "🎨" },
  { id: "nightlife", label: "Nightlife", icon: "🌙" },
  { id: "adventure", label: "Adventure", icon: "🎢" },
  { id: "family-friendly", label: "Family", icon: "👨‍👩‍👧‍👦" },
];

const SORT_OPTIONS = [
  { value: "TRAVELER_RATING", label: "Highest Rated" },
  { value: "PRICE", label: "Price" },
  { value: "REVIEW_AVG_RATING", label: "Review Rating" },
  { value: "ITINERARY_DURATION", label: "Duration" },
];

export default function ActivitiesPage() {
  const [destination, setDestination] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [activities, setActivities] = useState<BookableActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState("TRAVELER_RATING");
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const fetchActivities = useCallback(async () => {
    if (!destination) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        destination,
        sort: sortOrder,
        count: "20",
        page: page.toString(),
      });

      if (selectedCategory) {
        params.set("category", selectedCategory);
      }

      const response = await fetch(`/api/activities?${params}`);
      const data = await response.json();

      if (data.success) {
        if (page === 1) {
          setActivities(data.data.activities);
        } else {
          setActivities((prev) => [...prev, ...data.data.activities]);
        }
        setTotalCount(data.data.totalCount);
      } else {
        setError(data.error?.message || "Failed to fetch activities");
      }
    } catch (err) {
      setError("Failed to fetch activities. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [destination, selectedCategory, sortOrder, page]);

  useEffect(() => {
    if (destination) {
      setPage(1);
      fetchActivities();
    }
  }, [destination, selectedCategory, sortOrder]);

  useEffect(() => {
    if (page > 1) {
      fetchActivities();
    }
  }, [page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setDestination(searchInput.trim());
      setPage(1);
    }
  };

  const handleCategoryClick = (categoryId: string) => {
    setSelectedCategory(selectedCategory === categoryId ? null : categoryId);
    setPage(1);
  };

  const handleLoadMore = () => {
    setPage((prev) => prev + 1);
  };

  const handleAddToItinerary = (activity: BookableActivity) => {
    // TODO: Implement add to itinerary functionality
    console.log("Add to itinerary:", activity);
    alert(`Added "${activity.name}" to your trip!`);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />

      {/* Hero Section */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
        <div className="max-w-7xl mx-auto px-4 py-12 sm:py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <h1 className="text-3xl sm:text-4xl font-bold mb-4">
              Discover Amazing Experiences
            </h1>
            <p className="text-lg text-purple-100 mb-8 max-w-2xl mx-auto">
              Book tours, activities, and attractions powered by Viator
            </p>

            {/* Search Form */}
            <form onSubmit={handleSearch} className="max-w-2xl mx-auto">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Where are you going? (e.g., Paris, Tokyo, New York)"
                    className="pl-12 h-14 text-gray-900 bg-white border-0 rounded-xl shadow-lg"
                  />
                </div>
                <Button
                  type="submit"
                  className="h-14 px-8 bg-white text-purple-600 hover:bg-purple-50 rounded-xl font-semibold"
                >
                  <Search className="w-5 h-5 mr-2" />
                  Search
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Categories */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Categories
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="lg:hidden"
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((category) => (
              <button
                key={category.id}
                onClick={() => handleCategoryClick(category.id)}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium
                  transition-all duration-200
                  ${
                    selectedCategory === category.id
                      ? "bg-purple-600 text-white"
                      : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-gray-700"
                  }
                `}
              >
                <span>{category.icon}</span>
                <span>{category.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Sort & Filter Bar */}
        {destination && (
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <span className="text-gray-600 dark:text-gray-400">
                {loading
                  ? "Searching..."
                  : `${totalCount.toLocaleString()} activities in`}
              </span>
              <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                {destination}
              </Badge>
              {selectedCategory && (
                <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 flex items-center gap-1">
                  {CATEGORIES.find((c) => c.id === selectedCategory)?.label}
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className="ml-1 hover:text-red-500"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Sort by:</span>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Activities Grid */}
        {destination ? (
          <>
            <BookableActivityGrid
              activities={activities}
              onAddToItinerary={handleAddToItinerary}
              loading={loading && page === 1}
              emptyMessage={`No activities found in ${destination}. Try a different destination or category.`}
            />

            {/* Load More Button */}
            {activities.length > 0 && activities.length < totalCount && (
              <div className="text-center mt-8">
                <Button
                  onClick={handleLoadMore}
                  disabled={loading}
                  variant="outline"
                  className="px-8"
                >
                  {loading ? "Loading..." : "Load More Activities"}
                </Button>
              </div>
            )}
          </>
        ) : (
          /* Empty State */
          <div className="text-center py-16">
            <MapPin className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
            <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Search for a destination
            </h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              Enter a city or destination above to discover tours, activities,
              and experiences you can book.
            </p>

            {/* Popular Destinations */}
            <div className="mt-8">
              <p className="text-sm text-gray-500 mb-4">
                Popular destinations:
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  "Paris",
                  "New York",
                  "Tokyo",
                  "London",
                  "Rome",
                  "Barcelona",
                ].map((city) => (
                  <button
                    key={city}
                    onClick={() => {
                      setSearchInput(city);
                      setDestination(city);
                    }}
                    className="px-4 py-2 rounded-full bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-gray-700 text-sm font-medium transition-colors"
                  >
                    {city}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Viator Attribution */}
      <div className="text-center py-8 border-t border-gray-200 dark:border-gray-700">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Activities powered by{" "}
          <a
            href="https://www.viator.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#FF5533] hover:underline font-medium"
          >
            Viator
          </a>
        </p>
      </div>
    </div>
  );
}
