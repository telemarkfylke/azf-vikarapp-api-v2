import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { logger } from "@vestfoldfylke/loglady";
import { type InsertOneResult, ObjectId, type UpdateResult } from "mongodb";
import { mongoDB } from "../../config.js";
import { prepareRequest } from "../lib/auth/requestor.js";
import { getOwnedObjects, getUser } from "../lib/callGraph.js";
import { getPermittedLocations } from "../lib/jobs/getPermittedLocations.js";
import { activateSubstitutions, deactivateSubstitutions } from "../lib/jobs/graphJobs.js";
import { logToDB } from "../lib/jobs/logToDB.js";
import { getMongoClient } from "../lib/mongoClient.js";
import type { GraphOwnedObject, GraphUser, PermittedLocation } from "../types/graph.js";
import type { Requestor } from "../types/requestor.js";
import type { Substitution, SubstitutionRequest } from "../types/substitution.js";

type EnrichedSubstitute = GraphUser & {
  substitutions?: Substitution[];
  permittedLocations?: PermittedLocation[];
};

type EnrichedTeacher = GraphUser & {
  owned: GraphOwnedObject[];
};

type RenewedSubstitution = {
  extendedSubstitution: SubstitutionRequest;
  _id: ObjectId;
  expirationTimestamp: Date;
};

type RenewedExpiredSubstitution = {
  expiredSubstitution: SubstitutionRequest;
  _id: ObjectId;
  expirationTimestamp: Date;
};

const errorBody = (error: unknown): { error: string } => ({
  error: error instanceof Error ? error.message : String(error)
});

const validatePost = (requestBody: SubstitutionRequest[], requestor: Requestor, logPrefix: string): SubstitutionRequest[] => {
  const deduped: SubstitutionRequest[] = requestBody.filter(
    (item: SubstitutionRequest, index: number, self: SubstitutionRequest[]) => index === self.findIndex((t: SubstitutionRequest) => t.teacherUpn === item.teacherUpn && t.teamId === item.teamId)
  );

  logger.info(`${logPrefix} - Make sure all the required properties are provided`);
  for (const substitution of deduped) {
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

  return deduped;
};

const validatePut = (body: unknown, requestor: Requestor, logPrefix: string): string[] => {
  if (!body) {
    logger.error(`${logPrefix} - No body provided`);
    throw new Error("No body provided");
  }

  if (!Array.isArray(body)) {
    logger.error(`${logPrefix} - The body must be an array`);
    throw new Error("The body must be an array");
  }

  if (!requestor.roles.includes("App.Config")) {
    logger.warn(
      `${logPrefix} - Unauthorized. The requestor does not have the required role to perform this action. Requestor: {RequestorName} ({RequestorId}). Roles: {@Roles}`,
      requestor.name,
      requestor.id,
      requestor.roles.join(", ")
    );
    throw new Error("Unauthorized. You do not have the required role to perform this action.");
  }

  for (const id of body) {
    if (typeof id !== "string") {
      logger.warn(`${logPrefix} - The id '{Id}' is not of type 'string'`, id);
      throw new Error(`The id '${id}' is not of type 'string'`);
    }
  }

  return body as string[];
};

const handleGet = async (request: HttpRequest, context: InvocationContext, requestor: Requestor): Promise<HttpResponseInit> => {
  const logPrefix: string = "substitutions - get";
  const status: string | null | undefined = request.query?.get("status");
  const teacherUpn: string | null | undefined = request.query?.get("teacherUpn");
  const substituteUpn: string | null | undefined = request.query?.get("substituteUpn");
  const yearsQuery: string | null | undefined = request.query?.get("years");
  const years: string[] = yearsQuery ? (yearsQuery.includes(",") ? yearsQuery.split(",") : [yearsQuery]) : [];

  if (!requestor.roles.includes("App.Admin") && ((!substituteUpn && !teacherUpn) || (substituteUpn !== requestor.upn && teacherUpn !== requestor.upn))) {
    logger.warn(
      `${logPrefix} - Unauthorized. The requestor does not have the required role to perform this action. Requestor: {RequestorName} ({RequestorId}). Roles: {@Roles}`,
      requestor.name,
      requestor.id,
      requestor.roles.join(", ")
    );
    throw new Error("Unauthorized. You do not have the required role to perform this action.");
  }

  logger.info(`${logPrefix} - Define the filter`);
  const clauses: Record<string, unknown>[] = [];
  if (status) {
    clauses.push({ status });
  }

  if (teacherUpn) {
    clauses.push({ teacherUpn });
  }

  if (substituteUpn) {
    clauses.push({ substituteUpn });
  }

  if (years.length > 0) {
    const $or: Record<string, unknown>[] = years.map((y: string) => {
      const year: number = Number.parseInt(y, 10);
      return {
        createdTimestamp: {
          $gt: new Date(year, 0, 1, 1),
          $lt: new Date(year, 12, 31, 25)
        }
      };
    });
    clauses.push({ $or });
  }

  const filter: Record<string, unknown> = clauses.length > 0 ? { $and: clauses } : {};

  const mongoClient: Awaited<ReturnType<typeof getMongoClient>> = await getMongoClient();
  try {
    logger.info(`${logPrefix} - Query the database`);
    const substitutions: unknown[] = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.SUBSTITUTIONS_COLLECTION).find(filter).sort({ expirationTimestamp: -1 }).toArray();
    logger.info(`${logPrefix} - Found {SubstitutionCount} substitutions`, substitutions.length);
    return {
      status: 200,
      jsonBody: substitutions
    };
  } catch (error) {
    logger.errorException(error, `${logPrefix} - An error occured while trying to get the substitutions`);
    await logToDB("error", error, request, context, requestor);
    return {
      status: 500,
      jsonBody: errorBody(error)
    };
  }
};

