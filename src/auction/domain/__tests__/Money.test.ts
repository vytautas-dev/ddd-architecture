import { Money, MoneyInvalidError } from "../Money";

describe("Money", () => {
  describe("constructor", () => {
    it("creates a valid Money instance", () => {
      const money = new Money(100, "PLN");
      expect(money.amount).toBe(100);
      expect(money.currency).toBe("PLN");
    });

    it("allows zero amount", () => {
      const money = new Money(0, "PLN");
      expect(money.amount).toBe(0);
    });

    it("throws MoneyInvalidError when amount is negative", () => {
      expect(() => new Money(-1, "PLN")).toThrow(MoneyInvalidError);
    });

    it("throws MoneyInvalidError with descriptive message", () => {
      expect(() => new Money(-50, "PLN")).toThrow("Amount cannot be negative");
    });
  });

  describe("isGreaterThan", () => {
    it("returns true when amount is greater", () => {
      const bid = new Money(200, "PLN");
      const currentPrice = new Money(100, "PLN");
      expect(bid.isGreaterThan(currentPrice)).toBe(true);
    });

    it("returns false when amount is lower", () => {
      const bid = new Money(50, "PLN");
      const currentPrice = new Money(100, "PLN");
      expect(bid.isGreaterThan(currentPrice)).toBe(false);
    });

    it("returns false when amounts are equal", () => {
      const a = new Money(100, "PLN");
      const b = new Money(100, "PLN");
      expect(a.isGreaterThan(b)).toBe(false);
    });

    it("throws when comparing different currencies", () => {
      const pln = new Money(100, "PLN");
      const eur = new Money(100, "EUR");
      expect(() => pln.isGreaterThan(eur)).toThrow();
    });
  });

  describe("equals", () => {
    it("returns true for same amount and currency", () => {
      const a = new Money(100, "PLN");
      const b = new Money(100, "PLN");
      expect(a.equals(b)).toBe(true);
    });

    it("returns false for different amount", () => {
      const a = new Money(100, "PLN");
      const b = new Money(200, "PLN");
      expect(a.equals(b)).toBe(false);
    });

    it("returns false for different currency", () => {
      const a = new Money(100, "PLN");
      const b = new Money(100, "EUR");
      expect(a.equals(b)).toBe(false);
    });
  });
});