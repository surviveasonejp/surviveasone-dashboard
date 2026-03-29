const crypto = require('crypto');
const https = require('https');

const apiKey = process.env.X_API_KEY;
const apiSecret = process.env.X_API_SECRET;
const accessToken = process.env.X_ACCESS_TOKEN;
const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;
const tweetId = process.env.TWEET_ID;

if (!tweetId) {
  console.error('TWEET_ID is required');
  process.exit(1);
}

function oauthSign(method, baseUrl, params, consumerSecret, tokenSecret) {
  const sortedParams = Object.keys(params).sort().map(k =>
    encodeURIComponent(k) + '=' + encodeURIComponent(params[k])
  ).join('&');
  const base = method + '&' + encodeURIComponent(baseUrl) + '&' + encodeURIComponent(sortedParams);
  const signingKey = encodeURIComponent(consumerSecret) + '&' + encodeURIComponent(tokenSecret);
  return crypto.createHmac('sha1', signingKey).update(base).digest('base64');
}

function oauthHeader(method, url) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const oauthParams = {
    oauth_consumer_key: apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: accessToken,
    oauth_version: '1.0',
  };
  const signature = oauthSign(method, url, oauthParams, apiSecret, accessTokenSecret);
  oauthParams.oauth_signature = signature;
  const header = 'OAuth ' + Object.keys(oauthParams)
    .sort()
    .map(k => encodeURIComponent(k) + '="' + encodeURIComponent(oauthParams[k]) + '"')
    .join(', ');
  return header;
}

function request(options) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const deleteUrl = 'https://api.twitter.com/2/tweets/' + tweetId;
  const auth = oauthHeader('DELETE', deleteUrl);

  console.log('Deleting tweet:', tweetId);
  const res = await request({
    hostname: 'api.twitter.com',
    path: '/2/tweets/' + tweetId,
    method: 'DELETE',
    headers: {
      'Authorization': auth,
      'Content-Type': 'application/json',
    },
  });

  console.log('Delete response:', res.status, res.body);
  if (res.status === 200) {
    const data = JSON.parse(res.body);
    if (data.data && data.data.deleted) {
      console.log('Tweet deleted successfully');
    } else {
      console.error('Unexpected response');
      process.exit(1);
    }
  } else {
    console.error('Delete failed');
    process.exit(1);
  }
})();
