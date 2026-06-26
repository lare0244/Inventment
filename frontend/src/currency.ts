export const CURRENCIES = [
  { code: "SEK", symbol: "kr", name: "Swedish Crowns" },
  { code: "DKK", symbol: "kr.", name: "Danish Crowns" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pounds" },
];

export function currencySymbol(code: string) {
  return (CURRENCIES.find((c) => c.code === code) || CURRENCIES[0]).symbol;
}

export function money(amount: number, code: string = "SEK") {
  const c = CURRENCIES.find((x) => x.code === code) || CURRENCIES[0];
  const n = Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  if (code === "EUR" || code === "GBP") return `${c.symbol}${n}`;
  return `${n} ${c.symbol}`;
}
