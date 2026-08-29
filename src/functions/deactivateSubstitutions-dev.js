const { app } = require("@azure/functions");
const { logger } = require("@vestfoldfylke/loglady");
const { deactivateSubstitutions } = require("../lib/jobs/graphJobs.js");
const { logToDB } = require("../lib/jobs/logToDB.js");

app.http("deactivateSubstitutions-dev", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (_request, context) => {
    try {
      await deactivateSubstitutions(false, undefined, undefined, context);
    } catch (error) {
      logger.errorException(error, "deactivateSubstitutions-dev - An error occured while trying to deactivate substitutions");
      await logToDB("error", error?.message || error, undefined, context);
    }
  }
});
