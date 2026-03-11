import { NextRequest, NextResponse } from "next/server";

type ScheduleInput = {
  rooms: number;
  childrenPerRoom: number;
  holidayDates: string[];
  staffRatio: number;
  accountingDaysPerWeek: number;
};

type ScheduleOutput = {
  totalChildren: number;
  neededStaff: number;
  perRoom: Array<{ room: number; children: number; staff: number }>;
  holidays: string[];
  warnings: string[];
};

function computeSchedule(input: ScheduleInput): ScheduleOutput {
  const { rooms, childrenPerRoom, holidayDates, staffRatio, accountingDaysPerWeek } = input;

  const normalizedRoomCount = Math.max(1, Math.floor(rooms));
  const normalizedChildrenPerRoom = Math.max(1, Math.floor(childrenPerRoom));
  const ratio = staffRatio > 0 ? staffRatio : 0.25;

  const perRoom = [];
  let totalChildren = 0;
  let neededStaff = 0;

  for (let room = 1; room <= normalizedRoomCount; room++) {
    const children = normalizedChildrenPerRoom;
    const staff = Math.ceil(children * ratio);
    perRoom.push({ room, children, staff });
    totalChildren += children;
    neededStaff += staff;
  }

  const workingDays = accountingDaysPerWeek;
  const holidayCount = holidayDates.filter(Boolean).length;
  const availableDays = Math.max(0, workingDays - holidayCount);

  const warnings = [];
  if (holidayCount >= workingDays) {
    warnings.push("All chosen working days are holidays. Staffing amount may be zero.");
  }
  if (ratio > 0.5) {
    warnings.push("Staff ratio suggests 1 staff for 2 or fewer children; check legal limits in your region.");
  }
  if (normalizedChildrenPerRoom > 20) {
    warnings.push("Room count high: be sure regulatory maximums are met for each room.");
  }

  neededStaff = Math.ceil((totalChildren / (1 / ratio)) * (availableDays / Math.max(1, workingDays)));

  return {
    totalChildren,
    neededStaff,
    perRoom,
    holidays: holidayDates,
    warnings,
  };
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const schedule = computeSchedule(payload as ScheduleInput);

    const lambdaUrl = process.env.LAMBDA_ENDPOINT_URL;

    if (lambdaUrl) {
      const lambdaResp = await fetch(lambdaUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!lambdaResp.ok) {
        const text = await lambdaResp.text();
        return NextResponse.json({ error: `Lambda request failed: ${text}` }, { status: 502 });
      }

      const lambdaJson = await lambdaResp.json();
      return NextResponse.json(lambdaJson);
    }

    return NextResponse.json(schedule);
  } catch (error) {
    console.error("schedule API error", error);
    return NextResponse.json({ message: "Unable to compute schedule" }, { status: 500 });
  }
}
