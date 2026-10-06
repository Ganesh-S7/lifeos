export type Trend = "up" | "down" | "neutral";

export interface OverviewStat {
  label: string;
  value: string;
  description: string;
  trend: Trend;
}

export interface SpendingItem {
  label: string;
  value: number;
}

export interface ActivityItem {
  title: string;
  description: string;
  time: string;
  type: "finance" | "health" | "task" | "goal";
}