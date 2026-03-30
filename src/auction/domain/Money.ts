import { CurrencyMismatchError, MoneyInvalidError } from "./MoneyErrors";

export class Money {
  public readonly amount: number;
  public readonly currency: string;

  constructor(amount: number, currency: string) {
    if (amount < 0) {
      throw new MoneyInvalidError("Amount cannot be negative");
    }
    this.amount = amount;
    this.currency = currency;
  }

  isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount > other.amount;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount === other.amount;
  }

  private assertSameCurrency(other: Money) {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError();
    }
  }
}
