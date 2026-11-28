# Publish Math 24: Vercel, Azure F1, and Neon Free

This guide deploys the existing Angular browser application, Java 25 API, and
PostgreSQL 18 schema. It uses a dedicated Java App Service application and a
dedicated Neon project/database. The hosting target is $0 within the providers'
free allowances. The files in this repository prepare the deployment; adding
them does not create cloud resources or make the game live.

## Hosting layout

| Component | Service | Deployment unit |
| --- | --- | --- |
| Angular | Vercel Hobby | Static `dist/frontend/browser` output |
| Java API | Azure App Service F1, Java SE 25 | Executable Spring Boot JAR |
| PostgreSQL | Neon Free, PostgreSQL 18 | A database owned by this Java application |
| Checks and Java release | GitHub Actions | Separate Angular and Java workflows |

The browser loads Angular from Vercel and calls `/api/v1` on that same website
origin. Vercel forwards `/api/...` to the Azure application's `/api/...` path.
Java connects to Neon over TLS. Database credentials are backend configuration;
they never belong in the Angular build or the Vercel API-origin setting.

Use the providers' standard hostnames initially. Pick a stable Vercel production
hostname because the guest credential and saved round belong to that browser
origin. A different hostname, including a preview hostname, has separate browser
storage. Local development data is not automatically copied into the public game.

## CORS: configure the existing policy

There is no new Java CORS feature to implement. `GameApiWebConfiguration` already
accepts a comma-separated list of exact origins from `MATH24_ALLOWED_ORIGINS`.

For production, set that Azure application setting to the actual Vercel production
origin. For example, with an illustrative custom hostname:

```text
MATH24_ALLOWED_ORIGINS=https://play.example.com
```

An origin includes the scheme, hostname, and optional port. Do not include a path
or trailing slash. Replace the example with the real hostname before publishing.

The browser-to-Vercel request is same-origin, so it does not require a CORS
preflight just because Azure is the upstream server. The Vercel-to-Azure hop is
server-to-server. However, a proxy can retain the browser's `Origin` header, and
Spring can then compare it with the Azure request host. Configuring the exact
frontend origin allows that request and also supports intentional direct API
testing from that origin. This behavior is covered by `GameApiCorsTest`.

Keep Spring as the single CORS authority: leave the new Java App Service's
platform CORS allowlist unconfigured. Azure platform CORS can take precedence
over application CORS, so configuring both makes behavior harder to reason about.

The existing policy permits `GET`, `PUT`, `POST`, and `OPTIONS`, and permits the
`Authorization` and `Content-Type` request headers. Cookie credentials remain
disabled. Angular explicitly supplies its guest bearer credential; it does not
need `withCredentials: true`. CORS is a browser access policy, not guest
authorization and not a way to make the Azure endpoint private.

Do not use `*` or `*.vercel.app`. If an explicitly enabled preview needs API
access, use a separate test API/database and add only its exact frontend origin
to that API's allowlist. A stable preview hostname simplifies this setup.

## 1. Prepare and check the repository

From Windows PowerShell:

```powershell
Set-Location 'C:/Projects/24-game/angular-java-fullstack'
./scripts/Invoke-Database.ps1 -Task Start
./scripts/Invoke-Backend.ps1 -Task Test

Set-Location './frontend'
npm.cmd ci
npm.cmd run test:deployment
npm.cmd test -- --watch=false
npm.cmd run build
```

The deployment-config tests do not call Azure or Neon. The frontend tests do not
need the backend. Backend persistence tests use local PostgreSQL; never point a
test run at the production database.

Keep the existing Maven Wrapper and package lockfile. Azure uses the built JAR;
Vercel uses the compiled browser output. Docker remains the local PostgreSQL and
CI test-database tool, not a prerequisite on a player's computer.

## 2. Create the Java database in the existing Neon account

1. Select the existing **Free** organization/account and create a project for
   this Java application. Keep its schema separate from the .NET implementation.
