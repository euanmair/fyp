// AWS SDK modules for DynamoDB interaction and UUID generation for unique IDs
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { v4 as uuidv4 } from "uuid";
import Ajv from "ajv";

// Table names
const dynamoTable = process.env.SCHEDULE_TABLE_NAME || "NurserySchedules";
const historyTable = process.env.STAGE_HISTORY_TABLE_NAME || "NurseryScheduleHistory";

// Ajv validator setup for strict schema validation
const ajv = new Ajv({ allErrors: true, removeAdditional: "all", coerceTypes: true });

// Ratios for staffing (integer is assumed as 1:<value> ratio)
const staffingRatios = {
    "0-24": 3, // 1 staff member per 3 children
    "24-36": 4, // 1 staff member per 4 children
    "36+": 8, // 1 staff member per 8 children
    "Office": null // Office staff do not have a child-to-staff ratio
};

// Define the expected schema for the schedule data - this is for parsing purposes
// This function will still work even if no data is provided, as this runs primarily off of a dynamoDB
const scheduleSchema = {
    type: "object",
    additionalProperties: false,
    properties: {},
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
        items: {
            type: "object",
            additionalProperties: false,
            required: ["roomID", "roomName", "capacity", "ageGroup", "schedule", "isOffice"],
            properties: {
                roomID: { type: "string", required: true },
                roomName: { type: "string", required: true },
                capacity: { type: "integer", required: true },
                ageGroup: { type: "string", required: true },
                schedule: { type: "array", required: true },
                isOffice: { type: "boolean", required: true }
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
        items: {
            type: "object",
                additionalProperties: false,
                required: ["staffID", "staffName", "trainingLevel", "isOffice", "hourlyRate"],
                properties: {
                    staffID: { type: "string", required: true },
                    staffName: { type: "string", required: true },
                    trainingLevel: { type: "integer", required: true },
                    holiday: {type : "array:", items: { type: "string" }},
                    preferredShifts: {type : "array:", items: { type: "string" }}, // Some staff may prefer certain shitfs
                    isOffice: { type: "boolean", required: true },
                    hourlyRate: { type: "number", required: true }
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
        additionalProperties: false,
        required: ["planningWeeks", "workDays", "dayStart", "dayEnd", "budget"],
        properties: {
            planningWeeks: { type: "integer", required: true },
            workDays: { type: "array", items: { type: "string" }, required: true },
            dayStart: { type: "string", required: true },
            dayEnd: { type: "string", required: true },
            budget: { type: "number", required: true } 
            }
        },
    childrenCount: {
        // This is the expected number of children in each age group, which will be used to calculate staffing needs.
        type: "object",
        additionalProperties: false,
        required: ["0-24", "24-36", "36+"],
        properties: {
            "0-24": { type: "integer", required: true },
            "24-36": { type: "integer", required: true },
            "36+": { type: "integer", required: true }
            }
        },
    }
};

// Compile the schema using Ajv for validation
const validateSchedule = ajv.compile(scheduleSchema);

// Function to format Ajv validation errors for better readability
function formatAjvErrors(errors) {
  return (errors || []).map((err) => ({ path: err.instancePath || err.dataPath, message: err.message })).slice(0, 10);
}

function generateSchedule({ rooms, staff, settings, childrenCount }) {
    // This function will generate a schedule based on the provided rooms, staff, and settings.
    const planningWeeks = settings.planningWeeks || 1; // If no week present, default to 1 week of scheduling
    const workDays = settings.workDays || ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]; // Default to standard workweek
    const shifts = generateShiftLength(settings.dayStart, settings.dayEnd);

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

    

}

// Lambda handler function.
export const handler = async (event) => {
    try {

    } catch (error) {
        console.error("Error processing schedule:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Internal Server Error" }),
        };
    }
};

function generateShiftLength(dayStart, dayEnd) {
    // This function will generate shifts based on the provided start and end times.
    // The program assumes every day starts and ends at the same time.
    const shiftLength = parseInt(dayEnd.split(":")[0], 10) - parseInt(dayStart.split(":")[0], 10);
    return shiftLength;
};

