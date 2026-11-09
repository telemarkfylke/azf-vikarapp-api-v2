import type { ObjectId } from "mongodb";

export type SubstitutionStatus = "pending" | "active" | "expired";

export type Substitution = {
  _id: ObjectId;
  status: SubstitutionStatus;
  teacherId: string;
  teacherName: string;
  teacherUpn: string;
  substituteId: string;
  substituteName: string;
  substituteUpn: string;
  teamId: string;
  teamName: string;
  teamEmail: string;
  teamSdsId?: string;
  substitutionUpdated: number;
  expirationTimestamp: Date;
  createdTimestamp: Date;
  updatedTimestamp?: Date;
};

export type SubstitutionRequest = {
  _id?: string;
  status?: SubstitutionStatus;
  teacherUpn: string;
  substituteUpn: string;
  teamId: string;
};
