"use client";

import { ChartPanel, ChartSwitcher } from "@/components/ui/chart-switcher";
import { IncomeExpensesChart, WeightTrendChart } from "./overview-analysis";
import { SpendingOverview } from "./spending-overview";
import { GoalsOverview } from "./goals-overview";

export function OverviewVisualizations() {
  return (
    <ChartSwitcher
      label="Your trends"
      options={[
        { value: "cash-flow", label: "Cash flow" },
        { value: "weight", label: "Weight" },
        { value: "spending", label: "Spending" },
      ]}
    >
      <div className="contents md:grid md:min-w-0 md:gap-4 xl:grid-cols-2">
        <ChartPanel value="cash-flow">
          <IncomeExpensesChart />
        </ChartPanel>
        <ChartPanel value="weight">
          <WeightTrendChart />
        </ChartPanel>
      </div>
      <div className="contents md:grid md:gap-4 xl:grid-cols-[1.35fr_1fr]">
        <ChartPanel value="spending">
          <SpendingOverview />
        </ChartPanel>
        <GoalsOverview />
      </div>
    </ChartSwitcher>
  );
}
