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

- **Sidebar navigation.** The left nav is a small "EDI Gen" title bar up
  top, then a 2-level tree scoped to the active tab: a **Header & Title**
  item (document title/description + the ISA/GS-level header fields), and
  a **Members** list where each member expands to show its dependents.
  Clicking any item shows *only* that one thing in the form pane — the
  document title, one member, or one dependent — instead of one long
  scroll through everyone. Adding a member/dependent auto-selects it;
  removing the selected one falls back to a sane default. The selection is
  remembered per tab across reloads. The workspace controls (**+ New 834**,
  **LOB Mapping Settings**, **Display Settings**, **834 EDI Guide**) live
  at the bottom of the sidebar.
- **Split-screen editing.** The form pane on the left and the raw EDI text
  on the right stay in sync as you type in either one. Clicking a line in
  the raw editor jumps to and highlights the matching form field, and
  focusing a form field highlights and scrolls to its line in the raw
  text. The raw pane always shows the *entire* document (all members),
  regardless of which single item is selected in the sidebar.
- **Multiple open documents**, shown as tabs, each with its own
  color-coded members (the same color ties a member's card, its
  dependents, and its lines in the raw editor together).
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
- **Download** exports the current document as a file — `.dat` by default
  (also offers `.edi`/`.txt`) — or use **Copy to Clipboard** instead.
- **`guide.html`** — a reference page documenting every supported segment
  with examples, plus a "Load Full Demo File" button that opens a fully
  populated two-member example.

## Persistence model

Everything lives in `localStorage`, under a few keys:

| Key | Contents |
|---|---|
| `edi834_workspace_v1` | Open tabs — each tab's form data, dirty state, collapsed sections, and which member/dependent/header item is selected — plus which tab is active |
| `edi834_lob_mappings_v1` | Your LOB mapping rules |
| `edi834_app_settings_v1` | Theme choices, line-break/wrap preferences |
| `edi834_pane_width_v1` | Split-pane divider position |

There is no "Save" button and no server-side file storage — every edit is
persisted automatically as you type, and closing a tab permanently removes
it from local storage (you'll be asked to confirm if it has unsaved
content).

### Legacy migration shim

This app used to save documents to the server. That feature (and its
on-disk `saved_edi_files/` directory) has been removed. `public/legacy_import.js`
still runs once, on first load in a browser that hasn't seen it, to pull
any documents that existed under that old feature into `localStorage` as
regular open tabs, then marks itself done via the
`edi834_legacy_import_done_v1` flag. If you've confirmed (or don't need)
that migration, `public/legacy_import.js` and its `<script>` tag in
`index.html` can be deleted.

## Project layout

```
app.py                  Flask static file server
requirements.txt
.gitignore
public/
  index.html            Sidebar (title bar + member tree + workspace controls), tab bar, split panes, modals
  app.js                Form/raw-text compiler+parser, tabs, sidebar tree, settings, sync logic
  guide.html             Segment reference + demo-file loader
  legacy_import.js       One-time localStorage migration (see above)
  styles.css             Raw-editor syntax coloring, theming, tab/tree styling
```
