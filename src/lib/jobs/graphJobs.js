const { logger } = require("@vestfoldfylke/loglady");
const { mongoDB } = require("../../../config.js");
const { getGroupOwners, getGroupMembers, removeGroupMember, removeGroupOwner, addGroupOwner, getAdditionalRequestorInfo } = require("../callGraph.js");
const { getMongoClient } = require("../mongoClient.js");
const createStats = require("./createStats.js");
const { logToDB } = require("./logToDB.js");

const deactivateSubstitutions = async (onlyFirst = false, substitutions, request, context) => {
  const logPrefix = "deactivateSubstitutions - graphJobs.js";
  // Connect to the database
  const mongoClient = await getMongoClient();

  // If no substitutions were provided, the timetrigger was the one that called this function. Get the active substitutions from the database.
  if (!substitutions) {
    logger.info(`${logPrefix} - No substitutions provided. Get the active substitutions from the database`);
    const query = { status: "active", expirationTimestamp: { $lte: new Date() } };
    try {
      substitutions = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.SUBSTITUTIONS_COLLECTION).find(query).toArray();
    } catch (error) {
      logger.errorException(error, `${logPrefix} - An error occured while trying to get the active substitutions`);
      throw new Error("An error occured while trying to get the active substitutions");
    }
  }

  // Only deactivate the first substitution.
  if (onlyFirst && substitutions.length > 0) substitutions = [substitutions[0]];

  const responses = [];
  const error = { errors: [] };
  const stats = [];

  for (const substitution of substitutions) {
    try {
      if (!substitution.teamId) {
        logger.error(`${logPrefix} - Substitution '{SubstitutionId}' missing teamId`, substitution._id);
        error.errors.push(new Error(`Substitution '${substitution._id}' missing teamId`));
        continue;
      }
      if (!substitution.substituteId) {
        logger.error(`${logPrefix} - Substitution '{SubstitutionId}' missing substituteId`, substitution._id);
        error.errors.push(new Error(`Substitution '${substitution.substituteId}' missing substituteId`));
        continue;
      }

      // Make sure that the substitute is already owner. Find owners and Members.
      logger.info(`${logPrefix} - Get the owners and members of the team {SubstitutionTeamId}`, substitution.teamId);
      const owners = await getGroupOwners(substitution.teamId, substitution._id);
      logger.info(`${logPrefix} - Got {OwnerCount} owners of team {SubstitutionTeamId}`, owners.length, substitution.teamId);
      const members = await getGroupMembers(substitution.teamId);
      logger.info(`${logPrefix} - Got {MemberCount} members of team {SubstitutionTeamId}`, members.length, substitution.teamId);

      logger.info(`${logPrefix} - Check if the substitute {SubstituteId} is an owner or a member of team {SubstitutionTeamId}`, substitution.substituteId, substitution.teamId);
      const currentOwner = owners.find((i) => i.id === substitution.substituteId);
      logger.info(`${logPrefix} - Substitution-subject as owner: {@CurrentOwner}`, currentOwner);
      const currentMember = members.find((i) => i.id === substitution.substituteId);
      logger.info(`${logPrefix} - Substitution-subject as member: {@CurrentMember}`, currentMember);

      // If the substitute is an owner, remove the owner. If the substitute is a member, remove the member.
      logger.info(`${logPrefix} - Remove the substitute {SubstituteId} from the team {SubstitutionTeamId} if it is an owner or a member`, substitution.substituteId, substitution.teamId);
      if (currentOwner || currentMember) {
        if (currentOwner) {
          // Remove the owner
          logger.info(`${logPrefix} - Remove the substitute {SubstituteId} as owner from team {SubstitutionTeamId}`, substitution.substituteId, substitution.teamId);
          await removeGroupOwner(substitution.teamId, substitution.substituteId);
          logger.info(`${logPrefix} - Successfully removed the substitute {SubstituteId} as owner from team {SubstitutionTeamId}`, substitution.substituteId, substitution.teamId);
        }
        if (currentMember) {
          // Remove the member
          logger.info(`${logPrefix} - Remove the substitute {SubstituteId} as member from team {SubstitutionTeamId}`, substitution.substituteId, substitution.teamId);
          await removeGroupMember(substitution.teamId, substitution.substituteId);
          logger.info(`${logPrefix} - Successfully removed the substitute {SubstituteId} as member from team {SubstitutionTeamId}`, substitution.substituteId, substitution.teamId);
        }
      } else {
        logger.info(
          `${logPrefix} - The substitute {SubstituteId} is not an owner or a member of the team {SubstitutionTeamId} - can set substitution status to 'expired'`,
          substitution.substituteId,
          substitution.teamId
        );
      }
      // Set the substitution status to 'expired'
      logger.info(`${logPrefix} - Set the substitution: {SubstitutionId} status to 'expired'`, substitution._id);
      const updatedSub = await mongoClient
        .db(mongoDB.DB_NAME)
        .collection(mongoDB.SUBSTITUTIONS_COLLECTION)
        .updateOne({ _id: substitution._id }, { $set: { status: "expired" } });
      logger.info(`${logPrefix} - Substitution: {SubstitutionId} updated, status: 'expired'`, substitution._id);
      responses.push(updatedSub);
      stats.push({ teamId: substitution.teamId, status: "expired", description: "Substitute expired" });
    } catch (error) {
      logger.errorException(
        error,
        `${logPrefix} - An error occured while trying to deactivate the substitutionId {SubstitutionId} for team {SubstitutionTeamId}`,
        substitution.substituteId,
        substitution.teamId
      );
      // Log the error to the db
      await logToDB("error", error, request, context);
    }
  }
  // Create statistics for the deactivated substitutions
  if (responses.length > 0) {
    logger.info(`${logPrefix} - Create statistics for the deactivated substitutions`);
    for (const stat of stats) {
      await createStats(stat);
    }
  }

  // Log the substitutions to the db
  logger.info(`${logPrefix} - Deactivated {SubstitutionCount}' substitutions`, responses.length);
  await logToDB("info", { message: `Deactivated '${responses.length}' substitutions`, substitutions: responses }, request, context);

  // Return the responses
  return responses;
};

