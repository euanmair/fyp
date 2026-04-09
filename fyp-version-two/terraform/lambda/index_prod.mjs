// AWS SDK modules for DynamoDB interaction and UUID generation for unique IDs
import { DynamoDBClient, PutItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { v4 as uuidv4 } from "uuid";
import Ajv from "ajv";

// Table names
const dynamoTable = process.env.SCHEDULE_TABLE_NAME || "NurserySchedules";
const historyTable = process.env.STAGE_HISTORY_TABLE_NAME || "NurseryScheduleHistory";
// Config table stores the nursery's default staff, settings and children counts so the function can run without a full payload.
const configTable = process.env.CONFIG_TABLE_NAME || "NurseryConfig";
const shouldPersistByDefault = process.env.PERSIST_SCHEDULES === "true";

// Ajv validator setup for strict schema validation
const ajv = new Ajv({ allErrors: true, removeAdditional: "all", coerceTypes: true });
const dynamoClient = new DynamoDBClient({});

// Default ratios for staffing (integer is assumed as 1:<value> ratio)
const defaultStaffingRatios = {
    "0-24": 3,
    "24-36": 4,
    "36+": 8
};

// Define the expected schema for the schedule data - this is for parsing purposes
// This function will still work even if no data is provided, as this runs primarily off of a dynamoDB
const scheduleSchema = {
    type: "object",
    additionalProperties: false,
    required: ["staff", "settings", "childrenCount"],
    properties: {
        organisationID: { type: "string" },
        requestedBy: {
            type: "object",
            additionalProperties: true,
            properties: {
                userId: { type: "string" },
                role: { type: "string" },
                email: { type: "string" },
                staffID: { type: "string" }
            }
        },
        rooms: {
            // There are the following requirements for the rooms:
            /* 1. roomID - A unique identifier for the room (string, required).
               2. roomName - The name of the room (string, required).
               3. capacity - The maximum number of children the room can accommodate (integer, required).
               4. ageGroup - The age group of children assigned to the room (string, required).
                - For example: Age 0-18 Months, Age 18-36 Months, Age 3-5 Years, etc. This input will be by button/checkbox. 
               5. schedule - An array of schedule entries for the room (array of objects, required).
               6. isOffice - Various staff members have different jobs. (boolean, required).
            */
            type: "array",
            default: [],
            items: {
                type: "object",
                additionalProperties: false,
                required: ["roomID", "roomName", "capacity", "ageGroup", "schedule", "isOffice"],
                properties: {
                    roomID: { type: "string" },
                    roomName: { type: "string" },
                    capacity: { type: "integer", minimum: 0 },
                    ageGroup: { type: "string" },
                    schedule: { type: "array" },
                    isOffice: { type: "boolean" }
                }
            }
        },
        staff: {
            // There are the following requirements for the staff:
            /* 1. staffID - A unique identifier for the staff member (string, required).
               2. staffName - The name of the staff member (string, required).
               3. trainingLevel - The training level of the staff member (integer, required).
               4. holiday - An array of dates representing the staff member's holidays (array of strings, optional).
               5. preferredShifts - An array of preferred shift times for the staff member (array of strings, optional).
               6. isOffice - Staff are either office-based or practitioners (boolean, required).
                */
            type: "array",
            minItems: 1,
            items: {
                type: "object",
                additionalProperties: false,
                required: ["staffID", "staffName", "trainingLevel", "isOffice", "hourlyRate"],
                properties: {
                    staffID: { type: "string" },
                    staffName: { type: "string" },
                    trainingLevel: { type: "integer", minimum: 0 },
                    holiday: { type: "array", items: { type: "string" }, default: [] },
                    preferredShifts: { type: "array", items: { type: "string" }, default: [] }, // Some staff may prefer certain shitfs
                    isOffice: { type: "boolean" },
                    hourlyRate: { type: "number", minimum: 0 }
                }
            }
        },
        settings: {
            // There are the following requirements for the settings:
            /* 1. planningWeeks - The number of weeks to plan for (integer, required).
               2. workDays - An array of days of the week that are considered workdays (array of strings, required).
               3. dayStart - The start time of the workday (string in HH:MM format, required).
               4. dayEnd - The end time of the workday (string in HH:MM format, required).
               5. budget - The total budget for staffing (number, required).
            */
            type: "object",
            additionalProperties: true,
            required: ["planningWeeks", "workDays", "dayStart", "dayEnd", "budget"],
            properties: {
                planningWeeks: { type: "integer", minimum: 1 },
                workDays: { type: "array", minItems: 1, items: { type: "string" } },
                dayStart: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
                dayEnd: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
                budget: { type: "number", minimum: 0 },
                maxShiftHours: { type: "number", exclusiveMinimum: 0 },
                assignmentStrategy: { type: "string" },
                weekStartDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                forceGenerate: { type: "boolean" },
                staffingRatios: {
                    type: "object",
                    additionalProperties: false,
                    minProperties: 1,
                    patternProperties: {
                        "^(\\d+-\\d+|\\d+\\+)$": { type: "integer", minimum: 1 }
                    }
                },
                persistResult: { type: "boolean" }
            }
        },
        childrenCount: {
            // Accept any age bucket key (e.g. "0-18", "18-30", "30+") with integer child counts.
            type: "object",
            additionalProperties: false,
            minProperties: 1,
            patternProperties: {
                // Allows keys like "0-18", "18-30", "30+".
                "^(\\d+-\\d+|\\d+\\+)$": { type: "integer", minimum: 0 }
            }
        }
    }
};

// Compile the schema using Ajv for validation
const validateSchedule = ajv.compile(scheduleSchema);

// Function to format Ajv validation errors for better readability
function formatAjvErrors(errors) {
  return (errors || []).map((err) => ({ path: err.instancePath || err.dataPath, message: err.message })).slice(0, 10);
}

// Build a compact summary so API responses remain small when large configs are updated.
function buildConfigSummary(config) {
        return {
                roomCount: Array.isArray(config?.rooms) ? config.rooms.length : 0,
                staffCount: Array.isArray(config?.staff) ? config.staff.length : 0,
                childrenBuckets: Object.keys(config?.childrenCount || {}),
                planningWeeks: config?.settings?.planningWeeks ?? null,
                workDays: config?.settings?.workDays || [],
                dayStart: config?.settings?.dayStart ?? null,
                dayEnd: config?.settings?.dayEnd ?? null
        };
}

function generateSchedule({ rooms, staff, settings, childrenCount }) {
    // This function will generate a schedule based on the provided rooms, staff, and settings.
    buildStaffingRatios(childrenCount, settings?.staffingRatios);

    // So, legally the staffing ratios can only be enherited up.
    /* Practically, this means that lets say theres 2 under 2s, and 2 2-3s, the ratio for the first staff member will be 1:3.
     - Meaning a room with the above will need 2 staff members, with staff member 1 having two unders 2s, and 1 2-3, and staff member 2 having the other 1
     - In practice the burden is shared, however this is just how the ratios work by law.
     - Considering this, we must work out based on inherited ratios and quantities, rather than percents (as you may assuming 1:3 means 25% of allocation per child, it does not.)
    */

    // Given the custom nature of each room (ie Montesory nurseries have rooms of 0-18 months rather than 0-24 months), this needs calculating in a funny way
    /* Each room has an age-range, and a capacity. All children are filtered into each room based on age, with staff then calculated based on the ratios
     - Preferred shifts will take priority
     - Holiday requests will be taken into account
     - High trained staff will be allocated to older rooms
     - Office staff will be allocated to office shifts, and not allocated to rooms
     - Budget will be taken into account, acting as a cap but not a target (plus a buffer)
    */
    const forceGenerate = settings?.forceGenerate === true;
    try {
        return optimisedAssign(staff, settings, childrenCount, rooms);
    } catch {
        const shortage = estimateStaffShortage({ staff, settings, childrenCount, rooms });
        if (!forceGenerate) {
            const err = new Error(
                `Insufficient staff to generate a compliant rota. Additional staff needed at peak segment: ${shortage.totalAdditionalStaffNeeded}.`
            );
            err.shortage = shortage;
            throw err;
        }

        return buildForcedScheduleWithGaps(staff, settings, childrenCount, rooms, shortage);
    }

}

function buildStaffingRatios(childrenCount, providedRatios = {}) {
    // Merge any caller-provided ratios over the legal defaults before validating coverage.
    const ratios = { ...defaultStaffingRatios, ...providedRatios };
    const ageBuckets = Object.keys(childrenCount || {});

    if (ageBuckets.length === 0) {
        throw new Error("childrenCount must include at least one age range.");
    }

    for (const bucket of ageBuckets) {
        const ratio = ratios[bucket];
        if (!Number.isInteger(ratio) || ratio <= 0) {
            throw new Error(`Missing or invalid staffing ratio for age range: ${bucket}`);
        }
    }

    return ratios;
}

// Lambda handler function.
export const handler = async (event) => {
    try {
        // Accept either direct Lambda invocation payloads or API Gateway proxy events.
        const rawPayload = parseEventPayload(event);

        // Extract the config identifier before AJV strips unknown keys via removeAdditional.
        const configID = rawPayload?.configID ?? "default";
        const organisationID = getOrganisationID(rawPayload);

        // If any required fields are absent, attempt to load the nursery's saved config from DynamoDB
        // so the function can operate without a full payload being supplied every time.
        const isMissingRequiredFields = !rawPayload?.staff || !rawPayload?.settings || !rawPayload?.childrenCount;
        const storedConfig = isMissingRequiredFields ? await fetchStoredConfig(configID, organisationID) : null;

        // Merge: stored config provides baseline values; raw request fields take precedence.
        const payload = mergeWithStoredConfig(rawPayload, storedConfig);

        // Fail fast on malformed requests before any scheduling work begins.
        const isValid = validateSchedule(payload);
        if (!isValid) {
            return createJsonResponse(400, {
                message: storedConfig
                    ? "Invalid schedule input. Stored nursery config was merged but the combined data failed validation."
                    : "Invalid schedule input. No stored config found and the request is incomplete.",
                errors: formatAjvErrors(validateSchedule.errors)
            });
        }

        // If the caller sets updateConfig:true, save this payload as the new default config for future calls.
        // Wrapped in its own try/catch so a failed write does not abort the schedule response.
        if (payload?.settings?.updateConfig === true) {
            try {
                await saveNurseryConfig(configID, organisationID, payload);
            } catch (saveErr) {
                console.warn("Could not save nursery config to DynamoDB:", saveErr?.message);
            }
        }

        const result = generateSchedule(payload);

        // Normalise staffHours to a flat { staffID: hours } map so consumers
        // don't need to know which pool each member belongs to.
        if (result.staffHours && typeof result.staffHours === "object") {
            const sh = result.staffHours;
            if (sh.practitioner || sh.office) {
                result.staffHours = { ...(sh.practitioner || {}), ...(sh.office || {}) };
            }
        }

        const persistResult = payload?.settings?.persistResult ?? shouldPersistByDefault;

        let persistence = null;
        if (persistResult) {
            persistence = await persistScheduleResult(payload, result);
        }

        return createJsonResponse(200, {
            message: storedConfig
                ? "Schedule generated successfully using stored nursery config."
                : "Schedule generated successfully.",
            configSource: storedConfig ? "dynamodb" : "request",
            result,
            shortage: result?.shortage || null,
            persistence
        });
    } catch (error) {
        console.error("Error processing schedule:", error);

        const message = String(error?.message || "Unknown error");
        const isClientSideError = error?.name === "SyntaxError"
            || message.includes("Invalid")
            || message.includes("Missing")
            || message.includes("Not enough")
            || message.includes("Unable to assign")
            || message.includes("must include")
            || message.includes("requires")
            || message.includes("Insufficient staff");
        const statusCode = isClientSideError ? 400 : 500;

        return createJsonResponse(statusCode, {
            message: statusCode === 400
                ? (error?.name === "SyntaxError" ? "Invalid JSON payload." : message)
                : "Internal Server Error",
            error: message,
            shortage: error?.shortage || null
        });
    }
};

// Lambda function for Next.js: fetch an existing nursery config by configID.
export const getNurseryConfigHandler = async (event) => {
    try {
        const payload = parseEventPayload(event);
        const configID = getConfigIDFromEvent(event, payload);
        const organisationID = getOrganisationID(payload);

        const storedConfig = await fetchStoredConfig(configID, organisationID);
        if (!storedConfig) {
            return createJsonResponse(404, {
                message: `No nursery config found for configID '${configID}'.`,
                configID
            });
        }

        return createJsonResponse(200, {
            message: "Nursery config retrieved successfully.",
            configID,
            organisationID,
            summary: buildConfigSummary(storedConfig),
            config: storedConfig
        });
    } catch (error) {
        console.error("Error retrieving nursery config:", error);
        return createJsonResponse(500, {
            message: "Internal Server Error",
            error: error?.message || "Unknown error"
        });
    }
};

// Lambda function for Next.js: replace or create a full nursery config.
export const upsertNurseryConfigHandler = async (event) => {
    try {
        const payload = parseEventPayload(event);
        const configID = getConfigIDFromEvent(event, payload);
        const organisationID = getOrganisationID(payload);

        const nextConfig = {
            rooms: payload?.rooms ?? [],
            staff: payload?.staff,
            settings: payload?.settings,
            childrenCount: payload?.childrenCount
        };

        const isValid = validateSchedule(nextConfig);
        if (!isValid) {
            return createJsonResponse(400, {
                message: "Invalid nursery config payload.",
                errors: formatAjvErrors(validateSchedule.errors)
            });
        }

        await saveNurseryConfig(configID, organisationID, nextConfig);
        const savedConfig = await fetchStoredConfig(configID, organisationID);

        return createJsonResponse(200, {
            message: "Nursery config saved successfully.",
            configID,
            organisationID,
            summary: buildConfigSummary(savedConfig),
            config: savedConfig
        });
    } catch (error) {
        console.error("Error upserting nursery config:", error);
        const statusCode = error?.name === "SyntaxError" ? 400 : 500;
        return createJsonResponse(statusCode, {
            message: statusCode === 400 ? "Invalid JSON payload." : "Internal Server Error",
            error: error?.message || "Unknown error"
        });
    }
};

// Lambda function for Next.js: patch room/staff/settings/children data without replacing the whole config.
export const patchNurseryConfigHandler = async (event) => {
    try {
        const payload = parseEventPayload(event);
        const configID = getConfigIDFromEvent(event, payload);
        const organisationID = getOrganisationID(payload);

        const current = await fetchStoredConfig(configID, organisationID);
        if (!current) {
            return createJsonResponse(404, {
                message: `No nursery config found for configID '${configID}'.`,
                configID
            });
        }

        const patched = applyConfigPatch(current, payload);
        const isValid = validateSchedule(patched);
        if (!isValid) {
            return createJsonResponse(400, {
                message: "Patch would produce an invalid nursery config.",
                errors: formatAjvErrors(validateSchedule.errors)
            });
        }

        await saveNurseryConfig(configID, organisationID, patched);

        return createJsonResponse(200, {
            message: "Nursery config patched successfully.",
            configID,
            organisationID,
            summary: buildConfigSummary(patched),
            config: patched
        });
    } catch (error) {
        console.error("Error patching nursery config:", error);
        const statusCode = error?.name === "SyntaxError" ? 400 : 500;
        return createJsonResponse(statusCode, {
            message: statusCode === 400 ? "Invalid JSON payload." : "Internal Server Error",
            error: error?.message || "Unknown error"
        });
    }
};

function getConfigIDFromEvent(event, payload) {
    return payload?.configID
        || event?.pathParameters?.configID
        || event?.queryStringParameters?.configID
        || "default";
}

function parseEventPayload(event) {
    // Return an empty object for null/undefined events so the handler can fall back to stored config.
    if (!event) return {};

    if (typeof event.body === "string") {
        // Empty or whitespace-only body is treated as no input rather than a parse error.
        const trimmed = event.body.trim();
        return trimmed ? JSON.parse(trimmed) : {};
    }

    if (event.body && typeof event.body === "object") {
        return event.body;
    }

    // API Gateway events with a null body (no Content-Type / empty POST) are treated as no input.
    if ("httpMethod" in event || "requestContext" in event || "version" in event) return {};

    return event;
}

function createJsonResponse(statusCode, body) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    };
}

