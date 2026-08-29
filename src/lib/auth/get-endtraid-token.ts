import { type AuthenticationResult, type ClientCredentialRequest, ConfidentialClientApplication, type Configuration } from "@azure/msal-node";
import { logger } from "@vestfoldfylke/loglady";
import NodeCache from "node-cache";
import { azureApplication } from "../../../config.js";

type GetGraphAuthOptions = {
  forceNew?: boolean;
};

const cache: NodeCache = new NodeCache({ stdTTL: 3000 });

const getGraphAuth = async (scope: string, options: GetGraphAuthOptions = { forceNew: false }): Promise<string> => {
  const cacheKey: string = scope;
  const logPrefix: string = "getGraphToken";

  const cached: string | undefined = cache.get<string>(cacheKey);
  if (!options.forceNew && cached) {
    return cached;
  }

  logger.info(`${logPrefix} - no token in cache, fetching new from Microsoft`);
  const config: Configuration = {
    auth: {
      clientId: azureApplication.clientId,
      authority: `https://login.microsoftonline.com/${azureApplication.tenantId}/`,
      clientSecret: azureApplication.clientSecret
    }
  };

  const cca: ConfidentialClientApplication = new ConfidentialClientApplication(config);
  const clientCredentials: ClientCredentialRequest = {
    scopes: [scope]
  };

  const authResult: AuthenticationResult | null = await cca.acquireTokenByClientCredential(clientCredentials);
  if (!authResult?.expiresOn || !authResult.accessToken) {
    throw new Error("Failed to acquire graph auth from Microsoft");
  }

  const expires: number = Math.floor((authResult.expiresOn.getTime() - Date.now()) / 1000);
  logger.info(`${logPrefix} - Got token from Microsoft, expires in {Expires} seconds.`, expires);
  cache.set(cacheKey, authResult.accessToken, expires);
  logger.info(`${logPrefix} - Token stored in cache`);

  return authResult.accessToken;
};

export default getGraphAuth;
