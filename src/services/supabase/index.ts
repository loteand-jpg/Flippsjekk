export { SUPABASE_ENV, jwtRole, readSupabaseConfig, supabaseConfigFromEnv, type SupabaseConfig, type SupabaseConfigResult } from './config';
export { DEFAULT_AUTH_OPTIONS, createSupabaseClient, getSupabaseClient, resetSupabaseClientForTests, type FlippsjekkSupabaseClient, type SupabaseClientProvider } from './client';
export { createSupabaseServices, type SupabaseServicesOptions } from './compose';
export { SupabaseAuthService } from './authService';
export { SupabaseProfileService } from './profileService';
