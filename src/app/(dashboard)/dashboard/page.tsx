import { DashboardHeader } from "@/features/dashboard/components/dashboard-header";
import { OverviewStats } from "@/features/dashboard/components/overview-stats";
import { HealthOverview } from "@/features/dashboard/components/health-overview";
import { RecentActivity } from "@/features/dashboard/components/recent-activity";
import { OverviewVisualizations } from "@/features/dashboard/components/overview-visualizations";

export default function DashboardPage() {
    return (
        <div className="space-y-4 lg:space-y-8">
            <DashboardHeader />

            <OverviewStats />
            <HealthOverview />
            <OverviewVisualizations />
            <RecentActivity />
        </div>
    );
}
