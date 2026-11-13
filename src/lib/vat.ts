export function moneyRound(value: number) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100) / 100;
}

export function vatAmount(subtotal: number, percent: number) {
  const rate = Number(percent);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return moneyRound(moneyRound(subtotal) * rate / 100);
}

export function exactTotalWithVat(subtotal: number, percent: number) {
  return moneyRound(moneyRound(subtotal) + vatAmount(subtotal, percent));
}

/** 516.14 becomes 517. A whole baht stays as it is. */
export function roundUpBaht(value: number) {
  const cents = Math.round(moneyRound(value) * 100);
  if (!Number.isFinite(cents) || cents <= 0) return 0;
  if (cents % 100 === 0) return cents / 100;
  return Math.floor(cents / 100) + 1;
}

export function totalWithVat(subtotal: number, percent: number) {
  const exact = exactTotalWithVat(subtotal, percent);
  return Number(percent) > 0 ? roundUpBaht(exact) : exact;
}

/** VAT on each dish, then one total. A whole baht stays as it is. */
export function dishVat(amounts: number[], percent: number) {
  return moneyRound(amounts.reduce((sum, amount) => sum + vatAmount(amount, percent), 0));
}

export function totalWithDishVat(amounts: number[], percent: number) {
  const food = moneyRound(amounts.reduce((sum, amount) => sum + (Number(amount) || 0), 0));
  if (!(Number(percent) > 0) || !amounts.length) return food;
  return roundUpBaht(moneyRound(food + dishVat(amounts, percent)));
}

export function vatLabel(percent: number) {
  const rate = moneyRound(Number(percent) || 0);
  const shown = Number.isInteger(rate) ? String(rate) : String(rate);
  return `VAT ${shown}%`;
}

export function vatRateText(percent: number) {
  const rate = moneyRound(Number(percent) || 0);
  if (rate <= 0) return "";
  return `${Number.isInteger(rate) ? rate : rate}%`;
}
