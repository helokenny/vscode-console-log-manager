import * as vscode from "vscode";

function getPrefix(): string {
  // Align with package.json contributes.configuration path
  return vscode.workspace
    .getConfiguration("removeConsoleLogs")
    .get<string>("logPrefix", "👉🏻 --->| ");
}

function isConsoleLine(text: string): boolean {
  return /^\s*console\./.test(text);
}

function isCommentOrEmpty(text: string): boolean {
  const t = text.trim();
  return !t || t.startsWith("//");
}

function prevNonEmptyLine(
  document: vscode.TextDocument,
  from: number
): number | null {
  for (let l = from - 1; l >= 0; l--) {
    if (document.lineAt(l).text.trim() !== "") return l;
  }
  return null;
}

function nextNonEmptyLine(
  document: vscode.TextDocument,
  from: number
): number | null {
  for (let l = from + 1; l < document.lineCount; l++) {
    if (document.lineAt(l).text.trim() !== "") return l;
  }
  return null;
}

// Heuristic: is this line a *start* of a statement (so we won't break multi-line)?
function looksLikeStatementStart(
  document: vscode.TextDocument,
  line: number
): boolean {
  const text = document.lineAt(line).text;
  const trimmed = text.trim();

  // Skip braces-only and closers
  if (
    !trimmed ||
    trimmed === "{" ||
    trimmed === "}" ||
    /^[\]\)\}]/.test(trimmed)
  )
    return false;

  // Skip non-executable/declarations
  if (
    /^(import|export\s+(type|interface)?|type\s+|interface\s+|enum\s+|function\s+|class\s+)/.test(
      trimmed
    )
  ) {
    return false;
  }

  // Skip labels / case/default headers
  if (/^([A-Za-z_$][\w$]*\s*:\s*$|case\s+.+:|default\s*:)/.test(trimmed))
    return false;

  // If previous *non-empty* line clearly terminates, we're safe to treat this as a new statement
  const prevLine = prevNonEmptyLine(document, line);
  if (prevLine === null) return true;
  const prev = document.lineAt(prevLine).text.trim();

  // If previous is a comment, look further up
  if (prev.startsWith("//")) {
    const prev2 = prevNonEmptyLine(document, prevLine);
    if (prev2 === null) return true;
    const prev2Text = document.lineAt(prev2).text.trim();
    // fall through with prev2Text
    return /([;\{\}])\s*$/.test(prev2Text);
  }

  // Consider common safe terminators that end a statement or block
  if (/([;\{\}])\s*$/.test(prev)) return true;

  // Common line-continuation endings => treat current line as continuation, so NOT a start
  if (/[,\+\-\*\/%=&|^?:\.]\s*$/.test(prev)) return false;
  if (/\(\s*$/.test(prev) || /\[\s*$/.test(prev)) return false;
  if (/=>\s*$/.test(prev)) return false;

  // Otherwise assume it's a start (best-effort)
  return true;
}

// Robustly find the innermost open block { … } that encloses the cursor.
// Ignores braces in strings/comments.
function findEnclosingBlockRange(
  document: vscode.TextDocument,
  cursorOffset: number
): { contentStart: number; contentEnd: number } | null {
  const text = document.getText();
  let stack: number[] = [];

  let inS = false,
    inD = false,
    inT = false,
    inLC = false,
    inBC = false,
    esc = false;

  const pushBrace = (i: number) => stack.push(i);
  const popBrace = () => {
    if (stack.length) stack.pop();
  };

  for (let i = 0; i < cursorOffset; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inLC) {
      if (ch === "\n") inLC = false;
      continue;
    }
    if (inBC) {
      if (ch === "*" && next === "/") {
        inBC = false;
        i++;
      }
      continue;
    }

    if (inS) {
      if (!esc && ch === "'") inS = false;
      esc = ch === "\\" && !esc;
      continue;
    }
    if (inD) {
      if (!esc && ch === '"') inD = false;
      esc = ch === "\\" && !esc;
      continue;
    }
    if (inT) {
      if (!esc && ch === "`") inT = false;
      esc = ch === "\\" && !esc;
      continue;
    }

    if (ch === "/" && next === "/") {
      inLC = true;
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBC = true;
      i++;
      continue;
    }

    if (ch === "'") {
      inS = true;
      esc = false;
      continue;
    }
    if (ch === '"') {
      inD = true;
      esc = false;
      continue;
    }
    if (ch === "`") {
      inT = true;
      esc = false;
      continue;
    }

    if (ch === "{") pushBrace(i);
    else if (ch === "}") popBrace();
  }

  if (stack.length === 0) return null; // no open block → whole file scope

  const openIdx = stack[stack.length - 1];

  // Now find its matching closing brace
  let depth = 0;
  inS = inD = inT = inLC = inBC = esc = false;
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inLC) {
      if (ch === "\n") inLC = false;
      continue;
    }
    if (inBC) {
      if (ch === "*" && next === "/") {
        inBC = false;
        i++;
      }
      continue;
    }

    if (inS) {
      if (!esc && ch === "'") inS = false;
      esc = ch === "\\" && !esc;
      continue;
    }
    if (inD) {
      if (!esc && ch === '"') inD = false;
      esc = ch === "\\" && !esc;
      continue;
    }
    if (inT) {
      if (!esc && ch === "`") inT = false;
      esc = ch === "\\" && !esc;
      continue;
    }

    if (ch === "/" && next === "/") {
      inLC = true;
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBC = true;
      i++;
      continue;
    }

    if (ch === "'") {
      inS = true;
      esc = false;
      continue;
    }
    if (ch === '"') {
      inD = true;
      esc = false;
      continue;
    }
    if (ch === "`") {
      inT = true;
      esc = false;
      continue;
    }

    if (ch === "{") {
      depth++;
    }
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        // content between openIdx and this '}' (exclusive of braces themselves)
        return { contentStart: openIdx + 1, contentEnd: i };
      }
    }
  }
  return null; // unmatched (shouldn't happen for valid code)
}

