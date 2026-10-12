# PNG Metadata Editor for Obsidian

An Obsidian plugin to view and edit the metadata stored inside PNG files, with a dedicated mode for SillyTavern character cards (which keep their character data in PNG text chunks).

## Status

Early development. Today the plugin:

- Opens `.png` files from the file explorer in its own view, with a preview and the image's basic properties (can be turned off in settings).
- Lists every text field in the file (`tEXt`, `zTXt` and `iTXt` chunks) and lets you edit, add, delete and retype them, then save. Before a file is first changed, the original is kept next to it as `NAME.png.bak`.
- Shows standard metadata read-only: EXIF (from an `eXIf` chunk or an ImageMagick raw profile), XMP, and PNG info chunks such as resolution, modification time, gamma and color profile.
- Adds "Open in metadata view" to the file menu and the command palette, for opening a PNG on demand.

- Shows SillyTavern character cards as a form (name, description, personality, scenario, greetings, prompts, tags and so on), with a toggle back to the raw metadata. V1, V2 (`chara`) and V3 (`ccv3`) cards are supported; when a file has both chunks, edits are saved to both. Lorebooks and other data the form doesn't show are kept unchanged.

Planned next: a first release, and polish such as more settings.

## Development

```bash
npm install
npm run dev     # rebuilds main.js on change
npm run build   # type-check and production build
npm run lint
npm run test:unit   # PNG module tests (needs Python 3 + Pillow)
npm run test:e2e    # UI tests in a real Obsidian
```

See [docs/TESTING.md](docs/TESTING.md) for how the tests work and the manual checklist.

To try it in a vault, copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/png-metadata-editor/`, then enable the plugin under Settings → Community plugins.

## License

MIT