2. Select PostgreSQL **18** and an available AWS region geographically close to
   the Azure application. Neon no longer accepts new projects in Azure regions.
3. Keep the Free plan and its idle suspension enabled.
4. Obtain a pooled application connection and a direct migration connection.
   Both must use TLS. For Java, use JDBC URLs and supply the username/password
   separately.

Illustrative JDBC URL shape:

```text
jdbc:postgresql://YOUR_NEON_HOST/YOUR_DATABASE?sslmode=require
```

Use the Java connection settings supplied by Neon. If configuring certificate
and hostname verification with `sslmode=verify-full`, include the required trust
configuration for the JDBC driver. Do not disable TLS to resolve a connection
error. A generic `postgresql://user:password@host/database` URI is not directly a
JDBC URL. The pgJDBC spelling of Neon's `channel_binding` option is
`channelBinding` if that option is included.

The migration URL must use the **direct** hostname, without `-pooler`. The runtime
application can use the pooled hostname. Production Hikari settings keep the
pool small and allow it to release idle connections. There are no scheduled
keep-awake queries.
Both connections must identify the same Java project, branch, and database;
only the connection endpoint and, if configured separately, the role differ.

### Apply migrations through the release process

Production deliberately has `spring.flyway.enabled=false` and
`spring.jpa.hibernate.ddl-auto=validate`. A new empty database needs the versioned
migration before the API can start successfully.

The `database-migrations` Maven profile supplies the Flyway plugin and PostgreSQL
support. The release workflow runs migrations against the direct connection,
then validates them. It keeps Flyway's schema history; it does not paste SQL
outside Flyway or enable automatic schema changes during normal API startup.

For a deliberate manual migration on Windows, provide these variables only in
the current PowerShell process:

| Variable | Value |
| --- | --- |
| `FLYWAY_URL` | Direct PostgreSQL JDBC URL with TLS, no embedded credentials |
| `FLYWAY_USER` | Migration role |
| `FLYWAY_PASSWORD` | Migration password |

Then run the helper from the project directory:

```powershell
./scripts/Invoke-Migrations.ps1 -Task Info
./scripts/Invoke-Migrations.ps1 -Task Migrate
./scripts/Invoke-Migrations.ps1 -Task Validate
```

Enter secrets through a local secret prompt or your secret-management tool rather
than pasting them into chat or committing them. Clear the process variables when
finished. Normal application startup still validates the schema without migrating
it. Once applied, retain `V1__create_game_tables.sql` unchanged and add new
versioned migrations for future schema changes.

## 3. Create the Azure Java application

Create a separately named App Service for Java in the existing Azure account.
Select **Code**, **Java 25**, **Java SE**, and an **F1 Free** plan. Prefer Linux
where the selected region/subscription offers F1. Check the final SKU and price
before creating resources; the workflow does not create or upgrade plans.

The executable JAR contains its HTTP server. Use the Java SE hosting model and
let App Service launch the deployed JAR with its normal port configuration. The
application already supports `PORT`, defaulting to 8080 for local use.

Record the application's actual default HTTPS hostname from Azure. Do not assume
it can always be constructed as `APP_NAME.azurewebsites.net`; Azure can add a
unique suffix and region segment.

Set the following in the new application's environment settings:

| Name | Value |
| --- | --- |
| `SPRING_PROFILES_ACTIVE` | `prod` |
| `SPRING_DATASOURCE_URL` | Neon application JDBC URL with TLS |
| `SPRING_DATASOURCE_USERNAME` | Runtime database role |
| `SPRING_DATASOURCE_PASSWORD` | Runtime database password |
| `MATH24_ALLOWED_ORIGINS` | Exact stable Vercel production origin |

Use HTTPS Only. The game implements its own guest credential protocol, so App
Service's optional sign-in feature should not require players to authenticate
with Microsoft. Leave platform CORS unconfigured and let Spring handle it.

Use the built-in application log stream initially. Optional separately billed
monitoring resources are outside this free deployment setup.

### Configure the GitHub release identity

