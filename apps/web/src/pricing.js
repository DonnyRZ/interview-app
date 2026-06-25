import { buildApiUrl } from "./api-base.js";

document.querySelectorAll("[data-login-plan]").forEach((node) => {
  const plan = node.getAttribute("data-login-plan");
  if (!plan) return;
  node.setAttribute("href", buildApiUrl(`/auth/google/login?plan=${encodeURIComponent(plan)}`));
});
