import { PrismaUnitOfWork } from "../PrismaUnitOfWork";
import type { PrismaClient, Prisma } from "../../../generated/prisma/client";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The UoW uses exactly one Prisma method: $transaction(fn). The fake mimics
// its behavior — it calls fn with a fresh marker object per transaction, so
// tests can tell transactions apart by reference.
function makeFakePrisma() {
  const txClients: Prisma.TransactionClient[] = [];
  const prisma = {
    $transaction: jest.fn(
      async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
        const tx = { __tx: txClients.length } as unknown as Prisma.TransactionClient;
        txClients.push(tx);
        return fn(tx);
      },
    ),
  } as unknown as PrismaClient;
  return { prisma, txClients };
}

describe("PrismaUnitOfWork", () => {
  it("returns the singleton client outside of run", () => {
    const { prisma } = makeFakePrisma();
    const uow = new PrismaUnitOfWork(prisma);

    expect(uow.client).toBe(prisma);
  });

  it("returns the transaction client inside run, even in nested async calls", async () => {
    const { prisma, txClients } = makeFakePrisma();
    const uow = new PrismaUnitOfWork(prisma);

    // simulates a deep participant (e.g. a projection) that hops through
    // the event loop before touching the database
    const deepParticipant = async () => {
      await sleep(1);
      return uow.client;
    };

    const seen = await uow.run(() => deepParticipant());

    expect(seen).toBe(txClients[0]);
    expect(uow.client).toBe(prisma); // context does not leak past run()
  });

  it("isolates concurrent runs from each other", async () => {
    const { prisma, txClients } = makeFakePrisma();
    const uow = new PrismaUnitOfWork(prisma);

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
    expect(txClients).toHaveLength(2);
  });

  it("propagates errors from run", async () => {
    const { prisma } = makeFakePrisma();
    const uow = new PrismaUnitOfWork(prisma);

    await expect(
      uow.run(async () => {
        throw new Error("handler failed");
      }),
    ).rejects.toThrow("handler failed");
  });
});