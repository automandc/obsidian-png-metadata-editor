# PNG Metadata Editor for Obsidian

An Obsidian plugin to view and edit the metadata stored inside PNG files, with a dedicated mode for SillyTavern character cards (which keep their character data in PNG text chunks).

## Status

Early scaffold. Today the plugin:

- Opens `.png` files from the file explorer in its own view, showing the image (can be turned off in settings).
- Adds "Open in metadata view" to the file menu and a command palette entry, for opening a PNG on demand.

Planned next:

1. Generic PNG metadata view: list, edit, add and delete text chunks (`tEXt`, `zTXt`, `iTXt`), with a backup before saving.
2. SillyTavern mode: a form for character card fields stored in the `chara` / `ccv3` chunks.

## Development

```bash
npm install
npm run dev     # rebuilds main.js on change
npm run build   # type-check and production build
npm run lint
```

To try it in a vault, copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/png-metadata-editor/`, then enable the plugin under Settings → Community plugins.

## License

MIT
