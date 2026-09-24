import { logger } from "@vestfoldfylke/loglady";
import {
  type Db,
  type DeleteResult,
  type Document,
  type Filter,
  type FindCursor,
  type InsertOneResult,
  type MongoClient,
  ObjectId,
  type OptionalId,
  type Sort,
  type SortDirection,
  type UpdateFilter,
  type UpdateResult,
  type WithId
} from "mongodb";
import { mongoDB } from "../../config.js";
import { getMongoClient } from "./mongoClient.js";

type FindSort = {
  sort: Sort | string;
  direction?: SortDirection;
};

let mongoDb: Db | null;

const getMongoDb = async (): Promise<Db> => {
  if (mongoDb) {
    return mongoDb;
  }

  const mongoClient: MongoClient = await getMongoClient();
  mongoDb = mongoClient.db(mongoDB.DB_NAME);

  return mongoDb;
};

export const removeSubstitution = async (id: ObjectId | string): Promise<void> => {
  if (!id) {
    logger.error("removeSubstitution - Cannot remove a substitution if 'id' is not specified");
    throw new Error("Cannot remove a substitution if 'id' is not specified");
  }

  const db: Db = await getMongoDb();
  const objectId: ObjectId = typeof id === "string" ? new ObjectId(id) : id;

  try {
    const result: DeleteResult = await db.collection(mongoDB.SUBSTITUTIONS_COLLECTION).deleteOne({ _id: objectId });
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

export const findByQuery = async <T>(collectionName: string, query?: Filter<Document>, sorting?: FindSort): Promise<T> => {
  const db: Db = await getMongoDb();

  const findCursor: FindCursor<WithId<Document>> = query ? db.collection(collectionName).find(query) : db.collection(collectionName).find();

  if (!sorting) {
    return (await findCursor.toArray()) as T;
  }

  return (await findCursor.sort(sorting.sort, sorting.direction).toArray()) as T;
};

export const findOneByQuery = async <T>(collectionName: string, query: Filter<Document>): Promise<T | null> => {
  const result: T[] = await findByQuery<T[]>(collectionName, query);

  return result && result.length > 0 ? (result[0] as T) : null;
};

export const insertOne = async (collectionName: string, entry: OptionalId<Document>): Promise<InsertOneResult> => {
  const db: Db = await getMongoDb();

  return await db.collection(collectionName).insertOne(entry);
};

export const updateOne = async (collectionName: string, filter: Filter<Document>, update: Document[] | UpdateFilter<Document>): Promise<UpdateResult> => {
  const db: Db = await getMongoDb();

  return await db.collection(collectionName).updateOne(filter, update);
};
