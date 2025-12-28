/**
 * Day Reordering API Routes
 *
 * POST /api/trips/[id]/days - Reorder days or move activities
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getDayReorderingService,
  type ReorderDaysRequest,
  type SwapDaysRequest,
  type MoveActivityRequest,
  type ReorderActivitiesRequest,
} from "@/lib/day-reordering-service";

type RequestAction =
  | { action: "reorder_days"; data: Omit<ReorderDaysRequest, "tripId"> }
  | { action: "swap_days"; data: Omit<SwapDaysRequest, "tripId"> }
  | { action: "move_activity"; data: Omit<MoveActivityRequest, "tripId"> }
  | { action: "reorder_activities"; data: Omit<ReorderActivitiesRequest, "tripId"> };

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tripId = params.id;
    const body = (await request.json()) as RequestAction;
    const service = getDayReorderingService();

    switch (body.action) {
      case "reorder_days": {
        const result = service.reorderDays({
          tripId,
          fromIndex: body.data.fromIndex,
          toIndex: body.data.toIndex,
        });
        return NextResponse.json(result);
      }

      case "swap_days": {
        const result = service.swapDays({
          tripId,
          dayIndex1: body.data.dayIndex1,
          dayIndex2: body.data.dayIndex2,
        });
        return NextResponse.json(result);
      }

      case "move_activity": {
        const result = service.moveActivityAcrossDays({
          tripId,
          activityId: body.data.activityId,
          sourceDayIndex: body.data.sourceDayIndex,
          sourceSlotIndex: body.data.sourceSlotIndex,
          targetDayIndex: body.data.targetDayIndex,
          targetSlotIndex: body.data.targetSlotIndex,
        });
        return NextResponse.json(result);
      }

      case "reorder_activities": {
        const result = service.reorderActivitiesWithinDay({
          tripId,
          dayIndex: body.data.dayIndex,
          fromSlotIndex: body.data.fromSlotIndex,
          toSlotIndex: body.data.toSlotIndex,
        });
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json(
          { error: "Invalid action" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Day reordering error:", error);
    return NextResponse.json(
      { error: "Failed to process day reordering request" },
      { status: 500 }
    );
  }
}
