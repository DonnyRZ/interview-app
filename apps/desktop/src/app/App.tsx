import { ProfileDocumentDashboard } from "../features/profile-documents/ProfileDocumentDashboard.js";
import { InterviewOverlay } from "../features/overlay/InterviewOverlay.js";
import { DesktopOnboarding } from "./DesktopOnboarding.js";
import { DesktopTitleBar } from "./DesktopTitleBar.js";

export function App() {
  if (new URLSearchParams(window.location.search).get("window") === "overlay") {
    return <InterviewOverlay />;
  }

  return (
    <div className="desktop-window-shell">
      <DesktopTitleBar />
      <div className="desktop-window-content">
        <DesktopOnboarding>
          <ProfileDocumentDashboard />
        </DesktopOnboarding>
      </div>
    </div>
  );
}
