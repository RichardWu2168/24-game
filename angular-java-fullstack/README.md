# Math 24: Angular + Java

This directory contains the independent Angular, Java, and PostgreSQL
implementation of Math 24.

**Current milestone:** the Angular gameplay screen connects to the Java REST
API and PostgreSQL. Players can start a solvable puzzle, capture their thinking
time, enter an answer, see automatic-parentheses assistance, reveal or skip,
and continue to the next puzzle. The browser restores the current round, draft,
and timer after refresh and retains pending actions for safe retry. Simple
guest-session statistics appear alongside the game.

The agreed product behavior is recorded in
[design-decisions.md](docs/design-decisions.md).
See [the Java game engine guide](docs/java-game-engine.md) for its public API,
input rules, examples, puzzle selection, and tests.
See [the Java game API guide](docs/java-game-api.md) for guest access, endpoint
contracts, timing, retries, database tables, and PowerShell examples.
See [the Angular gameplay guide](docs/angular-gameplay.md) for the screen,
browser state, local API connection, and verification checklist.
See [the deployment guide](docs/deployment.md) for Vercel API forwarding, Azure
F1 configuration, exact CORS origins, Neon migrations, and the Java release
workflow. These deployment files prepare the public release; cloud resources
and account configuration are still separate setup steps.

## Toolchain

| Component | Version or choice |
| --- | --- |
| Angular framework and CLI | 22.3.0 |
| TypeScript | 6.0.3 in the committed lockfile |
| Node.js | 26 LTS preferred; Angular also supports 22.22.3+ within 22.x and 24.15+ within 24.x |
| npm | 11.19.1 used to generate and verify this scaffold |
| Java | JDK 25; Microsoft OpenJDK is the default Windows installer |
| Spring Boot | 4.2.0 |
| Maven | Wrapper downloads Maven 3.10.1; no global Maven installation needed |
| PostgreSQL | 18, supplied locally by Docker Compose |
| Editor | VS Code with Angular, Java, and Spring Boot extensions |

Use the committed package-lock.json and Maven Wrapper. Spring Boot manages
compatible versions of Hibernate, Flyway, the JDBC driver, and the test libraries.

## Folders

| Path | Purpose |
| --- | --- |
| frontend/ | Angular application, local CLI, and Vitest |
| frontend/src/app/features/game/ | Gameplay screen and signal-based game state |
| frontend/src/app/core/ | Typed game API, response models, and browser adapter |
| frontend/src/app/features/history/, statistics/, rules/ | Reserved for future standalone screens |
| frontend/src/app/shared/ | Future reusable presentation components |
| backend/ | Spring Boot Maven project |
| backend/src/main/java/io/math24/game/ | API, application, domain, and persistence package boundaries |
| backend/src/main/resources/ | Base, local, and production configuration |
| backend/src/main/resources/db/migration/ | Versioned Flyway migrations for PostgreSQL |
| infra/ | PostgreSQL Compose configuration and local environment example |
| scripts/ | Windows tool installation, dependency setup, backend launcher, and controlled migrations |
| docs/ | Agreed design and implementation notes |

This project remains inside the existing 24-game Git repository. There is no
nested Git repository and no change to the other implementations.

## Windows setup

The intended location is C:/Projects/24-game/angular-java-fullstack.
If using the supplied source archive, extract its angular-java-fullstack folder
into C:/Projects/24-game. Inspect an existing destination before extracting;
do not overwrite an existing implementation.

### 1. Install development tools

Open PowerShell in the new project directory:

```powershell
Set-Location 'C:/Projects/24-game/angular-java-fullstack'
./scripts/Install-DevTools.ps1
```

The installer checks for existing tools, keeps a compatible Node.js installation,
and installs missing tools through WinGet using exact package IDs:

- Git.Git
- OpenJS.NodeJS.LTS
- Microsoft.OpenJDK.25
- Microsoft.VisualStudioCode
- Docker.DockerDesktop

It installs these VS Code extensions:

- Angular.ng-template
- vscjava.vscode-java-pack
- vmware.vscode-boot-dev-pack

The installer can display normal Windows elevation or installer prompts.
It does not change PowerShell execution policy or restart Windows.
If downloaded scripts are blocked, keep the exact error for troubleshooting.

Docker is used for the local development database. If you are deliberately
postponing Docker setup, pass -SkipDocker; frontend builds and backend compilation
will still work, while database-backed startup and tests will need PostgreSQL.

