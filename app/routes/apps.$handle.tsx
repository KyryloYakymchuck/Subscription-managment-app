import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

/**
 * Shopify admin sometimes loads the embedded iframe at
 * `{application_url}/apps/{app-handle}` instead of the app root.
 * Forward that entry URL into the real app route.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  throw redirect(`/app${url.search}`);
};
