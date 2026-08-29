import { logger } from "@vestfoldfylke/loglady";
import { mongoDB } from "../../../config.js";
import type { PermittedLocation } from "../../types/graph.js";
import { getMongoClient } from "../mongoClient.js";

type SchoolDoc = {
  _id: unknown;
  name: string;
  permittedSchools?: PermittedLocation[];
};

export const getPermittedLocations = async (company: string): Promise<PermittedLocation[]> => {
  const logPrefix: string = "getPermittedLocations";
  const permittedLocations: PermittedLocation[] = [];

  const mongoClient: Awaited<ReturnType<typeof getMongoClient>> = await getMongoClient();

  const school: SchoolDoc | null = (await mongoClient.db(mongoDB.DB_NAME).collection<SchoolDoc>(mongoDB.SCHOOLS_COLLECTION).findOne({ name: company })) as SchoolDoc | null;

  if (!school) {
    logger.error(`${logPrefix} - School not found for company '{Company}'`, company);
    throw new Error("School not found");
  }

  logger.info(`${logPrefix} - Add the users own school to the permitted locations`);
  if (school._id && school.name) {
    permittedLocations.push({
      _id: school._id,
      name: school.name
    });
  }

  logger.info(`${logPrefix} - Add any other permitted schools to the permitted locations`);
  if (school.permittedSchools && Array.isArray(school.permittedSchools)) {
    for (const location of school.permittedSchools) {
      if (location._id && location.name) {
        permittedLocations.push({
          _id: location._id,
          name: location.name
        });
      }
    }
  }

  return permittedLocations;
};
