import { afterEach, describe, expect, it, vi } from "vitest";

import { scheduleDigestRunContinuation } from "./digest-run-continuation";

describe("scheduleDigestRunContinuation", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each(["network", "missing-secret"])("clears the deadline timer after %s failure", async failure => {
    vi.useFakeTimers();
    vi.stubEnv("CRON_SECRET", failure === "missing-secret" ? "" : "test-cron-secret");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://digest.example.com");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network unavailable")));
    await expect(scheduleDigestRunContinuation()).rejects.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts a stalled continuation after five seconds and clears its timer", async () => {
    vi.useFakeTimers();
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://digest.example.com");
    vi.stubGlobal("fetch", vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
    })));
    const rejected = expect(scheduleDigestRunContinuation()).rejects.toThrow("Aborted");
    await vi.advanceTimersByTimeAsync(5000);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts an authenticated invocation on the same deployment", async () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://digest.example.com");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await scheduleDigestRunContinuation("https://digest.example.com/api/digest-runs");

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://digest.example.com/api/digest-runs/advance"),
      expect.objectContaining({
        headers: { authorization: "Bearer test-cron-secret" },
        method: "GET",
      }),
    );
  });
});
