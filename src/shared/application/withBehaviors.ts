import type { CommandHandler } from "./CommandHandler";
import type { IUnitOfWork } from "./IUnitOfWork";
import { retryOnConcurrencyConflict } from "./retryOnConcurrencyConflict";

export interface HandlerBehaviors {
  retry?: boolean;
  transaction?: IUnitOfWork;
}

export function withBehaviors<TCommand, TResult>(
  handler: CommandHandler<TCommand, TResult>,
  behaviors: HandlerBehaviors,
): CommandHandler<TCommand, TResult> {
  return {
    execute(command: TCommand): Promise<TResult> {
      let run = () => handler.execute(command);

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
