import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://xlkeyraklzmlhxpfgyds.supabase.co";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhsa2V5cmFrbHptbGh4cGZneWRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4ODE4NzcsImV4cCI6MjA4NDQ1Nzg3N30.6E_QwJayE-1HY-pUQAoUqssLnjfeF46_wxbAiThnUMg";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);