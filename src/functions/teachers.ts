import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { logger } from "@vestfoldfylke/loglady";
import { searchGroupId } from "../../config.js";
import { prepareRequest } from "../lib/auth/requestor.js";
import { searchUsersInGroup } from "../lib/callGraph.js";
import { getPermittedLocations } from "../lib/jobs/getPermittedLocations.js";
import { logToDB } from "../lib/jobs/logToDB.js";
import type { GraphUser, PermittedLocation } from "../types/graph.js";
import type { Requestor } from "../types/requestor.js";

const handler = async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
  const logPrefix: string = "teachers";
  let requestor: Requestor | undefined;
  try {
    ({ requestor } = await prepareRequest(request, { required: ["searchTerm"] }));

    if (!searchGroupId) {
      logger.error(`${logPrefix} - No searchGroupId provided, make sure its set in the api config`);
      throw new Error("No searchGroupId provided, make sure its set in the api config");
    }

    const { searchTerm, returnSelf } = request.params;
    if (!searchTerm) {
      logger.error(`${logPrefix} - No search term provided`);
      throw new Error("No search term provided");
    }

    let users: GraphUser[] = (await searchUsersInGroup(searchTerm, searchGroupId, requestor, returnSelf)) ?? [];

    if (!requestor.roles.includes("App.Admin") && requestor.company) {
      const permittedLocations: PermittedLocation[] = await getPermittedLocations(requestor.company);
      if (!permittedLocations || permittedLocations.length === 0) {
        logger.warn(`${logPrefix} - User with upn {Upn} is not permitted to see any locations`, requestor.upn);
        users = [];
      } else {
        const permittedLocationNames: string[] = permittedLocations.map((location: PermittedLocation) => location.name);
        users = users.filter((user: GraphUser) => user.companyName !== undefined && permittedLocationNames.includes(user.companyName));
      }
    }

    return {
      status: 200,
      jsonBody: users
    };
  } catch (error) {
    logger.errorException(error, `${logPrefix} - An error occured while trying to get the teachers`);
    await logToDB("error", error, request, context, requestor);

    return {
      status: 500,
      jsonBody: { error: error instanceof Error ? error.message : String(error) }
    };
  }
};

app.http("teachers", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "teachers/{searchTerm}/{returnSelf?}",
  handler
});
