const { app } = require("@azure/functions");
const { logger } = require("@vestfoldfylke/loglady");
const { NODE_ENV, mongoDB } = require("../../config.js");
const { logToDB } = require("../lib/jobs/logToDB.js");
const { prepareRequest } = require("../lib/auth/requestor.js");
const { getMongoClient } = require("../lib/mongoClient.js");

app.http("logs", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "logs",
  handler: async (request, context) => {
    const logPrefix = "logs";
    let requestor;
    try {
      // Make sure all the required properties are provided
      ({ requestor } = await prepareRequest(request));
      if (NODE_ENV !== "development" && !requestor.roles.includes("App.Admin")) {
        logger.warn(`${logPrefix} - Unauthorized, missing role 'App.Admin'`);
        throw new Error("Unauthorized, missing role 'App.Admin'");
      }

      // Connect to the database
      const mongoClient = await getMongoClient();

      // Create the filter
      const filter = {};
      if (request.query?.from || request.query?.to) {
        filter.startTimeStamp = {};
        if (request.query.from) filter.startTimeStamp.$gte = request.query.from;
        if (request.query.to) filter.startTimeStamp.$lte = request.query.to;
      }

      // Get the logs, sort by startTimeStamp
      const logs = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.LOG_COLLECTION).find(filter).sort({ startTimeStamp: -1 });

      // Return the logs
      return { status: 200, jsonBody: logs };
    } catch (error) {
      logger.errorException(error, `${logPrefix} - An error occured while trying to get the logs`);
      await logToDB("error", error, request, context, requestor);
      return { status: 500, jsonBody: error };
    }
  }
});
