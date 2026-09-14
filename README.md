# Subscription Management Admin

Embedded Shopify admin app for managing a custom subscription service (`subscription.oplata.com.ua`).

## Features

- List subscriptions (`GET /admin/subscriptions`)
- Cancel a subscription (`POST /admin/cancel-subscription`)
- Pagination (50 per page)
- Cancel confirmation in the admin UI

## Quick start

1. Copy env values:

```shell
cp .env.example .env
```

2. Set `SUBSCRIPTION_ADMIN_TOKEN` in `.env`.

3. Install and run:

```shell
npm install
npm run dev
```

4. Follow the Shopify CLI prompts to create/link a Partner app and install it on a development store.

## Required configuration

| Variable | Purpose |
| --- | --- |
| `SUBSCRIPTION_API_URL` | Base URL (default `https://subscription.oplata.com.ua`) |
| `SUBSCRIPTION_ADMIN_TOKEN` | Bearer token for the subscription admin API |
| Shopify Partner app + store | Created/linked automatically via `shopify app dev` |

Shopify API keys are normally injected by the CLI during `npm run dev`.

## Production deploy

See [DEPLOY.md](./DEPLOY.md) — hosting on Render + install on a live store.
