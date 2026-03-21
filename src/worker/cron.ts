/**
 * Cron Trigger ハンドラー
 *
 * 毎週月曜 UTC 3:00 (JST 12:00) に実行
 * - OWID energy-data CSVをGitHubからfetch → R2にアーカイブ
 */

interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  ARCHIVE: R2Bucket;
}

const OWID_CSV_URL = "https://raw.githubusercontent.com/owid/energy-data/master/owid-energy-data.csv";

export async function handleScheduled(
  _event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  ctx.waitUntil(fetchAndArchiveOwid(env));
}

async function fetchAndArchiveOwid(env: Env): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const archiveKey = `owid/energy-data-${today}.csv`;

  // R2に既に存在する場合はスキップ
  const existing = await env.ARCHIVE.head(archiveKey);
  if (existing) {
    console.log(`OWID CSV already archived: ${archiveKey}`);
    return;
  }

  // GitHubからCSVをfetch
  const response = await fetch(OWID_CSV_URL);
  if (!response.ok) {
    console.error(`Failed to fetch OWID CSV: ${response.status}`);
    return;
  }

  // R2にアーカイブ
  const csvBody = await response.arrayBuffer();
  await env.ARCHIVE.put(archiveKey, csvBody, {
    httpMetadata: {
      contentType: "text/csv",
    },
    customMetadata: {
      source: "owid/energy-data",
      fetchedAt: new Date().toISOString(),
    },
  });

  console.log(`OWID CSV archived: ${archiveKey} (${csvBody.byteLength} bytes)`);

  // 最新のlatestキーも更新
  await env.ARCHIVE.put("owid/energy-data-latest.csv", csvBody, {
    httpMetadata: {
      contentType: "text/csv",
    },
    customMetadata: {
      source: "owid/energy-data",
      fetchedAt: new Date().toISOString(),
      originalKey: archiveKey,
    },
  });
}
