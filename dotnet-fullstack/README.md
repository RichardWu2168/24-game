# 24 Game — .NET Full-Stack Implementation

An independent implementation of the 24 Game using ASP.NET Core, C#, Entity Framework Core, and PostgreSQL.

This project is being developed separately from the existing React and Node.js implementations in this repository. The current focus is the .NET backend, with an Angular frontend planned as a separate part of the project.

## Technology Stack

- **Backend:** C# / ASP.NET Core 10
- **Framework:** .NET 10
- **Database:** PostgreSQL
- **ORM:** Entity Framework Core 10
- **PostgreSQL provider:** Npgsql
- **API documentation:** ASP.NET Core OpenAPI
- **Testing:** xUnit
- **API testing:** Postman

## Architecture

The backend follows a layered architecture that separates the API, application logic, domain rules, and infrastructure.

```text
backend/
├── src/
│   ├── TwentyFourGame.API/
│   │   ├── Controllers/
│   │   ├── Exceptions/
│   │   └── Properties/
│   │
│   ├── TwentyFourGame.Application/
│   │   ├── DependencyInjection/
│   │   ├── DTOs/
│   │   ├── Interfaces/
│   │   ├── Services/
│   │   └── Validation/
│   │
│   ├── TwentyFourGame.Domain/
│   │   ├── Entities/
│   │   ├── Enums/
│   │   ├── Exceptions/
│   │   └── Rules/
│   │
│   └── TwentyFourGame.Infrastructure/
│       ├── DependencyInjection/
│       └── Persistence/
│           └── Migrations/
│
└── tests/
    ├── TwentyFourGame.API.Tests/
    │   ├── Controllers/
    │   ├── Factories/
    │   └── Persistence/
    │
    └── TwentyFourGame.Domain.Tests/
```

### Layer responsibilities

| Layer | Responsibility |
|---|---|
| API | HTTP endpoints, controllers, exception handling, and API configuration |
| Application | Application services, DTOs, interfaces, and validation |
| Domain | Game entities, domain rules, enums, and domain exceptions |
| Infrastructure | PostgreSQL persistence, EF Core, repositories, and migrations |

The API layer depends on the Application and Infrastructure layers. Application depends on Domain. Infrastructure implements persistence and repository interfaces defined by the Application layer.

## Prerequisites

- .NET 10 SDK
- PostgreSQL
- Visual Studio 2022 or later, or Visual Studio Code
- EF Core CLI (`dotnet-ef`)
- Postman (optional, for manual API testing)

## Getting Started

### 1. Clone the repository

```powershell
git clone https://github.com/RichardWu2168/24-game.git
cd 24-game/dotnet-fullstack/backend
```

### 2. Create the PostgreSQL database

Create a local PostgreSQL database for the application.

For example, using `createdb`:

```powershell
createdb twentyfourgame_dotnet
```

You can also create the database through pgAdmin.

### 3. Configure the database connection

The API reads its PostgreSQL connection string from the configuration key:

`ConnectionStrings:DefaultConnection`

Use .NET User Secrets to store the connection string locally:

```powershell
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "Host=localhost;Port=5432;Database=twentyfourgame_dotnet;Username=postgres;Password=YOUR_PASSWORD" --project .\src\TwentyFourGame.API
```

Replace the example username and password with your local PostgreSQL credentials.

The connection string is not stored in the source code or committed to Git.

### 4. Install the EF Core CLI

If you do not already have the EF Core command-line tool installed:

```powershell
dotnet tool install --global dotnet-ef
```

If it is already installed, check its version:

```powershell
dotnet ef --version
```

### 5. Apply database migrations

From the `backend` directory, run:

```powershell
dotnet ef database update --project .\src\TwentyFourGame.Infrastructure --startup-project .\src\TwentyFourGame.API
```

This applies the existing EF Core migrations to the configured PostgreSQL database.

The API does not automatically apply migrations when it starts.

### 6. Run the API

```powershell
dotnet run --project .\src\TwentyFourGame.API
```

The local launch profiles use these URLs:

| Profile | URL |
|---|---|
| HTTP | http://localhost:5216 |
| HTTPS | https://localhost:7112 |

The API exposes its OpenAPI document in the Development environment:

- http://localhost:5216/openapi/v1.json
- https://localhost:7112/openapi/v1.json

## API Endpoints

All endpoints are relative to the API base URL.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/gamesessions` | Create a game session |
| GET | `/api/gamesessions/{sessionId}/puzzle` | Get or resume the active puzzle |
| POST | `/api/gamesessions/{sessionId}/puzzle` | Create a new puzzle |
| GET | `/api/gamesessions/{sessionId}/games/{gameId}` | Get a saved game |
| POST | `/api/gamesessions/{sessionId}/games/{gameId}/got-it` | Record that the player solved the puzzle |
| POST | `/api/gamesessions/{sessionId}/games/{gameId}/answers` | Submit an answer |
| POST | `/api/answers/check` | Check an expression without saving a game attempt |
| GET | `/api/gamesessions/{sessionId}/history` | Retrieve paginated game history |
| GET | `/api/gamesessions/{sessionId}/stats` | Retrieve session statistics |
| DELETE | `/api/gamesessions/{sessionId}/history` | Clear session history |

## Running Tests

The solution contains two test projects:

- `TwentyFourGame.Domain.Tests` — domain rules and business logic.
- `TwentyFourGame.API.Tests` — controller integration tests and repository tests.

The API integration tests use a separate PostgreSQL database named twentyfourgame_dotnet_test. This keeps test data isolated from the development database.

Run the complete test suite from the `backend` directory:

```powershell
dotnet test
```

The current test suite has **96 passing tests**.

The API integration tests use a separate PostgreSQL test database.

## Postman Collection

Postman assets are organized under the postman/ directory::

```text
postman/
├── collections/
├── documents/
├── environments/
├── flows/
├── globals/
├── mocks/
└── specs/
```

Import the collection and the local environment into Postman.

Set the environment variables for the local API URL, session ID, and game ID as needed.

The default local API base URL is:

```text
http://localhost:5216
```

## Project Status

The .NET backend has been implemented with:

- Layered architecture
- Domain game rules and validation
- ASP.NET Core API controllers
- PostgreSQL persistence using EF Core
- Repository implementations
- Database migrations
- Game sessions, puzzle management, and game history
- Session statistics
- Unit and integration tests

The Angular frontend is planned as a separate development step.

## Related Implementations

This repository also contains other independent implementations of the 24 Game:

- React / TypeScript
- React / TypeScript with Node.js, Express, Prisma, and PostgreSQL

The .NET implementation is maintained separately so that the different technology stacks can evolve independently.