// INSERT CONSOLE.LOG — fixed to insert on empty line at the same line
async function insertConsoleLog() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const document = editor.document;
  const selection = editor.selection;
  const line = selection.active.line;
  const currentLineText = document.lineAt(line).text;
  const indentMatch = currentLineText.match(/^(\s*)/);
  const indentation = indentMatch ? indentMatch[1] : "";

  const prefix = getPrefix().trimEnd();

  let logText = "";
  if (!selection.isEmpty) {
    const selectedText = document.getText(selection);
    if (/\s/.test(selectedText)) {
      logText = `console.log('${prefix} ${selectedText}');`;
    } else {
      logText = `console.log('${prefix} ${selectedText}: ', ${selectedText});`;
    }
  } else {
    logText = `console.log('${prefix}');`;
  }

  let insertLine = line;
  if (currentLineText.trim() !== "") {
    // Avoid breaking multi-line statements: scan downward to a safe boundary
    while (
      insertLine < document.lineCount - 1 &&
      !/[\};\]\)]\s*$/.test(document.lineAt(insertLine).text.trim())
    ) {
      insertLine++;
    }
    insertLine++; // insert after the statement end
  }
  const position = new vscode.Position(insertLine, 0);

  await editor.edit((eb) => {
    eb.insert(position, `${indentation}${logText}\n`);
  });
}