function applyConfigPatch(currentConfig, patchPayload) {
    const next = {
        rooms: Array.isArray(currentConfig?.rooms) ? [...currentConfig.rooms] : [],
        staff: Array.isArray(currentConfig?.staff) ? [...currentConfig.staff] : [],
        settings: { ...(currentConfig?.settings || {}) },
        childrenCount: { ...(currentConfig?.childrenCount || {}) }
    };

    // Full-field replacements.
    if (Array.isArray(patchPayload?.rooms)) next.rooms = patchPayload.rooms;
    if (Array.isArray(patchPayload?.staff)) next.staff = patchPayload.staff;
    if (patchPayload?.settings && typeof patchPayload.settings === "object") {
        next.settings = { ...next.settings, ...patchPayload.settings };
    }
    if (patchPayload?.childrenCount && typeof patchPayload.childrenCount === "object") {
        next.childrenCount = { ...next.childrenCount, ...patchPayload.childrenCount };
    }

    // Targeted room operations.
    if (patchPayload?.addRoom && typeof patchPayload.addRoom === "object") {
        next.rooms.push(patchPayload.addRoom);
    }

    if (patchPayload?.updateRoom && typeof patchPayload.updateRoom === "object") {
        const roomID = patchPayload.updateRoom.roomID;
        if (!roomID) throw new Error("updateRoom requires roomID.");
        next.rooms = next.rooms.map((room) => room.roomID === roomID ? { ...room, ...patchPayload.updateRoom } : room);
    }

    if (patchPayload?.removeRoomID) {
        next.rooms = next.rooms.filter((room) => room.roomID !== patchPayload.removeRoomID);
    }

    // Targeted staff operations.
    if (patchPayload?.addStaff && typeof patchPayload.addStaff === "object") {
        next.staff.push(patchPayload.addStaff);
    }

    if (patchPayload?.updateStaff && typeof patchPayload.updateStaff === "object") {
        const staffID = patchPayload.updateStaff.staffID;
        if (!staffID) throw new Error("updateStaff requires staffID.");
        next.staff = next.staff.map((member) => member.staffID === staffID ? { ...member, ...patchPayload.updateStaff } : member);
    }

    if (patchPayload?.removeStaffID) {
        next.staff = next.staff.filter((member) => member.staffID !== patchPayload.removeStaffID);
    }

    // Optional explicit staff quantity trim so Next.js can cap workforce size quickly.
    if (Number.isInteger(patchPayload?.trimStaffTo) && patchPayload.trimStaffTo >= 0) {
        next.staff = next.staff.slice(0, patchPayload.trimStaffTo);
    }

    // Targeted settings and childrenCount changes.
    if (patchPayload?.setSetting && typeof patchPayload.setSetting === "object") {
        for (const [key, value] of Object.entries(patchPayload.setSetting)) {
            next.settings[key] = value;
        }
    }

    if (patchPayload?.setChildrenCount && typeof patchPayload.setChildrenCount === "object") {
        for (const [bucket, value] of Object.entries(patchPayload.setChildrenCount)) {
            next.childrenCount[bucket] = value;
        }
    }

    return next;
}

