import { NextResponse } from "next/server";
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { getSessionClaimsFromCookies } from "@/lib/auth";

const region = process.env.AWS_REGION || "eu-north-1";
const configTable = process.env.CONFIG_TABLE_NAME || "NurseryConfig";
const dynamoClient = new DynamoDBClient({ region });

export async function GET() {
  const session = await getSessionClaimsFromCookies();
  if (!session) {
    return NextResponse.json({ message: "Unauthorised" }, { status: 401 });
  }

  if (!session.organisationID) {
    return NextResponse.json({ message: "Organisation membership required." }, { status: 400 });
  }

  const prefix = `${session.organisationID}#`;

  try {
    const response = await dynamoClient.send(new ScanCommand({
      TableName: configTable,
      FilterExpression: "begins_with(configID, :prefix)",
      ExpressionAttributeValues: {
        ":prefix": { S: prefix },
      },
      ProjectionExpression: "configID",
    }));

    const configIDs = (response.Items || [])
      .map((item) => {
        const raw = item.configID?.S || "";
        return raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
      })
      .filter(Boolean)
      .sort();

    return NextResponse.json({ configIDs });
  } catch (error) {
    console.error("GET /api/configs error:", error);
    return NextResponse.json({ message: "Unable to fetch configs." }, { status: 500 });
  }
}
