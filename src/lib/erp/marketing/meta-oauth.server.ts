import { GRAPH_VERSION } from "./meta.server";

export const META_SCOPES = "ads_read,ads_management,business_management";
const enc = new TextEncoder();

function b64url(buf: ArrayBuffer | Uint8Array) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string) {
  return atob(s.replace(/-/g, "+").replace(/_/g, "/"));
}

export function metaAppCreds() {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error("Meta App ID/Secret set kora nai");
  return { appId, appSecret };
}

async function hmac(secret: string, msg: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

export type OAuthState = { uid: string; origin: string; exp: number };

export async function signState(s: OAuthState, secret: string) {
  const body = b64url(enc.encode(JSON.stringify(s)));
  return `${body}.${await hmac(secret, body)}`;
}

export async function verifyState(token: string, secret: string): Promise<OAuthState> {
  const [body, sig] = token.split(".");
  if (!body || !sig || (await hmac(secret, body)) !== sig) throw new Error("Invalid state");
  const s = JSON.parse(fromB64url(body)) as OAuthState;
  if (Date.now() > s.exp) throw new Error("Login link expire hoye geche, abar try koro");
  return s;
}

export function redirectUri(origin: string) {
  return `${origin}/api/public/meta/oauth-callback`;
}

export function buildLoginUrl(appId: string, origin: string, state: string) {
  const q = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri(origin),
    state,
    scope: META_SCOPES,
    response_type: "code",
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${q}`;
}

async function graph(path: string, params: Record<string, string>) {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}${path}?${new URLSearchParams(params)}`);
  const j: any = await res.json();
  if (!res.ok || j?.error) throw new Error(j?.error?.message || `Meta ${res.status}`);
  return j;
}

/** code → short token → long-lived (~60 day) token */
export async function exchangeCode(code: string, origin: string) {
  const { appId, appSecret } = metaAppCreds();
  const short = await graph("/oauth/access_token", {
    client_id: appId, client_secret: appSecret, redirect_uri: redirectUri(origin), code,
  });
  const long = await graph("/oauth/access_token", {
    grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: short.access_token,
  });
  const me = await graph("/me", { fields: "name", access_token: long.access_token }).catch(() => ({ name: null }));
  return {
    token: long.access_token as string,
    expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : null,
    name: (me?.name as string) ?? null,
  };
}
