import {
  Activity,
  CircleDollarSign,
  HeartPulse,
  Target,
} from "lucide-react";

import type {
  ActivityItem,
  OverviewStat,
} from "../types/dashboard";

export const overviewStats: OverviewStat[] = [
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

export const recentActivity: ActivityItem[] = [
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
];

export const activityIcons = {
  finance: CircleDollarSign,
  health: HeartPulse,
  task: Activity,
  goal: Target,
};