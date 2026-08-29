const { logger } = require("@vestfoldfylke/loglady");
const { MongoClient } = require("mongodb");
const { mongoDB } = require("../../config.js");

let client = null;

/**
 *
 * @returns { import('mongodb').MongoClient }
 */
const getMongoClient = async () => {
  if (!client) {
    logger.info("mongo-client - Client does not exist - creating");
    client = new MongoClient(mongoDB.MONGODB_CONNECTION_STRING);
    logger.info("mongo-client - Client connected");
  }
  return client;
};

const closeMongoClient = () => {
  if (client) client.close();
  client = null;
};

module.exports = { getMongoClient, closeMongoClient };
