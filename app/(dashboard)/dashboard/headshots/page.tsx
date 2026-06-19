import { redirect } from "next/navigation";
import { HeadshotsApp } from "@/components/dashboard/headshots-app";
import { siteConfig } from "@/lib/seo";
import { ensureUserProfile, getDashboard } from "@/lib/db/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: `${siteConfig.name} Dashboard` };

export default async function HeadshotsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const profile = await ensureUserProfile(user);
  const { credits, subscription } = await getDashboard(profile.id);

  return (
    <HeadshotsApp
      userEmail={profile.email}
      initialCredits={credits}
      initialSubscription={subscription ? {
        plan: subscription.plan,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd
      } : null}
    />
  );
}
