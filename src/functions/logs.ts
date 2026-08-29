import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { logger } from "@vestfoldfylke/loglady";
import { mongoDB, NODE_ENV } from "../../config.js";
import { prepareRequest } from "../lib/auth/requestor.js";
import { logToDB } from "../lib/jobs/logToDB.js";
import { getMongoClient } from "../lib/mongoClient.js";
import type { Requestor } from "../types/requestor.js";

const handler = async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
  const logPrefix = "logs";
  let requestor: Requestor | undefined;
  try {
    ({ requestor } = await prepareRequest(request));
    if (NODE_ENV !== "development" && !requestor.roles.includes("App.Admin")) {
      logger.warn(`${logPrefix} - Unauthorized, missing role 'App.Admin'`);
      throw new Error("Unauthorized, missing role 'App.Admin'");
    }

    const mongoClient = await getMongoClient();

    const from = request.query?.get("from");
    const to = request.query?.get("to");
    const filter: { startTimeStamp?: { $gte?: string; $lte?: string } } = {};
    if (from || to) {
      filter.startTimeStamp = {};
      if (from) filter.startTimeStamp.$gte = from;
      if (to) filter.startTimeStamp.$lte = to;
    }

    const logs = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.LOG_COLLECTION).find(filter).sort({ startTimeStamp: -1 }).toArray();

    return { status: 200, jsonBody: logs };
  } catch (error) {
    logger.errorException(error, `${logPrefix} - An error occured while trying to get the logs`);
    await logToDB("error", error, request, context, requestor);
    return { status: 500, jsonBody: { error: error instanceof Error ? error.message : String(error) } };
  }
};

app.http("logs", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "logs",
  handler
});
