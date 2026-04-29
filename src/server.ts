import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createFlussClient } from "./fluss.js";
import { requireScope, ScopeError, type UserContext } from "./auth.js";

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function scopeError(err: unknown) {
  if (err instanceof ScopeError) {
    return {
      isError: true as const,
      content: [
        {
          type: "text" as const,
          text: `Missing required OAuth scope: ${err.required}. Reconnect this app and grant the requested permissions.`,
        },
      ],
    };
  }
  throw err;
}

export function createFlussServer(ctx: UserContext) {
  const fluss = createFlussClient(ctx.credential);
  const server = new McpServer({ name: "fluss", version: "1.0.0" });

  server.tool(
    "list_devices",
    "List all Fluss access control devices the authorized user has access to, with permissions per device.",
    {},
    async () => {
      try {
        requireScope(ctx, "devices:read");
        return text(await fluss.listDevices());
      } catch (err) {
        return scopeError(err);
      }
    },
  );

  server.tool(
    "get_device_status",
    "Get full status of a device: online/offline, open/closed state, firmware version, WiFi signal strength.",
    { device_id: z.string().describe("Fluss device ID") },
    async ({ device_id }) => {
      try {
        requireScope(ctx, "devices:read");
        return text(await fluss.getStatus(device_id));
      } catch (err) {
        return scopeError(err);
      }
    },
  );

  server.tool(
    "get_access_logs",
    "Get paginated access logs for one or more devices within a time range.",
    {
      device_ids: z.string().describe("Comma-separated device IDs, e.g. abc123,def456"),
      start: z.number().describe("Start of time range in epoch milliseconds"),
      stop: z.number().describe("End of time range in epoch milliseconds"),
      cursor: z.string().optional().describe("Pagination cursor from a previous response"),
    },
    async ({ device_ids, start, stop, cursor }) => {
      try {
        requireScope(ctx, "access:read");
        return text(await fluss.getLogs(device_ids, start, stop, cursor));
      } catch (err) {
        return scopeError(err);
      }
    },
  );

  server.tool(
    "trigger_device",
    "Send a trigger command to a device. State-agnostic — works regardless of current open/close state.",
    {
      device_id: z.string().describe("Fluss device ID"),
      metadata: z.string().optional().describe("Optional note to attach to the log event (max 400 chars)"),
    },
    async ({ device_id, metadata }) => {
      try {
        requireScope(ctx, "devices:control");
        return text(await fluss.trigger(device_id, metadata));
      } catch (err) {
        return scopeError(err);
      }
    },
  );

  server.tool(
    "open_device",
    "Open a device. Returns an error if the device is already open or offline.",
    { device_id: z.string().describe("Fluss device ID") },
    async ({ device_id }) => {
      try {
        requireScope(ctx, "devices:control");
        return text(await fluss.open(device_id));
      } catch (err) {
        return scopeError(err);
      }
    },
  );

  server.tool(
    "give_access",
    "Invite one or more users to one or more Fluss devices by mobile number.",
    {
      device_ids: z.array(z.string()).describe("Device IDs to grant access on"),
      invitees: z.array(z.object({
        userName: z.string(),
        mobile: z.string().describe("International format, e.g. +27821234567"),
        notes: z.string().optional(),
      })),
      permission: z.enum(["Full", "Always", "Temporary", "Repeat"]).optional()
        .describe("Omit for 6-digit intercom devices. Required for 16-digit device IDs."),
      start_date: z.number().optional().describe("Epoch ms — required for Temporary permission"),
      end_date: z.number().optional().describe("Epoch ms — required for Temporary permission"),
    },
    async ({ device_ids, invitees, permission, start_date, end_date }) => {
      try {
        requireScope(ctx, "access:write");
        return text(await fluss.giveAccess({
          deviceIds: device_ids,
          invitees,
          permission,
          ...(start_date ? { startDate: start_date } : {}),
          ...(end_date ? { endDate: end_date } : {}),
        }));
      } catch (err) {
        return scopeError(err);
      }
    },
  );

  return server;
}
