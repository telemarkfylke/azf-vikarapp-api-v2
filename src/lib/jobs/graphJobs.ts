import type { HttpRequest, InvocationContext } from "@azure/functions";
import { logger } from "@vestfoldfylke/loglady";
import type { UpdateResult } from "mongodb";
import { mongoDB } from "../../../config.js";
import type { GraphUser } from "../../types/graph.js";
import type { Requestor } from "../../types/requestor.js";
import type { Substitution } from "../../types/substitution.js";
import { addGroupOwner, getAdditionalRequestorInfo, getGroupMembers, getGroupOwners, removeGroupMember, removeGroupOwner } from "../callGraph.js";
import { getMongoClient } from "../mongoClient.js";
import createStats, { type StatEntry } from "./createStats.js";
import { logToDB } from "./logToDB.js";

export const deactivateSubstitutions = async (onlyFirst: boolean | undefined = false, substitutions?: Substitution[], request?: HttpRequest, context?: InvocationContext): Promise<unknown[]> => {
  const logPrefix: string = "deactivateSubstitutions - graphJobs.js";
  const mongoClient: Awaited<ReturnType<typeof getMongoClient>> = await getMongoClient();

  let items: Substitution[] | undefined = substitutions;
  if (!items) {
    logger.info(`${logPrefix} - No substitutions provided. Get the active substitutions from the database`);
    const query: Record<string, unknown> = {
      status: "active",
      expirationTimestamp: { $lte: new Date() }
    };
    try {
      items = (await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.SUBSTITUTIONS_COLLECTION).find(query).toArray()) as unknown as Substitution[];
    } catch (error) {
      logger.errorException(error, `${logPrefix} - An error occured while trying to get the active substitutions`);
      throw new Error("An error occured while trying to get the active substitutions");
    }
  }

  if (onlyFirst && items.length > 0 && items[0]) {
    items = [items[0]];
  }

  const responses: unknown[] = [];
  const errors: Error[] = [];
  const stats: StatEntry[] = [];

  for (const substitution of items) {
    try {
      if (!substitution.teamId) {
        logger.error(`${logPrefix} - Substitution '{SubstitutionId}' missing teamId`, substitution._id.toString());
        errors.push(new Error(`Substitution '${substitution._id}' missing teamId`));
        continue;
      }

      if (!substitution.substituteId) {
        logger.error(`${logPrefix} - Substitution '{SubstitutionId}' missing substituteId`, substitution._id.toString());
        errors.push(new Error(`Substitution '${substitution.substituteId}' missing substituteId`));
        continue;
      }

      logger.info(`${logPrefix} - Get the owners and members of the team {SubstitutionTeamId}`, substitution.teamId);
      const owners: GraphUser[] = (await getGroupOwners(substitution.teamId, substitution._id)) ?? [];
      logger.info(`${logPrefix} - Got {OwnerCount} owners of team {SubstitutionTeamId}`, owners.length, substitution.teamId);
      const members: GraphUser[] = (await getGroupMembers(substitution.teamId)) ?? [];
      logger.info(`${logPrefix} - Got {MemberCount} members of team {SubstitutionTeamId}`, members.length, substitution.teamId);

      logger.info(`${logPrefix} - Check if the substitute {SubstituteId} is an owner or a member of team {SubstitutionTeamId}`, substitution.substituteId, substitution.teamId);
      const currentOwner: GraphUser | undefined = owners.find((i: GraphUser) => i.id === substitution.substituteId);
      logger.info(`${logPrefix} - Substitution-subject as owner: {@CurrentOwner}`, currentOwner);
      const currentMember: GraphUser | undefined = members.find((i: GraphUser) => i.id === substitution.substituteId);
      logger.info(`${logPrefix} - Substitution-subject as member: {@CurrentMember}`, currentMember);

      logger.info(`${logPrefix} - Remove the substitute {SubstituteId} from the team {SubstitutionTeamId} if it is an owner or a member`, substitution.substituteId, substitution.teamId);
      if (currentOwner || currentMember) {
        if (currentOwner) {
          logger.info(`${logPrefix} - Remove the substitute {SubstituteId} as owner from team {SubstitutionTeamId}`, substitution.substituteId, substitution.teamId);
          await removeGroupOwner(substitution.teamId, substitution.substituteId);
          logger.info(`${logPrefix} - Successfully removed the substitute {SubstituteId} as owner from team {SubstitutionTeamId}`, substitution.substituteId, substitution.teamId);
        }

        if (currentMember) {
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

      logger.info(`${logPrefix} - Set the substitution: {SubstitutionId} status to 'expired'`, substitution._id.toString());
      const updatedSub: UpdateResult = await mongoClient
        .db(mongoDB.DB_NAME)
        .collection(mongoDB.SUBSTITUTIONS_COLLECTION)
        .updateOne({ _id: substitution._id }, { $set: { status: "expired" } });
      logger.info(`${logPrefix} - Substitution: {SubstitutionId} updated, status: 'expired'`, substitution._id.toString());
      responses.push(updatedSub);
      stats.push({
        teamId: substitution.teamId,
        status: "expired",
        description: "Substitute expired"
      });
    } catch (error) {
      logger.errorException(
        error,
        `${logPrefix} - An error occured while trying to deactivate the substitutionId {SubstitutionId} for team {SubstitutionTeamId}`,
        substitution.substituteId,
        substitution.teamId
      );
      await logToDB("error", error, request, context);
    }
  }

  if (responses.length > 0) {
    logger.info(`${logPrefix} - Create statistics for the deactivated substitutions`);
    for (const stat of stats) {
      await createStats(stat);
    }
  }

  logger.info(`${logPrefix} - Deactivated {SubstitutionCount}' substitutions`, responses.length);
  await logToDB(
    "info",
    {
      message: `Deactivated '${responses.length}' substitutions`,
      substitutions: responses
    },
    request,
    context
  );

  return responses;
};

export const activateSubstitutions = async (onlyFirst: boolean | undefined = false, request?: HttpRequest, context?: InvocationContext): Promise<unknown[] | undefined> => {
  const logPrefix: string = "activateSubstitutions - graphJobs.js";
  const mongoClient: Awaited<ReturnType<typeof getMongoClient>> = await getMongoClient();

  const query: Record<string, unknown> = { status: "pending" };
  let pendingSubstitutions: Substitution[] = (await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.SUBSTITUTIONS_COLLECTION).find(query).toArray()) as unknown as Substitution[];

  if (!pendingSubstitutions || pendingSubstitutions.length === 0) {
    logger.info(`${logPrefix} - No pending substitutions found`);
    return;
  }

  if (onlyFirst && pendingSubstitutions.length > 0 && pendingSubstitutions[0]) {
    logger.info(`${logPrefix} - onlyFirst is true. Only activate the first substitution`);
    pendingSubstitutions = [pendingSubstitutions[0]];
  }

  const responses: unknown[] = [];
  const stats: StatEntry[] = [];

  for (const substitution of pendingSubstitutions) {
    try {
      if (!substitution.teamId) {
        logger.error(`${logPrefix} - Substitution '{SubstitutionId}' missing teamId`, substitution._id.toString());
        throw new Error(`Substitution '${substitution._id}' missing teamId`);
      }

      if (!substitution.substituteId) {
        logger.error(`${logPrefix} - Substitution '{SubstitutionId}' missing substituteId`, substitution._id.toString());
        throw new Error(`Substitution '${substitution._id}' missing substituteId`);
      }

      logger.info(`${logPrefix} - Add the substitute as owner to the team`);
      try {
        await addGroupOwner(substitution.teamId, substitution.substituteId);
      } catch (error) {
        logger.errorException(error, `${logPrefix} - An error occured while trying to add the substitute as owner to the team`);
        await logToDB("error", error, request, context);
      }

      const updatedSub: UpdateResult = await mongoClient
        .db(mongoDB.DB_NAME)
        .collection(mongoDB.SUBSTITUTIONS_COLLECTION)
        .updateOne({ _id: substitution._id }, { $set: { status: "active", updatedTimestamp: new Date() } });
      responses.push(updatedSub);
      stats.push({
        teamId: substitution.teamId,
        status: "active",
        description: "Substitute activated"
      });
    } catch (error) {
      logger.errorException(error, `${logPrefix} - An error occured while trying to activate the substitution`);
      await logToDB("error", error, request, context);
    }

    await logToDB(
      "info",
      {
        message: `Activated '${responses.length}' substitutions`,
        substitutions: responses
      },
      request,
      context
    );

    for (const stat of stats) {
      await createStats(stat);
    }

    return responses;
  }

  return responses;
};

export const getEmployeeInfo = async (requestor: Requestor): Promise<GraphUser> => {
  const logPrefix: string = "getEmployeeInfo";
  const info: GraphUser | null = await getAdditionalRequestorInfo(requestor);

  if (!info || !info.jobTitle || !info.department || !info.officeLocation || !info.companyName) {
    logger.error(`${logPrefix} - Missing required properties in the returned object`);
    throw new Error("Missing required properties in the returned object");
  }

  return info;
};
