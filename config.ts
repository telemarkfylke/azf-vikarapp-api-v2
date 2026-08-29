const required = (name: string): string => {
  const value = process.env[name];
  if (!value) return "";
  return value;
};

const cfg = {
  USE_MOCK: process.env.USE_MOCK || false,
  APP_DEACTIVATE_TIMERS: process.env.APP_DEACTIVATE_TIMERS || false,
  NODE_ENV: process.env.NODE_ENV || "development",
  searchGroupId: process.env.NODE_ENV !== "test" ? process.env.AZURE_SEARCH_GROUP_ID || "" : "123",
  APIKEYS_MINIMUM_LENGTH: Number(process.env.APIKEYS_MINIMUM_LENGTH) || 5,
  APIKEYS: process.env.APIKEYS || "12345",
  azureApplication: {
    tenantId: required("AZURE_APP_TENANT_ID"),
    clientId: required("AZURE_APP_ID"),
    clientSecret: required("AZURE_APP_SECRET"),
    scope: process.env.AZURE_APP_SCOPE || "https://graph.microsoft.com/.default",
    grantType: process.env.AZURE_APP_GRANT_TYPE || "client_credentials",
    issuer: `https://sts.windows.net/${process.env.AZURE_APP_TENANT_ID}/`,
    jwkUri: `https://login.microsoftonline.com/${process.env.AZURE_APP_TENANT_ID}/discovery/v2.0/keys`,
    audience: process.env.AZURE_APP_AUDIENCE || "Audience"
  },
  mongoDB: {
    MONGODB_CONNECTION_STRING: required("MONGODB_CONNECTION_STRING"),
    SDS_MONGODB_CONNECTIONSTRING: required("SDS_MONGODB_CONNECTIONSTRING"),
    DB_NAME: required("MONGODB_DB_NAME"),
    SUBSTITUTIONS_COLLECTION: required("MONGODB_SUBSTITUTIONS_COLLECTION"),
    LOG_COLLECTION: required("MONGODB_LOG_COLLECTION"),
    SCHOOLS_COLLECTION: required("MONGODB_SCHOOLS_COLLECTION")
  },
  statistics: {
    url: required("STATISTICS_URL"),
    key: required("STATISTICS_KEY")
  },
  fylke: {
    fylke: process.env.FYLKE || ""
  }
};

export const USE_MOCK = cfg.USE_MOCK;
export const APP_DEACTIVATE_TIMERS = cfg.APP_DEACTIVATE_TIMERS;
export const NODE_ENV = cfg.NODE_ENV;
export const searchGroupId = cfg.searchGroupId;
export const APIKEYS_MINIMUM_LENGTH = cfg.APIKEYS_MINIMUM_LENGTH;
export const APIKEYS = cfg.APIKEYS;
export const azureApplication = cfg.azureApplication;
export const mongoDB = cfg.mongoDB;
export const statistics = cfg.statistics;
export const fylke = cfg.fylke;
export default cfg;
