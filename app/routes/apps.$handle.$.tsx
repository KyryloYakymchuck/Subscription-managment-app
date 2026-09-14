import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

/**
 * Forward nested admin entry paths under /apps/{handle}/...
 */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const rest = params["*"]?.replace(/^\/+/, "") || "app";
  throw redirect(`/${rest}${url.search}`);
};
