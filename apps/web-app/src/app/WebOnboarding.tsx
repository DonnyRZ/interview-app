import { useCallback, useEffect, useState, type ReactNode } from "react";
import { API_BASE_URL, apiRequest } from "../lib/api-client.js";

type AuthUser = {
  email: string;
  subscriptionPlan: string;
  subscriptionExpiresAt: string | null;
};

type Gate = "checking" | "login" | "pricing" | "home";

export function WebOnboarding({ children }: { children: ReactNode }) {
  const [gate, setGate] = useState<Gate>(import.meta.env.DEV ? "home" : "checking");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    if (import.meta.env.DEV) return;
    try {
      const response = await apiRequest<{ user: AuthUser }>("/auth/me");
      setGate(hasActiveSubscription(response.user) ? "home" : "pricing");
      setMessage("");
    } catch (error) {
      setGate("login");
      setMessage(error instanceof Error ? error.message : "Login diperlukan.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && gate === "pricing") void refresh();
    }, 5_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [gate, refresh]);

  if (gate === "home") return <>{children}</>;
  if (gate === "checking") return <GateShell title="Memeriksa sesi Orviko" body="Menyiapkan workspace web..." />;
  if (gate === "login") {
    return (
      <GateShell title="Masuk ke Orviko" body="Gunakan akun Google yang sama dengan subscription Orviko.">
        <button className="primary-btn" type="button" onClick={() => window.location.assign(`${API_BASE_URL}/auth/google/login?plan=starter&flow=web-app`)}>
          Lanjut dengan Google
        </button>
        {message ? <p className="gate-message">{message}</p> : null}
      </GateShell>
    );
  }
  return (
    <GateShell title="Pilih paket Orviko" body="Subscription aktif diperlukan untuk memulai sesi live.">
      <div className="web-pricing-actions">
        {(["mini", "starter", "pro"] as const).map((plan) => (
          <a className={plan === "starter" ? "primary-btn" : "secondary-btn"} href={`${API_BASE_URL}/checkout.html?plan=${plan}`} target="_blank" rel="noreferrer" key={plan}>
            {plan.charAt(0).toUpperCase() + plan.slice(1)}
          </a>
        ))}
      </div>
      <p className="gate-message">Halaman ini akan terbuka otomatis setelah pembayaran terkonfirmasi.</p>
    </GateShell>
  );
}

function GateShell({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <main className="web-gate-shell">
      <section className="panel web-gate-card">
        <img src={`${import.meta.env.BASE_URL}assets/orviko-logo.png`} alt="Orviko" />
        <h1>{title}</h1>
        <p>{body}</p>
        {children}
      </section>
    </main>
  );
}

function hasActiveSubscription(user: AuthUser) {
  return Boolean(
    user.subscriptionPlan
    && user.subscriptionPlan !== "free"
    && user.subscriptionExpiresAt
    && new Date(user.subscriptionExpiresAt).getTime() > Date.now()
  );
}
