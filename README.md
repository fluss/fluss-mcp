# Fluss MCP Server

An [MCP](https://modelcontextprotocol.io) server for the [Fluss](https://fluss.io) access control API. Connect any MCP-compatible AI client to your Fluss gates, doors, and intercoms.

## Tools

| Tool | Description |
|------|-------------|
| `list_devices` | List all devices + permissions |
| `get_device_status` | Online/offline, open/closed state, firmware, signal |
| `get_access_logs` | Paginated access logs with time range filter |
| `trigger_device` | Trigger a device (state-agnostic) |
| `open_device` | Open a device (fails if already open) |
| `give_access` | Invite users by mobile number |

## Prerequisites

- Node.js 20+
- A Fluss API key (contact [Fluss](https://fluss.io) to get one)

## Option 1 — Run with Docker

```bash
docker run -p 3000:3000 -e FLUSS_API_KEY=your-key ghcr.io/fluss/fluss-mcp
```

## Option 2 — Run from source

```bash
git clone https://github.com/fluss/fluss-mcp.git
cd fluss-mcp
npm install
FLUSS_API_KEY=your-key npm run dev
```

The server starts on `http://localhost:3000`.

## Option 3 — Deploy to Railway / Render / Fly.io

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/fluss-mcp)

Set the `FLUSS_API_KEY` environment variable in your deployment dashboard.

## Connecting to Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "fluss": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "x-fluss-api-key": "your-fluss-api-key"
      }
    }
  }
}
```

## Multi-user / hosted mode

When running as a shared server, omit `FLUSS_API_KEY` from the environment. Each client passes its own key via the `x-fluss-api-key` header — the server never stores keys.

## API reference

See [fluss.io/docs](https://fluss.io/docs) for the full Fluss API reference.