Docker Desktop is free for personal use and education under its current terms.
Open Docker Desktop after installation and complete its first-run setup.
If it requests WSL setup or a restart, complete those steps before starting the
database. Docker Desktop must be running with Linux containers.

Close and reopen PowerShell and VS Code after installing tools so they receive
the updated environment.

### 2. Install project packages and verify compilation

```powershell
Set-Location 'C:/Projects/24-game/angular-java-fullstack'
./scripts/Initialize-Dev.ps1
```

This script:

1. Checks that Node.js is compatible and selects a JDK 25 installation.
2. Creates infra/.env with a random local database password if the file is absent.
3. Preserves an existing infra/.env.
4. Runs npm ci, the Angular production build, and its unit tests.
5. Runs the Maven Wrapper version check and test-compile.

The Java test-compile goal compiles application and test code; it does not run
the database-dependent contextLoads test.

The scripts select JAVA_HOME for their own process. If you use Maven directly,
make sure JAVA_HOME and javac identify JDK 25. Do not point JAVA_HOME at a bin
directory.

### 3. Start the local PostgreSQL database

After Docker Desktop reports that its engine is running:

```powershell
Set-Location 'C:/Projects/24-game/angular-java-fullstack'
docker version
docker compose version
./scripts/Invoke-Database.ps1 -Task Start
```

The database listens only on localhost, using port 5433 by default:

| Setting | Local value |
| --- | --- |
| Host | localhost |
| Port | 5433 |
| Database | math24_java |
| User | math24 |
| Password | Generated in infra/.env |

The launcher selects the same validated infra/.env values used by the backend,
so inherited POSTGRES environment variables cannot accidentally change the
database credentials or port. It restores prior process values on exit.

The volume is mounted at /var/lib/postgresql, which is the PostgreSQL 18 image's
persistent volume location. The named volume retains data across normal stops
and restarts. The generated role is a local development role.

To stop the database while retaining its data:

```powershell
./scripts/Invoke-Database.ps1 -Task Stop
```

Use the same credentials with an existing local volume. Changing the environment
file after PostgreSQL is initialized does not change its database password.
Keep the generated local environment file private; it is ignored by Git.

### 4. Run the Java backend

In a PowerShell terminal:

```powershell
Set-Location 'C:/Projects/24-game/angular-java-fullstack'
./scripts/Invoke-Backend.ps1 -Task Run
```

The launcher reads only the supported local settings from infra/.env, activates
the local profile, and explicitly selects the local JDBC database. It restores
the previous Spring environment variables when it exits.

With PostgreSQL running, the health endpoint should be available at:

