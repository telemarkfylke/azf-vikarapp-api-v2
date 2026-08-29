import { logger } from "@vestfoldfylke/loglady";
import type { ObjectId } from "mongodb";
import { azureApplication } from "../../config.js";
import type { GraphGroup, GraphOwnedObject, GraphUser } from "../types/graph.js";
import type { Requestor } from "../types/requestor.js";
import getGraphAuth from "./auth/get-endtraid-token.js";
import { removeSubstitution } from "./mongoCalls.js";

type GraphResponse<T> = T | { value: T };

const unwrap = <T>(data: GraphResponse<T>): T => {
  if (data && typeof data === "object" && "value" in data) {
    return (data as { value: T }).value;
  }

  return data as T;
};

export const getUser = async (upn: string): Promise<GraphUser | null> => {
  if (!upn) {
    throw new Error("Cannot search for a user if 'upn' is not specified");
  }

  const authValue: string = await getGraphAuth(azureApplication.scope);
  const response: Response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${upn}?$select=id,displayName,givenName,surname,userPrincipalName,companyName,officeLocation,preferredLanguage,mail,jobTitle,mobilePhone,businessPhones`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authValue}`
      }
    }
  );

  if (!response.ok) {
    const errorData: unknown = await response.json();
    logger.errorException(errorData, "getUser - Failed to get user with upn '{Upn}'. Status: {Status} - {StatusText}", upn, response.status, response.statusText);
    return null;
  }

  const data: GraphResponse<GraphUser> = (await response.json()) as GraphResponse<GraphUser>;
  return unwrap(data);
};

export const searchUsersInGroup = async (searchTerm: string, groupId: string, requestor: Requestor, returnSelf?: string | boolean): Promise<GraphUser[] | null> => {
  if (!searchTerm) {
    throw new Error("Cannot search for a user if 'searchTerm' is not specified");
  }

  if (!groupId) {
    throw new Error("Cannot search for a user if 'groupId' is not specified");
  }

  if (!requestor) {
    throw new Error("Cannot search for a user if 'requestor' is not specified");
  }

  const authValue: string = await getGraphAuth(azureApplication.scope);
  const response: Response = await fetch(
    `https://graph.microsoft.com/v1.0/groups/${groupId}/members?$search="displayName:${searchTerm}"&$select=id,displayName,jobTitle,officeLocation,userPrincipalName,companyName&$orderby=displayName`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authValue}`,
        ConsistencyLevel: "eventual"
      }
    }
  );

  if (!response.ok) {
    const errorData: unknown = await response.json();
    logger.errorException(
      errorData,
      "searchUsersInGroup - Failed to search for users in groupId '{GroupId}' with searchTerm '{SearchTerm}'. Status: {Status} - {StatusText}",
      groupId,
      searchTerm,
      response.status,
      response.statusText
    );
    return null;
  }

  const data: GraphResponse<GraphUser[]> = (await response.json()) as GraphResponse<GraphUser[]>;
  const users: GraphUser[] = unwrap(data);

  return !returnSelf ? users.filter((i: GraphUser) => i.userPrincipalName !== requestor.upn) : users;
};

export const getOwnedObjects = async (upn: string): Promise<GraphOwnedObject[] | null> => {
  if (!upn) {
    throw new Error("Cannot search for a user if 'upn' is not specified");
  }

  const authValue: string = await getGraphAuth(azureApplication.scope);
  const response: Response = await fetch(`https://graph.microsoft.com/v1.0/users/${upn}/ownedObjects?$select=id,displayName,mail,description`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authValue}`,
      ConsistencyLevel: "eventual"
    }
  });

  if (!response.ok) {
    const errorData: unknown = await response.json();
    logger.errorException(errorData, "getOwnedObjects - Failed to get owned objects for upn '{Upn}'. Status: {Status} - {StatusText}", upn, response.status, response.statusText);
    return null;
  }

  const data: GraphResponse<GraphOwnedObject[]> = (await response.json()) as GraphResponse<GraphOwnedObject[]>;
  return unwrap(data);
};

export const getGroups = async (id: string): Promise<GraphGroup | null> => {
  if (!id) {
    throw new Error("Cannot search for a group if 'id' is not specified");
  }

  const authValue: string = await getGraphAuth(azureApplication.scope);
  const response: Response = await fetch(`https://graph.microsoft.com/v1.0/groups/${id}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authValue}`,
      ConsistencyLevel: "eventual"
    }
  });

  if (!response.ok) {
    const errorData: unknown = await response.json();
    logger.errorException(errorData, "getGroups - Failed to get group with id '{Id}'. Status: {Status} - {StatusText}", id, response.status, response.statusText);
    return null;
  }

  const data: GraphResponse<GraphGroup> = (await response.json()) as GraphResponse<GraphGroup>;
  return unwrap(data);
};

