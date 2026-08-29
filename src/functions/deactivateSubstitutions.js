const { app } = require("@azure/functions");
const { logger } = require("@vestfoldfylke/loglady");
const config = require("../../config.js");
const { deactivateSubstitutions } = require("../lib/jobs/graphJobs.js");
const { logToDB } = require("../lib/jobs/logToDB.js");

app.timer("deactivateSubstitutions", {
  schedule: "30 */15 * * * *", // every 15th minute at 30 seconds past the minute
  // schedule: '*/15 22-23,0-2 * * *', // At every 15th minute past every hour from 22 through 23 and every hour from 0 through 2.
  handler: async (_myTimer, context) => {
    if (["true", true].includes(config.APP_DEACTIVATE_TIMERS)) return;
    try {
      await deactivateSubstitutions(false, undefined, undefined, context);
    } catch (error) {
      logger.errorException(error, "deactivateSubstitutions - An error occured while trying to deactivate substitutions");
      await logToDB("error", error, undefined, context);
    }
  }
});