The Java workflow uses Azure OpenID Connect (OIDC), not a publish-profile password.
Create or configure the Azure identity with access to the Java application and
read access to its App Service plan. It does not need access to the .NET database.

Create the GitHub environment **`java-production`**, with deployment branches
restricted to `main`. Configure the Azure federated credential for:

```text
Issuer:   https://token.actions.githubusercontent.com
Audience: api://AzureADTokenExchange
Subject:  repo:RichardWu2168/24-game:environment:java-production
```

The environment form of the subject matters: this deploy job uses a GitHub
environment, so a credential restricted only to `ref:refs/heads/main` will not
match its OIDC token. Use the actual owner/repository if the project is forked.

Add these GitHub environment variables:

| Variable | Value |
| --- | --- |
| `AZURE_JAVA_CLIENT_ID` | Azure release identity client ID |
| `AZURE_JAVA_TENANT_ID` | Azure tenant ID |
| `AZURE_JAVA_SUBSCRIPTION_ID` | Subscription containing the Java app |
| `AZURE_JAVA_RESOURCE_GROUP` | Java application's resource group |
| `AZURE_JAVA_WEBAPP_NAME` | Actual Java App Service resource name |

Add these GitHub environment secrets:

| Secret | Value |
| --- | --- |
| `JAVA_FLYWAY_URL` | Direct Neon migration JDBC URL with TLS |
| `JAVA_FLYWAY_USER` | Migration database role |
| `JAVA_FLYWAY_PASSWORD` | Migration role password |

Runtime database settings remain in Azure. The Java-specific variable names
separate this workflow from the existing .NET release identity and destination.

### Run the first Java release

Complete the Azure settings and reserve the Vercel project's stable production
hostname in step 4 before starting this release. The Azure preflight requires
`MATH24_ALLOWED_ORIGINS` to be present. Vercel can build the UI while the API is
being provisioned; share the game link after the complete live checks pass.

After the preparation branch has passed checks and been merged into `main`:

1. Open GitHub Actions and select **Java Game API**.
2. Select **Run workflow**, choose `main`, and enable the **deploy** input.
3. The workflow checks/tests the code against disposable PostgreSQL 18, builds
   the JAR, checks the Azure destination, applies production migrations, deploys,
   and checks the application's health endpoint.
4. Verify the first actual puzzle as well as health. The solvable-puzzle catalogue
   is built on first use, so health alone does not exercise that work.

Pushes and pull requests run checks. Java production deployment is an explicit
workflow dispatch for this first release setup. Azure F1 does not provide a
deployment slot for a staging swap, so expect a brief interruption when replacing
the running application.

## 4. Connect Vercel to the Angular directory

Create a new project in the existing Vercel Hobby account and connect the existing
GitHub repository. Use these settings:

