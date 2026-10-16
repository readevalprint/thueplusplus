"use strict";

const path = require("path");
const vscode = require("vscode");
const { buildRunCommand } = require("./limits");

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("thuepp.runFile", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== "thuepp") {
        vscode.window.showErrorMessage("Open a Thue++ file to run it.");
        return;
      }
      const document = editor.document;
      if (document.isUntitled || document.uri.scheme !== "file") {
        vscode.window.showErrorMessage("Save the Thue++ file before running it.");
        return;
      }
      const config = vscode.workspace.getConfiguration("thuepp");
      let command;
      try {
        command = buildRunCommand({
          file: document.uri.fsPath,
          executable: config.get("executable"),
          config: {
            maxSteps: config.get("maxSteps"),
            maxProbes: config.get("maxProbes"),
            maxStateBytes: config.get("maxStateBytes"),
          },
        });
      } catch (err) {
        vscode.window.showErrorMessage(err instanceof Error ? err.message : String(err));
        return;
      }
      const terminal = vscode.window.createTerminal({
        name: "Thue++",
        shellPath: command.executable,
        shellArgs: command.args,
        cwd: path.dirname(document.uri.fsPath),
      });
      terminal.show();
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
