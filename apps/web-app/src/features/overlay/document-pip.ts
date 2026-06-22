type DocumentPictureInPictureOptions = {
  width?: number;
  height?: number;
  disallowReturnToOpener?: boolean;
  preferInitialWindowPlacement?: boolean;
};

type DocumentPictureInPictureApi = {
  window: Window | null;
  requestWindow(options?: DocumentPictureInPictureOptions): Promise<Window>;
};

type WindowWithDocumentPictureInPicture = Window & {
  documentPictureInPicture?: DocumentPictureInPictureApi;
};

export type FloatingOverlayDocument = {
  pipWindow: Window;
  mountNode: HTMLElement;
};

export function supportsDocumentPictureInPicture() {
  return window.isSecureContext
    && "documentPictureInPicture" in window
    && Boolean((window as WindowWithDocumentPictureInPicture).documentPictureInPicture);
}

export async function openDocumentPictureInPicture(): Promise<FloatingOverlayDocument> {
  const api = (window as WindowWithDocumentPictureInPicture).documentPictureInPicture;
  if (!window.isSecureContext || !api) {
    throw new Error("Floating overlay belum didukung oleh browser ini.");
  }

  const pipWindow = await api.requestWindow({
    width: 430,
    height: 72,
    disallowReturnToOpener: true,
    preferInitialWindowPlacement: true
  });

  pipWindow.document.title = "Orviko Audio";
  pipWindow.document.documentElement.className = "floating-overlay-document";
  pipWindow.document.body.className = "floating-overlay-body";
  copyDocumentStyles(document, pipWindow.document);

  const mountNode = pipWindow.document.createElement("div");
  mountNode.id = "floating-overlay-root";
  pipWindow.document.body.append(mountNode);

  return { pipWindow, mountNode };
}

function copyDocumentStyles(source: Document, target: Document) {
  for (const stylesheet of Array.from(source.styleSheets)) {
    try {
      const rules = Array.from(stylesheet.cssRules, (rule) => rule.cssText).join("\n");
      const style = target.createElement("style");
      style.textContent = rules;
      target.head.append(style);
    } catch {
      if (!stylesheet.href) continue;
      const link = target.createElement("link");
      link.rel = "stylesheet";
      link.href = stylesheet.href;
      target.head.append(link);
    }
  }
}
