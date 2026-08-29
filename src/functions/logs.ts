import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { logger } from "@vestfoldfylke/loglady";
import type { Document, WithId } from "mongodb";
import { mongoDB, NODE_ENV } from "../../config.js";
import { prepareRequest } from "../lib/auth/requestor.js";
import { logToDB } from "../lib/jobs/logToDB.js";
import { getMongoClient } from "../lib/mongoClient.js";
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

    const mongoClient: Awaited<ReturnType<typeof getMongoClient>> = await getMongoClient();

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

    const logs: WithId<Document>[] = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.LOG_COLLECTION).find(filter).sort({ startTimeStamp: -1 }).toArray();

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
