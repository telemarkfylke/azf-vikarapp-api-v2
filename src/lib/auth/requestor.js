const { logger } = require("@vestfoldfylke/loglady");
const config = require("../../../config.js");
const { auth } = require("./auth.js");
const { getAdditionalRequestorInfo } = require("../callGraph.js");

if (config.length > 0) {
  logger.info("prepareRequest - Config loaded");
}
// const setupMock = require('../mock/setupMock')

const defaultOptions = {
  auth: true,
  mock: false
};

/**
 *
 * @param { Object } req Azure function request object
 * @param { Object } options
 * @param { Boolean } options.auth Is this a protected route?
 * @param { [String] } options.required Array of properties that must be provided
 * @returns
 */
const prepareRequest = async (req, options = {}) => {
  const logPrefix = "prepareRequest";
  // Merge options with default options
  if (typeof options !== "object") options = {};
  options = { ...defaultOptions, ...options };

  // Make sure all the required properties are provided
  const missingProps = [];
  if (options.required) {
    options.required.forEach((prop) => {
      if (!prop.split(".").includes("body")) {
        if (!req.params[prop]) {
          missingProps.push(prop);
        }
      } else {
        if (!req.body[prop]) {
          missingProps.push(prop);
        }
      }
    });
    if (missingProps.length > 0) {
      logger.warn(`${logPrefix} - Missing required properties: {@RequiredPropertiesMissing}`, missingProps.join(", "));
      throw new Error(`Missing required property: ${missingProps.join(", ")}`);
    }
  }

  let requestor;
  if (options.auth) {
    if (!req) {
      logger.warn(`${logPrefix} - No request object provided`);
      throw new Error("No request object provided");
    }
    requestor = await auth(req);
  }

  if (process.env.NODE_ENV === "test" || options.mock) {
    // setupMock()
  }

  // Before returning the requestor object, make sure that the requestor has jobTitle, department, officeLocation and company. If not, get them with the graph api
  // This is because the token provided by the azure ad does not always contain these properties
  if (!requestor.jobTitle || !requestor.department || !requestor.officeLocation || !requestor.company) {
    logger.info(`${logPrefix} - Requestor is missing jobTitle, department, officeLocation or company, getting them with the graph api`);
    const updatedRequestor = await getAdditionalRequestorInfo(requestor);
    requestor.jobTitle = updatedRequestor.jobTitle;
    requestor.department = updatedRequestor.department;
    requestor.officeLocation = updatedRequestor.officeLocation;
    requestor.company = updatedRequestor.companyName;
  }

  logger.info(`${logPrefix} - Returning the requestor object`);
  return {
    requestor
  };
};

module.exports = {
  prepareRequest
};
