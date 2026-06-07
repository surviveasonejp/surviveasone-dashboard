import { type FC, useState, useCallback } from "react";

interface ShareButtonProps {
  /** クリック時に共有テキストを生成する。状態依存のため遅延評価で受け取る */
  getText: () => string;
  /** ボタンラベル（共有前の表示）。デフォルト「共有する」 */
  label?: string;
  /** ボタンのクラス（レイアウト差分用）。未指定時は既定スタイル */
  className?: string;
}

const DEFAULT_CLASS =
  "w-full py-2.5 px-4 rounded-lg text-xs font-mono font-bold bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 transition-colors";

/**
 * 共有ボタン。特定SNSに依存せず、対応環境では Web Share API（OS共有シート）、
 * 非対応環境（主にPC）ではクリップボードへコピーする。
 * X/Bluesky/任意の宛先へユーザーが貼り付けられる。
 */
export const ShareButton: FC<ShareButtonProps> = ({ getText, label = "共有する", className }) => {
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    const text = getText();
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ text });
      } catch {
        /* キャンセル/失敗時は何もしない */
      }
      return;
    }
    // Web Share 非対応（主にPC）→ クリップボードへコピー
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* クリップボード不可環境では何もしない */
    }
  }, [getText]);

  return (
    <button type="button" onClick={handleShare} className={className ?? DEFAULT_CLASS}>
      {copied ? "コピーしました ✓" : label}
    </button>
  );
};
