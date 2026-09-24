import { type AuthenticationResult, type ClientCredentialRequest, ConfidentialClientApplication, type Configuration } from "@azure/msal-node";
import { logger } from "@vestfoldfylke/loglady";
import { azureApplication } from "../../../config.js";

const config: Configuration = {
  auth: {
    clientId: azureApplication.clientId,
    authority: `https://login.microsoftonline.com/${azureApplication.tenantId}/`,
    clientSecret: azureApplication.clientSecret
  }
};

const cca: ConfidentialClientApplication = new ConfidentialClientApplication(config);

const getGraphAuth = async (scope: string): Promise<string> => {
  const logPrefix: string = "getGraphToken";

  logger.info(`${logPrefix} - fetching token from Microsoft`);
  const clientCredentials: ClientCredentialRequest = {
    scopes: [scope]
  };

  const authResult: AuthenticationResult | null = await cca.acquireTokenByClientCredential(clientCredentials);
  if (!authResult?.expiresOn || !authResult.accessToken) {
    throw new Error("Failed to acquire graph auth from Microsoft");
  }

  const expires: number = Math.floor((authResult.expiresOn.getTime() - Date.now()) / 1000);
  logger.info(`${logPrefix} - Got token from Microsoft, expires in {Expires} seconds.`, expires);

  return authResult.accessToken;
};

export default getGraphAuth;
