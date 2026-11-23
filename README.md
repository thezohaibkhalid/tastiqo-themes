# Tastiqo Liquid themes

Source of the Liquid themes used by Tastiqo's **hosted restaurant websites**.
The Liquid runtime is **active**: `go-back` renders these themes per
restaurant (by host), and restaurants customise them in the visual theme
editor in `tastiqo-front` (**Themes** → **Customize**).

| Theme | Folder |
|---|---|
| **Tastiqo Bold** (platform default for new restaurants) | `tastiqo-bold/` |
| Cheesious Bites | `cheesious-bites/` |
| Flavor House | `flavor-house/` |

Shared merchandising sections and card snippets live in `shared/merch/`;
run `python3 tools/sync-merch.py` after editing them (it writes into every
theme listed in the script).

Each theme follows the Online Store 2.0 layout:

```
layout/theme.liquid        page shell
templates/*.json           which sections a page shows, in order
sections/*.liquid          sections with a {% schema %} block
snippets/*.liquid          reusable partials
config/settings_schema.json, config/settings_data.json
assets/                    theme.css, theme.js, images
```

## How themes reach restaurants

- **Platform marketplace** (shared by every restaurant): managed by the
  platform operator in the super-admin console (`tastiqo-admin` → Themes),
  which uploads a theme ZIP to `/api/super-admin/themes/{slug}/upload-zip`.
  Files are stored in Cloudflare R2 under `<prefix>/public/<slug>/`.
- **Restaurant library**: a restaurant installs a marketplace theme (or
  uploads its own ZIP) from **Themes** in the dashboard; it gets a private
  copy it can customise, preview and publish.

A restaurant can alternatively use a custom/headless website built on the
public API (`/api/v1/public`) instead of a hosted Liquid theme; the account's
website mode decides which one is served.

## Developing a theme

See the theme developer documentation in `tastiqo-docs` (Themes section), and
`go-back/THEME_DEVELOPER_GUIDE.md` until those docs are published. Package a
theme as a ZIP whose root contains `layout/`, `templates/`, `sections/`,
`snippets/`, `config/` and `assets/` (no extra top-level folder, no
`__MACOSX/` entries).

## Publishing a theme to the marketplace (platform operator)

1. `tools/package-theme.sh tastiqo-bold` → `dist/tastiqo-bold.zip` (theme
   folders at the ZIP root, no `__MACOSX/`, `.DS_Store` or dotfiles; JSON is
   validated; shared merch sections are re-synced first).
2. tastiqo-admin → **Themes** → open (or **Register**) the theme with slug
   `tastiqo-bold` → choose the ZIP → **Save**. This calls
   `POST /api/super-admin/themes/tastiqo-bold/upload-zip` and replaces
   `<prefix>/public/tastiqo-bold/` in R2 (the ZIP is validated before
   anything is replaced).
3. Default theme: migration `storefront/004_default_theme_tastiqo_bold.sql`
   registers the theme and marks it `is_default`. **Set default** in
   tastiqo-admin changes it later. New restaurants get the default theme at
   signup; if its files are not uploaded yet, signup falls back to
   flavor-house instead of installing an empty theme.
4. Restaurants that already have a theme keep it; they can install Tastiqo
   Bold from **Website → Themes**.
