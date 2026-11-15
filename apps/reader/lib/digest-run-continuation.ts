import "server-only";

import { getAppUrl, requireEnv } from "./env";

export async function scheduleDigestRunContinuation(_requestUrl?: string) {
  const configuredUrl = getAppUrl();
  const continuationUrl = new URL("/api/digest-runs/advance", configuredUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(continuationUrl, {
      cache: "no-store",
      headers: {
        authorization: `Bearer ${requireEnv("CRON_SECRET")}`,
      },
      method: "GET",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Could not schedule digest continuation (${response.status}).`);
    }
  } finally {
    clearTimeout(timeout);
  }
}
