import Decimal from 'decimal.js';

/** Upper bound that fits DECIMAL(18,2). */
export const MAX_AMOUNT = 9_999_999_999_999.99;

/** Formats a DECIMAL value (string from mysql2) or JS number as a fixed 2-decimal string. */
export function toMoney(value: Decimal.Value): string {
  return new Decimal(value).toFixed(2);
}
