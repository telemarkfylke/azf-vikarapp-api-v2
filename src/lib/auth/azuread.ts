import { logger } from "@vestfoldfylke/loglady";
import { verify } from "azure-ad-verify-token";
import { azureApplication } from "../../../config.js";

export type ValidatedClaims = {
  oid?: string;
  onprem_sid?: string;
  ipaddr?: string;
  name?: string;
  upn?: string;
  given_name?: string;
  family_name?: string;
  jobTitle?: string;
  department?: string;
  officeLocation?: string;
  companyName?: string;
  roles?: string[];
  scp?: string;
  [claim: string]: unknown;
};

const validateAzureAd = async (authHeader: string): Promise<ValidatedClaims> => {
  if (!authHeader) throw new Error("authentication header missing");
  if (typeof authHeader !== "string") throw new Error("authentication header is not a string");
  if (!authHeader.startsWith("Bearer")) throw new Error("Invalid authorization header");

  const verifyConfig = {
    jwksUri: azureApplication.jwkUri,
    issuer: azureApplication.issuer,
    audience: azureApplication.audience
  };

  let claims: ValidatedClaims;
  try {
    claims = (await verify(authHeader.replace("Bearer ", ""), verifyConfig)) as ValidatedClaims;
  } catch (err) {
    logger.errorException(err, "Error validating authentication header");
    throw new Error("The authentication header is invalid");
  }

  if (!claims) throw new Error("Could not validate authentication header");

  return claims;
};

export default validateAzureAd;
