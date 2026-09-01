import { logger } from "@vestfoldfylke/loglady";
import { mongoDB } from "../../../config.js";
import type { PermittedLocation } from "../../types/graph.js";
import type { SchoolDoc } from "../../types/mongo.js";
import { findOneByQuery } from "../mongoCalls.js";

export const getPermittedLocations = async (company: string): Promise<PermittedLocation[]> => {
  const logPrefix: string = "getPermittedLocations";
  const permittedLocations: PermittedLocation[] = [];

  const school: SchoolDoc | null = await findOneByQuery<SchoolDoc>(mongoDB.SCHOOLS_COLLECTION, { name: company });

  if (!school) {
    logger.error(`${logPrefix} - School not found for company '{Company}'`, company);
    throw new Error(`School not found for company '${company}'`);
  }

  logger.info(`${logPrefix} - Add the users own school to the permitted locations`);
  if (school._id && school.name) {
    permittedLocations.push({
      _id: school._id,
      name: school.name
    });
  }

  logger.info(`${logPrefix} - Add any other permitted schools to the permitted locations`);

  if (!(school.permittedSchools && Array.isArray(school.permittedSchools))) {
    return permittedLocations;
  }

  for (const location of school.permittedSchools) {
    if (location._id && location.name) {
      permittedLocations.push({
        _id: location._id,
        name: location.name
      });
    }
  }

  return permittedLocations;
};
