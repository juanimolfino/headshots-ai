import { redirect } from "next/navigation";
import { HeadshotsApp } from "@/components/dashboard/headshots-app";
import { ensureUserProfile, getDashboard } from "@/lib/db/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Headshots AI" };

export default async function HeadshotsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const profile = await ensureUserProfile(user);
  const { credits } = await getDashboard(profile.id);

  return (
    <HeadshotsApp
      userEmail={profile.email}
      initialCredits={credits}
    />
  );
}
