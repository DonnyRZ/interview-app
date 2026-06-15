export type RealtimeCancelTarget = {
  responseId?: string;
} | null | undefined;

export type RealtimeResponseOwner = {
  requestId?: number;
  responseId?: string;
} | null | undefined;

export function buildRealtimeCancelEvent(target: RealtimeCancelTarget) {
  const responseId = target?.responseId?.trim();
  if (!responseId) {
    return null;
  }

  return {
    type: "response.cancel",
    response_id: responseId
  };
}

export function isRecoverableRealtimeCancelError(message?: string) {
  return /cancellation failed:\s*no active response found/i.test(message || "");
}

export function getRealtimeResponseId(event: Record<string, unknown>) {
  if (typeof event.response_id === "string" && event.response_id.trim()) {
    return event.response_id.trim();
  }

  const response = event.response && typeof event.response === "object"
    ? event.response as Record<string, unknown>
    : null;
  return typeof response?.id === "string" && response.id.trim() ? response.id.trim() : "";
}

export function hasRealtimeResponseIdConflict(
  owner: RealtimeResponseOwner,
  competingOwner: RealtimeResponseOwner,
  event: Record<string, unknown>
) {
  const responseId = getRealtimeResponseId(event);
  if (!responseId) {
    return false;
  }

  if (owner?.responseId && owner.responseId !== responseId) {
    return true;
  }

  return Boolean(competingOwner?.responseId && competingOwner.responseId === responseId);
}

export function canClaimRealtimeResponseId(
  owner: RealtimeResponseOwner,
  competingOwner: RealtimeResponseOwner,
  event: Record<string, unknown>,
  allowClaimWithoutCompetingOwner: boolean
) {
  if (!owner || owner.responseId) {
    return false;
  }

  const responseId = getRealtimeResponseId(event);
  if (!responseId || !allowClaimWithoutCompetingOwner || competingOwner) {
    return false;
  }

  return true;
}

export function isRealtimeResponseOwnedBy(
  owner: RealtimeResponseOwner,
  event: Record<string, unknown>,
  isCurrentRequest: (requestId: number) => boolean,
  fallbackWhenMissingResponseId = false
) {
  if (!owner) {
    return false;
  }

  if (typeof owner.requestId === "number" && !isCurrentRequest(owner.requestId)) {
    return false;
  }

  const responseId = getRealtimeResponseId(event);
  if (owner.responseId && responseId) {
    return owner.responseId === responseId;
  }

  if (owner.responseId && !responseId) {
    return fallbackWhenMissingResponseId;
  }

  return true;
}
