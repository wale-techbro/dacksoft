"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getAuthCallbackUrl } from "@/lib/auth/callback-url";
import { PasswordField } from "@/components/auth/password-field";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("authError") === "confirmation") {
      const frame = window.requestAnimationFrame(() => {
        setNotice("That confirmation link is invalid or has expired. Please request a new one or sign in.");
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      const supabase = createSupabaseBrowserClient();
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const { data: memberships } = await supabase.from("tenant_memberships").select("tenant_id").limit(1);
        router.push(memberships?.length ? "/dashboard" : "/onboarding");
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: getAuthCallbackUrl(window.location.origin) },
        });
        if (error) throw error;
        if (!data.session) { setNotice("Check your email to confirm your account, then sign in to finish workspace setup."); return; }
        const { error: tenantError } = await supabase.rpc("create_tenant_for_current_user", { tenant_name: company });
        if (tenantError) throw tenantError;
        router.push("/dashboard");
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : "Sign-in could not be completed."); }
    finally { setBusy(false); }
  }

  return <main className="auth-shell"><form className="auth-card" autoComplete="on" onSubmit={submit}>
    <Link className="auth-brand" href="/">Dacksoft</Link>
    <h1>{mode === "signin" ? "Welcome back" : "Create your workspace"}</h1>
    <p>Secure access for your customer support team.</p>
    {mode === "signup" && <label htmlFor="company">Business name<input id="company" name="organization" type="text" autoComplete="organization" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" value={company} onChange={(event) => setCompany(event.target.value)} minLength={2} maxLength={100} required /></label>}
    <label htmlFor="email">Email<input id="email" name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
    <label htmlFor="password">Password<PasswordField id="password" name="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
    {notice && <p role="status" className="auth-notice">{notice}</p>}
    <button className="primary-button" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}</button>
    <button className="auth-toggle" type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setNotice(""); }}>{mode === "signin" ? "New to Dacksoft? Create an account" : "Already have an account? Sign in"}</button>
  </form></main>;
}
