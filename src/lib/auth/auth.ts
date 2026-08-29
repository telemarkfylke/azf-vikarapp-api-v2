import type { HttpRequest } from "@azure/functions";
import type { Requestor } from "../../types/requestor.js";
import verifyKey from "./apikey.js";
import validateAzureAd, { type ValidatedClaims } from "./azuread.js";

type TestRequestWithRequestor = HttpRequest & { requestor?: Requestor };

export const auth = async (req: HttpRequest): Promise<Requestor> => {
  if (process.env.NODE_ENV === "test") {
    const testReq: TestRequestWithRequestor = req as TestRequestWithRequestor;
    if (testReq.requestor) {
      return testReq.requestor;
    }
  }

  const bearer: string | null = req.headers.get("authorization");
  const apiHeader: string | null = req.headers.get("x-api-key");

  if (bearer) {
    const claims: ValidatedClaims = await validateAzureAd(bearer);
    return {
      id: claims.oid,
      sid: claims.onprem_sid,
      ipaddress: claims.ipaddr,
      name: claims.name,
      upn: claims.upn,
      givenName: claims.given_name,
      familyName: claims.family_name,
      jobTitle: claims.jobTitle,
      department: claims.department,
      officeLocation: claims.officeLocation,
      company: claims.companyName,
      roles: claims.roles || [],
      scopes: claims.scp?.split(" ") || []
    };
  }

  if (apiHeader) {
    verifyKey(apiHeader);
    return {
      name: "apikey",
      id: "apikey",
      department: "apikey",
      email: "apikey@vtfk.no",
      roles: [],
      scopes: []
    };
  }

  throw new Error("No authentication token provided");
};
