import { logger } from "@vestfoldfylke/loglady";
import { ObjectId } from "mongodb";
import { mongoDB } from "../../config.js";
import { getMongoClient } from "./mongoClient.js";

export const removeSubstitution = async (id: ObjectId | string): Promise<void> => {
  if (!id) {
    logger.error("removeSubstitution - Cannot remove a substitution if 'id' is not specified");
    throw new Error("Cannot remove a substitution if 'id' is not specified");
  }

  const mongoClient = await getMongoClient();
  const objectId = typeof id === "string" ? new ObjectId(id) : id;

  try {
    const result = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.SUBSTITUTIONS_COLLECTION).deleteOne({ _id: objectId });
    if (result.deletedCount === 0) {
      logger.error("removeSubstitution - No substitution found with id '{Id}'", objectId.toString());
      throw new Error(`No substitution found with id '${objectId}'`);
    }

    logger.info("removeSubstitution - Successfully removed {DeletedCount} substitutions with id '{Id}'", result.deletedCount, objectId.toString());
  } catch (error) {
    logger.errorException(error, "removeSubstitution - An error occured while trying to remove the substitution");
    throw error;
  }
};
