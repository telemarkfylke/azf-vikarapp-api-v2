const { app } = require("@azure/functions");
const { logger } = require("@vestfoldfylke/loglady");
const { prepareRequest } = require("../lib/auth/requestor.js");
const { searchUsersInGroup } = require("../lib/callGraph.js");
const { logToDB } = require("../lib/jobs/logToDB.js");
const { getPermittedLocations } = require("../lib/jobs/getPermittedLocations.js");
const { searchGroupId } = require("../../config.js");

app.http("teachers", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "teachers/{searchTerm}/{returnSelf?}",
  handler: async (request, context) => {
    const logPrefix = "teachers";
    let requestor;
    try {
      // Make sure all the required properties are provided
      ({ requestor } = await prepareRequest(request, { required: ["searchTerm"] }));

      if (!searchGroupId) {
        logger.error(`${logPrefix} - No searchGroupId provided, make sure its set in the api config`);
        throw new Error("No searchGroupId provided, make sure its set in the api config");
      }

      // Get the search term from the request
      const { searchTerm } = request.params;
      if (!searchTerm) {
        logger.error(`${logPrefix} - No search term provided`);
        throw new Error("No search term provided");
      }
      // Get the returnSelf from the request, either true or false
      const { returnSelf } = request.params;

      // Do the search
      let users = await searchUsersInGroup(searchTerm, searchGroupId, requestor, returnSelf);
      // Check if the user is not admin, and filter out locations that the user is not permitted to see
      if (!requestor.roles.includes("App.Admin")) {
        // Get the locations the user is permitted to see
        const permittedLocations = await getPermittedLocations(requestor.company);
        // Filter out locations the user is not permitted to see, if the user has no permitted locations, return an empty array
        if (!permittedLocations || permittedLocations.length === 0) {
          logger.warn(`${logPrefix} - User with upn {Upn} is not permitted to see any locations`, requestor.upn);
          users = [];
        } else {
          // Filter out the users that are not part of the permitted locations
          const permittedLocationNames = permittedLocations.map((location) => location.name);
          users = users.filter((user) => permittedLocationNames.includes(user.companyName));
        }
      }

      // Return the users
      return { status: 200, jsonBody: users };
    } catch (error) {
      logger.errorException(error, `${logPrefix} - An error occured while trying to get the teachers`);
      await logToDB("error", error, request, context, requestor);
      return { status: 500, jsonBody: { error: error?.message || error } };
    }
  }
});
