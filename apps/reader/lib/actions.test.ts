import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(), revalidatePath: vi.fn(), requireOperator: vi.fn(),
  retryBrief: vi.fn(), retryRun: vi.fn(), advance: vi.fn(), continuation: vi.fn(),
}));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("./operator", () => ({ requireCurrentOperator: mocks.requireOperator }));
vi.mock("./digest-runs", () => ({ retryDigestBrief: mocks.retryBrief, retryFailedDigestRun: mocks.retryRun }));
vi.mock("./digest-stage-executor", () => ({ advanceDigestRunUntilIdle: mocks.advance }));
vi.mock("./digest-run-continuation", () => ({ scheduleDigestRunContinuation: mocks.continuation }));

import { retryAiDigestBrief, retryDigestRun } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOperator.mockResolvedValue({ id: "operator" });
  mocks.retryBrief.mockResolvedValue({ id: "existing-run", status: "queued" });
  mocks.retryRun.mockResolvedValue({ id: "existing-run", status: "queued" });
  mocks.advance.mockResolvedValue(undefined);
});

it.each([retryAiDigestBrief, retryDigestRun])("starts retried work on the existing run without waiting for the browser or cron", async retry => {
  await retry("existing-run");
  expect(mocks.after).toHaveBeenCalledOnce();
  await mocks.after.mock.calls[0][0]();
  expect(mocks.advance).toHaveBeenCalledWith("existing-run", { scheduleContinuation: expect.any(Function) });
  await mocks.advance.mock.calls[0][1].scheduleContinuation();
  expect(mocks.continuation).toHaveBeenCalledOnce();
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
});

it("does not schedule work when retry is rejected", async () => {
  mocks.retryBrief.mockRejectedValueOnce(new Error("not eligible"));
  await expect(retryAiDigestBrief("existing-run")).rejects.toThrow("not eligible");
  expect(mocks.after).not.toHaveBeenCalled();
});

it("requires an operator before retrying AI", async () => {
  mocks.requireOperator.mockRejectedValueOnce(new Error("Unauthorized"));
  await expect(retryAiDigestBrief("existing-run")).rejects.toThrow("Unauthorized");
  expect(mocks.retryBrief).not.toHaveBeenCalled();
  expect(mocks.after).not.toHaveBeenCalled();
});

it("does not advance a run that was not requeued", async () => {
  mocks.retryRun.mockResolvedValueOnce({ id: "existing-run", status: "succeeded" });
  await retryDigestRun("existing-run");
  expect(mocks.after).not.toHaveBeenCalled();
});
