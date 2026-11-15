// Serve committed watermark PNGs (no Logo.dev on read).
const fs = require('fs');
const path = require('path');

const HEADERS = {
  'Content-Type': 'image/png',
  'Cache-Control': 'public, max-age=31536000, immutable',
  'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=31536000',
};

const _handler = async (event) => {
  const raw = String((event.queryStringParameters || {}).ticker || (event.pathParameters || {}).ticker || '')
    .trim()
    .toUpperCase()
    .replace(/\.PNG$/i, '')
    .slice(0, 12);
  if (!raw || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(raw)) {
    return { statusCode: 400, headers: { 'Cache-Control': 'no-store' }, body: 'Bad ticker' };
  }

  const roots = [
    path.join(__dirname, '../../app/brand'),
    path.join(process.cwd(), 'app/brand'),
  ];
  for (const root of roots) {
    const file = path.join(root, `${raw}.png`);
    try {
      const body = fs.readFileSync(file);
      if (body.length) return { statusCode: 200, headers: HEADERS, body: body.toString('base64'), isBase64Encoded: true };
    } catch {
      /* try next root */
    }
  }
  return { statusCode: 404, headers: { 'Cache-Control': 'no-store' }, body: 'Not found' };
};

exports.handler = require('../lib/origin').guard(_handler);