const ISO4217_NUMERIC: Record<number, string> = {
  980: "UAH",
  840: "USD",
  978: "EUR",
  985: "PLN",
};

export type WalletData = {
  status?: string;
  walletId?: string;
  cardToken?: string;
  maskedPan?: string;
  paymentSystem?: string;
};

export type SubscriptionRecord = {
  id: string;
  orderId?: string;
  customerId?: string;
  failureReason?: string | null;
  status?: string;
  startDate?: string;
  endDate?: string | null;
  nextChargeDate?: string | null;
  amount?: string | number;
  ccy?: number;
  interval?: string;
  cancellationDesc?: string | null;
  totalPaid?: number;
  totalFailed?: number;
  walletData?: WalletData;
  merchant?: { shop?: string };
  [key: string]: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function currencyCode(ccy: unknown): string {
  if (typeof ccy === "number" && ISO4217_NUMERIC[ccy]) {
    return ISO4217_NUMERIC[ccy];
  }
  if (typeof ccy === "string" && ccy.length === 3) {
    return ccy.toUpperCase();
  }
  return "UAH";
}

/** API stores amount in minor units (kopiyky / cents). */
export function formatAmount(amount: unknown, ccy: unknown): string {
  if (amount == null || amount === "") return "—";

  const minor = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(minor)) return String(amount);

  const code = currencyCode(ccy);
  const major = minor / 100;

  try {
    return new Intl.NumberFormat("uk-UA", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(major);
  } catch {
    return `${major.toFixed(2)} ${code}`;
  }
}

export function formatDate(value: unknown): string {
  if (value == null || value === "") return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("uk-UA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatInterval(value: unknown): string {
  if (value == null || value === "") return "—";
  const raw = String(value);
  const match = raw.match(/^(\d+)([dDwWmMyY])$/);
  if (!match) return raw;

  const count = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === "d") return count === 1 ? "щодня" : `кожні ${count} дн.`;
  if (unit === "w") return count === 1 ? "щотижня" : `кожні ${count} тиж.`;
  if (unit === "m") return count === 1 ? "щомісяця" : `кожні ${count} міс.`;
  if (unit === "y") return count === 1 ? "щороку" : `кожні ${count} р.`;
  return raw;
}

export function formatCard(wallet: unknown): string {
  const data = asRecord(wallet);
  if (!data) return "—";

  const pan =
    typeof data.maskedPan === "string" && data.maskedPan
      ? data.maskedPan
      : null;
  const system =
    typeof data.paymentSystem === "string" && data.paymentSystem
      ? data.paymentSystem.toUpperCase()
      : null;

  if (pan && system) return `${system} ${pan}`;
  if (pan) return pan;
  if (system) return system;
  return "—";
}

export function statusTone(
  status: unknown,
): "success" | "critical" | "warning" | "info" | "neutral" {
  const value = String(status || "").toLowerCase();
  if (["active", "success", "paid"].includes(value)) return "success";
  if (["cancelled", "canceled", "failed"].includes(value)) return "critical";
  if (["pending", "paused"].includes(value)) return "warning";
  return "neutral";
}