async function persistScheduleResult(input, result) {
    const scheduleID = uuidv4();
    const historyID = uuidv4();
    const createdAt = new Date().toISOString();
    const organisationID = getOrganisationID(input);
    const weekStartDate = String(input?.settings?.weekStartDate || "").trim();

    const inputSummary = buildPersistedInputSummary(input);
    const resultSummary = buildPersistedResultSummary(result);

    const scheduleItem = {
        scheduleID,
        organisationID,
        createdAt,
        assignmentStrategy: "optimised",
        planningWeeks: input?.settings?.planningWeeks || 1,
        weekStartDate: weekStartDate || null,
        workDays: input?.settings?.workDays || [],
        budget: input?.settings?.budget ?? null,
        inputSummary,
        resultSummary,
        assignments: result?.assignments || []
    };

    const historyItem = {
        historyID,
        scheduleID,
        organisationID,
        createdAt,
        eventType: "SCHEDULE_GENERATED",
        assignmentStrategy: "optimised",
        assignmentCount: result?.assignments?.length || 0,
        resultSummary
    };

    await dynamoClient.send(new PutItemCommand({
        TableName: dynamoTable,
        Item: marshallSimpleRecord(scheduleItem)
    }));

    await dynamoClient.send(new PutItemCommand({
        TableName: historyTable,
        Item: marshallSimpleRecord(historyItem)
    }));

    return {
        saved: true,
        scheduleID,
        historyID,
        createdAt,
        tables: {
            schedule: dynamoTable,
            history: historyTable
        }
    };
}

function buildPersistedInputSummary(input) {
    return {
        roomCount: Array.isArray(input?.rooms) ? input.rooms.length : 0,
        staffCount: Array.isArray(input?.staff) ? input.staff.length : 0,
        childrenCount: input?.childrenCount || {},
        dayStart: input?.settings?.dayStart || null,
        dayEnd: input?.settings?.dayEnd || null,
        maxShiftHours: input?.settings?.maxShiftHours ?? null
    };
}

function buildPersistedResultSummary(result) {
    return {
        practitionerRoomCount: result?.roomPlan?.practitionerRooms?.length || 0,
        officeRoomCount: result?.roomPlan?.officeRooms?.length || 0,
        assignmentCount: result?.assignments?.length || 0,
        staffHours: result?.staffHours || {},
        optimisation: result?.optimisation || null,
        shortage: result?.shortage || null,
        forcedGeneration: result?.forcedGeneration === true
    };
}

function marshallSimpleRecord(record) {
    const marshalled = {};
    for (const [key, value] of Object.entries(record)) {
        marshalled[key] = marshallValue(value);
    }
    return marshalled;
}

function marshallValue(value) {
    if (value === null || value === undefined) {
        return { NULL: true };
    }

    if (typeof value === "string") {
        return { S: value };
    }

    if (typeof value === "number") {
        return { N: String(value) };
    }

    if (typeof value === "boolean") {
        return { BOOL: value };
    }

    if (Array.isArray(value) || typeof value === "object") {
        return { S: JSON.stringify(value) };
    }

    return { S: String(value) };
}

// ─── Nursery Config persistence (DynamoDB read/write) ────────────────────────

async function fetchStoredConfig(configID, organisationID) {
    // Retrieve the nursery's saved configuration from DynamoDB so the scheduler can
    // run without requiring a full payload on every request.
    try {
        const result = await dynamoClient.send(new GetItemCommand({
            TableName: configTable,
            Key: { configID: { S: getScopedConfigID(configID, organisationID) } }
        }));
        if (!result.Item) return null;
        return unmarshallConfig(result.Item);
    } catch (err) {
        // A failed read should not crash the function – fall through to validation,
        // which will return a 400 if the request is also incomplete.
        console.warn("Could not fetch stored nursery config from DynamoDB:", err?.message);
        return null;
    }
}

async function saveNurseryConfig(configID, organisationID, config) {
    // Persist the nursery configuration so future calls without a full payload can
    // use it as the baseline.  Only the four scheduling-relevant fields are stored.
    const record = {
        configID,
        organisationID,
        updatedAt: new Date().toISOString(),
        rooms: config.rooms ?? [],
        staff: config.staff,
        settings: config.settings,
        childrenCount: config.childrenCount
    };
    await dynamoClient.send(new PutItemCommand({
        TableName: configTable,
        Item: marshallSimpleRecord({ ...record, configID: getScopedConfigID(configID, organisationID) })
    }));
}

