export class ApiError extends Error {
  constructor(message: string, public code: string, public status: number, public details?: unknown) {
    super(message);
  }
}

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: init?.json !== undefined ? { "Content-Type": "application/json" } : init?.headers,
      body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    });
  } catch {
    throw new ApiError("Could not reach the server. Your change was not saved. Check your connection and try again.", "network", 0);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      payload?.error ?? `The server answered with an error (${response.status}). Your change was not saved.`,
      payload?.code ?? "server_error",
      response.status,
      payload?.details
    );
  }
  return payload as T;
}
