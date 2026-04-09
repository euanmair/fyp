import { NextRequest, NextResponse } from "next/server";
import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { getSessionClaimsFromCookies } from "@/lib/auth";

const region = process.env.AWS_REGION || "eu-north-1";
const scheduleTable = process.env.SCHEDULE_TABLE_NAME || "NurserySchedules";
const dynamoClient = new DynamoDBClient({ region });

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

function isDateToken(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(request: NextRequest) {
  const session = await getSessionClaimsFromCookies();
  if (!session) {
    return NextResponse.json({ message: "Unauthorised" }, { status: 401 });
  }

  if (!session.organisationID) {
    return NextResponse.json({ message: "Organisation membership required." }, { status: 400 });
  }

  const weekStartDate = String(request.nextUrl.searchParams.get("weekStartDate") || "").trim();
  const limitParam = Number(request.nextUrl.searchParams.get("limit") || 20);
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(100, Math.floor(limitParam))) : 20;

  if (weekStartDate && !isDateToken(weekStartDate)) {
    return NextResponse.json({ message: "Invalid weekStartDate format. Use YYYY-MM-DD." }, { status: 400 });
  }

  try {
    const response = weekStartDate
      ? await dynamoClient.send(new QueryCommand({
          TableName: scheduleTable,
          IndexName: "OrgWeekIndex",
          KeyConditionExpression: "organisationID = :org AND weekStartDate = :week",
          ExpressionAttributeValues: {
            ":org": { S: session.organisationID },
            ":week": { S: weekStartDate },
          },
          ScanIndexForward: false,
          Limit: limit,
        }))
      : await dynamoClient.send(new QueryCommand({
          TableName: scheduleTable,
          IndexName: "OrgWeekIndex",
          KeyConditionExpression: "organisationID = :org",
          ExpressionAttributeValues: {
            ":org": { S: session.organisationID },
          },
          ScanIndexForward: false,
          Limit: limit,
        }));
    const schedules = (response.Items || []).map((item) => unmarshallSimple(item as never));

    const summaries = schedules.map((item) => ({
      scheduleID: String(item.scheduleID || ""),
      organisationID: String(item.organisationID || ""),
      createdAt: String(item.createdAt || ""),
      weekStartDate: String(item.weekStartDate || ""),
      assignmentStrategy: String(item.assignmentStrategy || "optimised"),
      resultSummary: item.resultSummary || null,
      hasAssignments: Array.isArray(item.assignments),
    }));

    return NextResponse.json({
      organisationID: session.organisationID,
      schedules: summaries,
    });
  } catch (error) {
    console.error("GET /api/schedules error:", error);
    return NextResponse.json({ message: "Unable to fetch schedules." }, { status: 500 });
  }
}
