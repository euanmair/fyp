import { NextResponse } from "next/server";
import { DynamoDBClient, PutItemCommand, ScanCommand } from "@aws-sdk/client-dynamodb";
import { getSessionClaimsFromCookies, isAdmin } from "@/lib/auth";

const region = process.env.AWS_REGION || "eu-north-1";
const tableName = process.env.ORGANISATIONS_TABLE_NAME || "NurseryOrganisations";
const dynamoClient = new DynamoDBClient({ region });

function safeID(value: string) {
  return /^[a-zA-Z0-9._-]{2,64}$/.test(value);
}

function parseRecord(item: Record<string, { S?: string; N?: string; BOOL?: boolean }>) {
  return {
    organisationID: item.organisationID?.S || "",
    organisationName: item.organisationName?.S || "",
    createdAt: item.createdAt?.S || "",
    isActive: item.isActive?.BOOL !== false,
  };
}

export async function GET() {
  const session = await getSessionClaimsFromCookies();
  if (!session || !isAdmin(session.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const response = await dynamoClient.send(new ScanCommand({ TableName: tableName, Limit: 200 }));
    const organisations = (response.Items || []).map((item) => parseRecord(item as never));
    return NextResponse.json({ organisations });
  } catch (error) {
    console.error("GET /api/admin/organisations error:", error);
    return NextResponse.json({ message: "Unable to list organisations." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getSessionClaimsFromCookies();
  if (!session || !isAdmin(session.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const organisationID = String(body?.organisationID || "").trim();
    const organisationName = String(body?.organisationName || "").trim();

    if (!organisationID || !safeID(organisationID)) {
      return NextResponse.json({ message: "Invalid organisation ID." }, { status: 400 });
    }

    if (!organisationName) {
      return NextResponse.json({ message: "Organisation name is required." }, { status: 400 });
    }

    await dynamoClient.send(new PutItemCommand({
      TableName: tableName,
      Item: {
        organisationID: { S: organisationID },
        organisationName: { S: organisationName },
        createdAt: { S: new Date().toISOString() },
        isActive: { BOOL: true },
      },
      ConditionExpression: "attribute_not_exists(organisationID)",
    }));

    return NextResponse.json({ message: "Organisation created.", organisationID });
  } catch (error) {
    console.error("POST /api/admin/organisations error:", error);
    return NextResponse.json({ message: "Unable to create organisation." }, { status: 500 });
  }
}
