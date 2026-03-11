import { S3 } from "aws-sdk";

type SchedulerInput = {
  rooms: number;
  childrenPerRoom: number;
  holidayDates: string[];
  staffRatio: number;
  accountingDaysPerWeek: number;
};

type SchedulerOutput = {
  totalChildren: number;
  neededStaff: number;
  perRoom: Array<{ room: number; children: number; staff: number }>;
  holidays: string[];
  warnings: string[];
};

const computeScheduler = (input: SchedulerInput): SchedulerOutput => {
  const rooms = Math.max(1, Math.floor(input.rooms));
  const childrenPerRoom = Math.max(1, Math.floor(input.childrenPerRoom));
  const ratio = input.staffRatio > 0 ? input.staffRatio : 0.25;

  const perRoom = [];
  let totalChildren = 0;
  let neededStaff = 0;

  for (let room = 1; room <= rooms; room++) {
    const children = childrenPerRoom;
    const staff = Math.ceil(children * ratio);
    perRoom.push({ room, children, staff });
    totalChildren += children;
    neededStaff += staff;
  }

  const holidayCount = input.holidayDates.filter(Boolean).length;
  const activeDays = Math.max(0, input.accountingDaysPerWeek - holidayCount);

  const warnings = [];
  if (holidayCount >= input.accountingDaysPerWeek) {
    warnings.push("Week is all holidays; verify staffing expectations.");
  }
  if (ratio > 0.5) {
    warnings.push("Very high staff density ratio; confirm with policy.");
  }

  neededStaff = Math.ceil((totalChildren / (1 / ratio)) * (activeDays / Math.max(1, input.accountingDaysPerWeek)));

  return {
    totalChildren,
    neededStaff,
    perRoom,
    holidays: input.holidayDates,
    warnings,
  };
};

const s3Client = new S3({ region: process.env.AWS_REGION || "eu-west-2" });

const putScheduleToS3 = async (bucket: string, key: string, data: any) => {
  await s3Client
    .putObject({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: "application/json",
    })
    .promise();
};

export const handler = async (event: any) => {
  try {
    const body = typeof event.body === "string" ? JSON.parse(event.body) : event;

    const output = computeScheduler(body as SchedulerInput);

    if (process.env.SCHEDULE_BUCKET_NAME) {
      const key = `schedules/${new Date().toISOString()}_schedule.json`;
      await putScheduleToS3(process.env.SCHEDULE_BUCKET_NAME, key, {
        request: body,
        schedule: output,
        createdAt: new Date().toISOString(),
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify(output),
    };
  } catch (error) {
    console.error("Lambda error", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Failed to compute schedule" }),
    };
  }
};
