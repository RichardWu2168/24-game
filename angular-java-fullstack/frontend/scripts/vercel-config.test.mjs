import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVercelConfig } from './vercel-config.mjs';

const productionOrigin = 'https://math24-api.example';
const production = () =>
  createVercelConfig({ VERCEL_ENV: 'production', MATH24_API_ORIGIN: productionOrigin });

test('production refuses to publish without an explicit backend origin', () => {
  assert.throws(() => createVercelConfig({ VERCEL_ENV: 'production' }), /Set MATH24_API_ORIGIN/);
});

test('production preserves the complete API path and disables caching', () => {
  const config = production();
  assert.deepEqual(config.rewrites[0], {
    source: '/api/:path*',
    destination: `${productionOrigin}/api/:path*`,
  });
  assert.deepEqual(config.headers[0].headers, [
    { key: 'Cache-Control', value: 'no-store' },
    { key: 'x-vercel-enable-rewrite-caching', value: '0' },
  ]);
});

test('preview never falls back to the production API', () => {
  assert.throws(
    () => createVercelConfig({ VERCEL_ENV: 'preview', MATH24_API_ORIGIN: productionOrigin }),
    /Set MATH24_PREVIEW_API_ORIGIN/,
  );
});

test('preview accepts a separately configured test API', () => {
  const config = createVercelConfig({
    VERCEL_ENV: 'preview',
    MATH24_API_ORIGIN: productionOrigin,
    MATH24_PREVIEW_API_ORIGIN: 'https://math24-preview-api.example/',
  });
  assert.equal(config.rewrites[0].destination, 'https://math24-preview-api.example/api/:path*');
});

test('configuration rejects insecure URLs, embedded credentials, and API path suffixes', () => {
  for (const value of [
    'http://math24-api.example',
    'not a URL',
    'https://user:password@math24-api.example',
    'https://math24-api.example/api/v1',
    'https://math24-api.example?token=secret',
    'https://math24-api.example#fragment',
  ]) {
    assert.throws(
      () => createVercelConfig({ VERCEL_ENV: 'production', MATH24_API_ORIGIN: value }),
      /must be an HTTPS origin/,
    );
  }
});

test('an unspecified deployment environment cannot silently reuse the production API', () => {
  assert.throws(
    () => createVercelConfig({ MATH24_API_ORIGIN: productionOrigin }),
    /Set MATH24_PREVIEW_API_ORIGIN/,
  );
});
