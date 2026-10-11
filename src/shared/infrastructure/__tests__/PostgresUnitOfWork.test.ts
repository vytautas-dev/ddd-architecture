import type { Sql, TransactionSql } from "postgres";
import { PostgresUnitOfWork } from "../PostgresUnitOfWork";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The UoW uses exactly one Postgres.js method: sql.begin(fn). The fake mimics
// its behavior — it calls fn with a fresh marker object per transaction, so
// tests can tell transactions apart by reference.
function makeFakeSql() {
  const transactions: TransactionSql[] = [];
  const sql = {
    begin: jest.fn(async (fn: (tx: TransactionSql) => Promise<unknown>) => {
      const tx = { __tx: transactions.length } as unknown as TransactionSql;
      transactions.push(tx);
      return fn(tx);
    }),
  } as unknown as Sql;
  return { sql, transactions };
}

describe("PostgresUnitOfWork", () => {
  it("returns the root client outside of run", () => {
    const { sql } = makeFakeSql();
    const uow = new PostgresUnitOfWork(sql);

    expect(uow.client).toBe(sql);
  });

  it("returns the transaction inside run, even in nested async calls", async () => {
    const { sql, transactions } = makeFakeSql();
    const uow = new PostgresUnitOfWork(sql);

    // simulates a deep participant (e.g. the EventStore) that hops through
    // the event loop before touching the database
    const deepParticipant = async () => {
      await sleep(1);
      return uow.client;
    };

    const seen = await uow.run(() => deepParticipant());

    expect(seen).toBe(transactions[0]);
    expect(uow.client).toBe(sql); // context does not leak past run()
  });

  it("isolates concurrent runs from each other", async () => {
    const { sql, transactions } = makeFakeSql();
    const uow = new PostgresUnitOfWork(sql);

    const runAndObserve = async (delayMs: number) => {
      return uow.run(async () => {
        const before = uow.client;
        await sleep(delayMs); // interleave with the other run
        const after = uow.client;
        return { before, after };
      });
    };

    const [a, b] = await Promise.all([runAndObserve(15), runAndObserve(5)]);

    expect(a.before).toBe(a.after);
    expect(b.before).toBe(b.after);
    expect(a.before).not.toBe(b.before);
    expect(transactions).toHaveLength(2);
  });

  it("propagates errors from run", async () => {
    const { sql } = makeFakeSql();
    const uow = new PostgresUnitOfWork(sql);

    await expect(
      uow.run(async () => {
        throw new Error("handler failed");
      }),
    ).rejects.toThrow("handler failed");
  });
});
