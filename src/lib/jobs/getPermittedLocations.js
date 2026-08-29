const { logger } = require("@vestfoldfylke/loglady");
const { mongoDB } = require("../../../config.js");
const { getMongoClient } = require("../mongoClient.js");

const getPermittedLocations = async (company) => {
  const logPrefix = "getPermittedLocations";
  const permittedLocations = [];

  // Connect to the database
  const mongoClient = await getMongoClient();

  // Find the school provided in company
  const school = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.SCHOOLS_COLLECTION).findOne({ name: company });

  // Validate that the school was found and exists
  if (!school) {
    logger.error(`${logPrefix} - School not found for company '{Company}'`, company);
    throw new Error("School not found");
  }

  // Add the users own school to the permitted locations
  logger.info(`${logPrefix} - Add the users own school to the permitted locations`);
  if (school._id && school.name) {
    permittedLocations.push({ _id: school._id, name: school.name });
  }

  // Add any other permitted schools to the permitted locations
  logger.info(`${logPrefix} - Add any other permitted schools to the permitted locations`);
  if (school.permittedSchools && Array.isArray(school.permittedSchools)) {
    for (const location of school.permittedSchools) {
      if (location._id && location.name) {
        permittedLocations.push({ _id: location._id, name: location.name });
      }
    }
  }

  // Return the permitted locations
  return permittedLocations;
};

module.exports = {
  getPermittedLocations
};
