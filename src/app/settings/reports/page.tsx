import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ReportSettingsPanel } from "@/components/settings/report-settings-panel";

export default async function ReportSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--fg)]">Reports & Alerts</h1>
        <p className="mt-1 text-sm text-muted">
          Configure scheduled portfolio reports and real-time market event notifications.
        </p>
      </div>

      <div className="glass-card rounded-2xl p-5">
        <ReportSettingsPanel />
      </div>
    </div>
  );
}
