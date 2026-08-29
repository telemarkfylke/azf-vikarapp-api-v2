const { app } = require("@azure/functions");
const { logger } = require("@vestfoldfylke/loglady");
const { ObjectId } = require("mongodb");
const { getMongoClient } = require("../lib/mongoClient.js");
const { logToDB } = require("../lib/jobs/logToDB.js");
const { getUser, getOwnedObjects } = require("../lib/callGraph.js");
const { getPermittedLocations } = require("../lib/jobs/getPermittedLocations.js");
const { activateSubstitutions, deactivateSubstitutions } = require("../lib/jobs/graphJobs.js");
const { prepareRequest } = require("../lib/auth/requestor.js");
const { mongoDB } = require("../../config.js");

app.http("substitutions", {
  methods: ["GET", "POST", "PUT"],
  authLevel: "anonymous",
  route: "substitutions",
  handler: async (request, context) => {
    let logPrefix = "substitutions - validate";
    const { requestor } = await prepareRequest(request);
    let requestBody;
    // Make sure all the required properties are provided

    // Validate the POST request body
    if (request.method === "POST") {
      // Make sure the request.body is an array
      requestBody = await request.json();
      if (!Array.isArray(requestBody)) {
        logger.error(`${logPrefix} - The body must be an array`);
        throw new Error("The body must be an array");
      }

      // Filter out any duplicates in the request body, based on the teacherUpn and teamId.
      // This is to prevent duplicates in the database and to make sure that the requestor is not trying to create multiple substitutions for the same teacher and team.
      logger.info(`${logPrefix} - Filter out any duplicates in the request body`);
      requestBody = requestBody.filter((item, index, self) => index === self.findIndex((t) => t.teacherUpn === item.teacherUpn && t.teamId === item.teamId));

      // Make sure all the required properties are provided
      logger.info(`${logPrefix} - Make sure all the required properties are provided`);
      for (const substitution of requestBody) {
        // The requestor must be admin (App.Admin)
        if (!requestor.roles.includes("App.Admin") && requestor.upn !== substitution.substituteUpn) {
          logger.warn(
            `${logPrefix} - Unauthorized. The requestor does not have the required role to perform this action. Requestor: {RequestorName} ({RequestorId}). Roles: {@Roles}`,
            requestor.name,
            requestor.id,
            requestor.roles.join(", ")
          );
          throw new Error("Unauthorized. You do not have the required role to perform this action.");
        }
        if (!substitution.substituteUpn) {
          logger.error(`${logPrefix} - One or more substitution request is missing 'substituteUpn'`);
          throw new Error("One or more substitution requests are missing 'substituteUpn'");
        }
        if (!substitution.substituteUpn.includes("@")) {
          logger.error(`${logPrefix} - {SubstituteUpn} is not a valid upn`, substitution.substituteUpn);
          throw new Error(`${substitution.substituteUpn} is not a valid upn`);
        }
        if (!substitution.teacherUpn) {
          logger.error(`${logPrefix} - One or more substitution request is missing 'teacherUpn'`);
          throw new Error("One or more substitution requests are missing 'teacherUpn'");
        }
        if (!substitution.teacherUpn.includes("@")) {
          logger.error(`${logPrefix} - {TeacherUpn} is not a valid upn`, substitution.teacherUpn);
          throw new Error(`${substitution.teacherUpn} is not a valid upn`);
        }
        if (!substitution.teamId) {
          logger.error(`${logPrefix} - Substitution request is missing 'teamId'`);
          throw new Error("One or more substitution requests are missing 'teamId'");
        }
        if (substitution.substituteUpn.toLowerCase() === substitution.teacherUpn.toLowerCase()) {
          logger.error(
            `${logPrefix} - The substitute and the teacher cannot be the same person. SubstituteUpn: {SubstituteUpn}. TeacherUpn: {TeacherUpn}`,
            substitution.substituteUpn,
            substitution.teacherUpn
          );
          throw new Error(`The substitute and the teacher cannot be the same person, ${substitution.substituteUpn} and ${substitution.teacherUpn}`);
        }
      }
    }

    // Validate the PUT request body
    if (request.method === "PUT") {
      // Check if the a body is provided
      if (!request.json()) {
        logger.error(`${logPrefix} - No body provided`);
        throw new Error("No body provided");
      }
      // Make sure the request.json() is an array
      if (!Array.isArray(request.json())) {
        logger.error(`${logPrefix} - The body must be an array`);
        throw new Error("The body must be an array");
      }
      // Make sure the requestor has the correct role (App.Config)
      if (!requestor.roles.includes("App.Config")) {
        logger.warn(
          `${logPrefix} - Unauthorized. The requestor does not have the required role to perform this action. Requestor: {RequestorName} ({RequestorId}). Roles: {@Roles}`,
          requestor.name,
          requestor.id,
          requestor.roles.join(", ")
        );
        throw new Error("Unauthorized. You do not have the required role to perform this action.");
      }
      // Validate that the ids provided in the body are of type string
      request.json().forEach((id) => {
        if (typeof id !== "string") {
          logger.warn(`${logPrefix} - The id '{Id}' is not of type 'string'`, id);
          throw new Error(`The id '${id}' is not of type 'string'`);
        }
      });
    }

    // Connect to the database
    const mongoClient = await getMongoClient();

    // Determine the method and handle the request
    if (request.method === "GET") {
      logPrefix = "substitutions - get";
      // Get the query parameters
      const status = request.query?.get("status");
      const teacherUpn = request.query?.get("teacherUpn");
      const substituteUpn = request.query?.get("substituteUpn");
      let years = request.query?.get("years");

      // Clean up the years query parameter
      if (years?.includes(",")) years = years.split(",");
      if (years && !Array.isArray(years)) years = [years];

      // If the requestor is not admin, make sure that it has permissions for the call
      if (!requestor.roles.includes("App.Admin")) {
        if (!substituteUpn && !teacherUpn) {
          logger.warn(
            `${logPrefix} - Unauthorized. The requestor does not have the required role to perform this action. Requestor: {RequestorName} ({RequestorId}). Roles: {@Roles}`,
            requestor.name,
            requestor.id,
            requestor.roles.join(", ")
          );
          throw new Error("Unauthorized. You do not have the required role to perform this action.");
        }
        if (substituteUpn !== requestor.upn && teacherUpn !== requestor.upn) {
          logger.warn(
            `${logPrefix} - Unauthorized. The requestor does not have the required role to perform this action. Requestor: {RequestorName} ({RequestorId}). Roles: {@Roles}`,
            requestor.name,
            requestor.id,
            requestor.roles.join(", ")
          );
          throw new Error("Unauthorized. You do not have the required role to perform this action.");
        }
      }

      // Define the filter
      logger.info(`${logPrefix} - Define the filter`);
      let filter = [];
      if (status) filter.push({ status });
      if (teacherUpn) filter.push({ teacherUpn });
      if (substituteUpn) filter.push({ substituteUpn });
      if (years && years.length > 0) {
        const $or = [];
        years.forEach((i) => {
          const firstTimestamp = new Date(i, 0, 1, 1);
          const lastTimestamp = new Date(i, 12, 31, 25);
          $or.push({
            createdTimestamp: {
              $gt: firstTimestamp,
              $lt: lastTimestamp
            }
          });
        });
        filter.push({ $or });
      }

      // If the filter is empty, set it to an empty object. If not, set it to an $and object
      filter = filter.length > 0 ? { $and: [...filter] } : {};

      // Query the database
      let substitutions;
      try {
        logger.info(`${logPrefix} - Query the database`);
        substitutions = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.SUBSTITUTIONS_COLLECTION).find(filter).sort({ expirationTimestamp: -1 }).toArray();
        logger.info(`${logPrefix} - Found {SubstitutionCount} substitutions`, substitutions.length);
      } catch (error) {
        logger.errorException(error, `${logPrefix} - An error occured while trying to get the substitutions`);
        await logToDB("error", error, request, context, requestor);
      }

      // Return the substitutions
      return { status: 200, jsonBody: substitutions };
    }
    if (request.method === "POST") {
      logPrefix = "substitutions - post";
      // Get all the unique substitutions and the teacher UPNS from the request body
      const uniqueSubstituteUpns = [...new Set(requestBody.map((i) => i.substituteUpn))];
      const uniqueTeacherUpns = [...new Set(requestBody.map((i) => i.teacherUpn))];

      // Get all the required substitue informastion from ms graph
      const substitutes = [];
      for (const upn of uniqueSubstituteUpns) {
        // Get the substitute from ms graph
        const substitute = await getUser(upn);
        if (!substitute) {
          logger.error(`${logPrefix} - Could not find the substitute with upn {Upn}`, upn);
          throw new Error(`Could not find the substitute with upn ${upn}`);
        }

        // Attempt to find the exisitng substitutions in the database
        const existingSubstitutions = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.SUBSTITUTIONS_COLLECTION).find({ substituteId: substitute.id });
        if (existingSubstitutions) {
          substitute.substitutions = await existingSubstitutions.toArray();
          logger.info(`${logPrefix} - Found {SubstitutionCount} existing substitutions for the substitute {Upn}`, substitute.substitutions.length, upn);
        }

        // Check if the substitute is admin. If not, get the substitutes permittedLocations
        if (!requestor.roles.includes("App.Admin")) {
          logger.info(`${logPrefix} - Check if the substitute {Upn} has the required permissions to substitute for the teacher`, upn);
          substitute.permittedLocations = await getPermittedLocations(substitute.companyName);
          if (!substitute.permittedLocations || !Array.isArray(substitute.permittedLocations) || substitute.permittedLocations.length === 0) {
            logger.error(`${logPrefix} - Substitute {Upn} does not have any permitted locations`, upn);
            throw new Error(`Substitute ${upn} does not have any permitted locations`);
          }
        }

        substitutes.push(substitute);
      }

      // Get all the required teacher information from ms graph
      const teachers = [];
      for (const upn of uniqueTeacherUpns) {
        // Get the teacher from ms graph
        const teacher = await getUser(upn);
        if (!teacher || !teacher.id) {
          logger.error(`${logPrefix} - Could not find the teacher with upn {Upn}`, upn);
          throw new Error(`Could not find the teacher with upn ${upn}`);
        }

        // Find all the owned objects for the teacher
        let ownedResources = await getOwnedObjects(upn);
        if (!ownedResources) {
          logger.error(`${logPrefix} - Could not find any owned resources for teacher {Upn}`, upn);
          throw new Error(`Could not find any owned resources for teacher ${upn}`);
        }

        // If the ownedResoruces contains a value property, set it to the value.
        if (ownedResources.value) {
          ownedResources = ownedResources.value;
        }

        teacher.owned = ownedResources;
        teachers.push(teacher);
      }

      // Create the database entry for creating/renewing the substitutions
      const expirationTimestamp = new Date(new Date().setHours(1, 0, 0, 0) + 3 * 24 * 60 * 60 * 1000); // 2 days from now, at 01:00.
      const newSubstitutions = []; // The new substitutions to be created
      const renewedSubstitutions = []; // The substitutions that are extended from active
      const renewedExpiredSubstitutions = []; // The substitutions that are renewed from expired
      try {
        // Loop through the request body
        /* eslint no-unreachable-loop: ["error", { "ignore": ["ForOfStatement"] }] */
        for (const substitution of requestBody) {
          // Get the substitute and teacher
          const substitute = substitutes.find((i) => i.userPrincipalName === substitution.substituteUpn);
          const teacher = teachers.find((i) => i.userPrincipalName === substitution.teacherUpn);

          // Make sure that the substitute has the required permissions to substitute for the teacher
          logger.info(
            `${logPrefix} - Make sure that the substitute {SubstituteUserPrincipalName} has the required permissions to substitute for {TeacherUserPrincipalName}`,
            substitute.userPrincipalName,
            teacher.userPrincipalName
          );
          if (!requestor.roles.includes("App.Admin")) {
            logger.info(
              `${logPrefix} - Check if the substitute {SubstituteUserPrincipalName} has the required permissions to substitute for {TeacherUserPrincipalName}`,
              substitute.userPrincipalName,
              teacher.userPrincipalName
            );
            if (!Array.isArray(substitute.permittedLocations) || substitute.permittedLocations.length === 0) {
              logger.error(
                `${logPrefix} - Was not able to determine if the substitute {SubstituteUserPrincipalName} has the required permissions to substitute for {TeacherUserPrincipalName}`,
                substitute.userPrincipalName,
                teacher.userPrincipalName
              );
              throw new Error(`Was not able to determine if the substitute ${substitute.userPrincipalName} has the required permissions to substitute for ${teacher.userPrincipalName}`);
            }

            // Find the permitted locations for the substitute
            logger.info(`${logPrefix} - Find the permitted locations for the substitute {SubstituteUserPrincipalName}`, substitute.userPrincipalName);
            const permittedSchoolNames = substitute.permittedLocations.map((i) => i.name);
            if (!permittedSchoolNames.includes(teacher.companyName)) {
              logger.error(
                `${logPrefix} - The substitute {SubstituteUserPrincipalName} does not have the required permissions to substitute for {TeacherUserPrincipalName}`,
                substitute.userPrincipalName,
                teacher.userPrincipalName
              );
              throw new Error(`The substitute ${substitute.userPrincipalName} does not have the required permissions to substitute for ${teacher.userPrincipalName}`);
            }
          }

          // Verify that the teacher owns the requested team and that it is valid for substitution
          logger.info(`${logPrefix} - Verify that the teacher {TeacherUserPrincipalName} owns the requested team and that it is valid for substitution`, teacher.userPrincipalName);
          const team = teacher.owned?.find((i) => i.id === substitution.teamId);
          if (!team) {
            logger.error(`${logPrefix} - The teacher {TeacherUserPrincipalName} does not own the requested team {SubstitutionTeamId}`, teacher.userPrincipalName, substitution.teamId);
            throw new Error(`The teacher ${teacher.userPrincipalName} does not own the requested team ${substitution.teamId}`);
          }
          if (!team["@odata.type"] || team["@odata.type"].toLowerCase() !== "#microsoft.graph.group") {
            logger.error(`${logPrefix} - The requested team {SubstitutionTeamId} is not a valid team`, substitution.teamId);
            throw new Error(`The requested team ${substitution.teamId} is not a valid team`);
          }
          if (!team.mail || !team.mail.toLowerCase().startsWith("section_")) {
            logger.error(`${logPrefix} - The requested team {SubstitutionTeamId} is not a school team`, substitution.teamId);
            throw new Error(`The requested team ${substitution.teamId} is not a school team`);
          }

          const activeSubstitution =
            substitution.status === "active" && substitution._id
              ? substitute.substitutions?.find((sub) => sub._id.toString() === substitution._id)
              : substitute.substitutions?.find(
                  (sub) => sub.teamId === substitution.teamId && sub.teacherUpn === substitution.teacherUpn && sub.substituteUpn === substitution.substituteUpn && sub.status === "active"
                );

          const expiredSubstitution =
            substitution.status === "expired" && substitution._id
              ? substitute.substitutions?.find((sub) => sub._id.toString() === substitution._id)
              : substitute.substitutions?.find(
                  (sub) => sub.teamId === substitution.teamId && sub.teacherUpn === substitution.teacherUpn && sub.substituteUpn === substitution.substituteUpn && sub.status === "expired"
                );

          // Check if the substitution is currently active and should be renewed, else create a new substitution
          logger.info(`${logPrefix} - Check if the substitution is currently active and should only be renewed else create a new substitution`);
          if (activeSubstitution) {
            logger.info(`${logPrefix} - The selected substitution with id {ActiveSubstitutionId} is currently active and will be renewed`, activeSubstitution._id);
            renewedSubstitutions.push({
              extendedSubstitution: { ...substitution },
              _id: activeSubstitution._id, // Document ID from mongoDB
              expirationTimestamp
            });
          } else if (expiredSubstitution) {
            logger.info(`${logPrefix} - The selected substitution with id {ExpiredSubstitutionId} is currently expired and will be renewed`, expiredSubstitution._id);
            renewedExpiredSubstitutions.push({
              expiredSubstitution: { ...substitution },
              _id: expiredSubstitution._id, // Document ID from mongoDB
              expirationTimestamp
            });
          } else {
            // If we enable School data sync, we can get the school id from the team mail. Unusable for now.
            let teamSdsId = team.mail;
            if (teamSdsId.includes("_")) {
              teamSdsId = teamSdsId.substring(teamSdsId.indexOf("_") + 1);
            }

            // Create the new substitution
            logger.info(`${logPrefix} - Create the new substitution`);
            // Create the new substitution object
            const newSubstitutionsObj = {
              _id: new ObjectId(),
              status: "pending",
              teacherId: teacher.id,
              teacherName: teacher.displayName,
              teacherUpn: teacher.userPrincipalName,
              substituteId: substitute.id,
              substituteName: substitute.displayName,
              substituteUpn: substitute.userPrincipalName,
              teamId: team.id,
              teamName: team.displayName,
              teamEmail: team.mail,
              teamSdsId,
              substitutionUpdated: 0,
              expirationTimestamp,
              createdTimestamp: new Date()
            };

            newSubstitutions.push(newSubstitutionsObj);
          }
        }

        // Make the request to the database
        let documents = []; // The documents to be returned
        if (newSubstitutions.length > 0) {
          for (const newSubstitution of newSubstitutions) {
            try {
              // Insert the new substitutions
              logger.info(`${logPrefix} - Insert the new substitution`);
              const result = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.SUBSTITUTIONS_COLLECTION).insertOne(newSubstitution);
              documents.push(result);
              try {
                // Make the request to activate the substitutions in the database
                await activateSubstitutions(false, request, context);
                await logToDB("info", newSubstitution, request, context, requestor);
              } catch (error) {
                logger.errorException(error, `${logPrefix} - An error occured while trying to create logentry in the database`);
                await logToDB("error", error, request, context, requestor);
                return { status: 404, jsonBody: JSON.stringify({ error: error?.message || error }) };
              }
            } catch (error) {
              logger.errorException(error, `${logPrefix} - An error occured while trying to Insert the new substitutions into the DB`);
              await logToDB("error", error, request, context, requestor);
              return { status: 404, jsonBody: JSON.stringify({ error: error?.message || error }) };
            }
          }
        }
        // Update the renewed substitutions
        for (const renewal of renewedSubstitutions) {
          try {
            // Update the renewed substitutions
            logger.info(`${logPrefix} - Update the expirationTimestamp on the renewed substitution with id {RenewalId}`, renewal._id);
            const result = await mongoClient
              .db(mongoDB.DB_NAME)
              .collection(mongoDB.SUBSTITUTIONS_COLLECTION)
              .updateOne({ _id: new ObjectId(renewal._id) }, { $set: { expirationTimestamp: renewal.expirationTimestamp, updatedTimestamp: new Date() }, $inc: { substitutionUpdated: 1 } });
            documents = [...documents, result];

            try {
              // Logg action to the database
              await logToDB("info", renewal, request, context, requestor);
            } catch (error) {
              logger.errorException(error, `${logPrefix} - An error occured while trying to create logentry in the database`);
              await logToDB("error", error, request, context, requestor);
              return { status: 404, jsonBody: JSON.stringify({ error: error?.message || error }) };
            }
          } catch (error) {
            logger.errorException(error, `${logPrefix} - An error occured while trying to Update the renewed substitutions in the DB`);
            await logToDB("error", error, request, context, requestor);
            return { status: 404, jsonBody: JSON.stringify({ error: error?.message || error }) };
          }
        }

        // Update the renewed substitutions
        for (const renewal of renewedExpiredSubstitutions) {
          try {
            // Update the renewed substitutions
            logger.info(`${logPrefix} - Update the expired substitution with id {RenewalId} to pending`, renewal._id);
            const result = await mongoClient
              .db(mongoDB.DB_NAME)
              .collection(mongoDB.SUBSTITUTIONS_COLLECTION)
              .updateOne(
                { _id: new ObjectId(renewal._id) },
                { $set: { expirationTimestamp: renewal.expirationTimestamp, updatedTimestamp: new Date(), status: "pending" }, $inc: { substitutionUpdated: 1 } }
              );
            documents = [...documents, result];
            try {
              // Make the request to activate the substitutions in the database
              await activateSubstitutions(false, request, context);
              await logToDB("info", renewal, request, context, requestor);
            } catch (error) {
              logger.errorException(error, `${logPrefix} - An error occured while trying to create logentry in the database`);
              await logToDB("error", error, request, context, requestor);
              return { status: 404, jsonBody: JSON.stringify({ error: error?.message || error }) };
            }
          } catch (error) {
            logger.errorException(error, `${logPrefix} - An error occured while trying to Update the renewed substitutions in the DB`);
            await logToDB("error", error, request, context, requestor);
            return { status: 404, jsonBody: JSON.stringify({ error: error?.message || error }) };
          }
        }

        // Return the documents
        return { status: 201, jsonBody: documents };
      } catch (error) {
        logger.errorException(error, `${logPrefix} - An error occured while trying to create/renew the substitutions`);
        await logToDB("error", error, request, context, requestor);
        return { status: 404, jsonBody: JSON.stringify({ error: error?.message || error }) };
      }
    } else if (request.method === "PUT") {
      // Remember to change the endpoint in the front end from substitutions/deactivate to substitutions!
      logPrefix = "substitutions - put";

      let substitutions;
      let response;

      try {
        // Retrive all the ids from the body
        const ids = request.body.filter((id) => id);
        if (ids.length === 0) {
          logger.warn(`${logPrefix} - No ids provided`);
          throw new Error("No ids provided");
        }

        // Get the substitutions from the ids
        logger.info(`${logPrefix} - Get the substitutions from the ids`);
        substitutions = await mongoClient
          .db(mongoDB.DB_NAME)
          .collection(mongoDB.SUBSTITUTIONS_COLLECTION)
          .find({ _id: { $in: ids } })
          .toArray();

        // Check if any substitutions were found
        if (substitutions.length === 0) {
          logger.warn(`${logPrefix} - No substitutions found`);
          throw new Error("No substitutions found");
        }
        logger.info(`${logPrefix} - Found {SubstitutionCount} substitutions`, substitutions.length);

        // Deactivate the substitutions
        logger.info(`${logPrefix} - Try to deactivate the substitutions`);
        response = await deactivateSubstitutions(undefined, substitutions, request, context);

        // Return the deactivated substitutions
        logger.info(`${logPrefix} - Return the deactivated substitutions`);
        return { status: 201, jsonBody: response };
      } catch (error) {
        logger.errorException(error, `${logPrefix} - An error occured while trying to deactivate the substitutions`);
        await logToDB("error", error, request, context, requestor);
        return { status: 500, jsonBody: { error: error?.message || error } };
      }
    }
  }
});
