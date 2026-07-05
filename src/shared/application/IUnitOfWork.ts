export interface IUnitOfWork {
  run<T>(fn: () => Promise<T>): Promise<T>;
}
