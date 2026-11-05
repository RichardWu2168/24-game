export function registerKeyboard(dotNetReference) {
    const handler = async (event) => {
        if (event.ctrlKey || event.altKey || event.metaKey) {
            return;
        }

        if (event.repeat) {
            return;
        }

        const target = event.target;

        const isExpressionInput =
            target instanceof HTMLElement &&
            target.id === "typed-expression";

        const isOtherEditable =
            target instanceof HTMLElement &&
            (
                target.isContentEditable ||
                (
                    target.matches("input, textarea, select") &&
                    !isExpressionInput
                )
            );

        // Preserve normal keyboard behavior in unrelated inputs.
        if (isOtherEditable) {
            return;
        }

        const key = event.key.toLowerCase();

        let command = null;

        switch (key) {
            case "c":
                command = "click-mode";
                break;

            case "t":
                command = "type-mode";
                break;

            case "n":
                command = "new-game";
                break;

            case "delete":
                command = "clear";
                break;

            case "backspace":
                if (!isExpressionInput) {
                    command = "undo";
                }
                break;

            case " ":
                command = "got-it";
                break;

            case "a":
                command = "check-answer";
                break;

            case "enter":
                if (isExpressionInput) {
                    command = "check-answer";
                }
                break;

            // Show Solution will be added later.
        }

        if (command === null) {
            return;
        }

        event.preventDefault();

        try {
            await dotNetReference.invokeMethodAsync(
                "HandleKeyboardCommand",
                command
            );
        }
        catch (error) {
            console.error(
                "Keyboard command failed:",
                error
            );
        }
    };

    document.addEventListener("keydown", handler);

    return {
        dispose: () => {
            document.removeEventListener("keydown", handler);
        }
    };
}