const supabaseClient = window.supabase.createClient(
  window.WEX_CONFIG.SUPABASE_URL,
  window.WEX_CONFIG.SUPABASE_ANON_KEY,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

async function requireSession(redirectTo = "index.html") {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = redirectTo;
    return null;
  }
  return session;
}

async function fetchMyProfile() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, username, balance, is_admin, created_at")
    .eq("id", user.id)
    .single();
  if (error) {
    console.error("profile fetch error", error);
    return null;
  }
  return data;
}