// AUTO-INSERT CONSOLE.LOGS ACROSS SCOPE (ctrl+alt+a)
async function autoInsertConsoleLogs() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const document = editor.document;
  const prefix = getPrefix().trimEnd();
  const cursorOffset = document.offsetAt(editor.selection.active);

  // Determine scope by braces; if none → whole file
  const enclosing = findEnclosingBlockRange(document, cursorOffset);
  let startLine = 0;
  let endLine = document.lineCount - 1;

  if (enclosing) {
    startLine = document.positionAt(enclosing.contentStart).line;
    endLine = document.positionAt(enclosing.contentEnd).line;
  }

  const plannedInsertLines = new Set<number>();
  let counter = 1;
  const edits: { line: number; text: string }[] = [];

  // Scan line-by-line, but ensure we only insert at *statement starts*,
  // and never stack console lines (check prev/next NON-EMPTY and planned inserts).
  for (let line = startLine; line <= endLine; line++) {
    const raw = document.lineAt(line).text;
    const trimmed = raw.trim();

    // Skip empties/comments/brace-only/console lines themselves
    if (
      !trimmed ||
      trimmed === "{" ||
      trimmed === "}" ||
      isConsoleLine(trimmed) ||
      trimmed.startsWith("//")
    )
      continue;

    // Only executable statements, avoid declarations etc.
    if (
      /^(import|export\s+(type|interface)?|type\s+|interface\s+|enum\s+|function\s+|class\s+)/.test(
        trimmed
      )
    ) {
      continue;
    }

    // Do not start inside a multi-line statement
    if (!looksLikeStatementStart(document, line)) continue;

    // Check adjacency against existing & planned (use NON-EMPTY adjacency)
    const prevNE = prevNonEmptyLine(document, line);
    const nextNE = nextNonEmptyLine(document, line);

    if (
      (prevNE !== null &&
        (isConsoleLine(document.lineAt(prevNE).text) ||
          plannedInsertLines.has(prevNE))) ||
      (nextNE !== null &&
        (isConsoleLine(document.lineAt(nextNE).text) ||
          plannedInsertLines.has(nextNE)))
    ) {
      continue;
    }

    // Insert before this line
    const indentation = raw.match(/^(\s*)/)?.[1] ?? "";
    edits.push({
      line,
      text: `${indentation}console.log("${prefix} ${counter}");\n`,
    });
    plannedInsertLines.add(line);
    counter++;
  }

  // Apply edits from top to bottom (positions will shift automatically)
  await editor.edit((eb) => {
    for (const e of edits) {
      eb.insert(new vscode.Position(e.line, 0), e.text);
    }
  });
}

export function activate(context: vscode.ExtensionContext) {
  // REMOVE CONSOLE.LOG (unchanged; using your original heuristic)
  const removeLogs = vscode.commands.registerCommand(
    "extension.removeConsoleLogs",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const document = editor.document;
      const text = document.getText();
      const includeAll = vscode.workspace
        .getConfiguration("removeConsoleLogs")
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

          let deleteStart = startPos;
          let deleteEnd = endPos;

          // Include contiguous blank lines BELOW (but keep at most one)
          let nextLine = line + 1;
          let blankLines = 0;
          while (
            nextLine < document.lineCount &&
            document.lineAt(nextLine).isEmptyOrWhitespace
          ) {
            blankLines++;
            nextLine++;
          }

          const hasEmptyAbove =
            line > 0 && document.lineAt(line - 1).isEmptyOrWhitespace;

          if (hasEmptyAbove) {
            deleteEnd = document.lineAt(nextLine - 1).range.end;
          } else {
            if (blankLines > 1) {
              deleteEnd = document.lineAt(nextLine - 2).range.end;
            } else if (blankLines === 1) {
              deleteEnd = document.lineAt(nextLine - 1).range.end;
            }
          }

          editBuilder.delete(new vscode.Range(deleteStart, deleteEnd));
        }
      });
    }
  );

  // INSERT single console.log (fixed empty-line behavior)
  const insertLog = vscode.commands.registerCommand(
    "extension.insertConsoleLog",
    insertConsoleLog
  );

  // AUTO-INSERT numbered console.logs across scope (no stacking)
  const autoInsertLogs = vscode.commands.registerCommand(
    "extension.autoInsertConsoleLogs",
    autoInsertConsoleLogs
  );

  context.subscriptions.push(removeLogs, insertLog, autoInsertLogs);
}

export function deactivate() {}
