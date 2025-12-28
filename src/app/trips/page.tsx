"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Calendar, MapPin, Users, Search } from "lucide-react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { createMockTrip } from "@/data/mock-data";
import { formatDateRange } from "@/lib/utils";
import type { Trip } from "@/types";

export default function TripsPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const trips: Trip[] = [
    createMockTrip(),
    {
      ...createMockTrip(),
      id: "trip-2",
      title: "Tokyo Adventure",
      destination: {
        lat: 35.6762,
        lng: 139.6503,
        city: "Tokyo",
        country: "Japan",
      },
      coverImage:
        "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800",
      status: "completed",
      startDate: new Date("2024-03-10"),
      endDate: new Date("2024-03-17"),
    },
    {
      ...createMockTrip(),
      id: "trip-3",
      title: "Bali Retreat",
      destination: {
        lat: -8.3405,
        lng: 115.092,
        city: "Bali",
        country: "Indonesia",
      },
      coverImage:
        "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800",
      status: "planning",
      startDate: new Date("2024-09-01"),
      endDate: new Date("2024-09-08"),
    },
  ];

  const filteredTrips = trips.filter(
    (trip) =>
      trip.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      trip.destination.city.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const statusColors = {
    planning: "info",
    confirmed: "success",
    ongoing: "warning",
    completed: "default",
    cancelled: "error",
  } as const;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />

      <main className="pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                My Trips
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {trips.length} trips planned
              </p>
            </div>
            <Link href="/">
              <Button variant="primary" leftIcon={<Plus className="w-5 h-5" />}>
                Plan New Trip
              </Button>
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <Input
            placeholder="Search trips..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search className="w-5 h-5" />}
            className="max-w-md"
          />
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTrips.map((trip, index) => (
            <motion.div
              key={trip.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * (index + 1) }}
            >
              <Link href={`/trips/${trip.id}`}>
                <Card hover className="h-full">
                  <div className="relative h-48">
                    {trip.coverImage && (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={trip.coverImage}
                          alt={trip.title}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      </>
                    )}
                    <div className="absolute top-4 left-4">
                      <Badge variant={statusColors[trip.status]} size="sm">
                        {trip.status}
                      </Badge>
                    </div>
                    <div className="absolute bottom-4 left-4 right-4 text-white">
                      <h3 className="font-bold text-xl">{trip.title}</h3>
                      <div className="flex items-center gap-1 text-sm text-white/80 mt-1">
                        <MapPin className="w-4 h-4" />
                        {trip.destination.city}, {trip.destination.country}
                      </div>
                    </div>
                  </div>
                  <CardContent>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {formatDateRange(
                          new Date(trip.startDate),
                          new Date(trip.endDate)
                        )}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {trip.travelers} travelers
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {trip.preferences.interests
                        .slice(0, 3)
                        .map((interest) => (
                          <span
                            key={interest}
                            className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full"
                          >
                            {interest}
                          </span>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>

        {filteredTrips.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
          >
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              No trips found matching your search.
            </p>
            <Link href="/">
              <Button variant="primary">Plan Your First Trip</Button>
            </Link>
          </motion.div>
        )}
      </main>
    </div>
  );
}
