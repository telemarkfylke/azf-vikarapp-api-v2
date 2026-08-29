import type { HttpRequest, InvocationContext } from "@azure/functions";
import { logger } from "@vestfoldfylke/loglady";
import { mongoDB } from "../../../config.js";
import type { Requestor } from "../../types/requestor.js";
import { getMongoClient } from "../mongoClient.js";

type LogType = "info" | "warn" | "error" | "debug";

type NormalizedData = { message?: string; stack?: string } | Record<string, unknown> | string;

const isError = (value: unknown): value is Error => value instanceof Error;

export const logToDB = async (type: LogType = "info", data: unknown, request?: HttpRequest, context?: InvocationContext, requestor?: Requestor): Promise<void> => {
  if (!data) {
    logger.error("logToDB - Missing required parameter: data");
    throw new Error("Missing required parameter: data");
  }

  let normalized: NormalizedData;
  if (isError(data)) {
    normalized = { message: data.message, stack: data.stack };
  } else if (Array.isArray(data)) {
    normalized = data[0] as NormalizedData;
  } else {
    normalized = data as NormalizedData;
  }

  try {
    const sessionId = context?.invocationId || "unknown";
    const endpoint = context?.functionName || "unknown";
    const method = request?.method || "unknown";
    const origin = request?.headers?.get("origin") || "unknown";
    const url = request?.url || "unknown";
    const rawStart = (context as unknown as { bindingData?: { sys?: { utcNow?: string } } })?.bindingData?.sys?.utcNow;
    const endTimeStamp = new Date();
    let startTimeStamp: number | undefined;
    let duration = 0;
    if (rawStart) {
      const parsed = Date.parse(rawStart);
      if (!Number.isNaN(parsed)) {
        startTimeStamp = parsed;
        duration = endTimeStamp.getTime() - parsed;
      }
    }

    const mongoClient = await getMongoClient();
    const logEntry = {
      type,
      message: typeof normalized === "object" && normalized !== null && "message" in normalized ? String((normalized as { message?: unknown }).message ?? "") : "",
      sessionId,
      origin,
      method,
      endpoint,
      url,
      request,
      requestor: { ...(requestor ?? {}) },
      duration,
      data: normalized,
      startTimeStamp,
      endTimeStamp
    };
    await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.LOG_COLLECTION).insertOne(logEntry);
  } catch (error) {
    logger.errorException(error, "logToDB - An error occured while trying to log to the database");
    throw new Error("An error occured while trying to log to the database");
  }
};
