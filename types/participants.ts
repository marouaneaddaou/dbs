export interface BoxParticipant {
  id: string;
  name: string;
  normalizedName: string;
  createdAt: number;
  updatedAt: number;
}

export type BoxGroupMemberships = Record<string, string[]>;
