export interface BoxParticipant {
  id: string;
  name: string;
  normalizedName: string;
  createdAt: number;
  updatedAt: number;
}

export type BoxGroupMemberships = Record<string, string[]>;

export interface BoxGroupRecord {
  id: string;
  name: string;
  time: string;
  createdAt: number;
  updatedAt: number;
}
