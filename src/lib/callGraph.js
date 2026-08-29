const { logger } = require("@vestfoldfylke/loglady");
const getAccessToken = require("./auth/get-endtraid-token.js");
const { azureApplication } = require("../../config.js");
const { removeSubstitution } = require("./mongoCalls.js");

const getUser = async (upn) => {
  // Input validation
  if (!upn) throw new Error("Cannot search for a user if 'upn' is not specified");

  const accessToken = await getAccessToken(azureApplication.scope);
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${upn}?$select=id,displayName,givenName,surname,userPrincipalName,companyName,officeLocation,preferredLanguage,mail,jobTitle,mobilePhone,businessPhones`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    logger.errorException(errorData, "getUser - Failed to get user with upn '{Upn}'. Status: {Status} - {StatusText}", upn, response.status, response.statusText);
    return null;
  }

  const data = await response.json();
  return data.value ? data.value : data;
};

const searchUsersInGroup = async (searchTerm, groupId, requestor, returnSelf) => {
  // Input validation
  if (!searchTerm) throw new Error("Cannot search for a user if 'searchTerm' is not specified");
  if (!groupId) throw new Error("Cannot search for a user if 'groupId' is not specified");
  if (!requestor) throw new Error("Cannot search for a user if 'requestor' is not specified");

  const accessToken = await getAccessToken(azureApplication.scope);
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/groups/${groupId}/members?$search="displayName:${searchTerm}"&$select=id,displayName,jobTitle,officeLocation,userPrincipalName,companyName&$orderby=displayName`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ConsistencyLevel: "eventual"
      }
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
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

  const data = await response.json();
  const dataValue = data.value ? data.value : data;

  return !returnSelf ? dataValue.filter((i) => i.userPrincipalName !== requestor.upn) : dataValue;
};

const getOwnedObjects = async (upn) => {
  // Input validation
  if (!upn) throw new Error("Cannot search for a user if 'upn' is not specified");

  const accessToken = await getAccessToken(azureApplication.scope);
  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${upn}/ownedObjects?$select=id,displayName,mail,description`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ConsistencyLevel: "eventual"
    }
  });

  if (!response.ok) {
    const errorData = await response.json();
    logger.errorException(errorData, "getOwnedObjects - Failed to get owned objects for upn '{Upn}'. Status: {Status} - {StatusText}", upn, response.status, response.statusText);
    return null;
  }

  const data = await response.json();
  return data.value ? data.value : data;
};

const getGroups = async (id) => {
  // Input validation
  if (!id) throw new Error("Cannot search for a group if 'id' is not specified");

  const accessToken = await getAccessToken(azureApplication.scope);
  const response = await fetch(`https://graph.microsoft.com/v1.0/groups/${id}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ConsistencyLevel: "eventual"
    }
  });

  if (!response.ok) {
    const errorData = await response.json();
    logger.errorException(errorData, "getGroups - Failed to get group with id '{Id}'. Status: {Status} - {StatusText}", id, response.status, response.statusText);
    return null;
  }

  const data = await response.json();
  return data.value ? data.value : data;
};

const getGroupOwners = async (groupId, substitutionId = undefined) => {
  // Input validation
  if (!groupId) {
    throw new Error("Cannot search for a group if 'groupId' is not specified");
  }

  const accessToken = await getAccessToken(azureApplication.scope);
  const response = await fetch(`https://graph.microsoft.com/v1.0/groups/${groupId}/owners`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ConsistencyLevel: "eventual"
    }
  });

  if (!response.ok) {
    const errorData = await response.json();
    logger.errorException(errorData, "getGroupOwners - Failed to get group owners for groupId '{GroupId}'. Status: {Status} - {StatusText}", groupId, response.status, response.statusText);

    if (response.status === 404 && substitutionId) {
      logger.warn("getGroupOwners - Attempting to remove substitution with id {SubstitutionId}", substitutionId);
      await removeSubstitution(substitutionId);
    }

    return null;
  }

  const data = await response.json();
  return data.value ? data.value : data;
};

