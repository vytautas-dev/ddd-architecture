import type { CommandHandler } from "./CommandHandler";
import type { IUnitOfWork } from "./IUnitOfWork";
import { retryOnConcurrencyConflict } from "./retryOnConcurrencyConflict";

export interface HandlerBehaviors {
  retry?: boolean;
  // when set, the whole command executes inside one database transaction
  transaction?: IUnitOfWork;
}

export function withBehaviors<TCommand, TResult>(
  handler: CommandHandler<TCommand, TResult>,
  behaviors: HandlerBehaviors,
): CommandHandler<TCommand, TResult> {
  return {
    execute(command: TCommand): Promise<TResult> {
      let run = () => handler.execute(command);

      // Order matters: retry must stay OUTSIDE the transaction. A concurrency
      // conflict aborts the whole Postgres transaction, so each retry attempt
      // needs a fresh one opened around fresh state.
      if (behaviors.transaction) {
        const uow = behaviors.transaction;
        const inner = run;
        run = () => uow.run(inner);
      }

      if (behaviors.retry) {
        return retryOnConcurrencyConflict(run);
      }
      return run();
    },
  };
}