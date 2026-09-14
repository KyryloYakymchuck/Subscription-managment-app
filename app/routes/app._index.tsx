import { useEffect, useState, Fragment, type CSSProperties } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
  useSearchParams,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  cancelSubscription,
  listSubscriptions,
} from "../services/subscription.server";
import {
  formatAmount,
  formatCard,
  formatDate,
  formatInterval,
  statusTone,
  type SubscriptionRecord,
} from "../services/subscription.format";

const DEFAULT_PAGE_SIZE = 25;
const STATUS_OPTIONS = [
  { value: "", label: "Усі статуси" },
  { value: "active", label: "active" },
  { value: "cancelled", label: "cancelled" },
] as const;

function readFilters(url: URL) {
  const page = Math.max(1, Number(url.searchParams.get("page") || "1") || 1);
  const limit = Math.max(
    1,
    Math.min(100, Number(url.searchParams.get("limit") || DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE),
  );
  const status = (url.searchParams.get("status") || "").trim();
  const customerId = (url.searchParams.get("customerId") || "").trim();
  const orderId = (url.searchParams.get("orderId") || "").trim();
  const subscriptionId = (url.searchParams.get("subscriptionId") || "").trim();

  return { page, limit, status, customerId, orderId, subscriptionId };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const filters = readFilters(url);

  try {
    const result = await listSubscriptions(filters);
    return {
      ok: true as const,
      ...filters,
      page: result.page,
      limit: result.limit,
      total: result.total,
      pages: result.pages,
      subscriptions: result.subscriptions,
      raw: result.raw,
      error: null as string | null,
      hasNextPage: result.page < result.pages,
      hasPrevPage: result.page > 1,
    };
  } catch (error) {
    const message =
      error instanceof Response
        ? await error.text()
        : error instanceof Error
          ? error.message
          : "Не вдалося завантажити підписки";

    return {
      ok: false as const,
      ...filters,
      total: 0,
      pages: 1,
      subscriptions: [] as SubscriptionRecord[],
      raw: null,
      error: message,
      hasNextPage: false,
      hasPrevPage: filters.page > 1,
    };
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const subscriptionId = String(formData.get("subscriptionId") || "").trim();

  if (intent !== "cancel") {
    return { ok: false as const, message: "Невідома дія", subscriptionId: null };
  }

  if (!subscriptionId) {
    return {
      ok: false as const,
      message: "Немає ID підписки",
      subscriptionId: null,
    };
  }

  try {
    await cancelSubscription(subscriptionId);
    return {
      ok: true as const,
      message: `Підписку ${subscriptionId} скасовано`,
      subscriptionId,
    };
  } catch (error) {
    const message =
      error instanceof Response
        ? await error.text()
        : error instanceof Error
          ? error.message
          : "Не вдалося скасувати підписку";

    return { ok: false as const, message, subscriptionId };
  }
};

function buildAppHref(
  searchParams: URLSearchParams,
  overrides: Record<string, string | number | null | undefined>,
) {
  const params = new URLSearchParams(searchParams);

  for (const [key, value] of Object.entries(overrides)) {
    if (value == null || value === "") {
      params.delete(key);
    } else {
      params.set(key, String(value));
    }
  }

  const query = params.toString();
  return query ? `/app?${query}` : "/app";
}

export default function SubscriptionsPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const shopify = useAppBridge();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const isCancelling =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === "cancel";
  const isNavigating = navigation.state !== "idle";

  useEffect(() => {
    if (!actionData?.message) return;

    shopify.toast.show(actionData.message, {
      isError: !actionData.ok,
    });

    if (actionData.ok) {
      setConfirmId(null);
    }
  }, [actionData, shopify]);

  const FILTER_KEYS = [
    "page",
    "limit",
    "status",
    "customerId",
    "orderId",
    "subscriptionId",
  ] as const;

  const prevHref = buildAppHref(searchParams, { page: Math.max(1, data.page - 1) });
  const nextHref = buildAppHref(searchParams, { page: data.page + 1 });
  const refreshHref = buildAppHref(searchParams, { page: data.page });
  const resetHref = buildAppHref(
    searchParams,
    Object.fromEntries(FILTER_KEYS.map((key) => [key, null])),
  );

  return (
    <s-page heading="Підписки" inlineSize="large">
      <s-section heading="Фільтри">
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <Link to={refreshHref} style={buttonStyle}>
            Оновити
          </Link>
        </div>
        <Form method="get" key={searchParams.toString()}>
          {/* Keep Shopify embedded auth params if present */}
          {[...searchParams.entries()]
            .filter(
              ([key]) =>
                ![
                  "page",
                  "limit",
                  "status",
                  "customerId",
                  "orderId",
                  "subscriptionId",
                ].includes(key),
            )
            .map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
          <input type="hidden" name="page" value="1" />

          <div style={filtersGridStyle}>
            <label style={fieldStyle}>
              <span style={labelStyle}>Статус</span>
              <select
                name="status"
                defaultValue={data.status}
                style={inputStyle}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={fieldStyle}>
              <span style={labelStyle}>ID підписки</span>
              <input
                name="subscriptionId"
                defaultValue={data.subscriptionId}
                placeholder="ARRj9cLEfT"
                style={inputStyle}
              />
            </label>

            <label style={fieldStyle}>
              <span style={labelStyle}>ID клієнта</span>
              <input
                name="customerId"
                defaultValue={data.customerId}
                placeholder="9635773677807"
                style={inputStyle}
              />
            </label>

            <label style={fieldStyle}>
              <span style={labelStyle}>ID замовлення</span>
              <input
                name="orderId"
                defaultValue={data.orderId}
                placeholder="7322530250991"
                style={inputStyle}
              />
            </label>

            <label style={fieldStyle}>
              <span style={labelStyle}>На сторінці</span>
              <select
                name="limit"
                defaultValue={String(data.limit)}
                style={inputStyle}
              >
                {[10, 25, 50].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="submit" style={buttonStyle}>
              Застосувати
            </button>
            <Link to={resetHref} style={secondaryButtonStyle}>
              Скинути
            </Link>
          </div>
        </Form>
      </s-section>

      {data.error ? (
        <s-section heading="Не вдалося завантажити підписки">
          <s-banner tone="critical" heading="Помилка API">
            <s-paragraph>{data.error}</s-paragraph>
          </s-banner>
        </s-section>
      ) : (
        <s-section heading={`Сторінка ${data.page} з ${Math.max(1, data.pages)}`}>
          <s-paragraph>
            Знайдено: <strong>{data.total}</strong>
            {isNavigating ? " · оновлення…" : ""}
          </s-paragraph>

          {data.subscriptions.length === 0 ? (
            <s-banner tone="info" heading="Немає підписок">
              <s-paragraph>
                За цими фільтрами нічого не знайдено. Скинь фільтри або зміни
                сторінку.
              </s-paragraph>
            </s-banner>
          ) : (
            <s-box
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background="base"
            >
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {[
                        "ID",
                        "Статус",
                        "Клієнт",
                        "Замовлення",
                        "Сума",
                        "Картка",
                        "Інтервал",
                        "Наступне списання",
                        "Початок",
                        "Дії",
                      ].map((label) => (
                        <th key={label} style={headerStyle}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.subscriptions.map((subscription) => {
                      const id = subscription.id;
                      const status = String(subscription.status || "");
                      const isCancelled = ["cancelled", "canceled"].includes(
                        status.toLowerCase(),
                      );
                      const isExpanded = expandedId === id;

                      return (
                        <Fragment key={id}>
                          <tr>
                            <td style={cellStyle}>
                              <code>{id}</code>
                            </td>
                            <td style={cellStyle}>
                              <s-badge tone={statusTone(status)}>
                                {status || "—"}
                              </s-badge>
                            </td>
                            <td style={cellStyle}>
                              <code>{subscription.customerId || "—"}</code>
                            </td>
                            <td style={cellStyle}>
                              <code>{subscription.orderId || "—"}</code>
                            </td>
                            <td style={cellStyle}>
                              <strong>
                                {formatAmount(
                                  subscription.amount,
                                  subscription.ccy,
                                )}
                              </strong>
                            </td>
                            <td style={cellStyle}>
                              {formatCard(subscription.walletData)}
                            </td>
                            <td style={cellStyle}>
                              {formatInterval(subscription.interval)}
                            </td>
                            <td style={cellStyle}>
                              {formatDate(subscription.nextChargeDate)}
                            </td>
                            <td style={cellStyle}>
                              {formatDate(subscription.startDate)}
                            </td>
                            <td style={cellStyle}>
                              <div style={{ display: "flex", gap: 8 }}>
                                <button
                                  type="button"
                                  style={secondaryButtonStyle}
                                  onClick={() =>
                                    setExpandedId(isExpanded ? null : id)
                                  }
                                >
                                  {isExpanded ? "Сховати" : "Деталі"}
                                </button>
                                {isCancelled ? (
                                  <span>Скасовано</span>
                                ) : confirmId === id ? (
                                  <>
                                    <Form method="post">
                                      <input
                                        type="hidden"
                                        name="intent"
                                        value="cancel"
                                      />
                                      <input
                                        type="hidden"
                                        name="subscriptionId"
                                        value={id}
                                      />
                                      <button
                                        type="submit"
                                        style={dangerButtonStyle}
                                        disabled={isCancelling}
                                      >
                                        Підтвердити
                                      </button>
                                    </Form>
                                    <button
                                      type="button"
                                      style={secondaryButtonStyle}
                                      onClick={() => setConfirmId(null)}
                                    >
                                      Назад
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    style={dangerButtonStyle}
                                    onClick={() => setConfirmId(id)}
                                  >
                                    Скасувати
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {isExpanded ? (
                            <tr>
                              <td style={detailCellStyle} colSpan={10}>
                                <s-stack direction="block" gap="small">
                                  <s-paragraph>
                                    <s-text>Кінець: </s-text>
                                    {formatDate(subscription.endDate)}
                                  </s-paragraph>
                                  <s-paragraph>
                                    <s-text>Причина скасування: </s-text>
                                    {subscription.cancellationDesc ||
                                      subscription.failureReason ||
                                      "—"}
                                  </s-paragraph>
                                  <s-paragraph>
                                    <s-text>Оплат / невдалих: </s-text>
                                    {subscription.totalPaid ?? 0} /{" "}
                                    {subscription.totalFailed ?? 0}
                                  </s-paragraph>
                                  <s-paragraph>
                                    <s-text>Магазин: </s-text>
                                    {subscription.merchant?.shop || "—"}
                                  </s-paragraph>
                                  <pre style={rawStyle}>
                                    {JSON.stringify(subscription, null, 2)}
                                  </pre>
                                </s-stack>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </s-box>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
            {data.hasPrevPage ? (
              <Link to={prevHref} style={buttonStyle}>
                ← Назад
              </Link>
            ) : (
              <span style={disabledButtonStyle}>← Назад</span>
            )}

            <span>
              {data.page} / {Math.max(1, data.pages)}
            </span>

            {data.hasNextPage ? (
              <Link to={nextHref} style={buttonStyle}>
                Далі →
              </Link>
            ) : (
              <span style={disabledButtonStyle}>Далі →</span>
            )}
          </div>
        </s-section>
      )}
    </s-page>
  );
}

const filtersGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const fieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
};

const inputStyle: CSSProperties = {
  padding: "8px 10px",
  border: "1px solid #c9cccf",
  borderRadius: 8,
  fontSize: 13,
};

const buttonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #1a1a1a",
  background: "#1a1a1a",
  color: "#fff",
  textDecoration: "none",
  fontSize: 13,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "#fff",
  color: "#1a1a1a",
  borderColor: "#c9cccf",
};

const dangerButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "#8e1f0b",
  borderColor: "#8e1f0b",
};

const disabledButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "#eee",
  borderColor: "#ddd",
  color: "#999",
  cursor: "not-allowed",
};

const headerStyle: CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid #ddd",
  fontWeight: 600,
  whiteSpace: "nowrap",
  fontSize: "12px",
};

const cellStyle: CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #eee",
  verticalAlign: "top",
  fontSize: "13px",
  whiteSpace: "nowrap",
};

const detailCellStyle: CSSProperties = {
  ...cellStyle,
  whiteSpace: "normal",
  background: "#fafafa",
};

const rawStyle: CSSProperties = {
  margin: "12px 0 0",
  padding: "12px",
  overflow: "auto",
  maxHeight: "320px",
  fontSize: "12px",
  background: "#111",
  color: "#f5f5f5",
  borderRadius: "8px",
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
