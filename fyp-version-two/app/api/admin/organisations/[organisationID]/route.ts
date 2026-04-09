import { NextResponse } from "next/server";
import { DeleteItemCommand, DynamoDBClient, UpdateItemCommand, type AttributeValue } from "@aws-sdk/client-dynamodb";
import { getSessionClaimsFromCookies, isAdmin } from "@/lib/auth";

const region = process.env.AWS_REGION || "eu-north-1";
const tableName = process.env.ORGANISATIONS_TABLE_NAME || "NurseryOrganisations";
const dynamoClient = new DynamoDBClient({ region });

export async function PATCH(request: Request, context: { params: Promise<{ organisationID: string }> }) {
  const session = await getSessionClaimsFromCookies();
  if (!session || !isAdmin(session.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { organisationID } = await context.params;

  try {
    const body = await request.json();
    const organisationName = String(body?.organisationName || "").trim();
    const isActive = body?.isActive === undefined ? undefined : Boolean(body.isActive);

    const updates: string[] = [];
    const values: Record<string, AttributeValue> = {};

    if (organisationName) {
      updates.push("organisationName = :name");
      values[":name"] = { S: organisationName };
    }

    if (isActive !== undefined) {
      updates.push("isActive = :active");
      values[":active"] = { BOOL: isActive };
    }

    if (updates.length === 0) {
      return NextResponse.json({ message: "No update fields supplied." }, { status: 400 });
    }

    updates.push("updatedAt = :updatedAt");
    values[":updatedAt"] = { S: new Date().toISOString() };

    await dynamoClient.send(new UpdateItemCommand({
      TableName: tableName,
      Key: { organisationID: { S: organisationID } },
      UpdateExpression: `SET ${updates.join(", ")}`,
      ExpressionAttributeValues: values,
    }));

    return NextResponse.json({ message: "Organisation updated." });
  } catch (error) {
    console.error("PATCH /api/admin/organisations/[organisationID] error:", error);
    return NextResponse.json({ message: "Unable to update organisation." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ organisationID: string }> }) {
  const session = await getSessionClaimsFromCookies();
  if (!session || !isAdmin(session.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { organisationID } = await context.params;

  try {
    await dynamoClient.send(new DeleteItemCommand({
      TableName: tableName,
      Key: { organisationID: { S: organisationID } },
    }));

    return NextResponse.json({ message: "Organisation deleted." });
  } catch (error) {
    console.error("DELETE /api/admin/organisations/[organisationID] error:", error);
    return NextResponse.json({ message: "Unable to delete organisation." }, { status: 500 });
  }
}
