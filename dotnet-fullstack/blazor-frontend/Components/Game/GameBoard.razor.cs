using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;
using TwentyFourGame.Blazor.Models;
using TwentyFourGame.Blazor.Models.Api;
using TwentyFourGame.Blazor.Services;

namespace TwentyFourGame.Blazor.Components.Game;

public partial class GameBoard : IAsyncDisposable
{
    [Inject] private IJSRuntime JS { get; set; } = default!;
    [Inject] private GameApiClient GameApiClient { get; set; } = default!;
    [Inject] private BrowserStorageService BrowserStorage { get; set; } = default!;

    [Parameter]
    public bool ShowDebugInformation { get; set; }

    private bool isInitializingGame;

    private bool isRevealingSolution;

    private RevealSolutionResponse? solutionResult;

    private bool shouldRestoreTimer;

    private bool isRestoringSession;

    private bool sessionRestorationCompleted;

    private Guid? currentSessionId;

    private IJSObjectReference? keyboardModule;

    private IJSObjectReference? keyboardRegistration;

    private DotNetObjectReference<GameBoard>? dotNetReference;

    private ExpressionInputMode inputMode = ExpressionInputMode.Click;

    private string typedExpression = "";

    private SessionResponse? session;

    private PuzzleResponse? puzzle;

    private string? errorMessage;

    private bool isLoading;

    private readonly List<ExpressionToken> expressionTokens = [];

    private string ExpressionText =>
        string.Join(" ", expressionTokens.Select(token => token.Text));

    private readonly List<int> usedCardIndices = [];

    private GameTimer? gameTimer;

    private double? capturedDurationSeconds;

    private bool shouldStartTimer;

    private bool isSavingGotIt;

    private bool gotItSaved;

    private bool isSubmittingAnswer;

    private SubmitAnswerResponse? answerResult;

    private GameStatus currentGameStatus = GameStatus.InProgress;

    private bool IsGameOperationPending =>
    isLoading ||
    isRestoringSession ||
    isSubmittingAnswer ||
    isSavingGotIt ||
    isRevealingSolution;

    private bool CanCaptureThinkingTime =>
        puzzle is not null &&
        currentSessionId is not null &&
        currentGameStatus == GameStatus.InProgress &&
        !gotItSaved &&
        !IsGameOperationPending;

    private bool CanCreatePuzzle =>
        currentSessionId is not null &&
        !IsGameOperationPending;

    private bool CanSubmitAnswer =>
        puzzle is not null &&
        !IsGameOperationPending &&
        currentGameStatus == GameStatus.InProgress &&
        (
            inputMode == ExpressionInputMode.Type
                ? !string.IsNullOrWhiteSpace(typedExpression)
                : usedCardIndices.Count == puzzle.Numbers.Length &&
                  OpenParenthesisCount == 0 &&
                  (LastTokenType is ExpressionTokenType.Number
                      or ExpressionTokenType.CloseParenthesis)
        );

    private bool CanEditGame =>
        puzzle is not null &&
        !IsGameOperationPending &&
        currentGameStatus == GameStatus.InProgress;

    private ExpressionTokenType? LastTokenType =>
        expressionTokens.Count == 0
            ? null
            : expressionTokens[^1].Type;

    private bool CanAddNumber =>
        LastTokenType is null
        or ExpressionTokenType.Operator
        or ExpressionTokenType.OpenParenthesis;

    private bool CanAddOperator =>
        !isLoading &&
        (LastTokenType is ExpressionTokenType.Number
            or ExpressionTokenType.CloseParenthesis);

    private bool CanAddOpenParenthesis =>
        !isLoading &&
        (LastTokenType is null
            or ExpressionTokenType.Operator
            or ExpressionTokenType.OpenParenthesis);

    private bool CanAddCloseParenthesis =>
        !isLoading &&
        OpenParenthesisCount > 0 &&
        (LastTokenType is ExpressionTokenType.Number
            or ExpressionTokenType.CloseParenthesis);

    private bool CanEditExpression =>
        !isLoading && expressionTokens.Count > 0;

