const apiPath = '/api/:path*';

/**
 * Production requires an explicit backend. Preview builds never inherit that
 * backend: previews require their own API, which should use a separate test database.
 * Values are read when Vercel evaluates vercel.ts, so changes require a redeploy.
 */
export function createVercelConfig(environment) {
  const production = environment.VERCEL_ENV === 'production';
  const variable = production ? 'MATH24_API_ORIGIN' : 'MATH24_PREVIEW_API_ORIGIN';
  const value = environment[variable]?.trim();

  if (!value) {
    const target = production ? 'Production' : 'Preview';
    throw new Error(
      `Set ${variable} in Vercel ${target} to the corresponding Azure API HTTPS origin.`,
    );
  }

  const origin = requireHttpsOrigin(value, variable);

  return {
    $schema: 'https://openapi.vercel.sh/vercel.json',
    // The Angular preset supplies the page fallback. Every deployment must have
    // an API destination before that fallback; an unconfigured preview fails above.
    framework: 'angular',
    installCommand: 'npm ci',
    buildCommand: 'npm run build',
    outputDirectory: 'dist/frontend/browser',
    headers: [
      {
        source: apiPath,
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'x-vercel-enable-rewrite-caching', value: '0' },
        ],
      },
    ],
    rewrites: [
      // Preserve the complete /api/v1 path. No request-header overrides: each
      // browser's Authorization header belongs to that guest session.
      { source: apiPath, destination: `${origin}/api/:path*` },
    ],
  };
}

function requireHttpsOrigin(value, variable) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variable} must be an HTTPS origin without a path, query, or credentials.`);
  }

  if (
    url.protocol !== 'https:' ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${variable} must be an HTTPS origin without a path, query, or credentials.`);
  }

  return url.origin;
}
