# 24 Game

A math puzzle game and software learning project, implemented using different programming languages and technology stacks.

The goal is to use all four number cards exactly once, combining them with addition, subtraction, multiplication, division, and parentheses to make 24.

## Screenshots

![24 Game main screen](screenshots/main-screen.png)

## Game Rules

- Each round deals four cards with values from 1 to 10.
- Use all four numbers exactly once.
- Use `+`, `-`, `×`, `÷`, and parentheses to form an expression.
- Every intermediate calculation must produce an integer. Fractions and decimals are not allowed.
- Generate new solvable hands and check your answer.
- View possible solutions when you need help.

## Implementations

| Version | Technologies | Status |
|---|---|---|
| TypeScript + React | React, TypeScript, Vite | In development |
| Node.js + TypeScript | React, TypeScript, Node.js, Express | Planned |
| C# + ASP.NET Core | C#, ASP.NET Core Web API | Planned |
| Blazor | C#, Blazor | Planned |
| .NET MAUI | C#, .NET MAUI | Planned |
| WPF | C#, WPF | Planned |

## React + TypeScript Version

The current implementation is located in [`react-typescript/`](react-typescript/frontend).

It includes:

- A React frontend built with TypeScript and Vite.
- Game logic for validating expressions and finding solutions.
- A solver that finds all unique solutions using integer-only intermediate calculations.
- Automatic generation of solvable hands using four copies of each card value from 1 to 10.
- Interactive number cards and direct expression input.
- Answer validation and a solution display.
- A timer and optional success sound.
- Automated unit tests using Vitest.

The frontend currently provides the playable game interface. Backend API development and frontend-backend integration are planned for future development.

## Project Goals

- Learn and practice different programming languages and frameworks.
- Compare different implementations of the same game.
- Practice software design, automated testing, and API development.
- Build portfolio projects that demonstrate practical software engineering skills.

## Technologies

- React
- TypeScript
- Vite
- Vitest

## Running the React + TypeScript Version

Open a terminal and navigate to the frontend directory:

```bash
cd nodejs-typescript/frontend
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Run the tests:

```bash
npm test
```

Build the application:

```bash
npm run build
```

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.