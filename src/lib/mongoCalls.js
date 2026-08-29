const { logger } = require("@vestfoldfylke/loglady");
const { getMongoClient } = require("./mongoClient.js");
const { mongoDB } = require("../../config.js");

const removeSubstitution = async (id) => {
  if (!id) {
    logger.error("removeSubstitution - Cannot remove a substitution if 'id' is not specified");
    throw new Error("Cannot remove a substitution if 'id' is not specified");
  }

  // Connect to the database
  const mongoClient = await getMongoClient();

  // Remove the substitution from the database
  try {
    const result = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.SUBSTITUTIONS_COLLECTION).deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      logger.error("removeSubstitution - No substitution found with id '{Id}'", id);
      throw new Error(`No substitution found with id '${id}'`);
    }

    logger.info("removeSubstitution - Successfully removed {DeletedCount} substitutions with id '{Id}'", result.deletedCount, id);
  } catch (error) {
    logger.errorException(error, "removeSubstitution - An error occured while trying to remove the substitution");
    throw error;
  }
};

module.exports = {
  removeSubstitution
};
