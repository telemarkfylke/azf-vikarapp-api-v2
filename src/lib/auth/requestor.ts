import type { HttpRequest } from "@azure/functions";
import { logger } from "@vestfoldfylke/loglady";
import type { GraphUser } from "../../types/graph.js";
import type { Requestor } from "../../types/requestor.js";
import { getAdditionalRequestorInfo } from "../callGraph.js";
import { auth } from "./auth.js";

type PrepareOptions = {
  required?: string[];
};

type PrepareResult = {
  requestor: Requestor;
};

export const prepareRequest = async (req: HttpRequest, options: PrepareOptions = {}): Promise<PrepareResult> => {
  const logPrefix: string = "prepareRequest";

  const missingProps: string[] = [];
  if (options.required) {
    for (const prop of options.required) {
      if (!prop.split(".").includes("body")) {
        if (!req.params[prop]) {
          missingProps.push(prop);
        }
      } else if (!(req as unknown as { body?: Record<string, unknown> }).body?.[prop]) {
        missingProps.push(prop);
      }
    }

    if (missingProps.length > 0) {
      logger.warn(`${logPrefix} - Missing required properties: {@RequiredPropertiesMissing}`, missingProps.join(", "));
      throw new Error(`Missing required property: ${missingProps.join(", ")}`);
    }
  }

  if (!req) {
    logger.warn(`${logPrefix} - No request object provided`);
    throw new Error("No request object provided");
  }

  const requestor: Requestor = await auth(req);

  if (!requestor.jobTitle || !requestor.department || !requestor.officeLocation || !requestor.company) {
    logger.info(`${logPrefix} - Requestor is missing jobTitle, department, officeLocation or company, getting them from the graph api`);
    const updatedRequestor: GraphUser | null = await getAdditionalRequestorInfo(requestor);
    if (updatedRequestor) {
      requestor.jobTitle = updatedRequestor.jobTitle;
      requestor.department = updatedRequestor.department;
      requestor.officeLocation = updatedRequestor.officeLocation;
      requestor.company = updatedRequestor.companyName;
    }
  }

  logger.info(`${logPrefix} - Returning the requestor object`);
  return { requestor };
};
