const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

const planCatalog = {
  mini: {
    name: "Mini",
    priceLabel: "Rp29rb",
    description: "3 kali sesi live dalam satu bulan.",
    features: [
      "3 kali sesi live",
      "Upload profil referensi",
      "Masukkan konteks meeting",
      "Bantuan respons saat meeting"
    ]
  },
  starter: {
    name: "Starter",
    priceLabel: "Rp98rb",
    description: "12 kali sesi live dalam satu bulan.",
    features: [
      "Semua di Mini",
      "12 kali sesi live",
      "Overlay privat",
      "Mode screen share"
    ]
  },
  pro: {
    name: "Pro",
    priceLabel: "Rp359rb",
    description: "Sesi live tak terbatas untuk penggunaan intensif.",
    features: [
      "Semua fitur di Starter",
      "Sesi live tak terbatas",
      "Lebih lega untuk jadwal padat",
      "Cocok untuk penggunaan intensif"
    ]
  }
};

function apiUrl(path) {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function selectedPlanSlug() {
  const params = new URLSearchParams(window.location.search);
  const plan = params.get("plan") || "starter";
  return Object.prototype.hasOwnProperty.call(planCatalog, plan) ? plan : "starter";
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

async function fetchJson(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || "Request gagal.");
  }
  return payload;
}

function renderPlan(planSlug) {
  const plan = planCatalog[planSlug];
  setText("planName", plan.name);
  setText("planDescription", plan.description);
  setText("planPrice", plan.priceLabel);
  setText("totalPrice", plan.priceLabel);

  const features = document.getElementById("planFeatures");
  if (features) {
    features.innerHTML = plan.features.map((feature) => `<div class="feature-item">${feature}</div>`).join("");
  }

  const loginButton = document.getElementById("loginButton");
  if (loginButton) {
    loginButton.setAttribute("href", `/auth/google/login?plan=${encodeURIComponent(planSlug)}`);
  }
}

async function initCheckout() {
  const planSlug = selectedPlanSlug();
  renderPlan(planSlug);

  const payButton = document.getElementById("payButton");
  const loginButton = document.getElementById("loginButton");
  const statusText = document.getElementById("statusText");

  try {
    const payload = await fetchJson("/auth/me");
    setText("accountName", payload.user.name || "User Orviko");
    setText("accountEmail", payload.user.email || "");
    if (payButton) payButton.disabled = false;
    if (statusText) statusText.textContent = "Checkout siap. Pembayaran akan dibuka melalui Lynk.id.";
  } catch (error) {
    setText("accountName", "Login Google diperlukan");
    setText("accountEmail", "Silakan login ulang untuk melanjutkan checkout.");
    if (payButton) payButton.hidden = true;
    if (loginButton) loginButton.hidden = false;
    if (statusText) {
      statusText.textContent = error instanceof Error ? error.message : "Login diperlukan.";
      statusText.classList.add("error");
    }
    return;
  }

  payButton?.addEventListener("click", async () => {
    try {
      payButton.disabled = true;
      if (statusText) {
        statusText.textContent = "Menyiapkan checkout Lynk.id...";
        statusText.classList.remove("error");
      }

      const payment = await fetchJson("/payments/lynk/create", {
        method: "POST",
        body: JSON.stringify({ plan: planSlug })
      });

      if (!payment.redirectUrl) {
        throw new Error("Link pembayaran Lynk.id belum tersedia.");
      }

      if (statusText) statusText.textContent = "Membuka halaman pembayaran Lynk.id...";
      window.location.href = payment.redirectUrl;
    } catch (error) {
      if (statusText) {
        statusText.textContent = error instanceof Error ? error.message : "Gagal memulai pembayaran.";
        statusText.classList.add("error");
      }
      payButton.disabled = false;
    }
  });
}

function formatAmount(value) {
  return `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
}

async function initPaymentStatus() {
  const details = document.getElementById("paymentDetails");
  const params = new URLSearchParams(window.location.search);
  const paymentId = params.get("payment_id");
  if (!details) return;

  if (!paymentId) {
    details.innerHTML = "<div><dt>Status</dt><dd>Payment ID tidak ditemukan</dd></div>";
    return;
  }

  try {
    const payment = await fetchJson(`/payments/${encodeURIComponent(paymentId)}`);
    details.innerHTML = [
      ["Order ID", payment.orderId || "-"],
      ["Paket", planCatalog[payment.plan]?.name || payment.plan || "-"],
      ["Tagihan", formatAmount(payment.grossAmount)],
      ["Status terakhir", payment.status || "-"]
    ].map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("");
  } catch (error) {
    details.innerHTML = `<div><dt>Status</dt><dd>${error instanceof Error ? error.message : "Gagal memuat payment"}</dd></div>`;
  }
}

if (document.body.dataset.page === "checkout") {
  void initCheckout();
}

if (document.body.dataset.page === "payment-status") {
  void initPaymentStatus();
}
