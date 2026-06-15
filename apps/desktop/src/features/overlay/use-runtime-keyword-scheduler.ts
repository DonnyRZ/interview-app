import { MutableRefObject, useRef } from "react";
import type { RuntimeKeywordStatus } from "./runtime-rules/overlay-response-copy.js";
import { buildKeywordSourceText } from "./runtime-rules/transcript-focus-rules.js";
import type { ActiveKeywordRealtimeResponse, ActiveRealtimeResponse } from "./use-realtime-response-controller.js";
import type { StableConversationSnapshot } from "./use-overlay-transcript-state.js";

export type RuntimeKeywordRequestPayload = {
  requestKey: string;
  fingerprint: string;
  generation: number;
  transcriptSegment: string;
};

type KeywordContextLike = {
  liveMeetingSessionId?: string;
  runtimeKeywords?: string[];
};

type UseRuntimeKeywordSchedulerOptions<TContext extends KeywordContextLike> = {
  contextRef: MutableRefObject<TContext>;
  activeRealtimeResponseRef: MutableRefObject<ActiveRealtimeResponse | null>;
  activeKeywordResponseRef: MutableRefObject<ActiveKeywordRealtimeResponse | null>;
  keywordStreamingResponseRef: MutableRefObject<string>;
  realtimeStatusRef: MutableRefObject<string>;
  throttleMs: number;
  setRuntimeKeywordStatus: (status: RuntimeKeywordStatus) => void;
  setMode: (updater: (current: "mini" | "expanded" | "loading" | "response") => "mini" | "expanded" | "loading" | "response") => void;
  syncRuntimeKeywords: (keywords: string[]) => void;
  sendRealtimeKeywordRequest: (payload: RuntimeKeywordRequestPayload) => boolean;
  cancelActiveKeywordResponse: () => void;
};

