"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: createError } = await supabase.rpc("create_tenant_for_current_user", { tenant_name: name });
      if (createError) throw createError;
      router.push("/");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Workspace could not be created."); }
    finally { setBusy(false); }
  }
  return <main className="auth-shell"><form className="auth-card" onSubmit={submit}><strong className="auth-brand">Dacksoft</strong><h1>Set up your workspace</h1><p>Your account is ready. Add your business name to create a private workspace.</p><label>Business name<input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={100} required /></label>{error && <p className="auth-notice" role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? "Creating…" : "Create workspace"}</button></form></main>;
}
