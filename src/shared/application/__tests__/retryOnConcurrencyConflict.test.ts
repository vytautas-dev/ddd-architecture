import { retryOnConcurrencyConflict } from "../retryOnConcurrencyConflict";
import { OptimisticConcurrencyError } from "../../domain/OptimisticConcurrencyError";

describe("retryOnConcurrencyConflict", () => {
  it("returns the result on first success without retrying", async () => {
    const operation = jest.fn().mockResolvedValue("ok");

    const result = await retryOnConcurrencyConflict(operation);

    expect(result).toBe("ok");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("retries and succeeds after a concurrency conflict", async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new OptimisticConcurrencyError("stream-1"))
      .mockResolvedValueOnce("ok");

    const result = await retryOnConcurrencyConflict(operation);

    expect(result).toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("gives up after maxAttempts and rethrows the conflict", async () => {
    const operation = jest
      .fn()
      .mockRejectedValue(new OptimisticConcurrencyError("stream-1"));

    await expect(
      retryOnConcurrencyConflict(operation, 3),
    ).rejects.toBeInstanceOf(OptimisticConcurrencyError);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("does not retry on a non-concurrency error", async () => {
    const operation = jest
      .fn()
      .mockRejectedValue(new Error("something else"));

    await expect(retryOnConcurrencyConflict(operation)).rejects.toThrow(
      "something else",
    );
    expect(operation).toHaveBeenCalledTimes(1);
  });
});