import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  const removeLogs = vscode.commands.registerCommand(
    "extension.removeConsoleLogs", // match package.json
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const config = vscode.workspace.getConfiguration("removeConsoleLogs");
      const includeWarn = config.get("includeWarn") as boolean;
      const includeError = config.get("includeError") as boolean;
      const includeDebug = config.get("includeDebug") as boolean;
      const includeAll = config.get("includeAll") as boolean;
      const includeInline = config.get("includeInline") as boolean;

      const document = editor.document;
      const edit = new vscode.WorkspaceEdit();

      let regexStr = "console\\.log\\(.*?\\);?";
      if (includeAll) {
        regexStr = "console\\.[a-zA-Z]+\\(.*?\\);?";
      } else {
        const parts = ["log"];
        if (includeWarn) parts.push("warn");
        if (includeError) parts.push("error");
        if (includeDebug) parts.push("debug");
        regexStr = `console\\.(${parts.join("|")})\\(.*?\\);?`;
      }

      const regex = new RegExp(regexStr, "g");

      for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i);
        const text = line.text;

        if (regex.test(text)) {
          // Delete the console.* line
          edit.delete(document.uri, line.rangeIncludingLineBreak);

          // Also delete only the *immediately following* blank line, if present
          if (i + 1 < document.lineCount) {
            const nextLine = document.lineAt(i + 1);
            if (/^\s*$/.test(nextLine.text)) {
              edit.delete(document.uri, nextLine.rangeIncludingLineBreak);
              i++; // Skip ahead since we already removed the next line
            }
          }
        } else if (includeInline && regex.test(text)) {
          const match = text.match(regex);
          if (match) {
            const start = text.indexOf(match[0]);
            const range = new vscode.Range(
              new vscode.Position(i, start),
              new vscode.Position(i, start + match[0].length)
            );
            edit.delete(document.uri, range);
          }
        }
      }

      vscode.workspace.applyEdit(edit);
    }
  );

  const insertLog = vscode.commands.registerCommand(
    "extension.insertConsoleLog", // match package.json
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const config = vscode.workspace.getConfiguration("removeConsoleLogs");
      const logPrefix = config.get("logPrefix") as string;

      const selection = editor.selection;
      const selectedText = editor.document.getText(selection).trim();

      let logLine = "";

      if (!selectedText) {
        logLine = `console.log('${logPrefix}');`;
      } else if (/\s/.test(selectedText)) {
        logLine = `console.log('${logPrefix}${selectedText}');`;
      } else {
        logLine = `console.log('${logPrefix}${selectedText}: ', ${selectedText});`;
      }

      // Get indentation from current line
      const currentLine = editor.document.lineAt(selection.active.line);
      const indentation = currentLine.text.match(/^\s*/)?.[0] ?? "";

      editor.edit((editBuilder: any) => {
        const position = selection.active;
        const insertPos = new vscode.Position(position.line + 1, 0);
        editBuilder.insert(insertPos, indentation + logLine + "\n");
      });
    }
  );

  context.subscriptions.push(removeLogs, insertLog);

  // Auto clean on save
  vscode.workspace.onWillSaveTextDocument((event: any) => {
    const config = vscode.workspace.getConfiguration("removeConsoleLogs");
    const autoClean = config.get("autoCleanOnSave") as boolean;
    if (autoClean) {
      vscode.commands.executeCommand("extension.removeConsoleLogs");
    }
  });
}

export function deactivate() {}
