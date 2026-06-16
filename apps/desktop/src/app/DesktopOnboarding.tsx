import { useEffect, useState, type ReactNode } from "react";
import interviewPreviewUrl from "../../../web/public/assets/interview-2.jpg";
import logoUrl from "../../../web/public/assets/Logo-2.png";
import wallpaperUrl from "../../../web/public/assets/walpaper-2.png";

type GateStatus = "checking" | "login" | "pricing" | "home";
type PlanSlug = "mini" | "starter" | "pro";

type DesktopOnboardingProps = {
  children: ReactNode;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:4000";
const WEB_BASE_URL = import.meta.env.VITE_WEB_BASE_URL || import.meta.env.VITE_FRONTEND_BASE_URL || "https://dev.orviko.net";

function hasActiveSubscription(user: DesktopAuthUser | undefined) {
  if (!user || !user.subscriptionPlan || user.subscriptionPlan === "free" || !user.subscriptionExpiresAt) {
    return false;
  }

  return new Date(user.subscriptionExpiresAt).getTime() > Date.now();
}

function gateStatusFor(state: DesktopAuthState): GateStatus {
  if (!state.authenticated) {
    return "login";
  }

  return hasActiveSubscription(state.user) ? "home" : "pricing";
}

function checkoutUrl(plan: PlanSlug) {
  const url = new URL("/checkout.html", WEB_BASE_URL);
  url.searchParams.set("plan", plan);
  return url.toString();
}

async function getAuthStateFromApi(): Promise<DesktopAuthState> {
  const response = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/auth/me`, {
    credentials: "include"
  });

  if (!response.ok) {
    return { authenticated: false };
  }

  const payload = await response.json() as { user?: DesktopAuthUser };
  return payload.user ? { authenticated: true, user: payload.user } : { authenticated: false };
}

export function DesktopOnboarding({ children }: DesktopOnboardingProps) {
  const [gateStatus, setGateStatus] = useState<GateStatus>("checking");
  const [authState, setAuthState] = useState<DesktopAuthState>({ authenticated: false });
  const [message, setMessage] = useState("");
  const [isOpeningLogin, setIsOpeningLogin] = useState(false);

  function applyAuthState(nextState: DesktopAuthState) {
    setAuthState(nextState);
    setGateStatus(gateStatusFor(nextState));
    if (nextState.authenticated) {
      setMessage("");
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadAuthState() {
      try {
        const nextState = window.interviewDesktop?.getDesktopAuthState
          ? await window.interviewDesktop.getDesktopAuthState()
          : await getAuthStateFromApi();

        if (!cancelled) {
          applyAuthState(nextState);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Gagal memeriksa sesi Orviko.");
          setGateStatus("login");
        }
      }
    }

    const unsubscribe = window.interviewDesktop?.onDesktopAuthChanged?.((nextState) => {
      applyAuthState(nextState);
      setIsOpeningLogin(false);
    });

    void loadAuthState();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  async function startLogin() {
    setIsOpeningLogin(true);
    setMessage("Membuka login Google di browser...");

    try {
      if (window.interviewDesktop?.startDesktopLogin) {
        const result = await window.interviewDesktop.startDesktopLogin();
        if (!result.ok) {
          throw new Error(result.message || "Gagal membuka login Google.");
        }
      } else {
        window.open(`${API_BASE_URL.replace(/\/$/, "")}/auth/google/login?plan=starter&flow=desktop`, "_blank", "noopener,noreferrer");
      }

      setMessage("Selesaikan login di browser, lalu pilih Open Orviko saat diminta.");
    } catch (error) {
      setIsOpeningLogin(false);
      setMessage(error instanceof Error ? error.message : "Gagal membuka login Google.");
    }
  }

  if (gateStatus === "checking") {
    return (
      <main className="desktop-loading-screen">
        <img src={logoUrl} alt="Orviko" />
        <p>Memeriksa sesi Orviko...</p>
      </main>
    );
  }

  if (gateStatus === "login") {
    return (
      <DesktopLoginScreen
        isOpeningLogin={isOpeningLogin}
        message={message}
        onContinue={() => void startLogin()}
      />
    );
  }

  if (gateStatus === "pricing") {
    return <DesktopPricingScreen />;
  }

  return <>{children}</>;
}

function DesktopLoginScreen({
  isOpeningLogin,
  message,
  onContinue
}: {
  isOpeningLogin: boolean;
  message: string;
  onContinue: () => void;
}) {
  return (
    <main
      className="desktop-login-shell"
      style={{ "--desktop-wallpaper": `url(${wallpaperUrl})` } as React.CSSProperties}
    >
      <section className="desktop-login-welcome" aria-label="Pembuka aplikasi desktop Orviko">
        <div className="desktop-login-card">
          <div className="desktop-login-brand">
            <img src={logoUrl} alt="Logo Orviko" />
            <span>Orviko</span>
          </div>

          <div>
            <h1>Selamat datang di Orviko</h1>
            <p className="desktop-login-subcopy">Pendamping AI untuk online meeting yang membantu kamu tetap tenang, relevan, dan siap merespons saat percakapan berlangsung.</p>
          </div>

          <button className="desktop-login-cta" type="button" onClick={onContinue} disabled={isOpeningLogin}>
            <span>{isOpeningLogin ? "Membuka..." : "Lanjut"}</span>
            <svg className="desktop-login-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12H19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M13 6L19 12L13 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {message ? <p className="desktop-login-status">{message}</p> : null}

          <div className="desktop-login-legal">
            Dengan melanjutkan, kamu menyetujui <a href="https://orviko.net/terms-of-service.html" target="_blank" rel="noreferrer">Syarat Layanan</a> dan <a href="https://orviko.net/privacy-policy.html" target="_blank" rel="noreferrer">Kebijakan Privasi</a> Orviko.
            <div className="desktop-login-proofs" aria-hidden="true">
              <span>Desktop-first</span>
              <span>Realtime assist</span>
              <span>Untuk meeting online</span>
            </div>
          </div>
        </div>
      </section>

      <section className="desktop-login-visual" aria-label="Preview produk Orviko">
        <div className="desktop-login-visual-inner">
          <div className="desktop-login-preview-stack">
            <div className="desktop-login-meeting-window" aria-hidden="true">
              <img src={interviewPreviewUrl} alt="" />
            </div>

            <div className="desktop-login-overlay-group">
              <div className="desktop-login-overlay-panel">
                <div className="desktop-login-overlay-top">
                  <div>
                    <p className="desktop-login-overlay-kicker">LISTENING 02:14</p>
                    <h3>Live Meeting</h3>
                    <p className="desktop-login-overlay-meta">Tokopedia - Interview</p>
                    <p className="desktop-login-overlay-audio">Listening to active system audio</p>
                  </div>
                  <button className="desktop-login-overlay-button" type="button">Hide</button>
                </div>

                <div className="desktop-login-keywords">
                  <button type="button">Prioritas Tim</button>
                  <button type="button">Risiko Timeline</button>
                  <button type="button">Next Step</button>
                </div>

                <form className="desktop-login-ask" onSubmit={(event) => event.preventDefault()}>
                  <input type="text" placeholder="Tulis bantuan spesifik..." />
                  <button type="submit">Ask</button>
                </form>
              </div>

              <aside className="desktop-login-response">
                <div className="desktop-login-response-top">
                  <div>
                    <p className="desktop-login-response-kicker">MEETING HELP</p>
                    <h3>Tanggapi</h3>
                  </div>
                  <button type="button">Close</button>
                </div>

                <ul>
                  <li>Setuju, menurut saya kita perlu kunci dua prioritas paling penting dulu supaya tim punya arah yang jelas minggu ini.</li>
                  <li>Untuk keputusan yang belum matang, kita bisa tandai sebagai risiko dan tentukan owner-nya, jadi tidak hilang setelah meeting.</li>
                  <li>Saya usul di akhir sesi kita tutup dengan next step singkat: prioritas, owner, dan deadline.</li>
                </ul>
              </aside>
            </div>
          </div>

          <div className="desktop-login-visual-copy">
            <h2>Bantu kamu tidak blank saat interview</h2>
          </div>
        </div>
      </section>
    </main>
  );
}

function DesktopPricingScreen() {
  const [message, setMessage] = useState("");
  const [openingPlan, setOpeningPlan] = useState<PlanSlug | null>(null);

  async function openCheckout(plan: PlanSlug) {
    setOpeningPlan(plan);
    setMessage("Membuka checkout di browser...");

    try {
      if (window.interviewDesktop?.openDesktopCheckout) {
        const result = await window.interviewDesktop.openDesktopCheckout(plan);
        if (!result.ok) {
          throw new Error(result.message || "Gagal membuka checkout.");
        }
      } else {
        window.open(checkoutUrl(plan), "_blank", "noopener,noreferrer");
      }

      setMessage("Checkout web sudah dibuka di browser.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal membuka checkout.");
    } finally {
      setOpeningPlan(null);
    }
  }

  return (
    <main
      className="desktop-pricing-shell"
      aria-label="Pilih paket desktop Orviko"
      style={{ "--desktop-wallpaper": `url(${wallpaperUrl})` } as React.CSSProperties}
    >
      <div className="desktop-pricing-content">
        <div className="desktop-pricing-brand-row">
          <div className="desktop-pricing-brand">
            <img src={logoUrl} alt="Logo Orviko" />
            <span>Orviko</span>
          </div>
        </div>

        <section className="desktop-pricing-hero">
          <h1>Pilih paket Orviko yang paling cocok untuk ritme kamu</h1>
        </section>

        <section className="desktop-pricing-grid" aria-label="Daftar paket desktop Orviko">
          <PricingPlan
            plan="mini"
            badge="Paling ringan"
            name="Mini"
            price="Rp29rb"
            features={["3 kali sesi live", "Upload profil referensi", "Masukkan konteks meeting", "Bantuan respons saat meeting"]}
            isOpening={openingPlan === "mini"}
            onSelect={openCheckout}
          />
          <PricingPlan
            plan="starter"
            badge="Hemat"
            tag="Rekomendasi"
            name="Starter"
            price="Rp98rb"
            featured
            features={["Semua di Mini", "12 kali sesi live", "Overlay privat", "Mode screen share"]}
            goldFeatures={["Overlay privat", "Mode screen share"]}
            isOpening={openingPlan === "starter"}
            onSelect={openCheckout}
          />
          <PricingPlan
            plan="pro"
            badge="Paling bebas"
            name="Pro"
            price="Rp359rb"
            features={["Semua fitur di Starter", "Sesi live tak terbatas", "Lebih lega untuk jadwal padat", "Cocok untuk penggunaan intensif"]}
            isOpening={openingPlan === "pro"}
            onSelect={openCheckout}
          />
        </section>
        {message ? <p className="desktop-pricing-status">{message}</p> : null}
      </div>
    </main>
  );
}

function PricingPlan({
  plan,
  badge,
  tag,
  name,
  price,
  features,
  goldFeatures = [],
  featured = false,
  isOpening,
  onSelect
}: {
  plan: PlanSlug;
  badge: string;
  tag?: string;
  name: string;
  price: string;
  features: string[];
  goldFeatures?: string[];
  featured?: boolean;
  isOpening: boolean;
  onSelect: (plan: PlanSlug) => void | Promise<void>;
}) {
  return (
    <article className={`desktop-pricing-plan ${featured ? "featured" : ""}`}>
      <div className="desktop-plan-badges">
        <span>{badge}</span>
        {tag ? <strong>{tag}</strong> : null}
      </div>
      <h2>{name}</h2>
      <div className="desktop-plan-price"><strong>{price}</strong><span>/bulan</span></div>
      <ul>
        {features.map((feature) => (
          <li className={goldFeatures.includes(feature) ? "gold" : ""} key={feature}>{feature}</li>
        ))}
      </ul>
      <button type="button" onClick={() => void onSelect(plan)} disabled={isOpening}>
        {isOpening ? "Membuka..." : "Pilih paket ini"}
      </button>
    </article>
  );
}
