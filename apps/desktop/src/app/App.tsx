import { CvDashboard } from "../features/cv/CvDashboard.js";
import { InterviewOverlay } from "../features/overlay/InterviewOverlay.js";

export function App() {
  if (new URLSearchParams(window.location.search).get("window") === "overlay") {
    return <InterviewOverlay />;
  }

  return <CvDashboard />;
}
