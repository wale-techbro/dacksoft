import { redirect } from "next/navigation";
import { createSupabaseServerClient, supabaseConfigured } from "@/lib/supabase/server";

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (!supabaseConfigured()) redirect("/setup");
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login?next=%2Fdashboard");
  return children;
}
