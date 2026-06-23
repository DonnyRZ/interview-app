import { MeetingWorkspace } from "../features/workspace/MeetingWorkspace.js";
import { WebOnboarding } from "./WebOnboarding.js";

export function WebMeetingApp() {
  return <WebOnboarding><MeetingWorkspace /></WebOnboarding>;
}
