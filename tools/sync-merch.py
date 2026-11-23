#!/usr/bin/env python3
"""Generate the merchandising sections/snippets/CSS/JS into every theme from
one shared source (shared/merch/) so cheesious-bites, flavor-house and
tastiqo-bold (the platform default theme) stay consistent. Idempotent:
CSS/JS are replaced between markers."""
import os, re
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'shared', 'merch')

SNIPPETS = ['card-category', 'card-deal', 'card-item']
THEMES = {
    'flavor-house': {
        'SECTION': 'section', 'CONTAINER': 'container',
        'BTN': 'btn btn-primary btn-lg', 'BTN_SM': 'btn btn-primary btn-sm',
        'tokens': """:root {
  --tq-primary: var(--color-primary);
  --tq-secondary: var(--color-secondary);
  --tq-on-secondary: var(--color-dark);
  --tq-accent: var(--color-dark);
  --tq-surface: var(--color-surface);
  --tq-text: var(--color-text);
  --tq-heading: var(--color-text);
  --tq-muted: var(--color-text-muted);
  --tq-border: var(--color-border);
  --tq-success: var(--color-success);
  --tq-radius: var(--radius-lg);
  --tq-font-heading: var(--font-heading);
  --tq-page-width: var(--max-width);
}""",
        'snippets': SNIPPETS,
    },
    'cheesious-bites': {
        'SECTION': 'cb-section', 'CONTAINER': 'cb-container',
        'BTN': 'cb-btn cb-btn-primary cb-btn-lg', 'BTN_SM': 'cb-btn cb-btn-primary cb-btn-sm',
        'tokens': """:root {
  --tq-primary: var(--cb-primary);
  --tq-secondary: var(--cb-secondary);
  --tq-on-secondary: var(--cb-accent);
  --tq-accent: var(--cb-accent);
  --tq-surface: var(--cb-surface);
  --tq-text: var(--cb-text);
  --tq-heading: var(--cb-accent);
  --tq-muted: var(--cb-text-muted);
  --tq-border: var(--cb-border);
  --tq-success: var(--cb-success);
  --tq-radius: var(--cb-radius);
  --tq-font-heading: var(--cb-font-heading);
  --tq-page-width: var(--cb-page-width);
}""",
        'snippets': SNIPPETS,
    },
}
THEMES['tastiqo-bold'] = {
    'SECTION': 'tb-section', 'CONTAINER': 'tb-container',
    'BTN': 'tb-btn tb-btn--primary tb-btn--lg', 'BTN_SM': 'tb-btn tb-btn--primary tb-btn--sm',
    'tokens': """:root {
  --tq-primary: var(--c-primary);
  --tq-secondary: var(--c-accent);
  --tq-on-secondary: var(--c-on-accent);
  --tq-accent: var(--c-deep);
  --tq-surface: var(--c-surface);
  --tq-text: var(--c-text);
  --tq-heading: var(--c-text);
  --tq-muted: var(--c-muted);
  --tq-border: var(--c-border);
  --tq-success: var(--c-success);
  --tq-sale: var(--c-sale);
  --tq-radius: var(--radius);
  --tq-font-heading: var(--font-heading);
  --tq-page-width: var(--page-width);
}""",
    'snippets': SNIPPETS,
}
SECTIONS = ['hero-carousel', 'featured-categories', 'product-showcase', 'deals-section']
CSS_START, CSS_END = '/* >>> tq-merch components (generated, keep in sync across themes) */', '/* <<< tq-merch components */'
JS_START, JS_END = '/* >>> tq-merch carousel (generated, keep in sync across themes) */', '/* <<< tq-merch carousel */'

def sub(text, cfg):
    for k in ('SECTION', 'CONTAINER', 'BTN_SM', 'BTN'):
        text = text.replace('%%' + k + '%%', cfg[k])
    assert '%%' not in text, 'unreplaced placeholder'
    return text

def splice(path, start, end, body):
    s = open(path).read()
    block = start + '\n' + body.strip('\n') + '\n' + end + '\n'
    if start in s:
        s = re.sub(re.escape(start) + r'.*?' + re.escape(end) + r'\n?', lambda m: block, s, flags=re.S)
    else:
        s = s.rstrip('\n') + '\n\n' + block
    open(path, 'w').write(s)

css = open(os.path.join(SRC, 'tq-components.css')).read()
js = open(os.path.join(SRC, 'tq-carousel.js')).read()
for theme, cfg in THEMES.items():
    base = os.path.join(ROOT, theme)
    for name in SECTIONS:
        out = sub(open(os.path.join(SRC, name + '.liquid')).read(), cfg)
        open(os.path.join(base, 'sections', name + '.liquid'), 'w').write(out)
    for name in cfg['snippets']:
        out = sub(open(os.path.join(SRC, name + '.liquid')).read(), cfg)
        open(os.path.join(base, 'snippets', name + '.liquid'), 'w').write(out)
    splice(os.path.join(base, 'assets', 'theme.css'), CSS_START, CSS_END, cfg['tokens'] + '\n' + css)
    splice(os.path.join(base, 'assets', 'theme.js'), JS_START, JS_END, js)
    print('generated', theme)
