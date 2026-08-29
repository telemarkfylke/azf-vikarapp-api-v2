import { APIKEYS, APIKEYS_MINIMUM_LENGTH } from "../../../config.js";

const verifyKey = (key: string | null | undefined): void => {
  if (!key) throw new Error("No apikey provided");
  if (!APIKEYS) throw new Error("The provided apikey is invalid");

  const keys = APIKEYS.split(",").filter((n) => n.length >= APIKEYS_MINIMUM_LENGTH);
  if (keys.length === 0) throw new Error("The provided apikey is invalid");

  const existingKey = keys.find((n) => n === key);
  if (!existingKey) throw new Error("The provided apikey is invalid");
};

export default verifyKey;
