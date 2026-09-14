/// <reference types="vite/client" />
/// <reference types="@react-router/node" />

interface ImportMetaEnv {
  readonly SUBSCRIPTION_API_URL?: string;
  readonly SUBSCRIPTION_ADMIN_TOKEN?: string;
}

declare namespace NodeJS {
  interface ProcessEnv {
    DATABASE_URL?: string;
    SUBSCRIPTION_API_URL?: string;
    SUBSCRIPTION_ADMIN_TOKEN?: string;
    SHOPIFY_API_KEY?: string;
    SHOPIFY_API_SECRET?: string;
    SCOPES?: string;
    SHOPIFY_APP_URL?: string;
  }
}
