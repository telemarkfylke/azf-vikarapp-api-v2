import { app, type InvocationContext, type Timer } from "@azure/functions";
import { logger } from "@vestfoldfylke/loglady";
import { APP_DEACTIVATE_TIMERS } from "../../config.js";
import { activateSubstitutions } from "../lib/jobs/graphJobs.js";
import { logToDB } from "../lib/jobs/logToDB.js";

const handler = async (_myTimer: Timer, context: InvocationContext): Promise<void> => {
  if (APP_DEACTIVATE_TIMERS) {
    return;
  }

  try {
    await activateSubstitutions(false, undefined, context);
  } catch (error) {
    logger.errorException(error, "activateSubstitutions - An error occured while trying to activate substitutions");
    await logToDB("error", error, undefined, context);
  }
};

app.timer("activateSubstitutions", {
  schedule: process.env.ACTIVATE_SUBSTITUTIONS_SCHEDULE ?? "0 */15 * * * *",
  handler
});