const getGroupMembers = async (id) => {
  // Input validation
  if (!id) throw new Error("Cannot search for a user if 'id' is not specified");

  const accessToken = await getAccessToken(azureApplication.scope);
  const response = await fetch(`https://graph.microsoft.com/v1.0/groups/${id}/members`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ConsistencyLevel: "eventual"
    }
  });

  if (!response.ok) {
    const errorData = await response.json();
    logger.errorException(errorData, "getGroupMembers - Failed to get members from groupId '{Id}'. Status: {Status} - {StatusText}", id, response.status, response.statusText);
    return null;
  }

  const data = await response.json();
  return data.value ? data.value : data;
};

const addGroupOwner = async (groupId, userId) => {
  // Input validation
  if (!groupId) throw new Error("Cannot search for a user if 'groupId' is not specified");
  if (!userId) throw new Error("Cannot search for a user if 'userId' is not specified");

  // Check if the user exists
  const user = await getUser(userId);
  if (!user) throw new Error(`The user with id '${userId} could not be found'`);

  // Check if the team exists and get its members
  let owners = [];
  try {
    owners = await getGroupOwners(groupId);
  } catch {
    throw new Error(`The team '${groupId}' could not be found`);
  }
  if (!owners) throw new Error(`The team '${groupId}' could not be found`);

  // Check if the user is already a owner
  const existing = owners.find((i) => i.id === userId);
  if (existing) return { message: "The user is already a owner" };

  const accessToken = await getAccessToken(azureApplication.scope);
  const response = await fetch(`https://graph.microsoft.com/v1.0/groups/${groupId}/owners/$ref`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ConsistencyLevel: "eventual"
    },
    body: JSON.stringify({ "@odata.id": `https://graph.microsoft.com/v1.0/users/${userId}` })
  });

  if (!response.ok) {
    const errorData = await response.json();
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

const removeGroupOwner = async (groupId, userId) => {
  // Input validation
  if (!groupId) throw new Error("Cannot search for a user if 'groupId' is not specified");
  if (!userId) throw new Error("Cannot search for a user if 'userId' is not specified");

  const accessToken = await getAccessToken(azureApplication.scope);
  const response = await fetch(`https://graph.microsoft.com/v1.0/groups/${groupId}/owners/${userId}/$ref`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ConsistencyLevel: "eventual"
    }
  });

  if (!response.ok) {
    const errorData = await response.json();
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

const removeGroupMember = async (groupId, userId) => {
  // Input validation
  if (!groupId) throw new Error("Cannot search for a user if 'groupId' is not specified");
  if (!userId) throw new Error("Cannot search for a user if 'userId' is not specified");

  const accessToken = await getAccessToken(azureApplication.scope);
  const response = await fetch(`https://graph.microsoft.com/v1.0/groups/${groupId}/members/${userId}/$ref`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ConsistencyLevel: "eventual"
    }
  });

  if (!response.ok) {
    const errorData = await response.json();
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

const getAdditionalRequestorInfo = async (requestor) => {
  // Input validation
  if (!requestor) throw new Error("Cannot search for a user if 'requestor' is not specified");

  const accessToken = await getAccessToken(azureApplication.scope);
  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${requestor.upn}?$select=jobTitle,department,officeLocation,companyName`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const errorData = await response.json();
    logger.errorException(errorData, "getAdditionalRequestorInfo - Failed to get user with upn '{RequestorUpn}'. Status: {Status} - {StatusText}", requestor.upn, response.status, response.statusText);
    return null;
  }

  const data = await response.json();
  return data.value ? data.value : data;
};

module.exports = {
  getUser,
  searchUsersInGroup,
  getOwnedObjects,
  getGroups,
  getGroupOwners,
  getGroupMembers,
  addGroupOwner,
  removeGroupOwner,
  removeGroupMember,
  getAdditionalRequestorInfo
};
