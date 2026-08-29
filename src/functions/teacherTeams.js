const { app } = require("@azure/functions");
const { logger } = require("@vestfoldfylke/loglady");
const { getUser, getOwnedObjects } = require("../lib/callGraph.js");
const { prepareRequest } = require("../lib/auth/requestor.js");
const { getPermittedLocations } = require("../lib/jobs/getPermittedLocations.js");
const { logToDB } = require("../lib/jobs/logToDB.js");

app.http("teacherTeams", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "teacherteams/{upn}",
  handler: async (request, context) => {
    const logPrefix = "teacherTeams";
    let requestor;
    try {
      // Make sure all the required properties are provided
      ({ requestor } = await prepareRequest(request, { required: ["upn"] }));
      // If the user is not admin, make sure that the user has permission to see the requested teams
      if (!requestor.roles.includes("App.Admin")) {
        // Get the user you want to check the teams for
        const user = await getUser(request.params.upn);

        if (!user) {
          logger.error(`${logPrefix} - User not found with upn {Upn}`, request.params.upn);
          throw new Error(`User not found with upn ${request.params.upn}`);
        }
        if (!user.companyName) {
          logger.error(`${logPrefix} - Was not able to get the company name for user with upn {Upn}`, request.params.upn);
          throw new Error(`Was not able to get the company name for user with upn ${request.params.upn}`);
        }
        // Get the locations the user is permitted to see
        const permittedLocations = await getPermittedLocations(user.companyName);
        const permittedLocationNames = permittedLocations.map((location) => location.name);

        // Check if the user is permitted to see the requested teams
        if (!permittedLocationNames.includes(user.companyName)) {
          logger.error(`${logPrefix} - User with upn {Upn} is not permitted to see the requested teams`, request.params.upn);
          throw new Error(`User with upn ${request.params.upn} is not permitted to see the requested teams`);
        }
      }
      // Get the owned objects for the user
      let ownedObjects = await getOwnedObjects(request.params.upn);

      // Filter out any resources that is not an SDS team
      logger.info(`${logPrefix} - Removing any resources that is not an SDS team for user with upn {Upn}`, request.params.upn);
      ownedObjects = ownedObjects.filter((object) => object.mail?.toLowerCase().startsWith("section_"));
      // Filter out any resources that is expired
      logger.info(`${logPrefix} - Removing any expired resources for user with upn {Upn}`, request.params.upn);
      ownedObjects = ownedObjects.filter((object) => !object.displayName.toLowerCase().startsWith("exp"));

      // Return the teams
      logger.info(`${logPrefix} - Found {OwnedObjectCount} teams for user with upn {Upn}`, ownedObjects.length, request.params.upn);
      return { status: 200, jsonBody: ownedObjects };
    } catch (error) {
      logger.errorException(error, `${logPrefix} - An error occured while trying to get the teacher teams`);
      await logToDB("error", error, request, context, requestor);
      return { status: 500, jsonBody: { error: error?.message || error } };
    }
  }
});
