import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { logger } from "@vestfoldfylke/loglady";
import { ObjectId } from "mongodb";
import { mongoDB } from "../../config.js";
import { prepareRequest } from "../lib/auth/requestor.js";
import { logToDB } from "../lib/jobs/logToDB.js";
import { getMongoClient } from "../lib/mongoClient.js";

const handler = async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
  let logPrefix = "schools";

  const { requestor } = await prepareRequest(request);
  const validRoles = ["App.Config", "App.Admin"];
  const requestBody = await request.text();

  if (!requestor.roles?.some((role) => validRoles.includes(role))) {
    logger.warn(
      `${logPrefix} - Unauthorized. The requestor does not have the required role to perform this action. Requestor: {RequesterName} ({RequesterId}). Roles: {@Roles}`,
      requestor.name,
      requestor.id,
      requestor.roles?.join(", ")
    );
    throw new Error("Unauthorized. You do not have the required role to perform this action.");
  }

  const mongoClient = await getMongoClient();

  if (request.method === "GET") {
    logPrefix = "schools - get";
    try {
      logger.info(`${logPrefix} - Get the schools`);
      const schools = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.SCHOOLS_COLLECTION).find().sort({ name: 1 }).toArray();
      logger.info(`${logPrefix} - Found {SchoolCount} schools`, schools.length);
      return { status: 200, jsonBody: schools };
    } catch (error) {
      logger.errorException(error, `${logPrefix} - An error occured while trying to get the schools`);
      await logToDB("error", error, request, context, requestor);
      return { status: 500, jsonBody: { error: error instanceof Error ? error.message : String(error) } };
    }
  }

  if (request.method === "POST") {
    logPrefix = "schools - post";
    try {
      logger.info(`${logPrefix} - Post the school to the database`);
      const school = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.SCHOOLS_COLLECTION).insertOne(JSON.parse(requestBody));
      logger.info(`${logPrefix} - School posted to the database with id {InsertedId}`, school.insertedId.toString());
      await logToDB("info", school, request, context, requestor);
      return { status: 201, jsonBody: school };
    } catch (error) {
      logger.errorException(error, `${logPrefix} - An error occured while trying to post the school to the database`);
      await logToDB("error", error, request, context, requestor);
      return { status: 500, jsonBody: { error: error instanceof Error ? error.message : String(error) } };
    }
  }

  if (request.method === "PUT") {
    logPrefix = "schools - put";
    if (!request.params.id) {
      logger.warn(`${logPrefix} - No id provided`);
      throw new Error("No id provided");
    }
    try {
      logger.info(`${logPrefix} - Update the school with the provided id {Id}`, request.params.id);
      const school = await mongoClient
        .db(mongoDB.DB_NAME)
        .collection(mongoDB.SCHOOLS_COLLECTION)
        .updateOne({ _id: new ObjectId(request.params.id) }, { $set: { permittedSchools: JSON.parse(requestBody) } });
      logger.info(`${logPrefix} - School updated with id {Id}`, request.params.id);
      await logToDB("info", school, request, context, requestor);
      return { status: 200, jsonBody: school };
    } catch (error) {
      logger.errorException(error, `${logPrefix} - An error occured while trying to update the school`);
      await logToDB("error", error, request, context, requestor);
      return { status: 500, jsonBody: { error: error instanceof Error ? error.message : String(error) } };
    }
  }

  return { status: 405, jsonBody: { error: "Method not allowed" } };
};

app.http("schools", {
  methods: ["GET", "POST", "PUT"],
  authLevel: "anonymous",
  route: "schools/{id?}",
  handler
});
