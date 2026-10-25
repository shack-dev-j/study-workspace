# Vendored third-party code

Everything here is copied into the repo so the app works fully offline.
Nothing is downloaded at runtime.

| Folder | Project | Version | License | Source |
| --- | --- | --- | --- | --- |
| `inter/` | Inter font (Rasmus Andersson) | 4.1, variable | SIL OFL 1.1, see `inter/LICENSE.txt` | github.com/rsms/inter release `Inter-4.1.zip` (`web/InterVariable.woff2`) |
| `rubik/` | Rubik font (optional, Caelestia's font) | variable | SIL OFL 1.1, see `rubik/OFL.txt` | Google Fonts |
| `pdfjs/` | PDF.js (Mozilla) | 4.10.38 (legacy build) | Apache-2.0, see `pdfjs/LICENSE` | npm package `pdfjs-dist@4.10.38` |

Files kept from `pdfjs-dist`:
- `legacy/build/pdf.min.mjs` and `pdf.worker.min.mjs` → `pdfjs/build/`
  (the legacy build includes fallbacks for older WebKitGTK versions)
- `cmaps/` and `standard_fonts/` (needed for some textbooks' fonts)
- `web/pdf_viewer.css` (text layer styles for selection and search)

To update: download the new `pdfjs-dist` tarball from npm, replace these
files, update the version here and test the reader.
