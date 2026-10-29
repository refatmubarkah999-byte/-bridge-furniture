function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`متغير البيئة ${name} غير مضبوط. انسخ .env.example إلى .env.local واملأه.`);
  }
  return value;
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  serviceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
  authEmailDomain: () => process.env.AUTH_EMAIL_DOMAIN || "staff.bridgefurniture.app",
};

export function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase()}@${env.authEmailDomain()}`;
}
