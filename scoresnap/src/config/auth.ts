import { OFFLINE_MODE } from "./offline";
export const REAL_AUTH_CONFIGURED = !OFFLINE_MODE && !!process.env.EXPO_PUBLIC_SUPABASE_URL && !!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY && !process.env.EXPO_PUBLIC_SUPABASE_URL.includes("your-project");
