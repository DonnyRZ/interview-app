import { Dispatch, MutableRefObject, SetStateAction, useRef } from "react";
import { buildRealtimeCancelEvent } from "./overlay-realtime-state.js";

export type ActiveRealtimeResponse = {
  requestId: number;
  action: RealtimeOverlayAction["action"];
  conversationMode?: RealtimeOverlayAction["conversationMode"];
  sourceText?: string;
  payload?: RealtimeOverlayAction;
  retryCount?: number;
  responseId?: string;
};

export type ActiveKeywordRealtimeResponse = {
  requestKey: string;
  fingerprint: string;
  generation: number;
  responseId?: string;
};

type RealtimeStatusContext = {
  realtimeStatus?: string;
  realtimeMessage?: string;
};

type ControllerOptions<TContext extends RealtimeStatusContext> = {
  contextRef: MutableRefObject<TContext>;
  setContext: Dispatch<SetStateAction<TContext>>;
};

export function useRealtimeResponseController<TContext extends RealtimeStatusContext>({
  contextRef,
  setContext
}: ControllerOptions<TContext>) {
  const activeRealtimeResponseRef = useRef<ActiveRealtimeResponse | null>(null);
  const activeKeywordResponseRef = useRef<ActiveKeywordRealtimeResponse | null>(null);
  const streamingResponseRef = useRef("");
  const keywordStreamingResponseRef = useRef("");
  const realtimeSocketRef = useRef<WebSocket | null>(null);
  const realtimeStatusRef = useRef("");

  function updateRealtimeStatus(status: string, message: string) {
    realtimeStatusRef.current = status;
    setContext((current) => {
      const nextContext = {
        ...current,
        realtimeStatus: status,
        realtimeMessage: message
      };
      contextRef.current = nextContext;
      return nextContext;
    });
  }

  function sendRealtimeClientEvent(event: Record<string, unknown>) {
    const socket = realtimeSocketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    socket.send(JSON.stringify(event));
    return true;
  }

  function cancelActiveRealtimeResponse() {
    const cancelEvent = buildRealtimeCancelEvent(activeRealtimeResponseRef.current);
    if (cancelEvent) {
      sendRealtimeClientEvent(cancelEvent);
    }

    activeRealtimeResponseRef.current = null;
    streamingResponseRef.current = "";
  }

  function cancelActiveKeywordResponse() {
    const cancelEvent = buildRealtimeCancelEvent(activeKeywordResponseRef.current);
    if (cancelEvent) {
      sendRealtimeClientEvent(cancelEvent);
    }

    activeKeywordResponseRef.current = null;
    keywordStreamingResponseRef.current = "";
  }

  return {
    activeRealtimeResponseRef,
    activeKeywordResponseRef,
    streamingResponseRef,
    keywordStreamingResponseRef,
    realtimeSocketRef,
    realtimeStatusRef,
    updateRealtimeStatus,
    sendRealtimeClientEvent,
    cancelActiveRealtimeResponse,
    cancelActiveKeywordResponse
  };
}
