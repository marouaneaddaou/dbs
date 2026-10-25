export type SaveState = "saved" | "draft";

export interface SaveTracking {
  saveState?: SaveState;
  savedAt?: number | null;
  draftUpdatedAt?: number | null;
}