export function useRuntimeKeywordScheduler<TContext extends KeywordContextLike>({
  contextRef,
  activeRealtimeResponseRef,
  activeKeywordResponseRef,
  keywordStreamingResponseRef,
  realtimeStatusRef,
  throttleMs,
  setRuntimeKeywordStatus,
  setMode,
  syncRuntimeKeywords,
  sendRealtimeKeywordRequest,
  cancelActiveKeywordResponse
}: UseRuntimeKeywordSchedulerOptions<TContext>) {
  const runtimeKeywordRequestRef = useRef("");
  const runtimeKeywordTimerRef = useRef<number | null>(null);
  const runtimeKeywordInFlightRef = useRef(false);
  const runtimeKeywordPendingRef = useRef<RuntimeKeywordRequestPayload | null>(null);
  const runtimeKeywordLastRequestedKeyRef = useRef("");
  const runtimeKeywordGenerationRef = useRef(0);

  function clearRuntimeKeywordRequests() {
    cancelActiveKeywordResponse();

    if (runtimeKeywordTimerRef.current) {
      window.clearTimeout(runtimeKeywordTimerRef.current);
      runtimeKeywordTimerRef.current = null;
    }

    runtimeKeywordPendingRef.current = null;
    runtimeKeywordInFlightRef.current = false;
    runtimeKeywordRequestRef.current = "";
    runtimeKeywordLastRequestedKeyRef.current = "";
    runtimeKeywordGenerationRef.current += 1;
    activeKeywordResponseRef.current = null;
    keywordStreamingResponseRef.current = "";
  }

  function queueRuntimeKeywordRequest(snapshot: StableConversationSnapshot) {
    const keywordSourceText = buildKeywordSourceText(snapshot.focus, snapshot.windowText);
    if (!keywordSourceText.trim()) {
      setRuntimeKeywordStatus(contextRef.current.runtimeKeywords?.length ? "ready" : "empty");
      return;
    }

    const fingerprint = buildKeywordRequestFingerprint(keywordSourceText);
    const requestKey = `${contextRef.current.liveMeetingSessionId || "draft"}::${fingerprint}`;
    if (
      runtimeKeywordLastRequestedKeyRef.current === requestKey
      || runtimeKeywordPendingRef.current?.requestKey === requestKey
    ) {
      return;
    }

    runtimeKeywordPendingRef.current = {
      requestKey,
      fingerprint,
      generation: runtimeKeywordGenerationRef.current,
      transcriptSegment: keywordSourceText
    };
    runtimeKeywordRequestRef.current = requestKey;
    syncRuntimeKeywords([]);
    setRuntimeKeywordStatus("loading");

    scheduleRuntimeKeywordFlush();
  }

  function scheduleRuntimeKeywordFlush(delayMs = throttleMs) {
    if (runtimeKeywordInFlightRef.current || runtimeKeywordTimerRef.current) {
      return;
    }

    runtimeKeywordTimerRef.current = window.setTimeout(() => {
      runtimeKeywordTimerRef.current = null;
      void flushRuntimeKeywordRequest();
    }, delayMs);
  }

  function getPendingRuntimeKeywordRequest() {
    return runtimeKeywordPendingRef.current;
  }

  async function flushRuntimeKeywordRequest() {
    if (runtimeKeywordInFlightRef.current) {
      return;
    }

    const payload = runtimeKeywordPendingRef.current;
    if (!payload) {
      return;
    }

    runtimeKeywordPendingRef.current = null;
    runtimeKeywordInFlightRef.current = true;
    runtimeKeywordLastRequestedKeyRef.current = payload.requestKey;
    const generation = payload.generation;

    if (activeRealtimeResponseRef.current || realtimeStatusRef.current === "responding") {
      runtimeKeywordInFlightRef.current = false;
      scheduleRuntimeKeywordFlush(700);
      return;
    }

    keywordStreamingResponseRef.current = "";
    activeKeywordResponseRef.current = {
      requestKey: payload.requestKey,
      fingerprint: payload.fingerprint,
      generation
    };

    const sent = sendRealtimeKeywordRequest(payload);
    if (!sent) {
      if (runtimeKeywordGenerationRef.current === generation && runtimeKeywordRequestRef.current === payload.requestKey) {
        activeKeywordResponseRef.current = null;
        keywordStreamingResponseRef.current = "";
        runtimeKeywordInFlightRef.current = false;
        setRuntimeKeywordStatus(contextRef.current.runtimeKeywords?.length ? "ready" : "error");
      }
    }
  }

  function finishRealtimeKeywordResponse(text: string) {
    const active = activeKeywordResponseRef.current;
    if (!active) {
      return;
    }

    const pendingRequest = getPendingRuntimeKeywordRequest();
    const hasNewerPending = Boolean(
      pendingRequest
      && pendingRequest.generation === active.generation
      && pendingRequest.fingerprint !== active.fingerprint
    );
    const stillLatest = runtimeKeywordRequestRef.current === active.requestKey && !hasNewerPending;
    activeKeywordResponseRef.current = null;
    keywordStreamingResponseRef.current = "";
    runtimeKeywordInFlightRef.current = false;

    if (runtimeKeywordGenerationRef.current === active.generation && stillLatest) {
      const nextKeywords = parseRealtimeKeywordTerms(text);
      syncRuntimeKeywords(nextKeywords);
      setRuntimeKeywordStatus(nextKeywords.length ? "ready" : hasRealtimeKeywordContract(text) ? "empty" : "error");
      if (nextKeywords.length) {
        setMode((current) => current === "mini" ? "expanded" : current);
      }
    }

    if (getPendingRuntimeKeywordRequest()?.generation === active.generation) {
      scheduleRuntimeKeywordFlush(0);
    }
  }

  function failActiveKeywordResponse() {
    activeKeywordResponseRef.current = null;
    keywordStreamingResponseRef.current = "";
    runtimeKeywordInFlightRef.current = false;
  }

  return {
    runtimeKeywordGenerationRef,
    clearRuntimeKeywordRequests,
    queueRuntimeKeywordRequest,
    scheduleRuntimeKeywordFlush,
    getPendingRuntimeKeywordRequest,
    finishRealtimeKeywordResponse,
    failActiveKeywordResponse
  };
}

function buildKeywordRequestFingerprint(value: string) {
  const normalized = normalizeRuntimeFingerprintText(value);
  return normalized.length <= 360 ? normalized : normalized.slice(normalized.length - 360);
}

function parseRealtimeKeywordTerms(text: string) {
  const keywordLine = text
    .split(/\n+/)
    .map((line) => line.trim())
    .find((line) => /^KEYWORDS\s*:/i.test(line));
  if (!keywordLine) {
    return [];
  }

  const [, rawKeywords = ""] = keywordLine.split(/KEYWORDS\s*:/i);
  return rawKeywords
    .split("|")
    .map((term) => term.replace(/^[-*\u2022]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

function hasRealtimeKeywordContract(text: string) {
  return /^KEYWORDS\s*:/im.test(text);
}

function normalizeRuntimeFingerprintText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}