function getScopedConfigID(configID, organisationID) {
    const org = String(organisationID || "public").trim();
    return `${org}#${configID}`;
}

function getOrganisationID(payload) {
    const org = String(payload?.organisationID || "").trim();
    return org || "public";
}

function estimateStaffShortage({ staff, settings, childrenCount, rooms }) {
    const planningWeeks = settings?.planningWeeks || 1;
    const workDays = settings?.workDays || ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const dayStart = settings?.dayStart || "08:00";
    const dayEnd = settings?.dayEnd || "18:00";
    const maxShiftHours = Number.isFinite(settings?.maxShiftHours) ? settings.maxShiftHours : null;
    const daySegments = buildDaySegments(dayStart, dayEnd, maxShiftHours);

    const roomPlan = buildRoomPlan(childrenCount, rooms);
    const practitionerRequired = roomPlan.practitionerRooms.reduce((sum, room) => {
        const ratio = resolveLegalRatioForBucket(room.ageGroup);
        return sum + (room.children > 0 ? Math.ceil(room.children / ratio) : 0);
    }, 0);
    const officeRequired = roomPlan.officeRooms.length;

    const practitionerStaff = (staff || []).filter((member) => !member.isOffice);
    const officeStaff = (staff || []).filter((member) => member.isOffice);

    let peakMissing = 0;
    for (let week = 1; week <= planningWeeks; week += 1) {
        for (const day of workDays) {
            const availablePractitioners = practitionerStaff.filter((member) => !isStaffOnHoliday(member, day, week)).length;
            const availableOffice = officeStaff.filter((member) => !isStaffOnHoliday(member, day, week)).length;
            const missingThisSegment = Math.max(0, practitionerRequired - availablePractitioners) + Math.max(0, officeRequired - availableOffice);
            if (missingThisSegment > peakMissing) {
                peakMissing = missingThisSegment;
            }
        }
    }

    return {
        daySegments: daySegments.length,
        practitionerRequiredPerSegment: practitionerRequired,
        officeRequiredPerSegment: officeRequired,
        totalAdditionalStaffNeeded: peakMissing,
    };
}

function buildForcedScheduleWithGaps(staff, settings, childrenCount, rooms, shortage) {
    const result = greedyAssign(staff, { ...settings, assignmentStrategy: "optimised" }, childrenCount, rooms);
    return {
        ...result,
        shortage,
        forcedGeneration: true,
    };
}

function mergeWithStoredConfig(rawPayload, stored) {
    // If no stored config exists, the raw payload is used as-is and will be validated below.
    if (!stored) return rawPayload ?? {};
    return {
        organisationID: rawPayload?.organisationID,
        requestedBy: rawPayload?.requestedBy,
        // Stored config provides the baseline; any keys supplied in the request override it.
        rooms: rawPayload?.rooms ?? stored?.rooms ?? [],
        staff: rawPayload?.staff ?? stored?.staff,
        settings: {
            ...(stored?.settings ?? {}),
            ...(rawPayload?.settings ?? {})
        },
        childrenCount: rawPayload?.childrenCount ?? stored?.childrenCount
    };
}

function unmarshallConfig(dynamoItem) {
    // Convert a raw DynamoDB attribute map back into a plain JavaScript object.
    const result = {};
    for (const [key, typedValue] of Object.entries(dynamoItem)) {
        result[key] = unmarshallValue(typedValue);
    }
    return result;
}