export const getGroupOwners = async (groupId: string, substitutionId?: ObjectId | string): Promise<GraphUser[] | null> => {
  if (!groupId) {
    throw new Error("Cannot search for a group if 'groupId' is not specified");
  }

  const authValue: string = await getGraphAuth(azureApplication.scope);
  const response: Response = await fetch(`https://graph.microsoft.com/v1.0/groups/${groupId}/owners`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authValue}`,
      ConsistencyLevel: "eventual"
    }
  });

  if (!response.ok) {
    const errorData: unknown = await response.json();
    logger.errorException(errorData, "getGroupOwners - Failed to get group owners for groupId '{GroupId}'. Status: {Status} - {StatusText}", groupId, response.status, response.statusText);

    if (response.status === 404 && substitutionId) {
      logger.warn("getGroupOwners - Attempting to remove substitution with id {SubstitutionId}", substitutionId.toString());
      await removeSubstitution(substitutionId);
    }

    return null;
  }

  const data: GraphResponse<GraphUser[]> = (await response.json()) as GraphResponse<GraphUser[]>;
  return unwrap(data);
};

export const getGroupMembers = async (id: string): Promise<GraphUser[] | null> => {
  if (!id) {
    throw new Error("Cannot search for a user if 'id' is not specified");
  }

  const authValue: string = await getGraphAuth(azureApplication.scope);
  const response: Response = await fetch(`https://graph.microsoft.com/v1.0/groups/${id}/members`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authValue}`,
      ConsistencyLevel: "eventual"
    }
  });

  if (!response.ok) {
    const errorData: unknown = await response.json();
    logger.errorException(errorData, "getGroupMembers - Failed to get members from groupId '{Id}'. Status: {Status} - {StatusText}", id, response.status, response.statusText);
    return null;
  }

  const data: GraphResponse<GraphUser[]> = (await response.json()) as GraphResponse<GraphUser[]>;
  return unwrap(data);
};

export const addGroupOwner = async (groupId: string, userId: string): Promise<string | { message: string } | null> => {
  if (!groupId) {
    throw new Error("Cannot search for a user if 'groupId' is not specified");
  }

  if (!userId) {
    throw new Error("Cannot search for a user if 'userId' is not specified");
  }

  const user: GraphUser | null = await getUser(userId);
  if (!user) {
    throw new Error(`The user with id '${userId} could not be found'`);
  }

  let owners: GraphUser[] | null = [];
  try {
    owners = await getGroupOwners(groupId);
  } catch {
    throw new Error(`The team '${groupId}' could not be found`);
  }

  if (!owners) {
    throw new Error(`The team '${groupId}' could not be found`);
  }

  const existing: GraphUser | undefined = owners.find((i: GraphUser) => i.id === userId);
  if (existing) {
    return { message: "The user is already a owner" };
  }

  const authValue: string = await getGraphAuth(azureApplication.scope);
  const response: Response = await fetch(`https://graph.microsoft.com/v1.0/groups/${groupId}/owners/$ref`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authValue}`,
      ConsistencyLevel: "eventual"
    },
    body: JSON.stringify({ "@odata.id": `https://graph.microsoft.com/v1.0/users/${userId}` })
  });

  if (!response.ok) {
    const errorData: unknown = await response.json();
    logger.errorException(
      errorData,
      "addGroupOwner - Failed to add userId '{UserId}' as a group owner of groupId '{GroupId}'. Status: {Status} - {StatusText}",
      userId,
      groupId,
      response.status,
      response.statusText
    );
    return null;
  }

  return await response.text();
};

export const removeGroupOwner = async (groupId: string, userId: string): Promise<string | null> => {
  if (!groupId) {
    throw new Error("Cannot search for a user if 'groupId' is not specified");
  }

  if (!userId) {
    throw new Error("Cannot search for a user if 'userId' is not specified");
  }

  const authValue: string = await getGraphAuth(azureApplication.scope);
  const response: Response = await fetch(`https://graph.microsoft.com/v1.0/groups/${groupId}/owners/${userId}/$ref`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authValue}`,
      ConsistencyLevel: "eventual"
    }
  });

  if (!response.ok) {
    const errorData: unknown = await response.json();
    logger.errorException(
      errorData,
      "removeGroupOwner - Failed to remove userId '{UserId}' as an owner of groupId '{GroupId}'. Status: {Status} - {StatusText}",
      userId,
      groupId,
      response.status,
      response.statusText
    );
    return null;
  }

  return await response.text();
};

export const removeGroupMember = async (groupId: string, userId: string): Promise<string | null> => {
  if (!groupId) {
    throw new Error("Cannot search for a user if 'groupId' is not specified");
  }

  if (!userId) {
    throw new Error("Cannot search for a user if 'userId' is not specified");
  }

  const authValue: string = await getGraphAuth(azureApplication.scope);
  const response: Response = await fetch(`https://graph.microsoft.com/v1.0/groups/${groupId}/members/${userId}/$ref`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authValue}`,
      ConsistencyLevel: "eventual"
    }
  });

  if (!response.ok) {
    const errorData: unknown = await response.json();
    logger.errorException(
      errorData,
      "removeGroupMember - Failed to remove userId '{UserId}' as a member of groupId '{GroupId}'. Status: {Status} - {StatusText}",
      userId,
      groupId,
      response.status,
      response.statusText
    );
    return null;
  }

  return await response.text();
};

export const getAdditionalRequestorInfo = async (requestor: Requestor): Promise<GraphUser | null> => {
  if (!requestor) {
    throw new Error("Cannot search for a user if 'requestor' is not specified");
  }

  const authValue: string = await getGraphAuth(azureApplication.scope);
  const response: Response = await fetch(`https://graph.microsoft.com/v1.0/users/${requestor.upn}?$select=jobTitle,department,officeLocation,companyName`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authValue}`
    }
  });

  if (!response.ok) {
    const errorData: unknown = await response.json();
    logger.errorException(errorData, "getAdditionalRequestorInfo - Failed to get user with upn '{RequestorUpn}'. Status: {Status} - {StatusText}", requestor.upn, response.status, response.statusText);
    return null;
  }

  const data: GraphResponse<GraphUser> = (await response.json()) as GraphResponse<GraphUser>;
  return unwrap(data);
};
