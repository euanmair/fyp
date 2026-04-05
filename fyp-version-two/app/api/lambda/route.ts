import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { jwtVerify } from "jose";

export const runtime = "nodejs";

const region = process.env.AWS_REGION || "eu-north-1";
const schedulerFunction = process.env.AWS_LAMBDA_SCHEDULER_FUNCTION || "nursery-scheduler";
const getConfigFunction = process.env.AWS_LAMBDA_CONFIG_GET_FUNCTION || "nursery-config-get";
const upsertConfigFunction = process.env.AWS_LAMBDA_CONFIG_UPSERT_FUNCTION || "nursery-config-upsert";
const patchConfigFunction = process.env.AWS_LAMBDA_CONFIG_PATCH_FUNCTION || "nursery-config-patch";
const jwtSecret = process.env.JWT_SECRET || "your-secret-key-change-in-production";

const lambdaClient = new LambdaClient({ region });

type LambdaAction = "generateSchedule" | "getConfig" | "upsertConfig" | "patchConfig";

const functionByAction: Record<LambdaAction, string> = {
  generateSchedule: schedulerFunction,
  getConfig: getConfigFunction,
  upsertConfig: upsertConfigFunction,
  patchConfig: patchConfigFunction,
};

export async function POST(request: Request) {
  try {
    const isAuthed = await isAuthenticated();
    if (!isAuthed) {
      return NextResponse.json({ message: "Unauthorised" }, { status: 401 });
    }

    const body = await request.json();
    const action = body?.action as LambdaAction | undefined;
    const payload = body?.payload;

    if (!action || !(action in functionByAction)) {
      return NextResponse.json({ message: "Invalid action." }, { status: 400 });
    }

    const functionName = functionByAction[action as LambdaAction];
    const lambdaResult = await invokeLambda(functionName, payload ?? {});

    return NextResponse.json(
      {
        action,
        lambdaFunction: functionName,
        ...lambdaResult,
      },
      { status: lambdaResult.statusCode }
    );
  } catch (error) {
    console.error("/api/lambda error:", error);
    return NextResponse.json(
      {
        message: "Failed to call Lambda function.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

async function isAuthenticated() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth-token")?.value;
  if (!token) return false;

  try {
    const secret = new TextEncoder().encode(jwtSecret);
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

async function invokeLambda(functionName: string, payload: unknown) {
  const command = new InvokeCommand({
    FunctionName: functionName,
    Payload: new TextEncoder().encode(JSON.stringify(payload)),
  });

  const response = await lambdaClient.send(command);
  const rawPayload = response.Payload ? new TextDecoder().decode(response.Payload) : "{}";

  let parsedPayload: unknown = {};
  try {
    parsedPayload = rawPayload ? JSON.parse(rawPayload) : {};
  } catch {
    parsedPayload = { rawPayload };
  }

  const lambdaError = response.FunctionError;
  if (lambdaError) {
    return {
      statusCode: 502,
      message: "Lambda invocation failed.",
      functionError: lambdaError,
      payload: parsedPayload,
    };
  }

  const apiLikePayload = parsedPayload as { statusCode?: number; body?: string };
  if (typeof apiLikePayload?.body === "string") {
    try {
      const parsedBody = JSON.parse(apiLikePayload.body);
      return {
        statusCode: apiLikePayload.statusCode || 200,
        payload: parsedBody,
      };
    } catch {
      return {
        statusCode: apiLikePayload.statusCode || 200,
        payload: { rawBody: apiLikePayload.body },
      };
    }
  }

  return {
    statusCode: 200,
    payload: parsedPayload,
  };
}