function unmarshallValue(typedValue) {
    // Convert a single DynamoDB typed attribute value to a plain JavaScript value.
    // Arrays and objects were stored as JSON strings by marshallValue, so attempt a parse.
    if (typedValue.NULL) return null;
    if (typedValue.BOOL !== undefined) return typedValue.BOOL;
    if (typedValue.N !== undefined) return Number(typedValue.N);
    if (typedValue.S !== undefined) {
        try { return JSON.parse(typedValue.S); } catch { return typedValue.S; }
    }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────

function greedyAssign(staff, settings, childrenCount, rooms) {
    // Build the greedy scheduler inputs using sensible defaults where the request omits them.
    const planningWeeks = settings?.planningWeeks || 1;
    const workDays = settings?.workDays || ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const dayStart = settings?.dayStart || "08:00";
    const dayEnd = settings?.dayEnd || "18:00";
    const maxShiftHours = Number.isFinite(settings?.maxShiftHours) ? settings.maxShiftHours : null;
    const allowUnderstaffed = settings?.forceGenerate === true;
    // Split the day into legal assignable chunks if the daily opening hours exceed the maximum shift length.
    const daySegments = buildDaySegments(dayStart, dayEnd, maxShiftHours);
    const totalDayHours = daySegments.reduce((sum, segment) => sum + segment.hours, 0);

    if (totalDayHours <= 0) {
        throw new Error("Invalid workday start/end time; shift length must be positive.");
    }

    // Resolve rooms first so the same assignment logic works for both generated and user-supplied rooms.
    const roomPlan = buildRoomPlan(childrenCount, rooms);
    // Translate child counts into the number of practitioners required in each room.
    const roomStaffRequirements = roomPlan.practitionerRooms.map((room) => {
        const ratio = resolveLegalRatioForBucket(room.ageGroup);
        const requiredStaff = room.children > 0 ? Math.ceil(room.children / ratio) : 0;
        return {
            roomID: room.roomID,
            roomName: room.roomName,
            ageGroup: room.ageGroup,
            ratio,
            children: room.children,
            requiredStaff
        };
    });

    // Separate office staff from practitioners because they are balanced independently.
    const practitionerStaff = (staff || []).filter((member) => !member.isOffice);
    const officeStaff = (staff || []).filter((member) => member.isOffice);

    // Track cumulative hours so the greedy picker can favour the least-loaded colleague.
    const practitionerLoad = new Map(practitionerStaff.map((member) => [member.staffID, 0]));
    const officeLoad = new Map(officeStaff.map((member) => [member.staffID, 0]));

    const dailyPractitionerSlots = roomStaffRequirements.reduce((sum, room) => sum + room.requiredStaff, 0);
    const officeRoomCount = roomPlan.officeRooms.length;

    const assignments = [];
    for (let week = 1; week <= planningWeeks; week += 1) {
        for (const day of workDays) {
            // Filter out anybody who is unavailable on this day before attempting to cover required slots.
            const availableOfficeStaff = officeStaff.filter((member) => !isStaffOnHoliday(member, day, week));
            const availablePractitionerStaff = practitionerStaff.filter((member) => !isStaffOnHoliday(member, day, week));
            // Track daily hours separately so the same person is not given more than the configured daily cap.
            const practitionerDayHours = new Map(availablePractitionerStaff.map((member) => [member.staffID, 0]));
            const officeDayHours = new Map(availableOfficeStaff.map((member) => [member.staffID, 0]));

            if (!allowUnderstaffed && dailyPractitionerSlots > availablePractitionerStaff.length) {
                throw new Error(
                    `Not enough practitioner staff for ${day} (week ${week}). Required: ${dailyPractitionerSlots}, available: ${availablePractitionerStaff.length}.`
                );
            }

            if (!allowUnderstaffed && officeRoomCount > availableOfficeStaff.length) {
                throw new Error(
                    `Not enough office staff for ${day} (week ${week}). Required: ${officeRoomCount}, available: ${availableOfficeStaff.length}.`
                );
            }

            // Cover each segment in turn so long opening days remain staffed throughout the day.
            for (const segment of daySegments) {
                for (const officeRoom of roomPlan.officeRooms) {
                    const member = pickLeastLoadedStaff(
                        availableOfficeStaff,
                        officeLoad,
                        new Set(),
                        officeDayHours,
                        maxShiftHours,
                        segment.hours
                    );
                    if (!member) {
                        if (allowUnderstaffed) {
                            assignments.push({
                                week,
                                day,
                                staffID: "UNFILLED",
                                staffName: "Unfilled",
                                isOffice: true,
                                roomID: officeRoom.roomID,
                                roomName: officeRoom.roomName,
                                ageGroup: officeRoom.ageGroup,
                                start: segment.start,
                                end: segment.end,
                                hours: segment.hours,
                                unfilled: true
                            });
                            continue;
                        }

                        throw new Error(
                            `Unable to assign office cover for ${day} (week ${week}) in segment ${segment.start}-${segment.end}.`
                        );
                    }

                    assignments.push({
                        week,
                        day,
                        staffID: member.staffID,
                        staffName: member.staffName,
                        isOffice: true,
                        roomID: officeRoom.roomID,
                        roomName: officeRoom.roomName,
                        ageGroup: officeRoom.ageGroup,
                        start: segment.start,
                        end: segment.end,
                        hours: segment.hours
                    });
                    officeLoad.set(member.staffID, officeLoad.get(member.staffID) + segment.hours);
                    officeDayHours.set(member.staffID, (officeDayHours.get(member.staffID) || 0) + segment.hours);
                }

                // Prevent a practitioner from being assigned to two rooms in the same time segment.
                const usedPractitioners = new Set();
                for (const room of roomStaffRequirements) {
                    for (let slot = 0; slot < room.requiredStaff; slot += 1) {
                        const member = pickLeastLoadedStaff(
                            availablePractitionerStaff,
                            practitionerLoad,
                            usedPractitioners,
                            practitionerDayHours,
                            maxShiftHours,
                            segment.hours
                        );
                        if (!member) {
                            if (allowUnderstaffed) {
                                assignments.push({
                                    week,
                                    day,
                                    staffID: "UNFILLED",
                                    staffName: "Unfilled",
                                    isOffice: false,
                                    roomID: room.roomID,
                                    roomName: room.roomName,
                                    ageGroup: room.ageGroup,
                                    legalRatio: `1:${room.ratio}`,
                                    start: segment.start,
                                    end: segment.end,
                                    hours: segment.hours,
                                    unfilled: true
                                });
                                continue;
                            }

                            throw new Error(
                                `Unable to satisfy legal staffing for room ${room.roomName} (${room.ageGroup}) on ${day} (week ${week}) in segment ${segment.start}-${segment.end}.`
                            );
                        }

                        assignments.push({
                            week,
                            day,
                            staffID: member.staffID,
                            staffName: member.staffName,
                            isOffice: false,
                            roomID: room.roomID,
                            roomName: room.roomName,
                            ageGroup: room.ageGroup,
                            legalRatio: `1:${room.ratio}`,
                            start: segment.start,
                            end: segment.end,
                            hours: segment.hours
                        });

                        usedPractitioners.add(member.staffID);
                        practitionerLoad.set(member.staffID, practitionerLoad.get(member.staffID) + segment.hours);
                        practitionerDayHours.set(member.staffID, (practitionerDayHours.get(member.staffID) || 0) + segment.hours);
                    }
                }
            }
        }
    }

    return {
        roomPlan,
        roomStaffRequirements,
        assignments,
        staffHours: {
            practitioner: Object.fromEntries(practitionerLoad.entries()),
            office: Object.fromEntries(officeLoad.entries())
        }
    };
}

function buildDaySegments(dayStart, dayEnd, maxShiftHours) {
    // Convert human-readable times into minutes so the day can be split cleanly.
    const [startHourText, startMinuteText] = String(dayStart || "").split(":");
    const [endHourText, endMinuteText] = String(dayEnd || "").split(":");
    const startMinutes = (parseInt(startHourText, 10) * 60) + parseInt(startMinuteText || "0", 10);
    const endMinutes = (parseInt(endHourText, 10) * 60) + parseInt(endMinuteText || "0", 10);

    if (!Number.isInteger(startMinutes) || !Number.isInteger(endMinutes) || endMinutes <= startMinutes) {
        throw new Error("Invalid dayStart/dayEnd values.");
    }

    const durationHours = (endMinutes - startMinutes) / 60;
    if (!Number.isFinite(durationHours) || durationHours <= 0) {
        throw new Error("Invalid daily duration.");
    }

    // If there is no effective cap, treat the whole day as one assignable segment.
    if (!Number.isFinite(maxShiftHours) || maxShiftHours <= 0 || maxShiftHours >= durationHours) {
        return [{ start: dayStart, end: dayEnd, hours: durationHours }];
    }

    // Otherwise, chop the day into back-to-back segments no longer than the configured maximum.
    const segments = [];
    let cursor = startMinutes;
    const maxShiftMinutes = Math.floor(maxShiftHours * 60);
    while (cursor < endMinutes) {
        const next = Math.min(cursor + maxShiftMinutes, endMinutes);
        segments.push({
            start: formatClock(cursor),
            end: formatClock(next),
            hours: (next - cursor) / 60
        });
        cursor = next;
    }

    return segments;
}

function formatClock(totalMinutes) {
    // Rebuild a HH:MM clock string from a minute offset.
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const hh = String(hours).padStart(2, "0");
    const mm = String(minutes).padStart(2, "0");
    return `${hh}:${mm}`;
}

function isStaffOnHoliday(member, day, week) {
    // Treat holidays as either recurring weekday absences or explicit week/day tokens.
    const holidayEntries = Array.isArray(member?.holiday) ? member.holiday : [];
    if (holidayEntries.length === 0) {
        return false;
    }

    const normalizedDay = String(day || "").trim().toLowerCase();
    const weekDayToken = `w${week}-${normalizedDay}`;

    for (const rawEntry of holidayEntries) {
        const entry = String(rawEntry || "").trim().toLowerCase();
        if (!entry) {
            continue;
        }

        // Supports either weekday entries (e.g. "monday") or specific week/day tokens (e.g. "W1-Monday").
        if (entry === normalizedDay || entry === weekDayToken) {
            return true;
        }
    }

    return false;
}

function buildRoomPlan(childrenCount, inputRooms) {
    // Work out whether rooms should be generated from age buckets or taken from caller input.
    const ageBuckets = Object.keys(childrenCount || {});
    const hasInputRooms = Array.isArray(inputRooms) && inputRooms.length > 0;

    if (!hasInputRooms) {
        // In auto mode, produce one practitioner room per age bucket.
        const practitionerRooms = ageBuckets.map((bucket) => ({
            roomID: `auto-${bucket}`,
            roomName: `Age ${bucket}`,
            ageGroup: bucket,
            isOffice: false,
            capacity: childrenCount[bucket],
            children: childrenCount[bucket]
        }));

        return {
            practitionerRooms,
            officeRooms: []
        };
    }

    // In manual mode, keep office rooms separate and populate only practitioner rooms with children.
    const officeRooms = inputRooms.filter((room) => room.isOffice);
    const practitionerSourceRooms = inputRooms.filter((room) => !room.isOffice);
    const practitionerRooms = practitionerSourceRooms.map((room) => ({
        roomID: room.roomID,
        roomName: room.roomName,
        ageGroup: room.ageGroup,
        isOffice: false,
        capacity: Number.isInteger(room.capacity) && room.capacity > 0 ? room.capacity : Number.MAX_SAFE_INTEGER,
        children: 0
    }));

    for (const [bucket, totalChildren] of Object.entries(childrenCount || {})) {
        // Only rooms with the matching age group can receive children from that bucket.
        const bucketRooms = practitionerRooms.filter((room) => room.ageGroup === bucket);
        if (bucketRooms.length === 0) {
            throw new Error(
                `No room found for age range ${bucket}. Provide a room for this range or omit rooms to auto-generate.`
            );
        }
        distributeChildrenToRooms(bucketRooms, totalChildren);
    }

    return {
        practitionerRooms,
        officeRooms
    };
}

function distributeChildrenToRooms(rooms, totalChildren) {
    // Fill smaller-capacity rooms first so distribution is deterministic and easy to reason about.
    let remaining = totalChildren;
    const byCapacity = [...rooms].sort((a, b) => a.capacity - b.capacity);

    for (const room of byCapacity) {
        if (remaining <= 0) {
            break;
        }

        const space = Number.isFinite(room.capacity) ? room.capacity - room.children : remaining;
        const assign = Math.max(0, Math.min(space, remaining));
        room.children += assign;
        remaining -= assign;
    }

    if (remaining > 0 && byCapacity.length > 0) {
        // If the provided capacities are too small, keep overflow in the last room so legal ratios are still enforced.
        byCapacity[byCapacity.length - 1].children += remaining;
    }
}

function parseAgeBucket(bucket) {
    // Parse open-ended ranges such as 36+ into a numeric lower bound and infinite upper bound.
    if (/^\d+\+$/.test(bucket)) {
        const start = parseInt(bucket.slice(0, -1), 10);
        return { start, end: Number.POSITIVE_INFINITY };
    }

    // Parse bounded ranges such as 24-36 into numeric start and end values.
    if (/^\d+-\d+$/.test(bucket)) {
        const [startText, endText] = bucket.split("-");
        const start = parseInt(startText, 10);
        const end = parseInt(endText, 10);
        if (end <= start) {
            throw new Error(`Invalid age range ${bucket}: end must be greater than start.`);
        }
        return { start, end };
    }

    throw new Error(`Invalid age range format: ${bucket}. Use forms like 0-24 or 36+.`);
}

function resolveLegalRatioForBucket(bucket) {
    // Compare the requested bucket against the legal nursery bands and accept only unambiguous matches.
    const legalRanges = Object.entries(defaultStaffingRatios).map(([range, ratio]) => ({
        key: range,
        ratio,
        ...parseAgeBucket(range)
    }));

    const target = parseAgeBucket(bucket);
    const containingRanges = legalRanges.filter((legal) => target.start >= legal.start && target.end <= legal.end);

    if (containingRanges.length === 1) {
        return containingRanges[0].ratio;
    }

    throw new Error(
        `Cannot safely derive legal ratio for age range ${bucket}. Range spans or mismatches legal bands without per-child age detail.`
    );
}

function pickLeastLoadedStaff(
    staffPool,
    hoursMap,
    excludeIds = new Set(),
    dayHoursMap = null,
    maxShiftHours = null,
    requestedHours = 0
) {
    // Pick the least-loaded eligible person, optionally respecting a daily hours ceiling.
    let selected = null;
    let lowestHours = Number.POSITIVE_INFINITY;

    for (const member of staffPool) {
        if (excludeIds.has(member.staffID)) {
            continue;
        }

        if (dayHoursMap && Number.isFinite(maxShiftHours) && maxShiftHours > 0) {
            const dayHours = dayHoursMap.get(member.staffID) || 0;
            if ((dayHours + requestedHours) > maxShiftHours) {
                continue;
            }
        }

        const currentHours = hoursMap.get(member.staffID) || 0;
        if (currentHours < lowestHours) {
            lowestHours = currentHours;
            selected = member;
        }
    }

    return selected;
}

function optimisedAssign(staff, settings, childrenCount, rooms) {
    // Build the optimisation problem using the same core room and ratio logic as the greedy scheduler.
    const planningWeeks = settings?.planningWeeks || 1;
    const workDays = settings?.workDays || ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const dayStart = settings?.dayStart || "08:00";
    const dayEnd = settings?.dayEnd || "18:00";
    const maxShiftHours = Number.isFinite(settings?.maxShiftHours) ? settings.maxShiftHours : null;
    const daySegments = buildDaySegments(dayStart, dayEnd, maxShiftHours);

    const roomPlan = buildRoomPlan(childrenCount, rooms);
    const roomStaffRequirements = roomPlan.practitionerRooms.map((room) => {
        const ratio = resolveLegalRatioForBucket(room.ageGroup);
        const requiredStaff = room.children > 0 ? Math.ceil(room.children / ratio) : 0;
        return {
            roomID: room.roomID,
            roomName: room.roomName,
            ageGroup: room.ageGroup,
            ratio,
            children: room.children,
            requiredStaff
        };
    });

    const practitionerStaff = (staff || []).filter((member) => !member.isOffice);
    const officeStaff = (staff || []).filter((member) => member.isOffice);

    // Convert room requirements into explicit assignment slots so the optimiser can reason about each piece of cover.
    const practitionerSlots = [];
    const officeSlots = [];

    for (let week = 1; week <= planningWeeks; week += 1) {
        for (const day of workDays) {
            for (let segmentIndex = 0; segmentIndex < daySegments.length; segmentIndex += 1) {
                const segment = daySegments[segmentIndex];
                // Label each segment so preference strings such as "Monday early" can be matched directly.
                const label = getSegmentLabel(segmentIndex, daySegments.length);

                for (const officeRoom of roomPlan.officeRooms) {
                    officeSlots.push({
                        week,
                        day,
                        segmentIndex,
                        segmentLabel: label,
                        start: segment.start,
                        end: segment.end,
                        hours: segment.hours,
                        isOffice: true,
                        roomID: officeRoom.roomID,
                        roomName: officeRoom.roomName,
                        ageGroup: officeRoom.ageGroup,
                        legalRatio: null
                    });
                }

                for (const room of roomStaffRequirements) {
                    for (let slot = 0; slot < room.requiredStaff; slot += 1) {
                        practitionerSlots.push({
                            week,
                            day,
                            segmentIndex,
                            segmentLabel: label,
                            start: segment.start,
                            end: segment.end,
                            hours: segment.hours,
                            isOffice: false,
                            roomID: room.roomID,
                            roomName: room.roomName,
                            ageGroup: room.ageGroup,
                            legalRatio: `1:${room.ratio}`
                        });
                    }
                }
            }
        }
    }

    const practitionerPlan = optimizePoolAssignments(practitionerStaff, practitionerSlots, settings, "practitioner");
    const officePlan = optimizePoolAssignments(officeStaff, officeSlots, settings, "office");

    // Recombine both pools into one rota, sorted into a stable output order.
    const assignments = [...practitionerPlan.assignments, ...officePlan.assignments].sort((a, b) => {
        const keyA = `${a.week}|${a.day}|${a.start}|${a.roomID}|${a.staffID}`;
        const keyB = `${b.week}|${b.day}|${b.start}|${b.roomID}|${b.staffID}`;
        return keyA.localeCompare(keyB);
    });

    return {
        roomPlan,
        roomStaffRequirements,
        assignments,
        staffHours: {
            practitioner: practitionerPlan.hoursByStaff,
            office: officePlan.hoursByStaff
        },
        optimisation: {
            objective: practitionerPlan.objective + officePlan.objective,
            cost: practitionerPlan.cost + officePlan.cost,
            fairnessPenalty: practitionerPlan.fairnessPenalty + officePlan.fairnessPenalty
        }
    };
}

function optimizePoolAssignments(staffPool, slots, settings, poolName) {
    // Short-circuit empty pools so the optimiser only runs when there is real work to do.
    if (slots.length === 0) {
        return { assignments: [], hoursByStaff: {}, objective: 0, cost: 0, fairnessPenalty: 0 };
    }

    if (!Array.isArray(staffPool) || staffPool.length === 0) {
        throw new Error(describeMissingPoolStaff(poolName, slots));
    }

    // Aim for an even spread of hours across the available pool.
    const maxShiftHours = Number.isFinite(settings?.maxShiftHours) ? settings.maxShiftHours : null;
    const totalRequiredHours = slots.reduce((sum, slot) => sum + slot.hours, 0);
    const targetHours = totalRequiredHours / staffPool.length;

    // State stores both the assignment decisions and the bookkeeping needed to test future moves.
    const state = {
        assignments: new Array(slots.length).fill(null),
        locked: new Array(slots.length).fill(false),
        hoursByStaff: Object.fromEntries(staffPool.map((member) => [member.staffID, 0])),
        dayHoursByStaff: {},
        occupancy: {}
    };

    // Honour hard preferences before any optimisation takes place.
    preassignPreferredShifts(staffPool, slots, state, maxShiftHours);

    // Seed the optimiser with a valid low-cost, roughly fair baseline assignment.
    for (let i = 0; i < slots.length; i += 1) {
        if (state.assignments[i]) {
            continue;
        }

        const slot = slots[i];
        const candidates = staffPool.filter((member) => canAssignToSlot(member, slot, state, maxShiftHours));
        if (candidates.length === 0) {
            throw new Error(describeInitialAssignmentFailure(poolName, slot, slots, staffPool, state, maxShiftHours));
        }

        let best = null;
        let bestScore = Number.POSITIVE_INFINITY;
        for (const member of candidates) {
            const currentHours = state.hoursByStaff[member.staffID] || 0;
            const projectedHours = currentHours + slot.hours;
            const rate = Number(member.hourlyRate || 0);
            const fairnessDelta = Math.abs(projectedHours - targetHours);
            const score = (rate * slot.hours) + (fairnessDelta * 2);
            if (score < bestScore) {
                bestScore = score;
                best = member;
            }
        }

        applyAssignment(state, best, slot, i);
    }

    // Use simulated annealing to explore cheaper or fairer neighbour solutions without getting stuck too early.
    let currentState = cloneState(state);
    let currentScore = scoreState(currentState, slots, staffPool, targetHours);
    let bestState = cloneState(currentState);
    let bestScore = currentScore;

    let temperature = 50;
    const cooling = 0.995;
    const iterations = 4000;

    for (let iter = 0; iter < iterations; iter += 1) {
        const candidate = neighborState(currentState, staffPool, slots, maxShiftHours);
        if (!candidate) {
            temperature *= cooling;
            continue;
        }

        const candidateScore = scoreState(candidate, slots, staffPool, targetHours);
        const delta = candidateScore.objective - currentScore.objective;
        if (delta < 0 || Math.exp(-delta / Math.max(temperature, 0.001)) > Math.random()) {
            currentState = candidate;
            currentScore = candidateScore;
            if (candidateScore.objective < bestScore.objective) {
                bestState = cloneState(candidate);
                bestScore = candidateScore;
            }
        }

        temperature *= cooling;
    }

    const assignments = bestState.assignments.map((staffID, index) => {
        // Convert the internal slot-to-staff mapping back into the external rota shape.
        const slot = slots[index];
        const member = staffPool.find((item) => item.staffID === staffID);
        return {
            week: slot.week,
            day: slot.day,
            staffID,
            staffName: member?.staffName || staffID,
            isOffice: slot.isOffice,
            roomID: slot.roomID,
            roomName: slot.roomName,
            ageGroup: slot.ageGroup,
            legalRatio: slot.legalRatio,
            start: slot.start,
            end: slot.end,
            hours: slot.hours
        };
    });

    return {
        assignments,
        hoursByStaff: bestState.hoursByStaff,
        objective: bestScore.objective,
        cost: bestScore.cost,
        fairnessPenalty: bestScore.fairnessPenalty
    };
}

function describeInitialAssignmentFailure(poolName, slot, slots, staffPool, state, maxShiftHours) {
    // Build a clear diagnostic so users can see whether they need more staff or different constraints.
    const segmentIndices = [];
    for (let i = 0; i < slots.length; i += 1) {
        const s = slots[i];
        if (s.week === slot.week && s.day === slot.day && s.segmentIndex === slot.segmentIndex && s.isOffice === slot.isOffice) {
            segmentIndices.push(i);
        }
    }

    const roomIndices = segmentIndices.filter((index) => slots[index].roomID === slot.roomID);

    const segmentRequired = segmentIndices.length;
    const segmentAssigned = segmentIndices.filter((index) => !!state.assignments[index]).length;
    const segmentMissing = Math.max(0, segmentRequired - segmentAssigned);

    const roomRequired = roomIndices.length;
    const roomAssigned = roomIndices.filter((index) => !!state.assignments[index]).length;
    const roomMissing = Math.max(0, roomRequired - roomAssigned);

    const occKey = `${slot.week}|${slot.day}|${slot.segmentIndex}`;
    const occupied = state.occupancy[occKey] || new Set();

    let holidayBlocked = 0;
    let occupiedBlocked = 0;
    let shiftLimitBlocked = 0;
    let eligible = 0;

    for (const member of staffPool) {
        if (isStaffOnHoliday(member, slot.day, slot.week)) {
            holidayBlocked += 1;
            continue;
        }

        if (occupied.has(member.staffID)) {
            occupiedBlocked += 1;
            continue;
        }

        if (Number.isFinite(maxShiftHours) && maxShiftHours > 0) {
            const dayKey = `${slot.week}|${slot.day}|${member.staffID}`;
            const dayHours = state.dayHoursByStaff[dayKey] || 0;
            if ((dayHours + slot.hours) > maxShiftHours) {
                shiftLimitBlocked += 1;
                continue;
            }
        }

        eligible += 1;
    }

    const base = `Unable to create initial ${poolName} assignment for ${slot.day} ${slot.start}-${slot.end} (${slot.roomName}).`;
    const cover = `${poolName} cover required this segment: ${segmentRequired}, already assigned: ${segmentAssigned}, still needed: ${segmentMissing}.`;
    const roomCover = `${poolName} cover required for ${slot.roomName}: ${roomRequired}, already assigned: ${roomAssigned}, still needed: ${roomMissing}.`;
    const availability = `Available ${poolName} staff in pool: ${staffPool.length}, eligible for this slot now: ${eligible}.`;
    const blockers = `Blocked by holiday: ${holidayBlocked}, already assigned in this time segment: ${occupiedBlocked}, maxShiftHours limit: ${shiftLimitBlocked}.`;

    const needMore = poolName === "practitioner"
        ? "More practitioners are likely needed for this segment, or reduce child counts/ratios/room demand."
        : "More office staff are likely needed for this segment, or reduce office-room demand.";

    return `${base} ${cover} ${roomCover} ${availability} ${blockers} ${needMore}`;
}

function describeMissingPoolStaff(poolName, slots) {
    // Explain how many workers are needed at peak time when no pool staff are supplied.
    const bySegment = new Map();
    for (const slot of slots) {
        const key = `${slot.week}|${slot.day}|${slot.segmentIndex}`;
        bySegment.set(key, (bySegment.get(key) || 0) + 1);
    }

    let peakRequired = 0;
    for (const count of bySegment.values()) {
        if (count > peakRequired) {
            peakRequired = count;
        }
    }

    const nextStep = poolName === "practitioner"
        ? `Add at least ${peakRequired} practitioners in the configuration, or reduce child counts/room demand.`
        : `Add at least ${peakRequired} office staff in the configuration, or reduce office-room demand.`;

    return `No ${poolName} staff available for required slots. Peak ${poolName} staff needed in a single segment: ${peakRequired}. ${nextStep}`;
}

function describePreferredShiftFailure(request, slots, state, maxShiftHours) {
    // Explain why a preference could not be honoured and whether more staff are needed.
    const preferredIndices = request.candidateIndices || [];
    const matchingSlots = preferredIndices.length;

    let alreadyTaken = 0;
    let holidayBlocked = 0;
    let occupiedBlocked = 0;
    let shiftLimitBlocked = 0;
    let assignableNow = 0;

    for (const index of preferredIndices) {
        if (state.assignments[index]) {
            alreadyTaken += 1;
            continue;
        }

        const slot = slots[index];
        if (isStaffOnHoliday(request.member, slot.day, slot.week)) {
            holidayBlocked += 1;
            continue;
        }

        const occKey = `${slot.week}|${slot.day}|${slot.segmentIndex}`;
        const occupied = state.occupancy[occKey];
        if (occupied && occupied.has(request.member.staffID)) {
            occupiedBlocked += 1;
            continue;
        }

        if (Number.isFinite(maxShiftHours) && maxShiftHours > 0) {
            const dayKey = `${slot.week}|${slot.day}|${request.member.staffID}`;
            const dayHours = state.dayHoursByStaff[dayKey] || 0;
            if ((dayHours + slot.hours) > maxShiftHours) {
                shiftLimitBlocked += 1;
                continue;
            }
        }

        assignableNow += 1;
    }

    const who = request.member.staffName || request.member.staffID;
    const base = `Could not satisfy preferred shift for ${who}: ${request.parsed.raw}.`;
    const scope = `Matching slots for this preference: ${matchingSlots}.`;
    const blockers = `Already taken: ${alreadyTaken}, blocked by holiday: ${holidayBlocked}, blocked by same-segment occupancy: ${occupiedBlocked}, blocked by maxShiftHours: ${shiftLimitBlocked}, assignable now: ${assignableNow}.`;
    const help = "If this preference is mandatory, increase available staff or relax constraints (holidays, maxShiftHours, or competing preferences).";

    return `${base} ${scope} ${blockers} ${help}`;
}

function preassignPreferredShifts(staffPool, slots, state, maxShiftHours) {
    // Gather all preference requests first so they can be processed in the most constrained order.
    const requests = [];

    for (const member of staffPool) {
        const prefs = Array.isArray(member?.preferredShifts) ? member.preferredShifts : [];
        for (const pref of prefs) {
            const parsed = parsePreferredShift(pref);
            if (!parsed) {
                continue;
            }

            const candidateIndices = [];
            for (let i = 0; i < slots.length; i += 1) {
                if (state.assignments[i]) {
                    continue;
                }
                const slot = slots[i];
                if (isSlotMatchPreference(slot, parsed)) {
                    candidateIndices.push(i);
                }
            }

            requests.push({ member, parsed, candidateIndices });
        }
    }

    // Assign the hardest preferences first to reduce the chance of blocking them later.
    requests.sort((a, b) => a.candidateIndices.length - b.candidateIndices.length);

    for (const request of requests) {
        let assigned = false;
        for (const index of request.candidateIndices) {
            if (state.assignments[index]) {
                continue;
            }

            const slot = slots[index];
            if (!canAssignToSlot(request.member, slot, state, maxShiftHours)) {
                continue;
            }

            applyAssignment(state, request.member, slot, index);
            state.locked[index] = true;
            assigned = true;
            break;
        }

        if (!assigned) {
            throw new Error(describePreferredShiftFailure(request, slots, state, maxShiftHours));
        }
    }
}

function parsePreferredShift(input) {
    // Normalise free-text preference input into a machine-readable structure.
    if (!input) {
        return null;
    }

    const raw = String(input).trim();
    if (!raw) {
        return null;
    }

    const normalized = raw.toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ").trim();
    const match = normalized.match(/^(?:w(\d+)[-\s]+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+(early|mid|late|full))?$/i);
    if (!match) {
        return null;
    }

    return {
        raw,
        week: match[1] ? parseInt(match[1], 10) : null,
        day: match[2],
        label: match[3] || "full"
    };
}

function isSlotMatchPreference(slot, preference) {
    // A slot matches if the day, optional week, and segment label all line up.
    const day = String(slot.day || "").toLowerCase();
    if (day !== preference.day) {
        return false;
    }

    if (Number.isInteger(preference.week) && slot.week !== preference.week) {
        return false;
    }

    if (preference.label === "full") {
        return true;
    }

    // If the day is unsplit (single "full" segment), any time-of-day preference is satisfied
    // — the staff member covers the whole day so "early", "mid", and "late" all apply.
    if (slot.segmentLabel === "full") {
        return true;
    }

    return slot.segmentLabel === preference.label;
}

function canAssignToSlot(member, slot, state, maxShiftHours) {
    // Reject assignments that clash with holidays, overlapping shifts, or daily hour caps.
    if (!member || isStaffOnHoliday(member, slot.day, slot.week)) {
        return false;
    }

    const occKey = `${slot.week}|${slot.day}|${slot.segmentIndex}`;
    const occupied = state.occupancy[occKey];
    if (occupied && occupied.has(member.staffID)) {
        return false;
    }

    if (Number.isFinite(maxShiftHours) && maxShiftHours > 0) {
        const dayKey = `${slot.week}|${slot.day}|${member.staffID}`;
        const dayHours = state.dayHoursByStaff[dayKey] || 0;
        if ((dayHours + slot.hours) > maxShiftHours) {
            return false;
        }
    }

    return true;
}

function applyAssignment(state, member, slot, index) {
    // Apply one assignment and update all derived counters used by the search.
    const staffID = member.staffID;
    state.assignments[index] = staffID;
    state.hoursByStaff[staffID] = (state.hoursByStaff[staffID] || 0) + slot.hours;

    const dayKey = `${slot.week}|${slot.day}|${staffID}`;
    state.dayHoursByStaff[dayKey] = (state.dayHoursByStaff[dayKey] || 0) + slot.hours;

    const occKey = `${slot.week}|${slot.day}|${slot.segmentIndex}`;
    if (!state.occupancy[occKey]) {
        state.occupancy[occKey] = new Set();
    }
    state.occupancy[occKey].add(staffID);
}

function removeAssignment(state, slot, index) {
    // Roll back one assignment so a neighbour move can be tested safely.
    const staffID = state.assignments[index];
    if (!staffID) {
        return;
    }

    state.assignments[index] = null;
    state.hoursByStaff[staffID] = (state.hoursByStaff[staffID] || 0) - slot.hours;

    const dayKey = `${slot.week}|${slot.day}|${staffID}`;
    state.dayHoursByStaff[dayKey] = (state.dayHoursByStaff[dayKey] || 0) - slot.hours;

    const occKey = `${slot.week}|${slot.day}|${slot.segmentIndex}`;
    if (state.occupancy[occKey]) {
        state.occupancy[occKey].delete(staffID);
    }
}

function neighborState(currentState, staffPool, slots, maxShiftHours) {
    // Produce one nearby solution by changing a single unlocked slot.
    const unlocked = [];
    for (let i = 0; i < slots.length; i += 1) {
        if (!currentState.locked[i]) {
            unlocked.push(i);
        }
    }

    if (unlocked.length === 0) {
        return null;
    }

    const next = cloneState(currentState);
    const index = unlocked[Math.floor(Math.random() * unlocked.length)];
    const slot = slots[index];
    const oldStaffID = next.assignments[index];

    removeAssignment(next, slot, index);

    const candidates = staffPool.filter((member) => {
        if (member.staffID === oldStaffID) {
            return false;
        }
        return canAssignToSlot(member, slot, next, maxShiftHours);
    });

    if (candidates.length === 0) {
        const oldMember = staffPool.find((member) => member.staffID === oldStaffID);
        if (oldMember) {
            applyAssignment(next, oldMember, slot, index);
        }
        return null;
    }

    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    applyAssignment(next, pick, slot, index);
    return next;
}

function scoreState(state, slots, staffPool, targetHours) {
    // Score each solution on wage cost first, then add a penalty for uneven weekly hours.
    let cost = 0;
    const rates = Object.fromEntries(staffPool.map((member) => [member.staffID, Number(member.hourlyRate || 0)]));
    for (let i = 0; i < slots.length; i += 1) {
        const staffID = state.assignments[i];
        const slot = slots[i];
        cost += (rates[staffID] || 0) * slot.hours;
    }

    let fairnessPenalty = 0;
    for (const member of staffPool) {
        const hours = state.hoursByStaff[member.staffID] || 0;
        fairnessPenalty += Math.pow(hours - targetHours, 2);
    }

    const objective = cost + (fairnessPenalty * 1.25);
    return { objective, cost, fairnessPenalty };
}

function cloneState(state) {
    // Clone the mutable search state so candidate moves do not corrupt the current best solution.
    const occupancy = {};
    for (const [key, value] of Object.entries(state.occupancy || {})) {
        occupancy[key] = new Set(value);
    }

    return {
        assignments: [...state.assignments],
        locked: [...state.locked],
        hoursByStaff: { ...state.hoursByStaff },
        dayHoursByStaff: { ...state.dayHoursByStaff },
        occupancy
    };
}

function getSegmentLabel(index, totalSegments) {
    // Map segment positions to the labels used by preferred shift input.
    if (totalSegments <= 1) {
        return "full";
    }
    if (totalSegments === 2) {
        return index === 0 ? "early" : "late";
    }
    if (index === 0) {
        return "early";
    }
    if (index === totalSegments - 1) {
        return "late";
    }
    return "mid";
}