const handlePost = async (request: HttpRequest, context: InvocationContext, requestor: Requestor, requestBody: SubstitutionRequest[]): Promise<HttpResponseInit> => {
  const logPrefix: string = "substitutions - post";
  const mongoClient: Awaited<ReturnType<typeof getMongoClient>> = await getMongoClient();

  const uniqueSubstituteUpns: string[] = [...new Set(requestBody.map((i: SubstitutionRequest) => i.substituteUpn))];
  const uniqueTeacherUpns: string[] = [...new Set(requestBody.map((i: SubstitutionRequest) => i.teacherUpn))];

  const substitutes: EnrichedSubstitute[] = [];
  for (const upn of uniqueSubstituteUpns) {
    const substitute: EnrichedSubstitute | null = (await getUser(upn)) as EnrichedSubstitute | null;
    if (!substitute) {
      logger.error(`${logPrefix} - Could not find the substitute with upn {Upn}`, upn);
      throw new Error(`Could not find the substitute with upn ${upn}`);
    }

    const existingSubstitutions: unknown[] = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.SUBSTITUTIONS_COLLECTION).find({ substituteId: substitute.id }).toArray();
    substitute.substitutions = existingSubstitutions as unknown as Substitution[];
    logger.info(`${logPrefix} - Found {SubstitutionCount} existing substitutions for the substitute {Upn}`, substitute.substitutions.length, upn);

    if (!requestor.roles.includes("App.Admin")) {
      logger.info(`${logPrefix} - Check if the substitute {Upn} has the required permissions to substitute for the teacher`, upn);
      if (!substitute.companyName) {
        logger.error(`${logPrefix} - Substitute {Upn} has no companyName`, upn);
        throw new Error(`Substitute ${upn} has no companyName`);
      }

      substitute.permittedLocations = await getPermittedLocations(substitute.companyName);
      if (!substitute.permittedLocations || !Array.isArray(substitute.permittedLocations) || substitute.permittedLocations.length === 0) {
        logger.error(`${logPrefix} - Substitute {Upn} does not have any permitted locations`, upn);
        throw new Error(`Substitute ${upn} does not have any permitted locations`);
      }
    }

    substitutes.push(substitute);
  }

  const teachers: EnrichedTeacher[] = [];
  for (const upn of uniqueTeacherUpns) {
    const teacher: GraphUser | null = (await getUser(upn)) as GraphUser | null;
    if (!teacher?.id) {
      logger.error(`${logPrefix} - Could not find the teacher with upn {Upn}`, upn);
      throw new Error(`Could not find the teacher with upn ${upn}`);
    }

    let ownedResources: GraphOwnedObject[] | null = await getOwnedObjects(upn);
    if (!ownedResources) {
      logger.error(`${logPrefix} - Could not find any owned resources for teacher {Upn}`, upn);
      throw new Error(`Could not find any owned resources for teacher ${upn}`);
    }

    if ((ownedResources as unknown as { value?: GraphOwnedObject[] }).value) {
      ownedResources = (ownedResources as unknown as { value: GraphOwnedObject[] }).value;
    }

    teachers.push({
      ...teacher,
      owned: ownedResources
    });
  }

  const expirationTimestamp: Date = new Date(new Date().setHours(1, 0, 0, 0) + 3 * 24 * 60 * 60 * 1000);
  const newSubstitutions: Substitution[] = [];
  const renewedSubstitutions: RenewedSubstitution[] = [];
  const renewedExpiredSubstitutions: RenewedExpiredSubstitution[] = [];

  try {
    for (const substitution of requestBody) {
      const substitute: EnrichedSubstitute | undefined = substitutes.find((i: EnrichedSubstitute) => i.userPrincipalName === substitution.substituteUpn);
      const teacher: EnrichedTeacher | undefined = teachers.find((i: EnrichedTeacher) => i.userPrincipalName === substitution.teacherUpn);
      if (!substitute || !teacher) {
        throw new Error(`Missing substitute or teacher for request ${substitution.substituteUpn} / ${substitution.teacherUpn}`);
      }

      logger.info(
        `${logPrefix} - Make sure that the substitute {SubstituteUserPrincipalName} has the required permissions to substitute for {TeacherUserPrincipalName}`,
        substitute.userPrincipalName,
        teacher.userPrincipalName
      );
      if (!requestor.roles.includes("App.Admin")) {
        if (!Array.isArray(substitute.permittedLocations) || substitute.permittedLocations.length === 0) {
          logger.error(
            `${logPrefix} - Was not able to determine if the substitute {SubstituteUserPrincipalName} has the required permissions to substitute for {TeacherUserPrincipalName}`,
            substitute.userPrincipalName,
            teacher.userPrincipalName
          );
          throw new Error(`Was not able to determine if the substitute ${substitute.userPrincipalName} has the required permissions to substitute for ${teacher.userPrincipalName}`);
        }

        const permittedSchoolNames: string[] = substitute.permittedLocations.map((i: PermittedLocation) => i.name);
        if (!teacher.companyName || !permittedSchoolNames.includes(teacher.companyName)) {
          logger.error(
            `${logPrefix} - The substitute {SubstituteUserPrincipalName} does not have the required permissions to substitute for {TeacherUserPrincipalName}`,
            substitute.userPrincipalName,
            teacher.userPrincipalName
          );
          throw new Error(`The substitute ${substitute.userPrincipalName} does not have the required permissions to substitute for ${teacher.userPrincipalName}`);
        }
      }

      const team: GraphOwnedObject | undefined = teacher.owned.find((i: GraphOwnedObject) => i.id === substitution.teamId);
      if (!team) {
        logger.error(`${logPrefix} - The teacher {TeacherUserPrincipalName} does not own the requested team {SubstitutionTeamId}`, teacher.userPrincipalName, substitution.teamId);
        throw new Error(`The teacher ${teacher.userPrincipalName} does not own the requested team ${substitution.teamId}`);
      }

      if (team["@odata.type"]?.toLowerCase() !== "#microsoft.graph.group") {
        logger.error(`${logPrefix} - The requested team {SubstitutionTeamId} is not a valid team`, substitution.teamId);
        throw new Error(`The requested team ${substitution.teamId} is not a valid team`);
      }

      if (!team.mail?.toLowerCase().startsWith("section_")) {
        logger.error(`${logPrefix} - The requested team {SubstitutionTeamId} is not a school team`, substitution.teamId);
        throw new Error(`The requested team ${substitution.teamId} is not a school team`);
      }

      const activeSubstitution: Substitution | undefined =
        substitution.status === "active" && substitution._id
          ? substitute.substitutions?.find((sub: Substitution) => sub._id.toString() === substitution._id)
          : substitute.substitutions?.find(
              (sub: Substitution) => sub.teamId === substitution.teamId && sub.teacherUpn === substitution.teacherUpn && sub.substituteUpn === substitution.substituteUpn && sub.status === "active"
            );

      const expiredSubstitution: Substitution | undefined =
        substitution.status === "expired" && substitution._id
          ? substitute.substitutions?.find((sub: Substitution) => sub._id.toString() === substitution._id)
          : substitute.substitutions?.find(
              (sub: Substitution) => sub.teamId === substitution.teamId && sub.teacherUpn === substitution.teacherUpn && sub.substituteUpn === substitution.substituteUpn && sub.status === "expired"
            );

      if (activeSubstitution) {
        logger.info(`${logPrefix} - The selected substitution with id {ActiveSubstitutionId} is currently active and will be renewed`, activeSubstitution._id.toString());
        renewedSubstitutions.push({
          extendedSubstitution: { ...substitution },
          _id: activeSubstitution._id,
          expirationTimestamp
        });
      } else if (expiredSubstitution) {
        logger.info(`${logPrefix} - The selected substitution with id {ExpiredSubstitutionId} is currently expired and will be renewed`, expiredSubstitution._id.toString());
        renewedExpiredSubstitutions.push({
          expiredSubstitution: { ...substitution },
          _id: expiredSubstitution._id,
          expirationTimestamp
        });
      } else {
        let teamSdsId: string = team.mail;
        if (teamSdsId.includes("_")) {
          teamSdsId = teamSdsId.substring(teamSdsId.indexOf("_") + 1);
        }

        newSubstitutions.push({
          _id: new ObjectId(),
          status: "pending",
          teacherId: teacher.id,
          teacherName: teacher.displayName ?? "",
          teacherUpn: teacher.userPrincipalName,
          substituteId: substitute.id,
          substituteName: substitute.displayName ?? "",
          substituteUpn: substitute.userPrincipalName,
          teamId: team.id,
          teamName: team.displayName,
          teamEmail: team.mail,
          teamSdsId,
          substitutionUpdated: 0,
          expirationTimestamp,
          createdTimestamp: new Date()
        });
      }
    }

    let documents: unknown[] = [];
    for (const newSubstitution of newSubstitutions) {
      try {
        logger.info(`${logPrefix} - Insert the new substitution`);
        const result: InsertOneResult = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.SUBSTITUTIONS_COLLECTION).insertOne(newSubstitution);
        documents.push(result);
        try {
          await activateSubstitutions(false, request, context);
          await logToDB("info", newSubstitution, request, context, requestor);
        } catch (error) {
          logger.errorException(error, `${logPrefix} - An error occured while trying to create logentry in the database`);
          await logToDB("error", error, request, context, requestor);
          return {
            status: 404,
            jsonBody: errorBody(error)
          };
        }
      } catch (error) {
        logger.errorException(error, `${logPrefix} - An error occured while trying to Insert the new substitutions into the DB`);
        await logToDB("error", error, request, context, requestor);
        return {
          status: 404,
          jsonBody: errorBody(error)
        };
      }
    }

    for (const renewal of renewedSubstitutions) {
      try {
        logger.info(`${logPrefix} - Update the expirationTimestamp on the renewed substitution with id {RenewalId}`, renewal._id.toString());
        const result: UpdateResult = await mongoClient
          .db(mongoDB.DB_NAME)
          .collection(mongoDB.SUBSTITUTIONS_COLLECTION)
          .updateOne({ _id: new ObjectId(renewal._id) }, { $set: { expirationTimestamp: renewal.expirationTimestamp, updatedTimestamp: new Date() }, $inc: { substitutionUpdated: 1 } });
        documents = [...documents, result];
        try {
          await logToDB("info", renewal, request, context, requestor);
        } catch (error) {
          logger.errorException(error, `${logPrefix} - An error occured while trying to create logentry in the database`);
          await logToDB("error", error, request, context, requestor);
          return {
            status: 404,
            jsonBody: errorBody(error)
          };
        }
      } catch (error) {
        logger.errorException(error, `${logPrefix} - An error occured while trying to Update the renewed substitutions in the DB`);
        await logToDB("error", error, request, context, requestor);
        return {
          status: 404,
          jsonBody: errorBody(error)
        };
      }
    }

    for (const renewal of renewedExpiredSubstitutions) {
      try {
        logger.info(`${logPrefix} - Update the expired substitution with id {RenewalId} to pending`, renewal._id.toString());
        const result: UpdateResult = await mongoClient
          .db(mongoDB.DB_NAME)
          .collection(mongoDB.SUBSTITUTIONS_COLLECTION)
          .updateOne(
            { _id: new ObjectId(renewal._id) },
            { $set: { expirationTimestamp: renewal.expirationTimestamp, updatedTimestamp: new Date(), status: "pending" }, $inc: { substitutionUpdated: 1 } }
          );
        documents = [...documents, result];
        try {
          await activateSubstitutions(false, request, context);
          await logToDB("info", renewal, request, context, requestor);
        } catch (error) {
          logger.errorException(error, `${logPrefix} - An error occured while trying to create logentry in the database`);
          await logToDB("error", error, request, context, requestor);
          return {
            status: 404,
            jsonBody: errorBody(error)
          };
        }
      } catch (error) {
        logger.errorException(error, `${logPrefix} - An error occured while trying to Update the renewed substitutions in the DB`);
        await logToDB("error", error, request, context, requestor);
        return {
          status: 404,
          jsonBody: errorBody(error)
        };
      }
    }

    return {
      status: 201,
      jsonBody: documents
    };
  } catch (error) {
    logger.errorException(error, `${logPrefix} - An error occured while trying to create/renew the substitutions`);
    await logToDB("error", error, request, context, requestor);
    return {
      status: 404,
      jsonBody: errorBody(error)
    };
  }
};

