import { NextRequest, NextResponse } from "next/server";
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { getSessionClaimsFromCookies, isAdmin } from "@/lib/auth";

const region = process.env.AWS_REGION || "eu-north-1";
const usersTable = process.env.USERS_TABLE_NAME || "NurseryUsers";
const dynamoClient = new DynamoDBClient({ region });

function mapUser(item: Record<string, { S?: string }>) {
  return {
    email: item.email?.S || "",
    id: item.id?.S || "",
    role: item.role?.S || "staff",
    organisationID: item.organisationID?.S || "",
    staffID: item.staffID?.S || "",
    createdAt: item.createdAt?.S || "",
  };
}

export async function GET(request: NextRequest) {
  const session = await getSessionClaimsFromCookies();
  if (!session || !isAdmin(session.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const organisationID = String(request.nextUrl.searchParams.get("organisationID") || "").trim();

  try {
    const response = await dynamoClient.send(new ScanCommand({ TableName: usersTable, Limit: 300 }));
    let users = (response.Items || []).map((item) => mapUser(item as never));

    if (organisationID) {
      users = users.filter((user) => user.organisationID === organisationID);
    }

    return NextResponse.json({ users });
  } catch (error) {
    console.error("GET /api/admin/users error:", error);
    return NextResponse.json({ message: "Unable to list users." }, { status: 500 });
  }
}
