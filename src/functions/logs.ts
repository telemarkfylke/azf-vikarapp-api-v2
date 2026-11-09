import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { logger } from "@vestfoldfylke/loglady";
import type { WithId } from "mongodb";
import { mongoDB, NODE_ENV } from "../../config.js";
import { prepareRequest } from "../lib/auth/requestor.js";
import { logToDB } from "../lib/jobs/logToDB.js";
import { findByQuery } from "../lib/mongoCalls.js";
import type { LogEntry } from "../types/logs.js";
import type { Requestor } from "../types/requestor.js";

type LogsFilter = {
  startTimeStamp?: {
    $gte?: string;
    $lte?: string;
  };
};

const handler = async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
  const logPrefix: string = "logs";
  let requestor: Requestor | undefined;

  try {
    ({ requestor } = await prepareRequest(request));
    if (NODE_ENV !== "development" && !requestor.roles.includes("App.Admin")) {
      logger.warn(`${logPrefix} - Unauthorized, missing role 'App.Admin'`);
      throw new Error("Unauthorized, missing role 'App.Admin'");
    }

    const from: string | null | undefined = request.query?.get("from");
    const to: string | null | undefined = request.query?.get("to");
    const filter: LogsFilter = {};
    if (from || to) {
      filter.startTimeStamp = {};
      if (from) {
        filter.startTimeStamp.$gte = from;
      }

      if (to) {
        filter.startTimeStamp.$lte = to;
      }
    }

    const logs: WithId<LogEntry>[] = await findByQuery<WithId<LogEntry>[]>(mongoDB.LOG_COLLECTION, filter, { sort: { startTimeStamp: -1 } });

    return {
      status: 200,
      jsonBody: logs
    };
  } catch (error) {
    logger.errorException(error, `${logPrefix} - An error occured while trying to get the logs`);
    await logToDB("error", error, request, context, requestor);
    return {
      status: 500,
      jsonBody: { error: error instanceof Error ? error.message : String(error) }
    };
  }
};

app.http("logs", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "logs",
  handler
});
