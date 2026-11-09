export type Requestor = {
  id?: string | undefined;
  sid?: string | undefined;
  ipaddress?: string | undefined;
  name?: string | undefined;
  upn?: string | undefined;
  email?: string | undefined;
  givenName?: string | undefined;
  familyName?: string | undefined;
  jobTitle?: string | undefined;
  department?: string | undefined;
  officeLocation?: string | undefined;
  company?: string | undefined;
  roles: string[];
  scopes: string[];
};
