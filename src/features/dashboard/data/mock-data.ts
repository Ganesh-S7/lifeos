import {
  Activity,
  CircleDollarSign,
  HeartPulse,
  Target,
} from "lucide-react";

import type {
  ActivityItem,
  OverviewStat,
  SpendingItem,
} from "../types/dashboard";

export const overviewStats: OverviewStat[] = [
  {
    label: "Monthly spending",
    value: "₹16,240",
    description: "8.4% less than last month",
    trend: "down",
  },
  {
    label: "Savings",
    value: "₹18,500",
    description: "12.2% more than last month",
    trend: "up",
  },
  {
    label: "Weight",
    value: "72.4 kg",
    description: "0.8 kg down this month",
    trend: "down",
  },
  {
    label: "Habit completion",
    value: "75%",
    description: "18 of 24 completed",
    trend: "up",
  },
];

export const spendingData: SpendingItem[] = [
  { label: "Food", value: 4200 },
  { label: "Transport", value: 2100 },
  { label: "Shopping", value: 3200 },
  { label: "Bills", value: 2800 },
  { label: "Other", value: 3940 },
];

export const recentActivity: ActivityItem[] = [
  {
    title: "Expense added",
    description: "Dinner · ₹420",
    time: "2 hours ago",
    type: "finance",
  },
  {
    title: "Weight logged",
    description: "72.4 kg",
    time: "5 hours ago",
    type: "health",
  },
  {
    title: "Habit completed",
    description: "Workout",
    time: "6 hours ago",
    type: "task",
  },
  {
    title: "Savings goal updated",
    description: "Emergency Fund · ₹5,000",
    time: "Yesterday",
    type: "goal",
  },
];

export const activityIcons = {
  finance: CircleDollarSign,
  health: HeartPulse,
  task: Activity,
  goal: Target,
};