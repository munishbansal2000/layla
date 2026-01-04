/**
 * Travel Tips Section Component
 *
 * Displays general travel tips for the itinerary.
 */

"use client";

interface TravelTipsSectionProps {
  tips: string[];
}

export function TravelTipsSection({ tips }: TravelTipsSectionProps) {
  if (!tips || tips.length === 0) {
    return null;
  }

  return (
    <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
      <h3 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">
        💡 Travel Tips
      </h3>
      <ul className="space-y-1 text-sm text-blue-700 dark:text-blue-400">
        {tips.map((tip, i) => (
          <li key={i} className="flex items-start gap-2">
            <span>•</span>
            <span>{tip}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
