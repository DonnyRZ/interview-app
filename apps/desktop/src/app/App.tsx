import { ProfileDocumentDashboard } from "../features/profile-documents/ProfileDocumentDashboard.js";
import { InterviewOverlay } from "../features/overlay/InterviewOverlay.js";
import { DesktopOnboarding } from "./DesktopOnboarding.js";

export function App() {
  if (new URLSearchParams(window.location.search).get("window") === "overlay") {
    return <InterviewOverlay />;
  }

  return (
    <DesktopOnboarding>
      <ProfileDocumentDashboard />
    </DesktopOnboarding>
  );
}
