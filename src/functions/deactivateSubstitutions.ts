import { app, type InvocationContext, type Timer } from "@azure/functions";
import { logger } from "@vestfoldfylke/loglady";
import { APP_DEACTIVATE_TIMERS } from "../../config.js";
import { deactivateSubstitutions } from "../lib/jobs/graphJobs.js";
import { logToDB } from "../lib/jobs/logToDB.js";

const handler = async (_myTimer: Timer, context: InvocationContext): Promise<void> => {
  if (APP_DEACTIVATE_TIMERS) {
    return;
  }

  try {
    await deactivateSubstitutions(false, undefined, undefined, context);
  } catch (error) {
    logger.errorException(error, "deactivateSubstitutions - An error occured while trying to deactivate substitutions");
    await logToDB("error", error instanceof Error ? error.message : error, undefined, context);
  }
};

app.timer("deactivateSubstitutions", {
  schedule: process.env.DEACTIVATE_SUBSTITUTIONS_SCHEDULE ?? "30 */15 * * * *",
  handler
});
