import { logger } from "@vestfoldfylke/loglady";
import { fylke, statistics } from "../../../config.js";

export type StatEntry = {
  teamId: string;
  status: string;
  description: string;
};

const createStats = async (stat: StatEntry): Promise<boolean> => {
  const logPrefix = "createStats";
  logger.info(`${logPrefix} - Creating statistics for {Status} substitution`, stat.status);
  const statObj = {
    system: "VikarApp",
    engine: "azf-vikarapp-api",
    county: fylke.fylke,
    company: "OF",
    department: stat.teamId,
    description: stat.description,
    status: stat.status,
    type: "VikarApp"
  };

  const response = await fetch(`${statistics.url}/Stats`, {
    method: "POST",
    headers: {
      "X-Functions-Key": statistics.key
    },
    body: JSON.stringify(statObj)
  });

  if (!response.ok) {
    const errorData = await response.json();
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
