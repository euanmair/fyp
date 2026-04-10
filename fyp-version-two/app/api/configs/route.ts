import { NextResponse } from "next/server";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { getSessionClaimsFromCookies } from "@/lib/auth";

const region = process.env.AWS_REGION || "eu-north-1";
const listConfigsFunction = process.env.AWS_LAMBDA_CONFIG_LIST_FUNCTION || "nursery-config-list";
const lambdaClient = new LambdaClient({ region });

export async function GET() {
  const session = await getSessionClaimsFromCookies();
  if (!session) {
    return NextResponse.json({ message: "Unauthorised" }, { status: 401 });
  }

  if (!session.organisationID) {
    return NextResponse.json({ message: "Organisation membership required." }, { status: 400 });
  }

  try {
    const command = new InvokeCommand({
      FunctionName: listConfigsFunction,
      Payload: new TextEncoder().encode(JSON.stringify({
        organisationID: session.organisationID,
      })),
    });

    const response = await lambdaClient.send(command);
    const rawPayload = response.Payload ? new TextDecoder().decode(response.Payload) : "{}";
    const parsed = JSON.parse(rawPayload);

    if (response.FunctionError) {
      console.error("GET /api/configs Lambda error:", parsed);
      return NextResponse.json({ message: "Unable to fetch configs." }, { status: 502 });
    }

    const body = typeof parsed.body === "string" ? JSON.parse(parsed.body) : parsed;
    return NextResponse.json({ configIDs: body.configIDs || [] });
  } catch (error) {
    console.error("GET /api/configs error:", error);
    return NextResponse.json({ message: "Unable to fetch configs." }, { status: 500 });
  }
}
