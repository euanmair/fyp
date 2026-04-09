import { NextRequest, NextResponse } from "next/server";
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { getSessionClaimsFromCookies, isAdmin } from "@/lib/auth";

const region = process.env.AWS_REGION || "eu-north-1";
const scheduleTable = process.env.SCHEDULE_TABLE_NAME || "NurserySchedules";
const dynamoClient = new DynamoDBClient({ region });

function parseValue(value: unknown) {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

function mapSchedule(item: Record<string, { S?: string; N?: string; BOOL?: boolean; NULL?: boolean }>) {
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(item)) {
    if (v.S !== undefined) { out[key] = parseValue(v.S); continue; }
    if (v.N !== undefined) { out[key] = Number(v.N); continue; }
    if (v.BOOL !== undefined) { out[key] = v.BOOL; continue; }
    if (v.NULL) { out[key] = null; continue; }
  }
  return {
    scheduleID: String(out.scheduleID || ""),
    organisationID: String(out.organisationID || ""),
    weekStartDate: String(out.weekStartDate || ""),
    createdAt: String(out.createdAt || ""),
    assignmentCount: Array.isArray(out.assignments) ? out.assignments.length : 0,
    resultSummary: out.resultSummary || null,
  };
}

export async function GET(request: NextRequest) {
  const session = await getSessionClaimsFromCookies();
  if (!session || !isAdmin(session.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const orgFilter = String(request.nextUrl.searchParams.get("organisationID") || "").trim();
  const limitParam = Number(request.nextUrl.searchParams.get("limit") || 100);
  const limit = Math.max(1, Math.min(500, Math.floor(limitParam)));

  try {
    const response = await dynamoClient.send(new ScanCommand({ TableName: scheduleTable, Limit: limit }));
    let schedules = (response.Items || []).map((item) => mapSchedule(item as never));

    if (orgFilter) {
      schedules = schedules.filter((s) => s.organisationID === orgFilter);
    }

    return NextResponse.json({ schedules });
  } catch (error) {
    console.error("GET /api/admin/schedules error:", error);
    return NextResponse.json({ message: "Unable to list schedules." }, { status: 500 });
  }
}
