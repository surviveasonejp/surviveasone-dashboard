/**
 * Journal — 意思決定ログページ（Phase 20-C）
 *
 * 設計者本人が「いつ・どんな仮説のもとで・どう判断したか」を時系列で
 * 振り返るためのページ。完全 localStorage、サーバー連携無し。
 *
 * MVP機能:
 * - エントリ一覧（新しい順）
 * - 個別削除
 * - JSON エクスポート（ダウンロード）
 * - JSON インポート（アップロード・上書き）
 */

import { type FC, useRef, useState } from "react";
import { Link } from "react-router";
import { PageHero } from "../components/PageHero";
import { SectionHeading } from "../components/SectionHeading";
import { Badge } from "../components/Badge";
import { useLocalStorage } from "../hooks/useLocalStorage";
import {
  STORAGE_KEYS,
  type DecisionLogEntry,
  type UserHypothesis,
  DEFAULT_HYPOTHESIS,
} from "../lib/journal";
import { SCENARIOS } from "../../shared/scenarios";

interface ExportPayload {
  schema: "sao-journal-v1";
  exportedAt: string;
  hypothesis: UserHypothesis;
  entries: DecisionLogEntry[];
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(d);
}

export const Journal: FC = () => {
  const [hypothesis, setHypothesis] = useLocalStorage<UserHypothesis>(
    STORAGE_KEYS.hypothesis,
    DEFAULT_HYPOTHESIS,
  );
  const [entries, setEntries] = useLocalStorage<DecisionLogEntry[]>(
    STORAGE_KEYS.decisionLog,
    [],
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const handleDelete = (id: string) => {
    if (!confirm("このログエントリを削除しますか？")) return;
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const handleExport = () => {
    const payload: ExportPayload = {
      schema: "sao-journal-v1",
      exportedAt: new Date().toISOString(),
      hypothesis,
      entries,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sao-journal-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<ExportPayload>;
      if (parsed.schema !== "sao-journal-v1") {
        throw new Error("対応していないスキーマです");
      }
      if (!Array.isArray(parsed.entries)) {
        throw new Error("entries が不正です");
      }
      const ok = confirm(
        `${parsed.entries.length} 件のエントリと仮説を読み込みます。\n現在の内容は上書きされます。続行しますか？`,
      );
      if (!ok) {
        setImportStatus({ type: "ok", msg: "インポートをキャンセルしました" });
        return;
      }
      setEntries(parsed.entries);
      if (parsed.hypothesis) {
        setHypothesis(parsed.hypothesis);
      }
      setImportStatus({
        type: "ok",
        msg: `${parsed.entries.length} 件のエントリを読み込みました`,
      });
    } catch (err) {
      setImportStatus({
        type: "err",
        msg: `読み込み失敗: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
    }
  };

  const handleClearAll = () => {
    if (!confirm("すべてのログエントリを削除します。元に戻せません。続行しますか？")) return;
    setEntries([]);
  };

  return (
    <div className="space-y-6">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1 text-xs font-mono text-text-muted hover:text-info transition-colors"
      >
        ← Dashboard へ戻る
      </Link>

      <PageHero
        title={<span className="text-info">JOURNAL</span>}
        right={<>
          <span className="text-xs font-mono text-text-muted tracking-wider hidden sm:inline">
            意思決定の振り返り
          </span>
        </>}
      />

      {/* 説明 */}
      <div className="bg-info/5 border border-info/25 rounded-lg p-4 space-y-2">
        <SectionHeading tone="info">
          DECISION LOG — 意思決定の記録
        </SectionHeading>
        <p className="text-xs text-text leading-relaxed">
          自分の仮説と判断の根拠を時系列で記録し、後から振り返るための個人用ジャーナルです。
          すべてブラウザの localStorage に保存され、サーバー側には送信されません。
        </p>
        <p className="text-xs text-text-muted leading-relaxed">
          新規エントリの追加は <Link to="/dashboard" className="text-info hover:underline">Dashboard</Link> の
          MY HYPOTHESIS パネルから行います。
        </p>
      </div>

      {/* 操作バー */}
      <div className="bg-panel border border-border rounded-lg p-4 space-y-3">
        <SectionHeading size="xs" tracking="widest">
          DATA MANAGEMENT — エクスポート / インポート
        </SectionHeading>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExport}
            className="px-3 py-1.5 text-xs font-mono rounded bg-info/15 text-info border border-info/30 hover:bg-info/25 transition-colors"
          >
            JSON エクスポート（{entries.length} 件）
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 text-xs font-mono rounded border border-border hover:bg-bg/50 transition-colors"
          >
            JSON インポート
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
              e.target.value = "";
            }}
          />
          {entries.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="px-3 py-1.5 text-xs font-mono rounded border border-primary-soft/40 text-primary-soft hover:bg-primary-soft/10 transition-colors ml-auto"
            >
              全削除
            </button>
          )}
        </div>
        {importStatus && (
          <p
            className={`text-[10px] font-mono ${
              importStatus.type === "ok" ? "text-success-soft" : "text-primary-soft"
            }`}
          >
            {importStatus.msg}
          </p>
        )}
      </div>

      {/* エントリ一覧 */}
      <div className="space-y-3">
        <SectionHeading size="xs" tracking="widest">
          ENTRIES — 記録一覧（{entries.length} 件）
        </SectionHeading>

        {entries.length === 0 ? (
          <div className="bg-panel border border-border rounded-lg p-8 text-center">
            <p className="text-sm text-text-muted">
              まだエントリがありません。
              <br />
              <Link to="/dashboard" className="text-info hover:underline">
                Dashboard
              </Link>{" "}
              の MY HYPOTHESIS パネルから記録を追加できます。
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="bg-panel border border-border rounded-lg p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-text break-words">
                      {entry.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[10px] font-mono text-text-muted">
                        {formatTimestamp(entry.timestamp)}
                      </span>
                      {entry.scenarioRef && entry.scenarioRef !== "custom" && (
                        <Badge tone="warning">
                          参照: {SCENARIOS[entry.scenarioRef].label}
                        </Badge>
                      )}
                      {entry.scenarioRef === "custom" && (
                        <Badge tone="info">参照: 私の想定</Badge>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(entry.id)}
                    className="text-[10px] font-mono px-2 py-1 rounded border border-border hover:border-primary-soft/40 hover:text-primary-soft transition-colors shrink-0"
                  >
                    削除
                  </button>
                </div>

                {entry.rationale && (
                  <p className="text-xs text-text leading-relaxed whitespace-pre-wrap border-l-2 border-info/30 pl-3">
                    {entry.rationale}
                  </p>
                )}

                {/* 仮説スナップショット */}
                <details className="text-[10px] font-mono text-text-muted">
                  <summary className="cursor-pointer hover:text-text">
                    仮説スナップショット ▼
                  </summary>
                  <div className="mt-1.5 pl-3 space-y-0.5 border-l border-border">
                    <div>ラベル: {entry.hypothesis.label || "（未設定）"}</div>
                    <div>石油遮断率: {entry.hypothesis.oilBlockadeRate.toFixed(3)}</div>
                    <div>LNG遮断率: {entry.hypothesis.lngBlockadeRate.toFixed(3)}</div>
                    <div>需要削減率: {entry.hypothesis.demandReductionRate.toFixed(3)}</div>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
