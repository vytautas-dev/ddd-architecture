import { AsyncLocalStorage } from "node:async_hooks";
import type { PrismaClient, Prisma } from "../../generated/prisma/client";
import type { IUnitOfWork } from "../application/IUnitOfWork";

/**
 * Unit of Work: everything executed inside `run()` shares one database
 * transaction. Participants (EventStore, projections) never receive the
 * transaction explicitly — they read the current client from `client`,
 * which resolves to the transaction bound to the current async chain
 * (via AsyncLocalStorage) or falls back to the singleton client.
 */
export class PrismaUnitOfWork implements IUnitOfWork {
  private readonly storage = new AsyncLocalStorage<Prisma.TransactionClient>();

  constructor(private readonly prisma: PrismaClient) {}

  run<T>(fn: () => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => this.storage.run(tx, fn));
  }

  get client(): Prisma.TransactionClient {
    return this.storage.getStore() ?? this.prisma;
  }
}
