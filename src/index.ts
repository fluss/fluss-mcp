import cors from "cors";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildOAuthRouter, extractApiKey } from "./oauth.js";
import { createFlussServer } from "./server.js";

const JWT_SECRET = process.env.JWT_SECRET;
const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;

if (!JWT_SECRET || !OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET) {
  console.error("Missing required env vars: JWT_SECRET, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET");
  process.exit(1);
}

const app = express();

app.use(cors({
  origin: "*",
  allowedHeaders: ["Content-Type", "Authorization", "x-fluss-api-key", "mcp-session-id"],
  exposedHeaders: ["mcp-session-id"],
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
}));

app.use(express.json());

// OAuth 2.0 endpoints (discovery, authorize, token)
app.use(buildOAuthRouter({ jwtSecret: JWT_SECRET, clientId: OAUTH_CLIENT_ID, clientSecret: OAUTH_CLIENT_SECRET }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/mcp", async (req, res) => {
  const apiKey = await extractApiKey(
    req.headers.authorization,
    req.headers["x-fluss-api-key"] as string | undefined,
    JWT_SECRET,
  );

  if (!apiKey) {
    res.status(401).json({ error: "Unauthorized — provide a Bearer token (OAuth) or x-fluss-api-key header" });
    return;
  }

  const server = createFlussServer(apiKey);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on("close", () => server.close().catch(console.error));

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Fluss MCP running on http://localhost:${port}`));
