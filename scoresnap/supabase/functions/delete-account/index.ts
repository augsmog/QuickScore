import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleDeleteAccount } from "./handler.ts";

serve((req) => {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return handleDeleteAccount(req, {
    async getUser(token) {
      if (!url || !anon) return null;
      const client = createClient(url, anon, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      // Auth validates the JWT. data.user.id is the sub auth.uid() would return.
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user?.id) return null;
      return { id: data.user.id };
    },
    async purge(userId) {
      if (!url || !service) throw new Error("delete-account is not configured");
      const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
      // One RPC. purge_account runs in a single transaction and rolls back on any error.
      const { error } = await admin.rpc("purge_account", { p_user_id: userId });
      if (error) throw new Error(error.message);
    },
    async deleteAuthUser(userId) {
      if (!url || !service) throw new Error("delete-account is not configured");
      const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw new Error("auth_delete_failed");
    },
  });
});
