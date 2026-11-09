export type GraphUser = {
  id: string;
  displayName?: string;
  givenName?: string;
  surname?: string;
  userPrincipalName: string;
  companyName?: string;
  officeLocation?: string;
  preferredLanguage?: string;
  mail?: string;
  jobTitle?: string;
  department?: string;
  mobilePhone?: string;
  businessPhones?: string[];
};

export type GraphOwnedObject = {
  id: string;
  displayName: string;
  mail?: string;
  description?: string;
  "@odata.type"?: string;
};

export type GraphGroup = {
  id: string;
  displayName?: string;
  mail?: string;
};

export type PermittedLocation = {
  _id: unknown;
  name: string;
};
