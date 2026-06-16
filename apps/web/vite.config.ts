import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        pricing: resolve(__dirname, "pricing.html"),
        desktopSignIn: resolve(__dirname, "desktop-sign-in.html"),
        checkout: resolve(__dirname, "checkout.html"),
        paymentSuccess: resolve(__dirname, "payment-success.html"),
        paymentPending: resolve(__dirname, "payment-pending.html"),
        paymentFailed: resolve(__dirname, "payment-failed.html"),
        privacyPolicy: resolve(__dirname, "privacy-policy.html"),
        termsOfService: resolve(__dirname, "terms-of-service.html")
      }
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5174,
    proxy: {
      "/auth": {
        target: "http://127.0.0.1:4000",
        changeOrigin: true
      },
      "/payments": {
        target: "http://127.0.0.1:4000",
        changeOrigin: true
      }
    }
  },
  preview: {
    host: "127.0.0.1",
    port: 4174
  }
});
