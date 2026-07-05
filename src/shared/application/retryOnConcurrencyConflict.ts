import { OptimisticConcurrencyError } from "../domain/OptimisticConcurrencyError";

export async function retryOnConcurrencyConflict<T>(
  operation: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  let lastError: OptimisticConcurrencyError | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof OptimisticConcurrencyError) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}
