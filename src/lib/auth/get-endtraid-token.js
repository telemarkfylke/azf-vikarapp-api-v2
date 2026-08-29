const { ConfidentialClientApplication } = require("@azure/msal-node");
const { logger } = require("@vestfoldfylke/loglady");
const NodeCache = require("node-cache");
const { azureApplication } = require("../../../config.js");

const cache = new NodeCache({ stdTTL: 3000 });

module.exports = async (scope, options = { forceNew: false }) => {
  const cacheKey = scope;
  const logPrefix = "getGraphToken";

  if (!options.forceNew && cache.get(cacheKey)) {
    return cache.get(cacheKey);
  }

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

  const token = await cca.acquireTokenByClientCredential(clientCredentials);
  const expires = Math.floor((token.expiresOn.getTime() - Date.now()) / 1000);
  logger.info(`${logPrefix} - Got token from Microsoft, expires in {Expires} seconds.`, expires);
  cache.set(cacheKey, token.accessToken, expires);
  logger.info(`${logPrefix} - Token stored in cache`);

  return token.accessToken;
};