const activateSubstitutions = async (onlyFirst = false, request, context) => {
  const logPrefix = "activateSubstitutions - graphJobs.js";
  // Connect to the database
  const mongoClient = await getMongoClient();

  // Define the query
  const query = { status: "pending" };

  // Get the pending substitutions from the database
  let pendingSubstitutions = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.SUBSTITUTIONS_COLLECTION).find(query).toArray();

  if (!pendingSubstitutions || pendingSubstitutions.length === 0) {
    logger.info(`${logPrefix} - No pending substitutions found`);
    return;
  }

  // If onlyFirst is true, only activate the first substitution
  if (onlyFirst && pendingSubstitutions.length > 0) {
    logger.info(`${logPrefix} - onlyFirst is true. Only activate the first substitution`);
    pendingSubstitutions = [pendingSubstitutions[0]];
  }

  // Holds the responses and errors
  const responses = [];
  // Holds the statistics
  const stats = [];

  // Loop through the pending substitutions and activate them.
  /* eslint no-unreachable-loop: ["error", { "ignore": ["ForOfStatement"] }] */
  for (const substitution of pendingSubstitutions) {
    try {
      if (!substitution.teamId) {
        logger.error(`${logPrefix} - Substitution '{SubstitutionId}' missing teamId`, substitution._id);
        throw new Error(`Substitution '${substitution._id}' missing teamId`);
      }
      if (!substitution.substituteId) {
        logger.error(`${logPrefix} - Substitution '{SubstitutionId}' missing substituteId`, substitution._id);
        throw new Error(`Substitution '${substitution._id}' missing substituteId`);
      }

      // Add the substitute as owner to the team
      logger.info(`${logPrefix} - Add the substitute as owner to the team`);
      try {
        await addGroupOwner(substitution.teamId, substitution.substituteId);
      } catch (error) {
        logger.errorException(error, `${logPrefix} - An error occured while trying to add the substitute as owner to the team`);
        await logToDB("error", error, request, context);
      }

      // Set the substitution status to 'active'
      const updatedSub = await mongoClient
        .db(mongoDB.DB_NAME)
        .collection(mongoDB.SUBSTITUTIONS_COLLECTION)
        .updateOne({ _id: substitution._id }, { $set: { status: "active", updatedTimestamp: new Date() } }, { new: true });
      responses.push(updatedSub);
      stats.push({ teamId: substitution.teamId, status: "active", description: "Substitute activated" });
    } catch (error) {
      logger.errorException(error, `${logPrefix} - An error occured while trying to activate the substitution`);
      await logToDB("error", error, request, context);
    }

    await logToDB("info", { message: `Activated '${responses.length}' substitutions`, substitutions: responses }, request, context);
    // Create statistics for the activated substitutions
    for (const stat of stats) {
      await createStats(stat);
    }

    // Return the responses
    return responses;
  }
};

const getEmployeeInfo = async (requestor) => {
  const logPrefix = "getEmployeeInfo";
  const info = await getAdditionalRequestorInfo(requestor);

  // Validate that the returned object has the required properties
  if (!info.jobTitle || !info.department || !info.officeLocation || !info.company) {
    logger.error(`${logPrefix} - Missing required properties in the returned object`);
    throw new Error("Missing required properties in the returned object");
  }

  // Return the info
  return info;
};

module.exports = {
  deactivateSubstitutions,
  activateSubstitutions,
  getEmployeeInfo
};
