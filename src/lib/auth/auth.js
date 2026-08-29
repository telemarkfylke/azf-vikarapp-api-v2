const apikey = require("./apikey.js");
const azuread = require("./azuread.js");

/**
 * Auth's the request
 * @param {object} req Azure function request
 * @returns
 */
const auth = async (req) => {
  let requestor = {};

  // If test and a requestor has been provided, return that
  if (process.env.NODE_ENV === "test" && req.requestor) return req.requestor;

  if (req.headers.get("authorization")) {
    const token = await azuread(req.headers.get("authorization"));
    requestor = {
      id: token.oid,
      sid: token.onprem_sid,
      ipaddress: token.ipaddr,
      name: token.name,
      upn: token.upn,
      givenName: token.given_name,
      familyName: token.family_name,
      jobTitle: token.jobTitle,
      department: token.department,
      officeLocation: token.officeLocation,
      company: token.companyName,
      roles: token.roles || [],
      scopes: token.scp?.split(" ") || []
    };
  } else if (req.headers.get("x-api-key")) {
    apikey(req.headers.get("x-api-key"));
    requestor.name = "apikey";
    requestor.id = "apikey";
    requestor.department = "apikey";
    requestor.email = "apikey@vtfk.no";
  } else {
    throw new Error("No authentication token provided");
  }
  return requestor;
};

module.exports = {
  auth
};
