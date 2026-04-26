const BASE = "https://v1.fluss-api.com";

async function request(apiKey: string, path: string, method = "GET", body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      authorization: apiKey,
      "content-type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error((data.error as string) ?? `HTTP ${res.status}`);
  return data;
}

export function createFlussClient(apiKey: string) {
  return {
    listDevices: () =>
      request(apiKey, "/v1/list"),

    getStatus: (deviceId: string) =>
      request(apiKey, `/v1/status/${deviceId}`),

    getLogs: (deviceIds: string, start: number, stop: number, cursor?: string) => {
      const params = new URLSearchParams({
        deviceIds,
        start: String(start),
        stop: String(stop),
        ...(cursor ? { cursor } : {}),
      });
      return request(apiKey, `/v1/logs?${params}`);
    },

    trigger: (deviceId: string, metadata?: string) =>
      request(apiKey, `/v1/trigger/${deviceId}`, "POST", metadata ? { metaData: metadata } : undefined),

    open: (deviceId: string) =>
      request(apiKey, `/v1/open/${deviceId}`, "POST"),

    giveAccess: (body: {
      deviceIds: string[];
      invitees: { userName: string; mobile: string; notes?: string }[];
      permission?: "Full" | "Always" | "Temporary" | "Repeat";
      startDate?: number;
      endDate?: number;
    }) => request(apiKey, "/v1/access", "POST", body),
  };
}