    private int OpenParenthesisCount =>
        expressionTokens.Count(token =>
            token.Type == ExpressionTokenType.OpenParenthesis)
        -
        expressionTokens.Count(token =>
            token.Type == ExpressionTokenType.CloseParenthesis);

    private string CurrentExpression =>
        inputMode == ExpressionInputMode.Click
            ? ExpressionText
            : typedExpression.Trim();

    private bool CanRevealSolution =>
        puzzle is not null &&
        currentSessionId is not null &&
        currentGameStatus == GameStatus.InProgress &&
        !IsGameOperationPending;

    private async Task InitializeSessionAsync()
    {
        if (isInitializingGame)
        {
            return;
        }

        isInitializingGame = true;

        try
        {
            // First, try to restore the saved session and active puzzle.
            await RestoreSessionAsync();

            // If no session exists, create one.
            if (currentSessionId is null &&
                string.IsNullOrEmpty(errorMessage))
            {
                await CreateSessionAsync();
            }

            // If we have a valid session but no active puzzle,
            // automatically create a new puzzle.
            if (currentSessionId is not null &&
                puzzle is null &&
                string.IsNullOrEmpty(errorMessage))
            {
                await CreatePuzzleAsync();
            }
        }
        finally
        {
            isInitializingGame = false;
            await InvokeAsync(StateHasChanged);
        }
    }

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (firstRender)
        {
            // Initialize keyboard shortcuts.
            try
            {
                dotNetReference =
                    DotNetObjectReference.Create(this);

                keyboardModule =
                    await JS.InvokeAsync<IJSObjectReference>(
                        "import",
                        "./js/gameKeyboard.js");

                keyboardRegistration =
                    await keyboardModule.InvokeAsync<IJSObjectReference>(
                        "registerKeyboard",
                        dotNetReference);
            }
            catch (JSException ex)
            {
                Console.Error.WriteLine(
                    $"Keyboard initialization failed: {ex.Message}");
            }

            await RestoreInputModeAsync();

            // Restore the saved session.
            await InitializeSessionAsync();
        }

        if (shouldStartTimer && gameTimer is not null)
        {
            shouldStartTimer = false;

            if (puzzle is not null)
            {
                double elapsedSeconds = Math.Max(
                    0,
                    (DateTimeOffset.UtcNow - puzzle.StartedAt).TotalSeconds);

                await gameTimer.StartAsync(elapsedSeconds);
            }
        }

