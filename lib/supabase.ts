const SUPABASE_URL = "https://rdxtoymdnoofyofbenlp.supabase.co/rest/v1";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkeHRveW1kbm9vZnlvZmJlbmxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0NTk1NDQsImV4cCI6MjA4NTAzNTU0NH0.FTp5HyiGsg8Z_vymjKBuDEmTmxmtztOv2wS_seuXG-8";

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
};

export async function supabaseGet<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}${path}`, { headers });
  if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
  return res.json();
}

export async function supabasePatch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: "PATCH",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
  return res.json();
}

export async function supabaseDelete(path: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
}