[http://localhost:8080/actuator/health](http://localhost:8080/actuator/health)

The root URL has no controller at this milestone; a 404 at / is expected.
Use Ctrl+C to stop the backend.

To test the game engine without PostgreSQL or an infra/.env file:

```powershell
./scripts/Invoke-Backend.ps1 -Task EngineTest
```

This selects the `engine-tests` Maven profile and runs the plain Java domain
tests without starting Spring Boot. On Linux or macOS, run
`./mvnw -Pengine-tests test` from the backend directory with JDK 25 selected.

To run all Java tests, including the generated database-backed Spring context
test, first start PostgreSQL and then run:

```powershell
./scripts/Invoke-Backend.ps1 -Task Test
```

To run only the API and persistence integration tests with PostgreSQL running:

```powershell
./scripts/Invoke-Backend.ps1 -Task ApiTest
```

The integration suite creates its own randomly named schema in the configured
development database. It never truncates the application's normal tables.
The full `Test` task also runs the engine tests and the Spring context test.

For compilation without a database:

```powershell
./scripts/Invoke-Backend.ps1 -Task Compile
```

### 5. Run Angular

In a second terminal:

```powershell
Set-Location 'C:/Projects/24-game/angular-java-fullstack/frontend'
npm.cmd start
```

Open [http://localhost:4200/](http://localhost:4200/) and choose **Start puzzle**.
Keep PostgreSQL and the backend running. Angular proxies `/api/**` to
`http://127.0.0.1:8080`, so the browser uses the same origin for the page and game
requests. Use Ctrl+C to stop the development server.

To verify the frontend without starting PostgreSQL or Java:

```powershell
npm.cmd test -- --watch=false
npm.cmd run build
```

These unit tests use controlled clocks and API responses. The interactive game
itself requires the running backend and database.

To open the complete project in VS Code:

```powershell
Set-Location 'C:/Projects/24-game/angular-java-fullstack'
code.cmd ./math24.code-workspace
```

## Packages already included

Angular CLI installed Angular, Router, Forms, RxJS, TypeScript, the local build
tools, Vitest, and jsdom. Signals and HttpClient are part of Angular; they do not
need separate packages.

Spring Initializr included:

- Spring Web MVC
- Bean Validation
- Spring Data JPA
- PostgreSQL JDBC driver
- Flyway and its PostgreSQL module
- Actuator
- Spring Boot's matching test starters

The frontend uses standalone components, strict checking, routing, SCSS, and
client-side rendering. It does not require a production Node server.

## Database profiles

| Profile | Database configuration | Schema behavior |
| --- | --- | --- |
| local | Local PostgreSQL values selected by the launcher | Flyway runs locally; Hibernate validates |
| prod | SPRING_DATASOURCE_URL, SPRING_DATASOURCE_USERNAME, SPRING_DATASOURCE_PASSWORD | Startup Flyway disabled; Hibernate validates |

Use a Java-owned production database when deployment is established. Production
migrations are reviewed and applied separately before dependent application
changes are released. The local role and configuration are development-only.
The `database-migrations` Maven profile and `scripts/Invoke-Migrations.ps1`
provide that release step; the [deployment guide](docs/deployment.md) describes
the separate direct migration connection and the runtime connection.

The first migration creates guest sessions, game rounds, answer attempts, and
operation receipts. Constraints enforce valid cards and timing states, and a
partial unique index allows one active round per guest session. A local backend
startup or full test run applies the migration automatically. Keep applied
migrations unchanged; add a new version when the schema evolves.

## Verification

Verified in the development workspace:

- Angular dependencies installed successfully.
- Angular production build passed.
- The original generated Angular tests passed at the scaffold milestone.
- Maven Wrapper ran on Microsoft JDK 25.
- Backend application and starter test source compiled successfully.

For the game engine milestone, the `engine-tests` Maven profile passed all
**80 tests** on Java 25, with zero failures, errors, or skips. This includes
checking all 715 card multisets against an independent oracle, confirming 556
solvable multisets, validating every returned solution literally, and checking
256 generated puzzles.

Use `-Task Test` with PostgreSQL running to verify the complete Java suite on
your Windows machine. The API guide describes the additional persistence,
authorization, timing, and concurrent-retry coverage.

For the API/persistence milestone, a clean Maven verification on Java 25 and
PostgreSQL 18.7 passed **132 tests**: 80 domain cases, 51 API/database cases, and
the Spring context startup test, with zero failures, errors, or skips. Maven
also produced the executable Spring Boot JAR. The test JVM loads Mockito as an
explicit agent so it does not depend on dynamic self-attachment on Java 25.

For the Angular gameplay milestone, **55 frontend tests** passed, covering the
screen, HTTP contract, stored state, timing, and recovery. The production build
passed at approximately 291 kB of initial files (78 kB estimated transfer).
Live browser checks against the Java API and PostgreSQL verified solving,
automatic parentheses, incorrect-answer correction, refresh restoration,
reveal/skip, multiple-tab handling, and recovery after an API outage. The
responsive layout was also checked at 320- and 390-pixel widths.

Deployment preparation passed **57 frontend tests**, **6 deployment-configuration
tests**, and **86 Java tests** (80 domain cases and 6 database-free CORS cases).
The Angular production build passed. The new Java CI workflow verifies the
release migration command on disposable PostgreSQL 18 before the full backend
suite and a manual production deployment. That database-backed migration run and
live hosting checks remain required; see the deployment guide's verification
section for the workspace limitations.

## Official setup references

- [Angular compatibility](https://angular.dev/reference/versions)
- [Angular project generation](https://angular.dev/cli/new)
- [Microsoft OpenJDK installation](https://learn.microsoft.com/en-us/java/openjdk/install)
- [Spring Boot requirements](https://docs.spring.io/spring-boot/system-requirements.html)
- [Maven Wrapper](https://maven.apache.org/tools/wrapper/)
- [VS Code Java setup](https://code.visualstudio.com/docs/java/java-tutorial)
- [VS Code Spring Boot extensions](https://code.visualstudio.com/docs/java/java-spring-boot)
- [Docker Desktop on Windows](https://docs.docker.com/desktop/setup/install/windows-install/)
- [Official PostgreSQL container image](https://github.com/docker-library/docs/blob/master/postgres/README.md)
