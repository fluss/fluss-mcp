import cors from "cors";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createFlussServer } from "./server.js";

const app = express();

app.use(cors({
  origin: "*",
  allowedHeaders: ["Content-Type", "x-fluss-api-key", "mcp-session-id"],
  exposedHeaders: ["mcp-session-id"],
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
}));

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/mcp", async (req, res) => {
  const apiKey = req.headers["x-fluss-api-key"] ?? process.env.FLUSS_API_KEY;

  if (typeof apiKey !== "string" || !apiKey) {
    res.status(401).json({ error: "x-fluss-api-key header or FLUSS_API_KEY env var is required" });
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
