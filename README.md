# EDI 834 Generator & Editor

A self-contained workspace for building and editing X12 834 (benefit
enrollment) files by hand. It shows a structured form on one side and the
raw EDI text on the other, keeps both in sync as you type, and never sends
your data anywhere — everything is stored in your browser's local storage.

## Running it

```bash
pip install -r requirements.txt
python app.py
```

Then open `http://localhost:5000`. The Flask app only serves the static
files in `public/` — there's no database and no server-side state.

## What it does

- **Split-screen editing.** Fill out a form on the left; the raw EDI text
  on the right updates live (and vice versa — edit the raw text and the
  form catches up). Clicking a line in the raw editor jumps to and
  highlights the matching form field, and focusing a form field highlights
  and scrolls to its line.
- **Multiple open documents**, shown as tabs, each with its own color-coded
  members and dependents (dependents render as flat "Dependent of: Member
  NN" cards rather than nested inside the parent, to keep large families
  manageable).
- **Segment coverage**: header (ISA/GS/BGN/N1), member INS/NM1/DMG/N3/N4,
  coverage HD with per-line-of-business codes, AMT, provider NM1*P3/PER,
  COB, reporting categories (LX/N1*75/REF/optional DTP*007), additional
  REFs, mailing address, responsible party, HIOS plan ID, member PER
  contact, and a fixed-slot Speak/Write/Read LUI language section.
- **Line-of-Business (LOB) Mapping Settings** — configurable rules mapping
  a display name to an HD03 code and an optional custom REF segment
  (defaults: Medical/HLT, Dental/DEN, Vision/VIS).
- **Display Settings** with independent Light/Dark/System themes for the
  app chrome and for the raw editor pane, plus editor preferences for
  line-breaks and line-wrapping.
- **`guide.html`** — a reference page documenting every supported segment
  with examples, plus a "Load Full Demo File" button that opens a fully
  populated two-member example.

## Persistence model

Everything lives in `localStorage`, under a few keys:

| Key | Contents |
|---|---|
| `edi834_workspace_v1` | Open tabs (each tab's form data, dirty state, collapsed sections) and which tab is active |
| `edi834_lob_mappings_v1` | Your LOB mapping rules |
| `edi834_app_settings_v1` | Theme choices, line-break/wrap preferences |
| `edi834_pane_width_v1` | Split-pane divider position |

There is no "Save" button and no server-side file storage — every edit is
persisted automatically as you type, and closing a tab permanently removes
it from local storage (you'll be asked to confirm if it has unsaved
content). Use **Download** to export a document as a `.edi`/`.txt` file,
or **Copy to Clipboard**.

### One-time migration from the old server-save feature

This app used to save documents to the server (`saved_edi_files/*.json`).
That feature has been removed. `public/legacy_import.js` runs once, on
first load, to pull any documents that existed under that feature into
`localStorage` as regular open tabs, then marks itself done via the
`edi834_legacy_import_done_v1` flag. Once you've confirmed your old
documents show up as tabs, `public/legacy_import.js` and the
`saved_edi_files/` directory are no longer needed and safe to delete.

## Project layout

```
app.py                   Flask static file server
requirements.txt
public/
  index.html             Main workspace UI
  app.js                 Form/raw-text compiler+parser, tabs, settings, sync logic
  guide.html             Segment reference + demo-file loader
  legacy_import.js        One-time localStorage migration (see above)
  styles.css             Raw-editor syntax coloring, theming, tab styling
saved_edi_files/          Orphaned output from the old server-save feature
```
