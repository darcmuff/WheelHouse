'use strict';

const LOGO_API = 'https://api.logo.dev/v2/brands/logo';
const BRAND_API = 'https://api.logo.dev/v2/brands';

/** Logo route: 2 credits; Brand route: 5 credits. @see https://www.logo.dev/docs/platform/credits */
const CREDITS_LOGO = 2;
const CREDITS_BRAND = 5;

/**
 * @returns {Promise<{ png: Buffer, route: 'logo'|'brand', credits: number, brandJson?: object, why?: string }|{ why: string }>}
 */
async function fetchLogoPng(ticker, secretKey, fetchImpl = fetch) {
  const sym = encodeURIComponent(String(ticker).toUpperCase());
  const auth = { Authorization: `Bearer ${secretKey}`, Accept: 'application/json' };

  const logoRes = await fetchImpl(`${LOGO_API}?ticker=${sym}`, {
    headers: auth,
    signal: AbortSignal.timeout(45000),
  });

  if (logoRes.status === 401 || logoRes.status === 403) {
    return { why: `auth:${logoRes.status}` };
  }
  if (logoRes.status === 402) {
    return { why: 'credits_exhausted' };
  }
  if (logoRes.status === 429) {
    const raHdr = logoRes.headers.get('retry-after');
    const retryAfter = raHdr != null && raHdr !== '' && Number.isFinite(Number(raHdr)) ? Number(raHdr) : 30;
    return { why: 'rate_limited', retryAfter };
  }
  if (logoRes.status === 202) {
    return { why: 'indexing' };
  }
  if (logoRes.status === 404) {
    return { why: 'no_logo' };
  }

  let route = 'logo';
  let credits = CREDITS_LOGO;
  let j;

  const creditsRemaining = logoRes.headers.get('credits-remaining') || logoRes.headers.get('Credits-Remaining');

  if (logoRes.ok) {
    j = await logoRes.json();
  } else {
    const brandRes = await fetchImpl(`${BRAND_API}?ticker=${sym}`, { headers: auth, signal: AbortSignal.timeout(45000) });
    if (!brandRes.ok) {
      if (brandRes.status === 404) return { why: 'no_logo' };
      return { why: `api_http:${brandRes.status}` };
    }
    route = 'brand';
    credits = CREDITS_BRAND;
    j = await brandRes.json();
  }

  const data = (j && j.data) || j;
  const logoObj = data.logo || data;
  const logoUrl = logoObj && (logoObj.url || logoObj.href);
  if (!logoUrl) return { why: 'no_logo_url' };

  const dl = new URL(logoUrl);
  if (!dl.searchParams.has('format')) dl.searchParams.set('format', 'png');
  if (!dl.searchParams.has('size')) dl.searchParams.set('size', '512');

  const img = await fetchImpl(dl.toString(), { signal: AbortSignal.timeout(45000) });
  if (!img.ok) return { why: `download_http:${img.status}` };
  const png = Buffer.from(await img.arrayBuffer());
  if (!png.length) return { why: 'empty_image' };
  const rem = creditsRemaining != null && creditsRemaining !== '' ? Number(creditsRemaining) : null;
  return { png, route, credits, creditsRemaining: Number.isFinite(rem) ? rem : null, brandJson: data };
}

module.exports = { fetchLogoPng, CREDITS_LOGO, CREDITS_BRAND };