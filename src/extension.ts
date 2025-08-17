import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  // REMOVE CONSOLE.LOG
  const removeLogs = vscode.commands.registerCommand(
    "extension.removeConsoleLogs",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const document = editor.document;
      const text = document.getText();
      const includeAll = vscode.workspace
        .getConfiguration("consoleLogManager")
        .get<boolean>("includeAll", false);

      const logPattern = includeAll
        ? /^\s*(console\.[\w]+\([^)]*\));?\s*$/gm
        : /^\s*(console\.log\([^)]*\));?\s*$/gm;

      await editor.edit((editBuilder) => {
        let match;
        while ((match = logPattern.exec(text))) {
          const startPos = document.positionAt(match.index);
          const endPos = document.positionAt(match.index + match[0].length);
          const line = startPos.line;

          // Track range to delete
          let deleteStart = startPos;
          let deleteEnd = endPos;

          // Include blank lines below
          let nextLine = line + 1;
          let blankLines = 0;
          while (
            nextLine < document.lineCount &&
            document.lineAt(nextLine).isEmptyOrWhitespace
          ) {
            blankLines++;
            nextLine++;
          }

          // Check if there’s an empty line above
          const hasEmptyAbove =
            line > 0 && document.lineAt(line - 1).isEmptyOrWhitespace;

          // If above is empty, delete all below
          if (hasEmptyAbove) {
            deleteEnd = document.lineAt(nextLine - 1).range.end;
          } else {
            // Otherwise, leave 1 blank line max
            if (blankLines > 1) {
              deleteEnd = document.lineAt(nextLine - 2).range.end;
            } else if (blankLines === 1) {
              // keep one line
              deleteEnd = document.lineAt(nextLine - 1).range.end;
            }
          }

          editBuilder.delete(new vscode.Range(deleteStart, deleteEnd));
        }
      });
    }
  );

  // INSERT CONSOLE.LOG
  const insertLog = vscode.commands.registerCommand(
    "extension.insertConsoleLog",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const document = editor.document;
      const selection = editor.selection;
      const line = selection.active.line;
      const currentLineText = document.lineAt(line).text;
      const indentMatch = currentLineText.match(/^(\s*)/);
      const indentation = indentMatch ? indentMatch[1] : "";

      const prefix = vscode.workspace
        .getConfiguration("consoleLogManager")
        .get<string>("logPrefix", "👉🏻 --->|");

      let logText = "";
      if (!selection.isEmpty) {
        const selectedText = document.getText(selection);
        if (/\s/.test(selectedText)) {
          // multi-word selection
          logText = `console.log('${prefix} ${selectedText}');`;
        } else {
          // likely a variable
          logText = `console.log('${prefix} ${selectedText}: ', ${selectedText});`;
        }
      } else {
        logText = `console.log('${prefix} ');`;
      }

      // Find statement end (basic: look for ;, }, or ) further down)
      let insertLine = line;
      while (
        insertLine < document.lineCount - 1 &&
        !/[\};\]\)]\s*$/.test(document.lineAt(insertLine).text.trim())
      ) {
        insertLine++;
      }

      const position = new vscode.Position(insertLine + 1, 0);

      await editor.edit((editBuilder) => {
        editBuilder.insert(position, `${indentation}${logText}\n`);
      });
    }
  );

  context.subscriptions.push(removeLogs, insertLog);
}

export function deactivate() {}
