import type { HttpRequest, InvocationContext } from "@azure/functions";
import { logger } from "@vestfoldfylke/loglady";
import { mongoDB } from "../../../config.js";
import type { LogEntry, LogType, NormalizedData } from "../../types/logs.js";
import type { Requestor } from "../../types/requestor.js";
import { insertOne } from "../mongoCalls.js";

const isError = (value: unknown): value is Error => value instanceof Error;

export const logToDB = async (type: LogType = "info", data: unknown, request?: HttpRequest, context?: InvocationContext, requestor?: Requestor): Promise<void> => {
  if (!data) {
    logger.error("logToDB - Missing required parameter: data");
    throw new Error("Missing required parameter: data");
  }

  let normalized: NormalizedData;
  if (isError(data)) {
    normalized = {
      message: data.message,
      stack: data.stack
    };
  } else if (Array.isArray(data)) {
    normalized = data[0] as NormalizedData;
  } else {
    normalized = data as NormalizedData;
  }

  try {
    const sessionId: string = context?.invocationId || "unknown";
    const endpoint: string = context?.functionName || "unknown";
    const method: string = request?.method || "unknown";
    const origin: string = request?.headers?.get("origin") || "unknown";
    const url: string = request?.url || "unknown";
    const rawStart: string | undefined = (context as unknown as { bindingData?: { sys?: { utcNow?: string } } })?.bindingData?.sys?.utcNow;
    const endTimeStamp: Date = new Date();
    let startTimeStamp: number | undefined;
    let duration: number = 0;
    if (rawStart) {
      const parsed: number = Date.parse(rawStart);
      if (!Number.isNaN(parsed)) {
        startTimeStamp = parsed;
        duration = endTimeStamp.getTime() - parsed;
      }
    }

    const logEntry: LogEntry = {
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
    await insertOne(mongoDB.LOG_COLLECTION, logEntry);
  } catch (error) {
    logger.errorException(error, "logToDB - An error occured while trying to log to the database");
    throw new Error("An error occured while trying to log to the database");
  }
};
