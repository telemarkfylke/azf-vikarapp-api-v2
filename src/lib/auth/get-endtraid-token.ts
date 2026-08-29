import { ConfidentialClientApplication } from "@azure/msal-node";
import { logger } from "@vestfoldfylke/loglady";
import NodeCache from "node-cache";
import { azureApplication } from "../../../config.js";

const cache = new NodeCache({ stdTTL: 3000 });

const getGraphAuth = async (scope: string, options: { forceNew?: boolean } = { forceNew: false }): Promise<string> => {
  const cacheKey = scope;
  const logPrefix = "getGraphToken";

  const cached = cache.get<string>(cacheKey);
  if (!options.forceNew && cached) return cached;

  logger.info(`${logPrefix} - no token in cache, fetching new from Microsoft`);
  const config = {
    auth: {
      clientId: azureApplication.clientId,
      authority: `https://login.microsoftonline.com/${azureApplication.tenantId}/`,
      clientSecret: azureApplication.clientSecret
    }
  };

  // Create msal application object
  const cca = new ConfidentialClientApplication(config);
  const clientCredentials = {
    scopes: [scope]
  };

  const authResult = await cca.acquireTokenByClientCredential(clientCredentials);
  if (!authResult || !authResult.expiresOn || !authResult.accessToken) {
    throw new Error("Failed to acquire graph auth from Microsoft");
  }
  const expires = Math.floor((authResult.expiresOn.getTime() - Date.now()) / 1000);
  logger.info(`${logPrefix} - Got token from Microsoft, expires in {Expires} seconds.`, expires);
  cache.set(cacheKey, authResult.accessToken, expires);
  logger.info(`${logPrefix} - Token stored in cache`);

  return authResult.accessToken;
};

export default getGraphAuth;
