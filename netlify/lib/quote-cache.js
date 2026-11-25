// Finnhub quote CDN caching: never cache empty / zero prints (c:0).
function headersForQuote(data) {
  if (data && data.c > 0) {
    return {
      'Cache-Control': 'public, max-age=20',
      'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=30'
    };
  }
  return { 'Cache-Control': 'no-store', 'Netlify-CDN-Cache-Control': 'no-store' };
}

module.exports = { headersForQuote };