import type { CommandHandler } from "./CommandHandler";
import { retryOnConcurrencyConflict } from "./retryOnConcurrencyConflict";

export interface HandlerBehaviors {
  retry?: boolean;
}

export function withBehaviors<TCommand, TResult>(
  handler: CommandHandler<TCommand, TResult>,
  behaviors: HandlerBehaviors,
): CommandHandler<TCommand, TResult> {
  return {
    execute(command: TCommand): Promise<TResult> {
      const run = () => handler.execute(command);

      if (behaviors.retry) {
        return retryOnConcurrencyConflict(run);
      }
      return run();
    },
  };
}
