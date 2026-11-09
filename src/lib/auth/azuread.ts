import { logger } from "@vestfoldfylke/loglady";
import type { ValidatedClaims } from "../../types/auth.js";

// We only decode, as built in Entra auth verifies. Decode only for metadata - not authentication.
const decodeJwt = (token: string): ValidatedClaims => {
  const base64Payload: string | undefined = token.replace("Bearer ", "").split(".")[1];
  if (!base64Payload) {
    throw new Error("Unable to decode base64 payload");
  }

  const payload: string = Buffer.from(base64Payload, "base64url").toString();
  const parsed: ValidatedClaims | null = JSON.parse(payload);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Payload is not a JSON object");
  }

  return parsed;
};

const decodeAccessToken = async (authHeader: string): Promise<ValidatedClaims> => {
  if (!authHeader) {
    throw new Error("authentication header missing");
  }

  if (typeof authHeader !== "string") {
    throw new Error("authentication header is not a string");
  }

  if (!authHeader.startsWith("Bearer")) {
    throw new Error("Invalid authorization header");
  }

  try {
    return decodeJwt(authHeader);
  } catch (err) {
    logger.errorException(err, "Error validating authentication header");
    throw new Error("The authentication header is invalid");
  }
};

export default decodeAccessToken;
