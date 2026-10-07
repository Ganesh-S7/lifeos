import { DashboardHeader } from "@/features/dashboard/components/dashboard-header";
import { OverviewStats } from "@/features/dashboard/components/overview-stats";
import { SpendingOverview } from "@/features/dashboard/components/spending-overview";
import { HealthOverview } from "@/features/dashboard/components/health-overview";
import { GoalsOverview } from "@/features/dashboard/components/goals-overview";
import { RecentActivity } from "@/features/dashboard/components/recent-activity";

export default function DashboardPage() {
    return (
        <div className="space-y-4">
            <DashboardHeader />

            <OverviewStats />
            <HealthOverview />

            <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
                <SpendingOverview />
                <GoalsOverview />
            </div>
            <RecentActivity />
        </div>
    );
}