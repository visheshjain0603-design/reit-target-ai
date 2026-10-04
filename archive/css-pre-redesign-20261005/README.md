# Stylesheets before the visual redesign — archived 5 October 2026

Moved here from `public/css/` when the interface was redesigned. The application
now loads one stylesheet, `public/css/app.css`. Nothing in the application reads
any file in this folder, and nothing was deleted.

| File | Was at | What it is |
|---|---|---|
| `styles.css` | `public/css/` | About 6,000 lines copied from an earlier "Rental Manager" design system. The REIT pages used only its base element styles and a handful of shell classes (page, sidebar, toast, loading and error messages). |
| `m-app.css` | `public/css/` | Mobile layer from the same design system. |
| `reit-components.css` | `public/css/` | The REIT component styles, built up stage by stage. About 80 classes the pages used were never defined in it, and several were defined twice with different values. |

Why the change: three stylesheets with overlapping and missing definitions gave
the pages inconsistent spacing, colour and type. `app.css` defines every class
the page scripts use, from one set of tokens (colour, type, spacing, motion), and
no behaviour, data or test depends on the old files.

Use `git log --follow <file>` for history.
