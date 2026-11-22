// Serve the app at / for returning users (ot-open-app cookie) so the visit is one document load.
// ?home still shows the landing page. New visitors (no cookie) fall through to landing.html.
export default async (request, context) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return context.next();
  const url = new URL(request.url);
  if (url.pathname !== '/') return context.next();
  if (url.searchParams.has('home')) return context.next();
  if (context.cookies.get('ot-open-app') !== '1') return context.next();
  return context.rewrite('/index.html');
};

export const config = { path: '/' };
