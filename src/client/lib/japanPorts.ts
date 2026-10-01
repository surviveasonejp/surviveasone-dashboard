/**
 * 日本国内の仕向港キー（tankers.json の destinationPort）
 *
 * 「日本向け」判定の唯一の定義。TankerTracker・TankerMap・ArrivalTimeline で共有する。
 * 以前は3ファイルに別々に定義しており、地図と到着タイムラインだけ名古屋・姉崎・横浜等が欠けていた。
 * tankers.json に新しい国内港を使ったら、ここに追加すること。
 */
export const JAPAN_DEST_PORTS: ReadonlySet<string> = new Set([
  "Japan", "Kawasaki", "Hiroshima", "Chiba", "Yokkaichi", "Sakai",
  "Mizushima", "Kiire", "Futtsu", "Chita", "Kitakyushu", "Himeji",
  "Sodegaura", "Sendai", "Naha", "Kashima", "Negishi", "Oita", "Ehime",
  "Yokohama", "Hitachi", "Sakai/Izumiotsu",
  "Ogishima", "Anegasaki", "Yokosuka", "Fukuyama", "Nagoya", "Tomakomai",
  "Kobe", "Niihama", "Sakaide", "Shimizu", "Tokuyama",
]);
