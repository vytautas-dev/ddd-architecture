import { AsyncLocalStorage } from "node:async_hooks";
import type { Sql, TransactionSql } from "postgres";
import type { IUnitOfWork } from "../application/IUnitOfWork";

/**
 * Unit of Work for the command side: everything executed inside `run()`
 * shares one Postgres.js transaction. Same mechanism as `PrismaUnitOfWork` —
 * participants (EventStore) read the current client from `client`, which
 * resolves to the transaction bound to the current async chain (via
 * AsyncLocalStorage) or falls back to the root client.
 */
export class PostgresUnitOfWork implements IUnitOfWork {
  private readonly storage = new AsyncLocalStorage<TransactionSql>();

  constructor(private readonly sql: Sql) {}

  run<T>(fn: () => Promise<T>): Promise<T> {
    // Postgres.js types the result as UnwrapPromiseArray<T>; for a single
    // awaited value that is T.
    return this.sql.begin((tx) => this.storage.run(tx, fn)) as Promise<T>;
  }

  get client(): Sql | TransactionSql {
    return this.storage.getStore() ?? this.sql;
  }
}
