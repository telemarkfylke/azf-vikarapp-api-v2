const { logger } = require("@vestfoldfylke/loglady");
const { azureApplication } = require("../../../config.js");

const verifyToken = (...args) => import("azure-ad-verify-token").then(({ verify }) => verify(...args));

/**
 *
 * @param {string} authHeader Authentication header
 */
module.exports = async (authHeader) => {
  // Input validation
  const bearerToken = authHeader;
  if (!bearerToken) throw new Error("authentication token missing");
  if (typeof bearerToken !== "string") throw new Error("authentication token is not a string");
  if (!bearerToken.startsWith("Bearer")) throw new Error("authentication token is not a Bearer token");

  // Token configuration
  const tokenConfig = {
    jwksUri: azureApplication.jwkUri,
    issuer: azureApplication.issuer,
    audience: azureApplication.audience
  };

  // Validation
  let validatedToken;
  try {
    validatedToken = await verifyToken(bearerToken.replace("Bearer ", ""), tokenConfig);
  } catch (err) {
    logger.errorException(err, "Error validating authentication token");
    throw new Error("The token is invalid");
  }

  if (!validatedToken) throw new Error("Could not validate authentication token");

  // if (!validatedToken.groups || validatedToken.groups.length === 0) throw new Error(401, 'No groups could be found in authentication token')
  // if (!validatedToken.department) throw new Error(401, 'Could not find the users company department in the authentication token')

  return validatedToken;
};