| Setting | Value |
| --- | --- |
| Root Directory | `angular-java-fullstack/frontend` |
| Framework | Angular |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist/frontend/browser` |
| Node.js | 26.x |
| Production Branch | `main` |

The committed `vercel.ts` exports configuration evaluated at deployment time.
It uses a validated backend origin from the deployment environment. It is not a
frontend environment file and does not put database secrets in the browser.

Configure this Vercel variable with **Production** scope:

```text
MATH24_API_ORIGIN=https://YOUR_ACTUAL_AZURE_HOSTNAME
```

Use only the HTTPS origin, without `/api/v1`, credentials, a query, or a fragment.
The routing configuration adds `/api/:path*` itself. Production configuration
fails with a clear error if the origin is missing or invalid.

For **Preview**, the separately named `MATH24_PREVIEW_API_ORIGIN` is required if
you want to deploy a preview. Without it, preview configuration fails with an
explicit message; it never borrows the production API setting. Production does
not require a preview backend. If previews are needed later, provide a separate
test API and add the exact preview origin to that API's
`MATH24_ALLOWED_ORIGINS`.

Every successfully configured deployment forwards `/api/**` externally before
Angular's standard SPA fallback. Requiring an API origin prevents an unconfigured
preview from using Angular's catch-all page for API calls. The configuration
disables rewrite caching and retains the backend's `Cache-Control: no-store`
behavior. It does not overwrite the guest bearer header or add another CORS
policy. Check real API error responses in the live smoke test.

After choosing the stable Vercel production hostname, enter its exact origin in
the Azure application's `MATH24_ALLOWED_ORIGINS` setting and restart/redeploy as
needed. A Vercel environment change takes effect on a new deployment.

## 5. Verify the live deployment

Use the actual production hostname for these checks:

1. Open the page in a fresh browser session. Confirm that Angular files load and
   `/api/v1` returns JSON through Vercel, not `index.html`.
2. Start a puzzle. Confirm the clock begins after cards are visible, even if the
   API needed time to start.
3. Solve a suitable puzzle with automatic parentheses; try an incorrect answer
   and correction and confirm captured time stays fixed.
4. Reveal and skip separate rounds, then refresh both active and completed games.
5. Check the network panel for `Cache-Control: no-store`, correct API statuses,
   and no redirects to a sign-in page. The guest token must be in the request
   header, not the URL.
6. Use a second browser profile and confirm it has an independent guest session.
7. Repeat after a period without API traffic. A later answer submission can wake
   the service as well as a first visit. The browser allows up to 60 seconds per
   API request and offers the existing safe retry if that is exceeded.
8. Review Azure CPU/memory quotas and Neon storage/compute use after normal play.

Do not run a continuous uptime ping just to prevent idle suspension. F1 and Neon
Free trade startup latency for limited free resources. An exhausted quota can
make the service unavailable until its reset period; a longer browser timeout
cannot fix a stopped service.

The browser records timing locally and keeps the original operation ID, draft,
and captured duration across uncertain responses. Waiting for a newly requested
puzzle must not consume thinking time, and submitting a frozen answer must not
replace its duration.

## Releases and recovery

Keep the last successful Java build artifact and Vercel deployment available.
Redeploy that application version if a release fails. Before migrations that
change existing data, take a Neon snapshot or a direct-connection `pg_dump`
backup. Application rollback does not automatically undo a database migration;
prefer backward-compatible schema changes and correct problems with a reviewed
forward migration.

Both CI workflows are scoped to this implementation. The older .NET backend
workflow is scoped to its own files so Angular/Java-only changes do not redeploy
the older application.

## Preparation verification

The preparation changes were checked locally with 57 passing Angular cases,
six deployment-configuration cases, and 86 passing Java cases (80 domain cases
and six database-free CORS cases). The Angular production build and Maven POM
validation passed. The workflow and PowerShell syntax were checked, and the
Azure destination preflight was exercised with mocked CLI responses.

The new Flyway Maven command has not been executed against PostgreSQL in this
workspace: no PostgreSQL/Docker service is available, and downloading its new
plugin was blocked by the unavailable local Maven proxy. Java CI runs that exact
migration command against disposable PostgreSQL 18 before running the full
database-backed suite. Live Vercel/Azure/Neon behavior remains a separate release
verification step; the preparation tests do not establish that the game is live.

## Official references

- [Vercel programmatic configuration](https://vercel.com/docs/project-configuration/vercel-ts)
- [Vercel external rewrites and caching](https://vercel.com/docs/routing/rewrites)
- [Spring MVC CORS](https://docs.spring.io/spring-framework/reference/web/webmvc-cors.html)
- [Azure application CORS and platform CORS](https://learn.microsoft.com/en-us/azure/app-service/app-service-web-tutorial-rest-api)
- [Azure Java deployment](https://learn.microsoft.com/en-us/azure/app-service/configure-language-java-deploy-run)
- [Azure OIDC with GitHub Actions](https://learn.microsoft.com/en-us/azure/developer/github/connect-from-azure-openid-connect)
- [Neon Java connections](https://neon.com/docs/guides/java)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
- [Neon Free plan limits](https://neon.com/docs/introduction/plans)
