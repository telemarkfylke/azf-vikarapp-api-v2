const { app } = require("@azure/functions");
const { logger } = require("@vestfoldfylke/loglady");
const { ObjectId } = require("mongodb");
const { mongoDB } = require("../../config.js");
const { getMongoClient } = require("../lib/mongoClient.js");
const { logToDB } = require("../lib/jobs/logToDB.js");
const { prepareRequest } = require("../lib/auth/requestor.js");

app.http("schools", {
  methods: ["GET", "POST", "PUT"],
  authLevel: "anonymous",
  route: "schools/{id?}", // id is optional, make sure to check if it is provided
  handler: async (request, context) => {
    let logPrefix = "schools";

    // Make sure all the required properties are provided
    const { requestor } = await prepareRequest(request);
    const validRoles = ["App.Config", "App.Admin"];
    const requestBody = await request.text();
    // Make sure the requestor has the correct role (App.Config)
    if (!requestor.roles?.some((roles) => validRoles.includes(roles))) {
      logger.warn(
        `${logPrefix} - Unauthorized. The requestor does not have the required role to perform this action. Requestor: {RequesterName} ({RequesterId}). Roles: {@Roles}`,
        requestor.name,
        requestor.id,
        requestor.roles?.join(", ")
      );
      throw new Error("Unauthorized. You do not have the required role to perform this action.");
    }

    // Connect to the database
    const mongoClient = await getMongoClient();

    // Determine the method
    if (request.method === "GET") {
      // Get the schools
      let schools;
      logPrefix = "schools - get";

      try {
        logger.info(`${logPrefix} - Get the schools`);
        schools = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.SCHOOLS_COLLECTION).find().sort({ name: 1 }).toArray();
        logger.info(`${logPrefix} - Found {SchoolCount} schools`, schools.length);
      } catch (error) {
        logger.errorException(error, `${logPrefix} - An error occured while trying to get the schools`);
        await logToDB("error", error, request, context, requestor);
      }

      // // Return the schools
      return { status: 200, jsonBody: schools };
    }
    if (request.method === "POST") {
      let school;
      logPrefix = "schools - post";

      // Post the school to the database from request.body
      try {
        logger.info(`${logPrefix} - Post the school to the database`);
        school = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.SCHOOLS_COLLECTION).insertOne(JSON.parse(requestBody));
        logger.info(`${logPrefix} - School posted to the database with id {InsertedId}`, school.insertedId);
        await logToDB("info", school, request, context, requestor);
      } catch (error) {
        logger.errorException(error, `${logPrefix} - An error occured while trying to post the school to the database`);
        await logToDB("error", error, request, context, requestor);
      }

      // Return the school posted to the database
      return { status: 201, jsonBody: school };
    }
    if (request.method === "PUT") {
      // Update the school with the provided id
      let school;
      logPrefix = "schools - put";

      // Make sure the id is provided
      if (!request.params.id) {
        logger.warn(`${logPrefix} - No id provided`);
        throw new Error("No id provided");
      }
      try {
        logger.info(`${logPrefix} - Update the school with the provided id {Id}`, request.params.id);
        // Find the document with the provided ._id and update the permittedSchools array in the document
        school = await mongoClient
          .db(mongoDB.DB_NAME)
          .collection(mongoDB.SCHOOLS_COLLECTION)
          .updateOne({ _id: new ObjectId(request.params.id) }, { $set: { permittedSchools: JSON.parse(requestBody) } }, { returnDocument: "after" });
        logger.info(`${logPrefix} - School updated with id {Id}`, request.params.id);
        await logToDB("info", school, request, context, requestor);
      } catch (error) {
        logger.errorException(error, `${logPrefix} - An error occured while trying to update the school`);
        await logToDB("error", error, request, context, requestor);
      }

      // Return the updated school
      return { status: 200, jsonBody: school };
    }
  }
});
