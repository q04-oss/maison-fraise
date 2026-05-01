import { NextRequest, NextResponse } from 'next/server';

// Generates a fresh cryptographically random nonce per request.
// Buffer.from(uuid).toString('base64') is the pattern recommended by Next.js 16.
// The nonce is set on both the CSP response header (browser enforces it) and
// the x-nonce request header (Next.js extracts it and stamps all generated
// script/style tags automatically during SSR).
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV === 'development';

  const csp = [
    "default-src 'self'",
    // strict-dynamic lets nonce-stamped scripts load further scripts without
    // needing each of them listed explicitly — required for Next.js code splitting.
    // unsafe-eval is needed in dev for React's error stack reconstruction; omitted in prod.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // style-src nonce covers <style> tags (font-face, critical CSS) that Next.js injects.
    // Inline style *attributes* (style="...") are moved to CSS classes — see globals.css.
    `style-src 'self' 'nonce-${nonce}'`,
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  // x-nonce lets server components call headers().get('x-nonce') if they ever
  // need the value directly (e.g. to pass to a third-party <Script> component).
  requestHeaders.set('x-nonce', nonce);
  // The CSP on the request headers is what Next.js reads during SSR to stamp tags.
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  // The CSP on the response headers is what the browser enforces.
  response.headers.set('Content-Security-Policy', csp);

  return response;
}

export const config = {
  matcher: [
    {
      // Run on every route except static assets and image optimisation paths.
      // Also skip prefetch requests — they don't need a fresh nonce.
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
