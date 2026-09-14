const DEFAULT_BASE_URL = "https://subscription.oplata.com.ua";

const ISO4217_NUMERIC: Record<number, string> = {
  980: "UAH",
  840: "USD",
  978: "EUR",
  985: "PLN",
};

function getConfig() {
  const baseUrl = (
    process.env.SUBSCRIPTION_API_URL || DEFAULT_BASE_URL
  ).replace(/\/$/, "");
  const token = process.env.SUBSCRIPTION_ADMIN_TOKEN;

  if (!token) {
    throw new Response(
      "Missing SUBSCRIPTION_ADMIN_TOKEN. Add it to your .env file.",
      { status: 500 },
    );
  }

  return { baseUrl, token };
}

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

export type SubscriptionListResult = {
  subscriptions: SubscriptionRecord[];
  raw: unknown;
  page: number;
  limit: number;
  total: number;
  pages: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickId(item: Record<string, unknown>): string | null {
  const candidates = [
    item.id,
    item.subscriptionId,
    item.subscription_id,
    item._id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
    if (typeof candidate === "number") {
      return String(candidate);
    }
  }

  return null;
}

function normalizeList(payload: unknown): SubscriptionRecord[] {
  if (Array.isArray(payload)) {
    return payload
      .map((item) => asRecord(item))
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .map((item) => {
        const id = pickId(item);
        return id ? ({ ...item, id } as SubscriptionRecord) : null;
      })
      .filter((item): item is SubscriptionRecord => Boolean(item));
  }

  const root = asRecord(payload);
  if (!root) return [];

  const nestedCandidates = [
    root.subscriptions,
    root.data,
    root.items,
    root.results,
    asRecord(root.data)?.subscriptions,
    asRecord(root.data)?.items,
  ];

  for (const candidate of nestedCandidates) {
    if (Array.isArray(candidate)) {
      return normalizeList(candidate);
    }
  }

  return [];
}

function readMeta(payload: unknown, page: number, limit: number) {
  const root = asRecord(payload);
  const total =
    typeof root?.total === "number"
      ? root.total
      : Number(root?.total) || 0;
  const pages =
    typeof root?.pages === "number"
      ? root.pages
      : Number(root?.pages) || Math.max(1, Math.ceil(total / limit) || 1);
  const resolvedPage =
    typeof root?.page === "number" ? root.page : Number(root?.page) || page;
  const resolvedLimit =
    typeof root?.limit === "number" ? root.limit : Number(root?.limit) || limit;

  return {
    total,
    pages,
    page: resolvedPage,
    limit: resolvedLimit,
  };
}

async function parseApiResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    const record = asRecord(payload);
    const message =
      (typeof record?.message === "string" && record.message) ||
      (typeof record?.error === "string" && record.error) ||
      `Subscription API error (${response.status})`;

    throw new Response(message, { status: response.status });
  }

  const record = asRecord(payload);
  if (
    record &&
    (record.status === "error" || record.success === false) &&
    typeof record.message === "string"
  ) {
    throw new Response(record.message, { status: 502 });
  }

  return payload;
}

export type SubscriptionListQuery = {
  page?: number;
  limit?: number;
  status?: string;
  customerId?: string;
  orderId?: string;
  subscriptionId?: string;
};

export async function listSubscriptions(
  query: SubscriptionListQuery = {},
): Promise<SubscriptionListResult> {
  const page = Math.max(1, query.page || 1);
  const limit = Math.max(1, Math.min(100, query.limit || 50));
  const { baseUrl, token } = getConfig();
  const url = new URL(`${baseUrl}/admin/subscriptions`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(limit));

  if (query.status) url.searchParams.set("status", query.status);
  if (query.customerId) url.searchParams.set("customerId", query.customerId);
  if (query.orderId) url.searchParams.set("orderId", query.orderId);
  if (query.subscriptionId) {
    url.searchParams.set("subscriptionId", query.subscriptionId);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  const raw = await parseApiResponse(response);
  const meta = readMeta(raw, page, limit);

  return {
    subscriptions: normalizeList(raw),
    raw,
    page: meta.page,
    limit: meta.limit,
    total: meta.total,
    pages: meta.pages,
  };
}

export async function cancelSubscription(subscriptionId: string) {
  const { baseUrl, token } = getConfig();

  const response = await fetch(`${baseUrl}/admin/cancel-subscription`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ subscriptionId }),
  });

  return parseApiResponse(response);
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
