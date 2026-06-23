export type RealtimeResponseOwner = {
  requestId?: number;
  responseId?: string;
} | null | undefined;

export function hasRealtimeResponseIdConflict(
  owner: RealtimeResponseOwner,
  competingOwner: RealtimeResponseOwner,
  responseId: string
) {
  if (!responseId) return false;
  if (owner?.responseId && owner.responseId !== responseId) return true;
  return Boolean(competingOwner?.responseId && competingOwner.responseId === responseId);
}

export function canClaimRealtimeResponseId(
  owner: RealtimeResponseOwner,
  competingOwner: RealtimeResponseOwner,
  responseId: string,
  allowClaimWithoutCompetingOwner: boolean
) {
  if (!owner || owner.responseId) return false;
  if (!responseId || !allowClaimWithoutCompetingOwner || competingOwner) return false;
  return true;
}

export function isRealtimeResponseOwnedBy(
  owner: RealtimeResponseOwner,
  responseId: string,
  isCurrentRequest: (requestId: number) => boolean,
  fallbackWhenMissingResponseId = false
) {
  if (!owner) return false;
  if (typeof owner.requestId === "number" && !isCurrentRequest(owner.requestId)) return false;
  if (owner.responseId && responseId) return owner.responseId === responseId;
  if (owner.responseId && !responseId) return fallbackWhenMissingResponseId;
  if (!owner.responseId && !responseId) return fallbackWhenMissingResponseId;
  return true;
}
