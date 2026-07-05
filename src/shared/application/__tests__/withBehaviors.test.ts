import { withBehaviors } from "../withBehaviors";
import type { CommandHandler } from "../CommandHandler";
import type { IUnitOfWork } from "../IUnitOfWork";
import { OptimisticConcurrencyError } from "../../domain/OptimisticConcurrencyError";

function makeFakeUow(): IUnitOfWork & { transactionsOpened: number } {
  return {
    transactionsOpened: 0,
    async run<T>(fn: () => Promise<T>): Promise<T> {
      this.transactionsOpened++;
      return fn();
    },
  };
}

describe("withBehaviors", () => {
  it("executes the handler inside a transaction when transaction is set", async () => {
    const uow = makeFakeUow();
    let inTransactionWhenExecuted = false;
    const handler: CommandHandler<string> = {
      async execute() {
        inTransactionWhenExecuted = uow.transactionsOpened === 1;
      },
    };

    await withBehaviors(handler, { transaction: uow }).execute("cmd");

    expect(uow.transactionsOpened).toBe(1);
    expect(inTransactionWhenExecuted).toBe(true);
  });

  it("opens a FRESH transaction for each retry attempt (retry wraps transaction)", async () => {
    const uow = makeFakeUow();
    const execute = jest
      .fn()
      .mockRejectedValueOnce(new OptimisticConcurrencyError("stream-1"))
      .mockResolvedValueOnce(undefined);
    const handler: CommandHandler<string> = { execute };

    await withBehaviors(handler, { retry: true, transaction: uow }).execute("cmd");

    expect(execute).toHaveBeenCalledTimes(2);
    expect(uow.transactionsOpened).toBe(2); // one transaction per attempt
  });

  it("works with retry only (no transaction)", async () => {
    const execute = jest
      .fn()
      .mockRejectedValueOnce(new OptimisticConcurrencyError("stream-1"))
      .mockResolvedValueOnce("ok");
    const handler: CommandHandler<string, string> = { execute };

    const result = await withBehaviors(handler, { retry: true }).execute("cmd");

    expect(result).toBe("ok");
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("propagates a non-concurrency error without retrying, rolling back once", async () => {
    const uow = makeFakeUow();
    const execute = jest.fn().mockRejectedValue(new Error("domain rule broken"));
    const handler: CommandHandler<string> = { execute };

    await expect(
      withBehaviors(handler, { retry: true, transaction: uow }).execute("cmd"),
    ).rejects.toThrow("domain rule broken");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(uow.transactionsOpened).toBe(1);
  });
});