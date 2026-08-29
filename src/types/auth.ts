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
