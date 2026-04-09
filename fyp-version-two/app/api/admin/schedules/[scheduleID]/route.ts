import { NextResponse } from "next/server";
import { DeleteItemCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { getSessionClaimsFromCookies, isAdmin } from "@/lib/auth";

const region = process.env.AWS_REGION || "eu-north-1";
const scheduleTable = process.env.SCHEDULE_TABLE_NAME || "NurserySchedules";
const dynamoClient = new DynamoDBClient({ region });

export async function DELETE(_request: Request, context: { params: Promise<{ scheduleID: string }> }) {
  const session = await getSessionClaimsFromCookies();
  if (!session || !isAdmin(session.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { scheduleID } = await context.params;

  try {
    await dynamoClient.send(new DeleteItemCommand({
      TableName: scheduleTable,
      Key: { scheduleID: { S: scheduleID } },
    }));

    return NextResponse.json({ message: "Schedule deleted." });
  } catch (error) {
    console.error("DELETE /api/admin/schedules/[scheduleID] error:", error);
    return NextResponse.json({ message: "Unable to delete schedule." }, { status: 500 });
  }
}
