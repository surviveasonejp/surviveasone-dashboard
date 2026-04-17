import { useSearchParams } from "react-router-dom";
import { type ScenarioId, DEFAULT_SCENARIO, SCENARIOS } from "../../shared/scenarios";

function isValidScenario(s: string | null): s is ScenarioId {
  return s !== null && s in SCENARIOS;
}

/**
 * URL クエリパラメータ `?scenario=xxx` と React state を同期するフック。
 *
 * - 初期値は URL から読み取り、有効な ScenarioId なら使用。無効/未指定時は DEFAULT_SCENARIO
 * - setScenario(id) は URL を書き換える。DEFAULT_SCENARIO の場合は param を削除（URL をキレイに保つ）
 * - replace 遷移で履歴を汚さない
 */
export function useScenarioParam(): [ScenarioId, (id: ScenarioId) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("scenario");
  const scenario: ScenarioId = isValidScenario(raw) ? raw : DEFAULT_SCENARIO;

  const setScenario = (id: ScenarioId) => {
    const params = new URLSearchParams(searchParams);
    if (id === DEFAULT_SCENARIO) {
      params.delete("scenario");
    } else {
      params.set("scenario", id);
    }
    setSearchParams(params, { replace: true });
  };

  return [scenario, setScenario];
}
