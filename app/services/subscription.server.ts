import type { SubscriptionRecord } from "./subscription.format";

export type {
  SubscriptionRecord,
  WalletData,
} from "./subscription.format";

const DEFAULT_BASE_URL = "https://subscription.oplata.com.ua";

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
