Edge functions use Deno URL imports and globals and are excluded from the Expo app's TypeScript entrypoints. Pure handlers imported by app scenarios still typecheck with those scenarios.

With Deno installed, check both entrypoints (without running servers or writing to Supabase):

```sh
cd supabase/functions
deno task check
```

The task is defined in deno.json. Deno was unavailable in the Oct 30, 2026 local fix environment, so that check was not run there. Node integration scenarios additionally require the package.json dependencies, including Stripe.