const handlePut = async (request: HttpRequest, context: InvocationContext, requestor: Requestor, ids: string[]): Promise<HttpResponseInit> => {
  const logPrefix: string = "substitutions - put";
  const mongoClient: Awaited<ReturnType<typeof getMongoClient>> = await getMongoClient();

  try {
    if (ids.length === 0) {
      logger.warn(`${logPrefix} - No ids provided`);
      throw new Error("No ids provided");
    }

    logger.info(`${logPrefix} - Get the substitutions from the ids`);
    const objectIds: ObjectId[] = ids.map((id: string) => new ObjectId(id));
    const substitutions: Substitution[] = (await mongoClient
      .db(mongoDB.DB_NAME)
      .collection(mongoDB.SUBSTITUTIONS_COLLECTION)
      .find({ _id: { $in: objectIds } })
      .toArray()) as unknown as Substitution[];

    if (substitutions.length === 0) {
      logger.warn(`${logPrefix} - No substitutions found`);
      throw new Error("No substitutions found");
    }

    logger.info(`${logPrefix} - Found {SubstitutionCount} substitutions`, substitutions.length);

    logger.info(`${logPrefix} - Try to deactivate the substitutions`);
    const response: unknown[] = await deactivateSubstitutions(undefined, substitutions, request, context);

    logger.info(`${logPrefix} - Return the deactivated substitutions`);
    return {
      status: 201,
      jsonBody: response
    };
  } catch (error) {
    logger.errorException(error, `${logPrefix} - An error occured while trying to deactivate the substitutions`);
    await logToDB("error", error, request, context, requestor);
    return {
      status: 500,
      jsonBody: errorBody(error)
    };
  }
};

const handler = async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
  const { requestor } = await prepareRequest(request);
  const logPrefix: string = "substitutions - validate";

  if (request.method === "POST") {
    const rawBody: unknown = (await request.json()) as unknown;
    if (!Array.isArray(rawBody)) {
      logger.error(`${logPrefix} - The body must be an array`);
      throw new Error("The body must be an array");
    }

    const requestBody: SubstitutionRequest[] = validatePost(rawBody as SubstitutionRequest[], requestor, logPrefix);
    return handlePost(request, context, requestor, requestBody);
  }

  if (request.method === "PUT") {
    const rawBody: unknown = (await request.json()) as unknown;
    const ids: string[] = validatePut(rawBody, requestor, logPrefix);
    return handlePut(request, context, requestor, ids);
  }

  if (request.method === "GET") {
    return handleGet(request, context, requestor);
  }

  return {
    status: 405,
    jsonBody: { error: "Method not allowed" }
  };
};

app.http("substitutions", {
  methods: ["GET", "POST", "PUT"],
  authLevel: "anonymous",
  route: "substitutions",
  handler
});
