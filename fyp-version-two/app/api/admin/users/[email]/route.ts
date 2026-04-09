import { NextResponse } from "next/server";
import { DeleteItemCommand, DynamoDBClient, UpdateItemCommand, type AttributeValue } from "@aws-sdk/client-dynamodb";
import { getSessionClaimsFromCookies, isAdmin } from "@/lib/auth";

const region = process.env.AWS_REGION || "eu-north-1";
const usersTable = process.env.USERS_TABLE_NAME || "NurseryUsers";
const dynamoClient = new DynamoDBClient({ region });

function safeOptionalID(value: string) {
  return value.length === 0 || /^[a-zA-Z0-9._-]{2,64}$/.test(value);
}

export async function PATCH(request: Request, context: { params: Promise<{ email: string }> }) {
  const session = await getSessionClaimsFromCookies();
  if (!session || !isAdmin(session.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { email } = await context.params;

  try {
    const body = await request.json();
    const role = String(body?.role || "").trim().toLowerCase();
    const organisationID = String(body?.organisationID || "").trim();
    const staffID = String(body?.staffID || "").trim();

    const updates: string[] = ["updatedAt = :updatedAt"];
    const values: Record<string, AttributeValue> = {
      ":updatedAt": { S: new Date().toISOString() },
    };
    const names: Record<string, string> = {};

    if (role) {
      if (!["staff", "manager", "admin"].includes(role)) {
        return NextResponse.json({ message: "Invalid role." }, { status: 400 });
      }
      updates.push("#role = :role");
      values[":role"] = { S: role };
      names["#role"] = "role";
    }

    if (!safeOptionalID(organisationID)) {
      return NextResponse.json({ message: "Invalid organisation ID." }, { status: 400 });
    }

    if (!safeOptionalID(staffID)) {
      return NextResponse.json({ message: "Invalid staff ID." }, { status: 400 });
    }

    updates.push("organisationID = :org");
    values[":org"] = { S: organisationID };
    updates.push("staffID = :staffID");
    values[":staffID"] = { S: staffID };

    await dynamoClient.send(new UpdateItemCommand({
      TableName: usersTable,
      Key: { email: { S: decodeURIComponent(email).toLowerCase() } },
      UpdateExpression: `SET ${updates.join(", ")}`,
      ExpressionAttributeValues: values,
      ...(Object.keys(names).length > 0 ? { ExpressionAttributeNames: names } : {}),
    }));

    return NextResponse.json({ message: "User updated." });
  } catch (error) {
    console.error("PATCH /api/admin/users/[email] error:", error);
    return NextResponse.json({ message: "Unable to update user." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ email: string }> }) {
  const session = await getSessionClaimsFromCookies();
  if (!session || !isAdmin(session.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { email } = await context.params;
  const normalisedEmail = decodeURIComponent(email).toLowerCase();

  if (normalisedEmail === session.email) {
    return NextResponse.json({ message: "Cannot delete your own account." }, { status: 400 });
  }

  try {
    await dynamoClient.send(new DeleteItemCommand({
      TableName: usersTable,
      Key: { email: { S: normalisedEmail } },
    }));

    return NextResponse.json({ message: "User deleted." });
  } catch (error) {
    console.error("DELETE /api/admin/users/[email] error:", error);
    return NextResponse.json({ message: "Unable to delete user." }, { status: 500 });
  }
}
