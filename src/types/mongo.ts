import type { ObjectId } from "mongodb";

export type SchoolDoc = {
  _id: ObjectId;
  name: string;
  permittedSchools?: string[];
};
