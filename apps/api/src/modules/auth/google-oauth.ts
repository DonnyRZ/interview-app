import { env } from "../../env.js";

type GoogleTokenResponse = {
  access_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
};

export type GoogleUserInfo = {
  sub: string;
  email: string;
  name: string;
  picture?: string;
};

export function assertGoogleOAuthConfigured() {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
    throw new Error("Google OAuth belum dikonfigurasi lengkap.");
  }
}

export function buildGoogleLoginUrl(state: string) {
  assertGoogleOAuthConfigured();
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID || "",
    redirect_uri: env.GOOGLE_REDIRECT_URI || "",
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    state
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string) {
  assertGoogleOAuthConfigured();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID || "",
      client_secret: env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: env.GOOGLE_REDIRECT_URI || "",
      grant_type: "authorization_code"
    })
  });

  if (!response.ok) {
    throw new Error("Gagal menukar code Google menjadi token.");
  }

  const payload = await response.json() as GoogleTokenResponse;
  if (!payload.access_token) {
    throw new Error("Access token Google tidak ditemukan.");
  }
  return payload.access_token;
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      "Authorization": `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error("Gagal mengambil profil user dari Google.");
  }

  const payload = await response.json() as Partial<GoogleUserInfo>;
  if (!payload.sub || !payload.email) {
    throw new Error("Profil Google tidak lengkap.");
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name || payload.email,
    picture: payload.picture
  };
}
