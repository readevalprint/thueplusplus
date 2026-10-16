# Thue++ for VS Code

Syntax highlighting, snippets, and **Run Thue++ file** for [Thue++](https://github.com/readevalprint/thueplusplus) programs (`.tpp`).

The extension installs in VS Code, Cursor, VSCodium, and Windsurf. Cursor installs extensions from [Open VSX](https://open-vsx.org). This repository does not publish the extension.

## What you get

- A TextMate grammar for the current language: rules, `::=`, `::<`, `::>`, `::-`, `::!`, `::|` steps, `{{name}}`, `{{name|pctenc}}`, `{{name|pctdec}}`, `{{name|quote}}`, `{{rule_index}}`, `$NAME` aliases, and the initial state after a `::=` row.
- A language configuration. `{` `}` `(` `)` `[` `]` and `{{` `}}` auto-close. Thue++ has no comment introducer: a row that is not a rule or an alias is a comment, and `#` is ordinary text, so the editor does not bind a comment toggle.
- Snippets for a rewrite, a `::|` step, a quoted step, read, write, exit, a builtin call, an alias, a named capture, and a small program.
- **Run Thue++ file**, which runs the installed `thuepp` CLI.

## Install a `.vsix` by hand

From this repository:

```bash
npm --prefix editors/vscode ci
npm --prefix editors/vscode test
npm --prefix editors/vscode run package
```

That writes `editors/vscode/thuepp-0.5.0.vsix`. A CI job also builds that file and keeps it as an artifact. Nothing in CI publishes it.

In the Extensions view, open the `...` menu and choose **Install from VSIX**, then pick the file. The same menu exists in VS Code, Cursor, VSCodium, and Windsurf.

From a terminal, if the matching command is on your `PATH`:

```bash
code --install-extension thuepp-0.5.0.vsix
cursor --install-extension thuepp-0.5.0.vsix
codium --install-extension thuepp-0.5.0.vsix
windsurf --install-extension thuepp-0.5.0.vsix
```

Reload the window if an open `.tpp` file does not pick up the grammar.

## Run Thue++ file

The command is **Thue++: Run Thue++ file**. It is in the Command Palette and the editor run menu when the active file is Thue++.

It does not install an interpreter. Set `thuepp.executable` to the `thuepp` command or to an absolute path. The three hosts in this repository all install that command.

Every run passes three finite limits. There is no unlimited value in these settings. `0` is a real limit.

| Setting | CLI flag | Default |
| --- | --- | --- |
| `thuepp.maxSteps` | `--max-steps` | `1000000` |
| `thuepp.maxProbes` | `--max-evals` | `1000000` |
| `thuepp.maxStateBytes` | `--max-state-bytes` | `8388608` |

A negative number, a fraction, or the text `unlimited` is rejected and the terminal is not started. The program's standard input and output are the terminal that the command opens.

## Tests

```bash
npm --prefix editors/vscode test
```

`vscode-tmgrammar-snap` checks the committed snapshots in `tests/snap/`. `tests/corpus.test.js` tokenizes every `.tpp` program under `examples/` and, when that directory exists, `guests/`. Update snapshots with `npm run test:update-snapshots` after an intentional grammar change, then read the diff.

## Publish to the VS Code Marketplace

Do this yourself, from a machine that holds the publisher token. Do not put the token in the repository or in CI, and do not publish as part of a pull request.

1. Create a publisher at [Visual Studio Marketplace](https://marketplace.visualstudio.com/manage). The `publisher` field in `package.json` is `readevalprint`. Change it if you use another publisher id.
2. Create an Azure DevOps personal access token with the **Marketplace (manage)** scope.
3. From `editors/vscode`:

```bash
npx @vscode/vsce login readevalprint
npm test
npm run package
npx @vscode/vsce publish
```

`vsce publish` uploads the extension. `vsce package` only builds the `.vsix`. The package step is the one CI runs.

Publishing docs: [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).

## Publish to Open VSX

Cursor installs from Open VSX, not from the VS Code Marketplace. A Marketplace release does not appear in Cursor until it is also published to Open VSX. VSCodium and Windsurf also read Open VSX.

Do this yourself. Do not put the token in the repository or in CI.

1. Create an account and a namespace at [open-vsx.org](https://open-vsx.org). The namespace has to match `publisher` in `package.json`.
2. Create an access token for that namespace.
3. From `editors/vscode`, after `npm run package`:

```bash
npx ovsx publish thuepp-0.5.0.vsix -p "$OVSX_TOKEN"
```

Publishing docs: [Publishing Extensions](https://github.com/eclipse/openvsx/wiki/Publishing-Extensions).

## Playground highlighter

The playground keeps its own highlighter in `demo/src/thueppMonarch.ts`. Monaco does not load this TextMate grammar by itself, and the playground is changing separately, so the two highlighters are not shared yet. That work is [issue #42](https://github.com/readevalprint/thueplusplus/issues/42).
