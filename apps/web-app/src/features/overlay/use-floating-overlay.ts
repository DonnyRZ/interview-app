import { useCallback, useEffect, useRef, useState } from "react";
import {
  openDocumentPictureInPicture,
  supportsDocumentPictureInPicture
} from "./document-pip.js";

type FloatingOverlayState = {
  pipWindow: Window | null;
  mountNode: HTMLElement | null;
  error: string;
};

const initialState: FloatingOverlayState = {
  pipWindow: null,
  mountNode: null,
  error: ""
};

const overlaySizes = {
  mini: { width: 430, height: 72 },
  expanded: { width: 560, height: 440 },
  response: { width: 900, height: 440 }
} as const;

export type FloatingOverlayMode = keyof typeof overlaySizes;

export function useFloatingOverlay(onWindowClosed?: () => void) {
  const [state, setState] = useState<FloatingOverlayState>(initialState);
  const windowRef = useRef<Window | null>(null);

  const close = useCallback(() => {
    const pipWindow = windowRef.current;
    windowRef.current = null;
    if (pipWindow && !pipWindow.closed) pipWindow.close();
    setState(initialState);
  }, []);

  const open = useCallback(async () => {
    const existingWindow = windowRef.current;
    if (existingWindow && !existingWindow.closed) {
      existingWindow.focus();
      return true;
    }

    setState((current) => ({ ...current, error: "" }));
    try {
      const overlay = await openDocumentPictureInPicture();
      windowRef.current = overlay.pipWindow;

      overlay.pipWindow.addEventListener("pagehide", () => {
        if (windowRef.current !== overlay.pipWindow) return;
        windowRef.current = null;
        setState(initialState);
        onWindowClosed?.();
      }, { once: true });

      setState({ ...overlay, error: "" });
      return true;
    } catch (error) {
      setState({
        ...initialState,
        error: error instanceof Error ? error.message : "Floating overlay gagal dibuka."
      });
      return false;
    }
  }, [onWindowClosed]);

  const resize = useCallback((mode: FloatingOverlayMode) => {
    const pipWindow = windowRef.current;
    if (!pipWindow || pipWindow.closed) return;
    const size = overlaySizes[mode];
    try {
      pipWindow.resizeBy(size.width - pipWindow.innerWidth, size.height - pipWindow.innerHeight);
    } catch {
      // Browser controls the final Picture-in-Picture bounds.
    }
  }, []);

  useEffect(() => () => {
    const pipWindow = windowRef.current;
    windowRef.current = null;
    if (pipWindow && !pipWindow.closed) pipWindow.close();
  }, []);

  return {
    ...state,
    supported: supportsDocumentPictureInPicture(),
    active: Boolean(state.pipWindow && !state.pipWindow.closed),
    open,
    close,
    resize
  };
}
