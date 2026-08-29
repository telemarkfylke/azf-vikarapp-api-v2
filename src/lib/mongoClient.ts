import { logger } from "@vestfoldfylke/loglady";
import { MongoClient } from "mongodb";
import { mongoDB } from "../../config.js";

let client: MongoClient | null = null;

export const getMongoClient = async (): Promise<MongoClient> => {
  if (!client) {
    logger.info("mongo-client - Client does not exist - creating");
    client = new MongoClient(mongoDB.MONGODB_CONNECTION_STRING);
    logger.info("mongo-client - Client connected");
  }
  return client;
};

export const closeMongoClient = (): void => {
  if (client) client.close();
  client = null;
};
