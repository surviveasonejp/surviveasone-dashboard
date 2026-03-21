import type { AlertLevel, SurvivalRank } from "../../shared/types";

export function getAlertLevel(days: number): AlertLevel {
  if (days <= 30) return "critical";
  if (days <= 60) return "warning";
  if (days <= 90) return "caution";
  return "safe";
}

export function getAlertColor(level: AlertLevel): string {
  switch (level) {
    case "critical": return "#ff1744";
    case "warning": return "#ff9100";
    case "caution": return "#ffea00";
    case "safe": return "#00e676";
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
    case "S": return "#00e676";
    case "A": return "#66ffa6";
    case "B": return "#ffea00";
    case "C": return "#ff9100";
    case "D": return "#ff5252";
    case "F": return "#ff1744";
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
