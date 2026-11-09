import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { logger } from "@vestfoldfylke/loglady";
import { prepareRequest } from "../lib/auth/requestor.js";
import { getOwnedObjects, getUser } from "../lib/callGraph.js";
import { getPermittedLocations } from "../lib/jobs/getPermittedLocations.js";
import { logToDB } from "../lib/jobs/logToDB.js";
import type { GraphOwnedObject, GraphUser, PermittedLocation } from "../types/graph.js";
import type { Requestor } from "../types/requestor.js";

const handler = async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
  const logPrefix: string = "teacherTeams";
  let requestor: Requestor | undefined;
  try {
    ({ requestor } = await prepareRequest(request, { required: ["upn"] }));

    if (!requestor.roles.includes("App.Admin")) {
      const upn: string = request.params.upn ?? "";
      const user: GraphUser | null = await getUser(upn);

      if (!user) {
        logger.error(`${logPrefix} - User not found with upn {Upn}`, upn);
        throw new Error(`User not found with upn ${upn}`);
      }

      if (!user.companyName) {
        logger.error(`${logPrefix} - Was not able to get the company name for user with upn {Upn}`, upn);
        throw new Error(`Was not able to get the company name for user with upn ${upn}`);
      }

      const permittedLocations: PermittedLocation[] = await getPermittedLocations(user.companyName);
      const permittedLocationNames: string[] = permittedLocations.map((location: PermittedLocation) => location.name);

      if (!permittedLocationNames.includes(user.companyName)) {
        logger.error(`${logPrefix} - User with upn {Upn} is not permitted to see the requested teams`, upn);
        throw new Error(`User with upn ${upn} is not permitted to see the requested teams`);
      }
    }

    const upn: string = request.params.upn ?? "";
    let ownedObjects: GraphOwnedObject[] = (await getOwnedObjects(upn)) ?? [];

    logger.info(`${logPrefix} - Removing any resources that is not an SDS team for user with upn {Upn}`, upn);
    ownedObjects = ownedObjects.filter((object: GraphOwnedObject) => object.mail?.toLowerCase().startsWith("section_"));

    logger.info(`${logPrefix} - Removing any expired resources for user with upn {Upn}`, upn);
    ownedObjects = ownedObjects.filter((object: GraphOwnedObject) => !object.displayName.toLowerCase().startsWith("exp"));

    logger.info(`${logPrefix} - Found {OwnedObjectCount} teams for user with upn {Upn}`, ownedObjects.length, upn);

    return {
      status: 200,
      jsonBody: ownedObjects
    };
  } catch (error) {
    logger.errorException(error, `${logPrefix} - An error occured while trying to get the teacher teams`);
    await logToDB("error", error, request, context, requestor);
    return {
      status: 500,
      jsonBody: { error: error instanceof Error ? error.message : String(error) }
    };
  }
};

app.http("teacherTeams", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "teacherteams/{upn}",
  handler
});
