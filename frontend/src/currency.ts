export const CURRENCIES = [
  { code: "SEK", symbol: "kr", name: "Swedish Crowns" },
  { code: "DKK", symbol: "kr.", name: "Danish Crowns" },
  { code: "NOK", symbol: "kr", name: "Norwegian Crowns" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pounds" },
  { code: "USD", symbol: "$", name: "US Dollars" },
  { code: "AUD", symbol: "A$", name: "Australian Dollars" },
];

// Currencies whose symbol is written before the amount (e.g. €10, $10)
const PREFIX_SYMBOL = new Set(["EUR", "GBP", "USD", "AUD"]);

export function currencySymbol(code: string) {
  return (CURRENCIES.find((c) => c.code === code) || CURRENCIES[0]).symbol;
}

export function money(amount: number, code: string = "SEK") {
  const c = CURRENCIES.find((x) => x.code === code) || CURRENCIES[0];
  const n = Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  if (PREFIX_SYMBOL.has(code)) return `${c.symbol}${n}`;
  return `${n} ${c.symbol}`;
}