        if (shouldRestoreTimer && gameTimer is not null && puzzle is not null)
        {
            shouldRestoreTimer = false;

            if (puzzle.CapturedDurationSeconds is double savedDuration)
            {
                await gameTimer.RestoreCapturedDurationAsync(savedDuration);
            }
            else
            {
                double elapsedSeconds = Math.Max(
                    0,
                    (DateTimeOffset.UtcNow - puzzle.StartedAt).TotalSeconds);

                await gameTimer.StartAsync(elapsedSeconds);
            }
        }
    }

    private async Task CreateSessionAsync()
    {
        if (IsGameOperationPending || currentSessionId is not null)
        {
            return;
        }

        isLoading = true;
        errorMessage = null;
        session = null;
        currentSessionId = null;
        puzzle = null;
        isSavingGotIt = false;
        gotItSaved = false;
        capturedDurationSeconds = null;
        shouldStartTimer = false;
        shouldRestoreTimer = false;
        solutionResult = null;
        answerResult = null;
        isSubmittingAnswer = false;
        currentGameStatus = GameStatus.InProgress;

        ResetExpression();
        typedExpression = "";

        try
        {
            session = await GameApiClient.CreateSessionAsync();
            currentSessionId = session.Id;
            await BrowserStorage.SaveSessionIdAsync(session.Id);
        }
        catch (HttpRequestException)
        {
            errorMessage = "Unable to create a game session.";
        }
        catch (JSException)
        {
            errorMessage =
                "Session created, but it could not be saved in browser storage.";
        }
        catch (Exception)
        {
            errorMessage = "An unexpected error occurred.";
        }
        finally
        {
            isLoading = false;
        }
    }

    private async Task CreatePuzzleAsync()
    {
        if (!CanCreatePuzzle)
        {
            return;
        }

        isLoading = true;
        errorMessage = null;
        puzzle = null;
        isSavingGotIt = false;
        gotItSaved = false;
        capturedDurationSeconds = null;
        shouldStartTimer = false;
        shouldRestoreTimer = false;
        answerResult = null;
        currentGameStatus = GameStatus.InProgress;
        solutionResult = null;

        ResetExpression();
        typedExpression = "";

        try
        {
            puzzle = await GameApiClient.CreatePuzzleAsync(currentSessionId.Value);

            capturedDurationSeconds = null;
            shouldStartTimer = true;

        }
        catch (HttpRequestException)
        {
            errorMessage = "Unable to create a puzzle.";
        }
        catch (Exception)
        {
            errorMessage = "An unexpected error occurred.";
        }
        finally
        {
            isLoading = false;
        }
    }

    private void AddNumber(int cardIndex)
    {
        if (inputMode != ExpressionInputMode.Click ||
            !CanEditGame || !CanAddNumber || puzzle is null)
        {
            return;
        }

        if (cardIndex < 0 || cardIndex >= puzzle.Numbers.Length)
        {
            return;
        }

        if (usedCardIndices.Contains(cardIndex))
        {
            return;
        }

        int number = puzzle.Numbers[cardIndex];

        ExpressionToken token = new(
            ExpressionTokenType.Number,
            number.ToString(),
            cardIndex
        );

        expressionTokens.Add(token);
        usedCardIndices.Add(cardIndex);
    }

    private void AddOperator(string op)
    {
        if (!CanEditGame || !CanAddOperator)
        {
            return;
        }

        if (op is not ("+" or "-" or "*" or "/"))
        {
            return;
        }

        expressionTokens.Add(new ExpressionToken(
            ExpressionTokenType.Operator,
            op
        ));
    }

    private void AddParenthesis(bool isOpening)
    {
        if (!CanEditGame || isLoading)
        {
            return;
        }

        if (isOpening)
        {
            if (!CanAddOpenParenthesis)
            {
                return;
            }

            expressionTokens.Add(new ExpressionToken(
                ExpressionTokenType.OpenParenthesis,
                "("
            ));
        }
        else
        {
            if (!CanAddCloseParenthesis)
            {
                return;
            }

            expressionTokens.Add(new ExpressionToken(
                ExpressionTokenType.CloseParenthesis,
                ")"
            ));
        }
    }

    private void Undo()
    {
        if (!CanEditGame || !CanEditExpression)
        {
            return;
        }

        ExpressionToken lastToken = expressionTokens[^1];

        expressionTokens.RemoveAt(expressionTokens.Count - 1);

        if (lastToken.Type == ExpressionTokenType.Number &&
            lastToken.CardIndex is int cardIndex)
        {
            usedCardIndices.Remove(cardIndex);
        }
    }

    private void ClearExpression()
    {
        if (!CanEditGame || !CanEditExpression)
        {
            return;
        }

        ResetExpression();
    }

    private void ResetExpression()
    {
        expressionTokens.Clear();
        usedCardIndices.Clear();
    }

    private static string GetSuit(int index)
    {
        string[] suits = ["♠", "♥", "♦", "♣"];

        return suits[index % suits.Length];
    }

    private async Task CaptureThinkingTimeAsync()
    {
        if (!CanCaptureThinkingTime ||
            gameTimer is null ||
            currentSessionId is null ||
            puzzle is null)
        {
            return;
        }

        isSavingGotIt = true;
        errorMessage = null;

        try
        {
            // Stop the timer only once.
            if (capturedDurationSeconds is null)
            {
                capturedDurationSeconds =
                    await gameTimer.StopAsync();
            }

            // Submit the captured duration to the backend.
            PuzzleResponse updatedPuzzle =
                await GameApiClient.RecordGotItAsync(
                    currentSessionId.Value,
                    puzzle.Id,
                    capturedDurationSeconds.Value);

            // Use the backend response as the authoritative state.
            puzzle = updatedPuzzle;

            gotItSaved = true;
        }
        catch (HttpRequestException)
        {
            errorMessage =
                "Unable to save thinking time. Please try Got It again.";
        }
        catch (Exception)
        {
            errorMessage =
                "An unexpected error occurred while saving thinking time.";
        }
        finally
        {
            isSavingGotIt = false;
        }
    }

    private async Task SubmitAnswerAsync()
    {
        if (!CanSubmitAnswer ||
            currentSessionId is null ||
            puzzle is null ||
            gameTimer is null)
        {
            return;
        }

        isSubmittingAnswer = true;
        errorMessage = null;
        answerResult = null;

        try
        {
            // Capture the current elapsed time without stopping the timer.
            double durationSeconds = gotItSaved
                ? puzzle.CapturedDurationSeconds
                    ?? throw new InvalidOperationException(
                        "The captured thinking duration is missing.")
                : gameTimer.ElapsedSeconds;

            SubmitAnswerRequest request = new(
                CurrentExpression,
                puzzle.Numbers,
                durationSeconds
            );

            SubmitAnswerResponse result =
                await GameApiClient.SubmitAnswerAsync(
                    currentSessionId.Value,
                    puzzle.Id,
                    request);

            answerResult = result;
            currentGameStatus = result.Game.Status;

            if (result.Valid)
            {
                double confirmedDuration =
                    result.Game.DurationSeconds
                    ?? throw new InvalidOperationException(
                        "The completed game has no duration.");

                await gameTimer.ConfirmDurationAsync(
                    confirmedDuration);
            }
        }
        catch (HttpRequestException)
        {
            errorMessage =
                "Unable to submit the answer. Please try again.";
        }
        catch (Exception)
        {
            errorMessage =
                "An unexpected error occurred while checking the answer.";
        }
        finally
        {
            isSubmittingAnswer = false;
        }
    }

    private async Task ChangeInputMode(ExpressionInputMode newMode)
    {
        if (!CanEditGame || inputMode == newMode)
        {
            return;
        }

        inputMode = newMode;

        ResetExpression();
        typedExpression = "";

        answerResult = null;

        try
        {
            await BrowserStorage.SaveInputModeAsync(
                newMode.ToString());
        }
        catch (JSException)
        {
            errorMessage =
                "Input mode changed, but the preference could not be saved.";
        }
    }

    private void UpdateTypedExpression(string value)
    {
        if (!CanEditGame ||
            inputMode != ExpressionInputMode.Type)
        {
            return;
        }

        typedExpression = value;

        answerResult = null;
    }

    private void ClearTypedExpression()
    {
        if (!CanEditGame ||
            inputMode != ExpressionInputMode.Type)
        {
            return;
        }

        typedExpression = "";

        answerResult = null;
    }

    [JSInvokable]
    public async Task HandleKeyboardCommand(string command)
    {
        if (isRestoringSession)
        {
            return;
        }

        switch (command)
        {
            case "click-mode":
                await ChangeInputMode(ExpressionInputMode.Click);
                break;

            case "type-mode":
                await ChangeInputMode(ExpressionInputMode.Type);
                break;

            case "new-game":
                if (CanCreatePuzzle)
                {
                    await CreatePuzzleAsync();
                }
                break;

            case "clear":
                if (inputMode == ExpressionInputMode.Click)
                {
                    ClearExpression();
                }
                else
                {
                    ClearTypedExpression();
                }
                break;

            case "undo":
                if (inputMode == ExpressionInputMode.Click)
                {
                    Undo();
                }
                break;

            case "got-it":
                await CaptureThinkingTimeAsync();
                break;

            case "check-answer":
                await SubmitAnswerAsync();
                break;

            case "show-solution":
                await RevealSolutionAsync();
                break;
        }

        await InvokeAsync(StateHasChanged);
    }

    private async Task RestoreInputModeAsync()
    {
        try
        {
            string? storedMode =
                await BrowserStorage.GetInputModeAsync();

            if (Enum.TryParse(
                    storedMode,
                    ignoreCase: true,
                    out ExpressionInputMode restoredMode) &&
                Enum.IsDefined(restoredMode))
            {
                inputMode = restoredMode;
            }
            else
            {
                inputMode = ExpressionInputMode.Click;
            }
        }
        catch (JSException)
        {
            inputMode = ExpressionInputMode.Click;

            errorMessage =
                "Unable to restore the preferred input mode.";
        }
    }

    private async Task RestoreSessionAsync()
    {
        if (sessionRestorationCompleted)
        {
            return;
        }

        isRestoringSession = true;
        errorMessage = null;

        try
        {
            currentSessionId =
                await BrowserStorage.GetSessionIdAsync();

            if (currentSessionId is null)
            {
                return;
            }

            // Verify the stored session against the backend.
            bool sessionExists =
                await GameApiClient.SessionExistsAsync(
                    currentSessionId.Value);

            if (!sessionExists)
            {
                // The backend confirmed that the session no longer exists.
                await BrowserStorage.RemoveSessionIdAsync();

                currentSessionId = null;
                puzzle = null;

                return;
            }

            // The session exists. Restore its active puzzle.
            puzzle = await GameApiClient.GetPuzzleAsync(
                currentSessionId.Value);

            if (puzzle is not null)
            {
                ResetExpression();
                typedExpression = "";
                answerResult = null;

                currentGameStatus = GameStatus.InProgress;

                gotItSaved =
                    puzzle.CapturedDurationSeconds is not null;

                capturedDurationSeconds =
                    puzzle.CapturedDurationSeconds;

                shouldRestoreTimer = true;
            }
        }
        catch (JSException)
        {
            errorMessage =
                "Unable to access browser storage.";
        }
        catch (HttpRequestException)
        {
            errorMessage =
                "Unable to connect to the backend. Your saved session has been preserved.";
        }
        catch (Exception)
        {
            errorMessage =
                "An unexpected error occurred while restoring the session.";
        }
        finally
        {
            isRestoringSession = false;
            sessionRestorationCompleted = true;

            await InvokeAsync(StateHasChanged);
        }
    }

    private async Task RevealSolutionAsync()
    {
        if (!CanRevealSolution ||
            currentSessionId is null ||
            puzzle is null ||
            gameTimer is null)
        {
            return;
        }

        isRevealingSolution = true;
        errorMessage = null;
        solutionResult = null;

        try
        {
            double elapsedAtClick = gameTimer.ElapsedSeconds;

            RevealSolutionResponse result =
                await GameApiClient.RevealSolutionAsync(
                    currentSessionId.Value,
                    puzzle.Id);

            solutionResult = result;
            currentGameStatus = result.Status;

            if (result.Status == GameStatus.Abandoned)
            {
                double durationToDisplay =
                    gotItSaved && capturedDurationSeconds is double savedDuration
                        ? savedDuration
                        : elapsedAtClick;

                await gameTimer.ConfirmDurationAsync(durationToDisplay);
            }
        }
        catch (HttpRequestException)
        {
            errorMessage =
                "Unable to retrieve solutions. Please try again.";
        }
        catch (Exception)
        {
            errorMessage =
                "An unexpected error occurred while retrieving solutions.";
        }
        finally
        {
            isRevealingSolution = false;
        }
    }

    private static string FormatSolution(string expression)
    {
        if (string.IsNullOrWhiteSpace(expression))
        {
            return expression;
        }

        expression = expression.Trim();

        if (expression.Length >= 2 &&
            expression[0] == '(' &&
            expression[^1] == ')')
        {
            return expression[1..^1];
        }

        return expression;
    }

    public async ValueTask DisposeAsync()
    {
        try
        {
            if (keyboardRegistration is not null)
            {
                await keyboardRegistration.InvokeVoidAsync("dispose");
                await keyboardRegistration.DisposeAsync();
            }

            if (keyboardModule is not null)
            {
                await keyboardModule.DisposeAsync();
            }
        }
        catch (JSDisconnectedException)
        {
            // The browser connection was already closed.
        }
        finally
        {
            dotNetReference?.Dispose();
        }
    }
}
