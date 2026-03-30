export class MoneyInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyInvalidError";
  }
}

export class CurrencyMismatchError extends Error {
  constructor() {
    super("Cannot compare Money with different currencies");
    this.name = "CurrencyMismatchError";
  }
}