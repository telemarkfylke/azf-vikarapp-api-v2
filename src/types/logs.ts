import type { HttpRequest } from "@azure/functions";
import type { Requestor } from "./requestor.js";

export type LogEntry = {
  type: LogType;
  message: string;
  sessionId: string;
  origin: string;
  method: string;
  endpoint: string;
  url: string;
  request: HttpRequest | undefined;
  requestor: Partial<Requestor>;
  duration: number;
  data: NormalizedData;
  startTimeStamp: number | undefined;
  endTimeStamp: Date;
};

export type LogType = "info" | "warn" | "error" | "debug";

export type NormalizedData = { message?: string; stack?: string } | Record<string, unknown> | string;
