export class OptimisticConcurrencyError extends Error {
  constructor(streamId: string) {
    super(`Concurrency conflict on stream: ${streamId}`);
    this.name = "OptimisticConcurrencyError";
  }
}