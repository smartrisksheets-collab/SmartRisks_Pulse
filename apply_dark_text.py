"""Dark mode: text that uses the accent (navy) color turns light instead.

Usage:  python apply_dark_text.py frontend/src/index.css

Adds --accent-text (accent in light mode, --text in dark mode) and points every
`color: var(--accent)` / `color: var(--navy)` declaration at it. Backgrounds and
borders keep the accent. Rules on boxes that stay light in dark mode are skipped.
Writes nothing if a check fails. Original kept as index.css.bak.
"""
import re
import shutil
import sys

# Selectors whose box stays light in dark mode, so navy text must stay navy there.
SKIP_SELECTORS = ("fresh-tip", "risk-preview-card")

VARS: list[tuple[str, str, str]] = [
    ("root",
     "  --navy: var(--accent);\n",
     "  --navy: var(--accent);\n  --accent-text: var(--accent);\n"),
    ("dark",
     '[data-theme="dark"] {\n  --bg: #0f172a;\n',
     '[data-theme="dark"] {\n  --accent-text: var(--text);\n  --bg: #0f172a;\n'),
    ("auto (media)",
     '  [data-theme="auto"] {\n    --bg: #0f172a;\n',
     '  [data-theme="auto"] {\n    --accent-text: var(--text);\n    --bg: #0f172a;\n'),
]

# `color` only: the lookbehind rejects background-color, border-color, accent-color etc.
COLOR_RE = re.compile(r"(?<![-\w])color\s*:\s*var\(--(?:navy|accent)\)")


def selector_of(css: str, pos: int) -> str:
    open_brace = css.rfind("{", 0, pos)
    prev_close = css.rfind("}", 0, open_brace)
    return css[prev_close + 1:open_brace]


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python apply_dark_text.py <path to index.css>")
        return 2
    path = sys.argv[1]
    with open(path, encoding="utf-8") as fh:
        css = fh.read()

    if "--accent-text" in css:
        print("No changes written: --accent-text already exists, so this has already been applied.")
        return 1

    bad = [name for name, find, _ in VARS if css.count(find) != 1]
    if bad:
        print("No changes written. These variable anchors did not match exactly once: " + ", ".join(bad))
        return 1
    for _, find, repl in VARS:
        css = css.replace(find, repl)

    changed = 0
    skipped: list[str] = []

    def swap(m: re.Match[str]) -> str:
        nonlocal changed
        sel = selector_of(css, m.start())
        if any(s in sel for s in SKIP_SELECTORS):
            skipped.append(sel.strip())
            return m.group(0)
        changed += 1
        return "color: var(--accent-text)"

    css = COLOR_RE.sub(swap, css)

    shutil.copyfile(path, path + ".bak")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(css)
    print(f"Added --accent-text and switched {changed} text colors to it. Backup: {path}.bak")
    for s in skipped:
        print(f"  kept accent (light box): {s}")
    return 0


if __name__ == "__main__":
    sys.exit(main())