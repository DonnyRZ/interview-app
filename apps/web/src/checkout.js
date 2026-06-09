const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

const planCatalog = {
  mini: {
    name: "Mini",
    priceLabel: "Rp29rb",
    description: "3 kali sesi live dalam satu bulan."
  },
  starter: {
    name: "Starter",
    priceLabel: "Rp98rb",
    description: "12 kali sesi live dalam satu bulan."
  },
  pro: {
    name: "Pro",
    priceLabel: "Rp359rb",
    description: "Sesi live tak terbatas untuk penggunaan intensif."
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

function fitCheckoutEmail() {
  const emailNode = document.getElementById("checkoutEmail");
  if (!emailNode) return;

  const availableWidth = emailNode.parentElement?.clientWidth || emailNode.clientWidth;
  const maxSize = Math.min(Math.max(window.innerWidth * 0.037, 28), 50);
  const minSize = 12;
  let size = maxSize;

  emailNode.style.setProperty("--checkout-email-font-size", `${size}px`);
  while (emailNode.scrollWidth > availableWidth && size > minSize) {
    size -= 1;
    emailNode.style.setProperty("--checkout-email-font-size", `${size}px`);
  }
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "readonly");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
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
  setText("totalPrice", plan.priceLabel);

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
  const copyEmailButton = document.getElementById("copyEmailButton");
  const modalCopyEmailButton = document.getElementById("modalCopyEmailButton");
  const copyEmailModal = document.getElementById("copyEmailModal");
  const statusText = document.getElementById("statusText");
  let checkoutEmail = "";
  let hasCopiedEmail = false;

  function openCopyEmailModal() {
    if (!copyEmailModal) return;
    copyEmailModal.hidden = false;
    modalCopyEmailButton?.focus();
  }

  function closeCopyEmailModal() {
    if (!copyEmailModal) return;
    copyEmailModal.hidden = true;
  }

  async function copyCheckoutEmail() {
    if (!checkoutEmail) return;

    await copyText(checkoutEmail);
    hasCopiedEmail = true;
    if (copyEmailButton) {
      copyEmailButton.textContent = "Email tersalin";
      copyEmailButton.classList.add("copied");
      window.setTimeout(() => {
        copyEmailButton.textContent = "Copy email";
        copyEmailButton.classList.remove("copied");
      }, 2400);
    }
    if (statusText) {
      statusText.textContent = "Email sudah dicopy. Paste email yang sama di checkout Lynk.id.";
      statusText.classList.remove("error");
    }
  }

  try {
    const payload = await fetchJson("/auth/me");
    checkoutEmail = payload.user.email || "";
    setText("accountName", payload.user.name || "User Orviko");
    setText("accountEmail", checkoutEmail);
    setText("checkoutEmail", checkoutEmail);
    fitCheckoutEmail();
    if (payButton) payButton.disabled = false;
    if (copyEmailButton) copyEmailButton.disabled = !checkoutEmail;
    if (statusText) statusText.textContent = "Copy email di kiri, lalu lanjutkan pembayaran di Lynk.id.";
  } catch (error) {
    setText("accountName", "Login Google diperlukan");
    setText("accountEmail", "Silakan login ulang untuk melanjutkan checkout.");
    setText("checkoutEmail", "Login dulu untuk melihat email.");
    if (payButton) payButton.hidden = true;
    if (copyEmailButton) copyEmailButton.disabled = true;
    if (loginButton) loginButton.hidden = false;
    if (statusText) {
      statusText.textContent = error instanceof Error ? error.message : "Login diperlukan.";
      statusText.classList.add("error");
    }
    return;
  }

  window.addEventListener("resize", fitCheckoutEmail);

  copyEmailButton?.addEventListener("click", async () => {
    try {
      await copyCheckoutEmail();
    } catch {
      if (statusText) {
        statusText.textContent = "Gagal copy otomatis. Blok email di kiri lalu copy manual.";
        statusText.classList.add("error");
      }
    }
  });

  modalCopyEmailButton?.addEventListener("click", async () => {
    try {
      await copyCheckoutEmail();
      closeCopyEmailModal();
    } catch {
      if (statusText) {
        statusText.textContent = "Gagal copy otomatis. Blok email di kiri lalu copy manual.";
        statusText.classList.add("error");
      }
    }
  });

  document.querySelectorAll("[data-close-copy-modal]").forEach((node) => {
    node.addEventListener("click", closeCopyEmailModal);
  });

  payButton?.addEventListener("click", async () => {
    if (!hasCopiedEmail) {
      openCopyEmailModal();
      if (statusText) {
        statusText.textContent = "Copy email dulu sebelum lanjut ke checkout Lynk.id.";
        statusText.classList.add("error");
      }
      return;
    }

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
