import type { AlertLevel, SurvivalRank } from "../../shared/types";

export function getAlertLevel(days: number): AlertLevel {
  if (days <= 30) return "critical";
  if (days <= 60) return "warning";
  if (days <= 90) return "caution";
  return "safe";
}

export function getAlertColor(level: AlertLevel): string {
  switch (level) {
    case "critical": return "#ef4444";
    case "warning": return "#f59e0b";
    case "caution": return "#94a3b8";
    case "safe": return "#22c55e";
  }
}

export function getSurvivalRank(days: number): SurvivalRank {
  if (days >= 60) return "S";
  if (days >= 30) return "A";
  if (days >= 14) return "B";
  if (days >= 7) return "C";
  if (days >= 3) return "D";
  return "F";
}

export function getSurvivalRankColor(rank: SurvivalRank): string {
  switch (rank) {
    case "S": return "#22c55e";
    case "A": return "#4ade80";
    case "B": return "#94a3b8";
    case "C": return "#f59e0b";
    case "D": return "#ef4444";
    case "F": return "#dc2626";
  }
}

export function getSurvivalRankLabel(rank: SurvivalRank): string {
  switch (rank) {
    case "S": return "十分な備え";
    case "A": return "良好";
    case "B": return "最低限";
    case "C": return "要準備";
    case "D": return "危機的";
    case "F": return "生存困難";
  }
}
