const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

export interface DeleteAccountDeps {
  /** Returns the verified JWT subject. That is the value auth.uid() returns. */
  getUser: (token: string) => Promise<{ id: string } | null>;
  purge: (userId: string) => Promise<void>;
  deleteAuthUser: (userId: string) => Promise<void>;
}

/**
 * Deletes the caller identified by the bearer JWT.
 * The body and query string are not an identity source: a client-supplied id
 * cannot select another user. auth.admin.deleteUser receives only that subject.
 */
export async function handleDeleteAccount(req: Request, deps: DeleteAccountDeps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);
  // Discard the body so a user id in it cannot be forwarded.
  await req.text();
  const caller = await deps.getUser(token);
  if (!caller?.id || !USER_ID.test(caller.id)) return json({ error: "unauthorized" }, 401);
  try {
    await deps.purge(caller.id);
    await deps.deleteAuthUser(caller.id);
  } catch {
    return json({ error: "delete_failed" }, 500);
  }
  return json({ deleted: true }, 200);
}
