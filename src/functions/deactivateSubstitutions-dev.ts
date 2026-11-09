import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { logger } from "@vestfoldfylke/loglady";
import { deactivateSubstitutions } from "../lib/jobs/graphJobs.js";
import { logToDB } from "../lib/jobs/logToDB.js";

const handler = async (_request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
  try {
    await deactivateSubstitutions(false, undefined, undefined, context);
    return { status: 200 };
  } catch (error) {
    logger.errorException(error, "deactivateSubstitutions-dev - An error occured while trying to deactivate substitutions");
    await logToDB("error", error instanceof Error ? error.message : error, undefined, context);
    return {
      status: 500,
      jsonBody: { error: error instanceof Error ? error.message : String(error) }
    };
  }
};

app.http("deactivateSubstitutions-dev", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler
});
