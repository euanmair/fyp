import { NextResponse } from "next/server";
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { canManageSchedules, getSessionClaimsFromCookies } from "@/lib/auth";

const region = process.env.AWS_REGION || "eu-north-1";
const scheduleTable = process.env.SCHEDULE_TABLE_NAME || "NurserySchedules";
const dynamoClient = new DynamoDBClient({ region });

type Assignment = {
  week?: number;
  day?: string;
  start?: string;
  end?: string;
  roomID?: string;
  roomName?: string;
  staffID?: string;
  staffName?: string;
  isOffice?: boolean;
  unfilled?: boolean;
};

function parseValue(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function unmarshallSimple(item: Record<string, { S?: string; N?: string; BOOL?: boolean; NULL?: boolean }>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item || {})) {
    if (value.S !== undefined) {
      out[key] = parseValue(value.S);
      continue;
    }
    if (value.N !== undefined) {
      out[key] = Number(value.N);
      continue;
    }
    if (value.BOOL !== undefined) {
      out[key] = value.BOOL;
      continue;
    }
    if (value.NULL) {
      out[key] = null;
      continue;
    }
  }
  return out;
}

function normaliseAssignment(raw: unknown): Assignment {
  const item = (raw || {}) as Assignment;
  return {
    week: Number(item.week || 1),
    day: String(item.day || ""),
    start: String(item.start || ""),
    end: String(item.end || ""),
    roomID: String(item.roomID || ""),
    roomName: String(item.roomName || ""),
    staffID: String(item.staffID || ""),
    staffName: String(item.staffName || ""),
    isOffice: Boolean(item.isOffice),
    unfilled: Boolean(item.unfilled),
  };
}

function computeStaffHours(assignments: Assignment[]) {
  const hoursByStaff: Record<string, number> = {};
  for (const item of assignments) {
    if (!item.staffID || item.staffID === "UNFILLED") {
      continue;
    }

    const start = String(item.start || "").split(":");
    const end = String(item.end || "").split(":");
    const startMinutes = (Number(start[0]) * 60) + Number(start[1] || 0);
    const endMinutes = (Number(end[0]) * 60) + Number(end[1] || 0);
    const duration = Math.max(0, (endMinutes - startMinutes) / 60);
    hoursByStaff[item.staffID] = (hoursByStaff[item.staffID] || 0) + duration;
  }
  return hoursByStaff;
}

export async function GET(_request: Request, context: { params: Promise<{ scheduleID: string }> }) {
  const session = await getSessionClaimsFromCookies();
  if (!session) {
    return NextResponse.json({ message: "Unauthorised" }, { status: 401 });
  }

  const { scheduleID } = await context.params;

  try {
    const response = await dynamoClient.send(new GetItemCommand({
      TableName: scheduleTable,
      Key: { scheduleID: { S: scheduleID } },
    }));

    if (!response.Item) {
      return NextResponse.json({ message: "Schedule not found." }, { status: 404 });
    }

    const schedule = unmarshallSimple(response.Item as never);
    if (String(schedule.organisationID || "") !== String(session.organisationID || "")) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const assignments = Array.isArray(schedule.assignments) ? (schedule.assignments as Assignment[]) : [];
    const filteredAssignments = session.role === "staff"
      ? (session.staffID ? assignments.filter((item) => item.staffID === session.staffID) : [])
      : assignments;

    return NextResponse.json({
      schedule: {
        ...schedule,
        assignments: filteredAssignments,
      },
    });
  } catch (error) {
    console.error("GET /api/schedules/[scheduleID] error:", error);
    return NextResponse.json({ message: "Unable to fetch schedule." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ scheduleID: string }> }) {
  const session = await getSessionClaimsFromCookies();
  if (!session) {
    return NextResponse.json({ message: "Unauthorised" }, { status: 401 });
  }

  if (!canManageSchedules(session.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { scheduleID } = await context.params;

  try {
    const body = await request.json();
    const assignments = Array.isArray(body?.assignments)
      ? body.assignments.map(normaliseAssignment)
      : null;

    if (!assignments) {
      return NextResponse.json({ message: "assignments array is required." }, { status: 400 });
    }

    const org = String(session.organisationID || "");
    if (!org) {
      return NextResponse.json({ message: "Organisation membership required." }, { status: 400 });
    }

    const resultSummary = {
      assignmentCount: assignments.length,
      staffHours: computeStaffHours(assignments),
      editedAt: new Date().toISOString(),
    };

    await dynamoClient.send(new UpdateItemCommand({
      TableName: scheduleTable,
      Key: { scheduleID: { S: scheduleID } },
      ConditionExpression: "organisationID = :org",
      UpdateExpression: "SET assignments = :assignments, resultSummary = :summary, updatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":org": { S: org },
        ":assignments": { S: JSON.stringify(assignments) },
        ":summary": { S: JSON.stringify(resultSummary) },
        ":updatedAt": { S: new Date().toISOString() },
      },
      ReturnValues: "ALL_NEW",
    }));

    return NextResponse.json({
      message: "Schedule updated successfully.",
      scheduleID,
      assignmentCount: assignments.length,
    });
  } catch (error) {
    console.error("PATCH /api/schedules/[scheduleID] error:", error);
    return NextResponse.json({ message: "Unable to update schedule." }, { status: 500 });
  }
}
