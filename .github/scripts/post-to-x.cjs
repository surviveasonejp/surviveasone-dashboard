const crypto = require('crypto');
const fs = require('fs');
const https = require('https');

const apiKey = process.env.X_API_KEY;
const apiSecret = process.env.X_API_SECRET;
const accessToken = process.env.X_ACCESS_TOKEN;
const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;
const tag = process.env.RELEASE_TAG;
const name = process.env.RELEASE_NAME;
const url = process.env.RELEASE_URL;
const releaseBody = process.env.RELEASE_BODY || '';

// OAuth 1.0a signature
function oauthSign(method, baseUrl, params, consumerSecret, tokenSecret) {
  const sortedParams = Object.keys(params).sort().map(k =>
    encodeURIComponent(k) + '=' + encodeURIComponent(params[k])
  ).join('&');
  const base = method + '&' + encodeURIComponent(baseUrl) + '&' + encodeURIComponent(sortedParams);
  const signingKey = encodeURIComponent(consumerSecret) + '&' + encodeURIComponent(tokenSecret);
  return crypto.createHmac('sha1', signingKey).update(base).digest('base64');
}

function oauthHeader(method, url, extraParams = {}) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const oauthParams = {
    oauth_consumer_key: apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: accessToken,
    oauth_version: '1.0',
    ...extraParams,
  };
  const signature = oauthSign(method, url, oauthParams, apiSecret, accessTokenSecret);
  oauthParams.oauth_signature = signature;
  const header = 'OAuth ' + Object.keys(oauthParams)
    .filter(k => k.startsWith('oauth_'))
    .sort()
    .map(k => encodeURIComponent(k) + '="' + encodeURIComponent(oauthParams[k]) + '"')
    .join(', ');
  return header;
}

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function uploadMedia() {
  const mediaData = fs.readFileSync('screenshot.png').toString('base64');
  const uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json';
  const params = { media_data: mediaData };
  const body = 'media_data=' + encodeURIComponent(mediaData);
  const auth = oauthHeader('POST', uploadUrl, params);

  const res = await request({
    hostname: 'upload.twitter.com',
    path: '/1.1/media/upload.json',
    method: 'POST',
    headers: {
      'Authorization': auth,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);

  if (res.status !== 200) {
    console.error('Media upload failed:', res.status, res.body);
    return null;
  }
  return JSON.parse(res.body).media_id_string;
}

// リリースbodyから <!-- tweet: ... --> ブロックを抽出
// リリース作成時にX投稿の文面を制御できる
// 例: <!-- tweet: 【データ更新】タンカー追跡を17隻に拡大\n... -->
function extractTweetFromBody(body) {
  const match = body.match(/<!--\s*tweet:\s*([\s\S]*?)-->/);
  if (!match) return null;
  const text = match[1].trim();
  if (text.length === 0 || text.length > 280) return null;
  return text;
}

async function postTweet(mediaId) {
  // 優先順: 1) リリースbody内の <!-- tweet: --> 2) デフォルトテンプレート
  const customTweet = extractTweetFromBody(releaseBody);
  const text = customTweet || [
    '【データ更新 ' + tag + '】' + name,
    '',
    'シミュレーションを更新しました →',
    'surviveasonejp.org',
    '',
    '#surviveasonejp #備蓄確認',
  ].join('\n');

  const tweetBody = JSON.stringify({
    text: text,
    ...(mediaId ? { media: { media_ids: [mediaId] } } : {}),
  });

  const tweetUrl = 'https://api.twitter.com/2/tweets';
  const auth = oauthHeader('POST', tweetUrl);

  const res = await request({
    hostname: 'api.twitter.com',
    path: '/2/tweets',
    method: 'POST',
    headers: {
      'Authorization': auth,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(tweetBody),
    },
  }, tweetBody);

  console.log('Tweet response:', res.status, res.body);
  if (res.status === 201) {
    console.log('Successfully posted to X!');
  } else {
    console.error('Tweet failed');
    process.exit(1);
  }
}

(async () => {
  console.log('Uploading screenshot...');
  const mediaId = await uploadMedia();
  console.log('Media ID:', mediaId);

  console.log('Posting tweet...');
  await postTweet(mediaId);
})();
