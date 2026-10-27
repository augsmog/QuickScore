import { REAL_AUTH_CONFIGURED } from "../config/auth";
import { supabase } from "../db/supabase";

/**
 * Ask the delete-account edge function to remove the signed-in user.
 * The function takes the user id from the JWT (auth.uid()). This body
 * intentionally has no user id.
 */
export async function deleteServerAccount(): Promise<void> {
  if (!REAL_AUTH_CONFIGURED) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return;
  const { data, error } = await supabase.functions.invoke("delete-account", {
    method: "POST",
    body: {},
  });
  if (error || !data?.deleted) throw new Error("Could not delete the account. Try again.");
}
