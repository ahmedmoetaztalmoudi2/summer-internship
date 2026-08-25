import { QaApiError } from "@/types/qa";

/**
 * Base URL of the QA agent backend.
 * Set VITE_QA_API_URL to point the UI at your existing backend.
 */
export const API_BASE_URL: string =
  (import.meta.env["VITE_QA_API_URL"] as string | undefined) ?? "";

/** When no backend URL is configured, the isolated mock service is used instead. */
export const USE_MOCK_API = API_BASE_URL.trim() === "";

const FRIENDLY_MESSAGES: Record<string, string> = {
  invalid_ticket: "That Jira ticket could not be found. Please check the ticket key and try again.",
  jira_unavailable: "Jira is currently unreachable. Please try again in a moment.",
  invalid_url: "That website URL does not look valid. Please enter a full URL including https://.",
  website_unreachable: "Unable to access the website. Please verify the URL and try again.",
  missing_credentials: "Some required information is missing. Please complete the requested fields.",
  gherkin_failed: "The agent could not generate test scenarios from this ticket.",
  playwright_failed: "The agent could not generate Playwright tests for this scenario.",
  execution_failed: "The test run could not be executed against the target website.",
  backend_unavailable: "The QA agent backend is unavailable. Please check that it is running.",
  timeout: "The agent took too long to respond. Please try again.",
  unknown: "Something went wrong. Please try again.",
};

export function friendlyMessage(code: string, fallback?: string): string {
  return FRIENDLY_MESSAGES[code] ?? fallback ?? FRIENDLY_MESSAGES["unknown"]!;
}

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal } = options;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    });
  } catch {
    throw new QaApiError("backend_unavailable", friendlyMessage("backend_unavailable"));
  }

  if (!response.ok) {
    let code = "unknown";
    let message: string | undefined;
    try {
      const payload = (await response.json()) as { code?: string; message?: string };
      code = payload.code ?? code;
      message = payload.message;
    } catch {
      /* non-JSON error body */
    }
    if (response.status === 504 || response.status === 408) code = "timeout";
    if (response.status >= 500 && code === "unknown") code = "backend_unavailable";
    throw new QaApiError(code, friendlyMessage(code, message));
  }

  return (await response.json()) as T;
}
