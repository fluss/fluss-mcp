import { Router } from "express";
import { SignJWT, jwtVerify } from "jose";

export interface OAuthConfig {
  jwtSecret: string;
  clientId: string;
  clientSecret: string;
}

function escape(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function baseUrl(req: { protocol: string; get: (h: string) => string | undefined }): string {
  // Trust forwarded headers from Lambda / reverse proxies
  const proto = req.get("x-forwarded-proto") ?? req.protocol;
  const host = req.get("x-forwarded-host") ?? req.get("host") ?? "localhost";
  return `${proto}://${host}`;
}

export function buildOAuthRouter(config: OAuthConfig): Router {
  const secret = new TextEncoder().encode(config.jwtSecret);
  const router = Router();

  // Needed to parse the authorization form submission
  router.use("/authorize", (req, _res, next) => {
    if (req.method === "POST") {
      let body = "";
      req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      req.on("end", () => {
        req.body = Object.fromEntries(new URLSearchParams(body).entries());
        next();
      });
    } else {
      next();
    }
  });

  // OAuth 2.0 discovery metadata
  router.get("/.well-known/oauth-authorization-server", (req, res) => {
    const base = baseUrl(req);
    res.json({
      issuer: base,
      authorization_endpoint: `${base}/authorize`,
      token_endpoint: `${base}/token`,
      token_endpoint_auth_methods_supported: ["client_secret_post"],
      grant_types_supported: ["authorization_code"],
      response_types_supported: ["code"],
    });
  });

  // Authorization page — user enters their Fluss API key here
  router.get("/authorize", (req, res) => {
    const { redirect_uri, state, client_id } = req.query as Record<string, string>;

    if (client_id !== config.clientId) {
      res.status(400).send("Unknown client_id");
      return;
    }

    res.setHeader("Content-Type", "text/html");
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Connect Fluss</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f5f5f5;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }
    .card {
      background: white;
      border-radius: 12px;
      padding: 40px;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 4px 24px rgba(0,0,0,.08);
    }
    .logo { font-size: 1.6rem; font-weight: 700; color: #1a56db; margin-bottom: 6px; }
    h1 { font-size: 1.2rem; margin: 0 0 8px; }
    p { color: #6b7280; font-size: 0.875rem; margin: 0 0 24px; }
    label { display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 6px; }
    input[type=password] {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 0.875rem;
      outline: none;
      transition: border-color .15s;
    }
    input[type=password]:focus { border-color: #1a56db; box-shadow: 0 0 0 3px rgba(26,86,219,.1); }
    button {
      margin-top: 20px;
      width: 100%;
      padding: 11px;
      background: #1a56db;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 0.9rem;
      font-weight: 500;
      cursor: pointer;
      transition: background .15s;
    }
    button:hover { background: #1e40af; }
    .hint { margin-top: 16px; font-size: 0.75rem; color: #9ca3af; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Fluss</div>
    <h1>Connect your account</h1>
    <p>Enter your Fluss API key to give Claude access to your devices.</p>
    <form method="POST" action="/authorize">
      <input type="hidden" name="redirect_uri" value="${escape(redirect_uri ?? "")}">
      <input type="hidden" name="state" value="${escape(state ?? "")}">
      <label for="api_key">Fluss API Key</label>
      <input type="password" id="api_key" name="api_key" placeholder="Paste your API key" required autofocus>
      <button type="submit">Authorize</button>
    </form>
    <p class="hint">Your API key is never stored — it's encrypted into the session token.</p>
  </div>
</body>
</html>`);
  });

  // Form submission — sign API key into a short-lived auth code
  router.post("/authorize", async (req, res) => {
    const { redirect_uri, state, api_key } = req.body as Record<string, string>;

    if (!api_key || !redirect_uri) {
      res.status(400).send("Missing required fields");
      return;
    }

    const code = await new SignJWT({ flussApiKey: api_key, type: "code" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(secret);

    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set("code", code);
    if (state) redirectUrl.searchParams.set("state", state);

    res.redirect(redirectUrl.toString());
  });

  // Token exchange — client trades auth code for Bearer access token
  router.post("/token", async (req, res) => {
    const { grant_type, code, client_id, client_secret } = req.body as Record<string, string>;

    if (client_id !== config.clientId || client_secret !== config.clientSecret) {
      res.status(401).json({ error: "invalid_client" });
      return;
    }

    if (grant_type !== "authorization_code") {
      res.status(400).json({ error: "unsupported_grant_type" });
      return;
    }

    try {
      const { payload } = await jwtVerify(code, secret);
      if (payload.type !== "code" || typeof payload.flussApiKey !== "string") {
        throw new Error("invalid code payload");
      }

      const accessToken = await new SignJWT({ flussApiKey: payload.flussApiKey, type: "access" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(secret);

      res.json({ access_token: accessToken, token_type: "Bearer", expires_in: 3600 });
    } catch {
      res.status(400).json({ error: "invalid_grant" });
    }
  });

  return router;
}

// Extracts the Fluss API key from either a Bearer JWT or the x-fluss-api-key header
export async function extractApiKey(
  authorizationHeader: string | undefined,
  fallbackHeader: string | undefined,
  jwtSecret: string,
): Promise<string | null> {
  if (authorizationHeader?.startsWith("Bearer ")) {
    const token = authorizationHeader.slice(7);
    try {
      const secret = new TextEncoder().encode(jwtSecret);
      const { payload } = await jwtVerify(token, secret);
      if (payload.type === "access" && typeof payload.flussApiKey === "string") {
        return payload.flussApiKey;
      }
    } catch {
      return null;
    }
  }

  if (typeof fallbackHeader === "string" && fallbackHeader) return fallbackHeader;
  return null;
}
