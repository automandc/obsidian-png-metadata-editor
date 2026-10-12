# Contributing

Thanks for helping out. Bug reports, feature ideas and pull requests are all welcome.

## Reporting a bug or asking for a feature

Open an [issue](https://github.com/automandc/obsidian-png-metadata-editor/issues/new/choose) and pick the bug report or feature request form. For bugs, a PNG that shows the problem helps a lot. Don't attach files with private information in them.

## Setting up

You need Node.js 20 or later and, for the unit tests, Python 3 with Pillow (`pip install pillow`).

```bash
git clone https://github.com/automandc/obsidian-png-metadata-editor.git
cd obsidian-png-metadata-editor
npm install
npm run dev     # rebuilds main.js on change
```

To try your build, copy or symlink `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/png-metadata-editor/` in a test vault, then reload Obsidian. Use a vault you don't mind breaking.

## Checks to run before a pull request

```bash
npm run lint
npm run build
npm run test:unit   # PNG and card code, checked against Pillow
npm run test:e2e    # UI tests in a real Obsidian (downloads Obsidian the first time)
```

CI runs all of these on every pull request. On Linux without a display, run the UI tests with `xvfb-run -a npm run test:e2e`. [docs/TESTING.md](docs/TESTING.md) explains the tests and has a manual checklist.

## Sending a change

1. Fork the repository and create a branch for your change.
2. Keep the change focused on one thing, and add or update tests for it. Code that writes PNG files (`src/png/`, `src/card/`) needs unit tests.
3. Open a pull request describing what changes for the user and how you tested it.

Maintainers: [docs/RELEASING.md](docs/RELEASING.md) explains how releases are made.

## Code layout

- `src/main.ts`: plugin lifecycle, commands and the `.png` file handler.
- `src/png/`: reading and writing PNG chunks, text fields, EXIF, XMP and info chunks.
- `src/card/`: SillyTavern character card reading and writing.
- `src/ui/`: the view, the card form and the metadata panels.
- `test/`: unit tests, UI tests, fixtures and a test vault.

Follow Obsidian's [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines): sentence case in UI text, no `innerHTML`, and Obsidian's CSS variables for styling.

## Scope

The plugin is about the metadata inside PNG files. Features that need other file types (for example SillyTavern lorebook JSON files) are out of scope here.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
