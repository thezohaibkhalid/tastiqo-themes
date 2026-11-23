#!/usr/bin/env bash
# Package a theme folder as the ZIP the platform accepts.
#
#   tools/package-theme.sh tastiqo-bold            -> dist/tastiqo-bold.zip
#   tools/package-theme.sh tastiqo-bold /tmp/out   -> /tmp/out/tastiqo-bold.zip
#
# ZIP layout (what go-back's themefiles.ReadZIP expects): the theme folders
# at the ZIP root — layout/ templates/ sections/ snippets/ config/ assets/
# (and locales/ blocks/ when present) — no wrapper folder, no __MACOSX/,
# .DS_Store, dotfiles, Thumbs.db or *.fiber.gz. Entries are sorted and
# timestamps fixed so the same source gives the same ZIP.
#
# Before packaging it re-runs tools/sync-merch.py (shared merchandising
# sections must be current) and checks that every JSON file parses and that
# the required files exist. The platform operator then uploads the ZIP in
# tastiqo-admin → Themes (POST /api/super-admin/themes/<slug>/upload-zip).
set -euo pipefail
cd "$(dirname "$0")/.."
theme="${1:?usage: tools/package-theme.sh <theme-folder> [out-dir]}"
theme="${theme%/}"
out="${2:-dist}"
[[ "$theme" =~ ^[a-z0-9][a-z0-9-]{0,63}$ ]] || { echo "theme folder must be a marketplace slug (a-z, 0-9, -): $theme" >&2; exit 1; }
[[ -d "$theme" ]] || { echo "no such theme folder: $theme" >&2; exit 1; }
python3 tools/sync-merch.py >/dev/null
mkdir -p "$out"
python3 - "$theme" "$out/$theme.zip" <<'PY'
import json, os, sys, zipfile
theme, dest = sys.argv[1], sys.argv[2]
FOLDERS = ['layout', 'templates', 'sections', 'snippets', 'config', 'assets', 'locales', 'blocks']
REQUIRED = ['layout/theme.liquid', 'templates/index.json', 'config/settings_schema.json', 'config/settings_data.json']
JUNK = ('.DS_Store', 'Thumbs.db', 'desktop.ini')
missing = [f for f in REQUIRED if not os.path.isfile(os.path.join(theme, f))]
if missing:
    sys.exit('missing required files: ' + ', '.join(missing))
files = []
for top in FOLDERS:
    base = os.path.join(theme, top)
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = sorted(d for d in dirnames if not d.startswith('.') and d != '__MACOSX')
        for name in sorted(filenames):
            if name.startswith('.') or name in JUNK or name.endswith('.fiber.gz') or name.endswith('~'):
                continue
            path = os.path.join(dirpath, name)
            rel = os.path.relpath(path, theme).replace(os.sep, '/')
            if rel.endswith('.json'):
                try:
                    json.load(open(path, encoding='utf-8'))
                except Exception as e:
                    sys.exit(f'{rel}: invalid JSON: {e}')
            files.append((rel, path))
tmp = dest + '.tmp'
with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for rel, path in sorted(files):
        info = zipfile.ZipInfo(rel, date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        with open(path, 'rb') as fh:
            z.writestr(info, fh.read())
os.replace(tmp, dest)
size = os.path.getsize(dest)
print(f'{dest}: {len(files)} files, {size // 1024} KB')
PY
