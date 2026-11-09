import { logger } from "@vestfoldfylke/loglady";
import { fylke, statistics } from "../../../config.js";
import type { StatEntry } from "../../types/stats.js";

type StatObject = {
  system: string;
  engine: string;
  county: string;
  company: string;
  department: string;
  description: string;
  status: string;
  type: string;
};

const createStats = async (stat: StatEntry): Promise<boolean> => {
  const logPrefix: string = "createStats";
  logger.info(`${logPrefix} - Creating statistics for {Status} substitution`, stat.status);
  const statObj: StatObject = {
    system: "VikarApp",
    engine: "azf-vikarapp-api",
    county: fylke.fylke,
    company: "OF",
    department: stat.teamId,
    description: stat.description,
    status: stat.status,
    type: "VikarApp"
  };

  const response: Response = await fetch(`${statistics.url}/Stats`, {
    method: "POST",
    headers: {
      "X-Functions-Key": statistics.key
    },
    body: JSON.stringify(statObj)
  });

  if (!response.ok) {
    const errorData: unknown = await response.json();
    logger.errorException(
      errorData,
      `${logPrefix} - Failed to create statistics for {Status} substitution. ApiStatus: {ApiStatus} - {StatusText} : {@StatObject}`,
      stat.status,
      response.status,
      response.statusText,
      statObj
    );
    return false;
  }

  logger.info(`${logPrefix} - Successfully created statistics for {Status} substitution. ApiStatus: {ApiStatus} : {@StatObject}`, stat.status, response.status, statObj);
  return response.status === 200;
};

export default createStats;
