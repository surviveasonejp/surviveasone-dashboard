interface Env {
  ASSETS: Fetcher;
}

const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'",
};

function isDevRequest(request: Request): boolean {
  const url = new URL(request.url);
  return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}

function addSecurityHeaders(
  response: Response,
  isDev: boolean,
): Response {
  const newResponse = new Response(response.body, response);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (isDev && key === "Content-Security-Policy") {
      continue;
    }
    newResponse.headers.set(key, value);
  }
  return newResponse;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const isDev = isDevRequest(request);

    if (url.pathname === "/api/health") {
      return addSecurityHeaders(
        Response.json({
          status: "ok",
          timestamp: new Date().toISOString(),
          version: "0.0.1",
        }),
        isDev,
      );
    }

    const response = await env.ASSETS.fetch(request);
    return addSecurityHeaders(response, isDev);
  },
} satisfies ExportedHandler<Env>;
