#!/usr/bin/env python3
"""
Extract every <section class="view" id="view-XXX">…</section> block
from the mockup's gh-pages index.html into individual HTML files,
so the team (and agents) can reference a single view per file instead
of re-grepping the 3,000-line monolith.

Output layout:
    mockup/
      index.html                 ← the original (for reference)
      views/
        view-login.html
        view-dashboard.html
        view-upload.html
        view-dimensions.html
        view-taxonomy-groups.html
        view-taxonomies.html
        view-roles.html
        view-paquetes.html
        view-segmentation.html
        view-tagging.html
        view-discrepancias.html
        view-validacion.html
        view-reporte.html
        view-kappa.html
      overlays/                   ← floating dialogs/wizards that live
                                   outside <section class="view">
        tax-wizard-overlay.html   ← 4-step dimension creation wizard
        custom-scale-overlay.html ← custom scale dialog
        dimension-picker-overlay.html
      css/
        view-shared.css           ← the global :root / *, .app etc.
        view-styles.css           ← any per-component .view-* classes
        overlay-styles.css        ← .wiz-* styles from the overlays

Run from repo root:
    python3 scripts/extract_mockup.py

Re-runnable: regenerates the mockup/ tree from the current
gh-pages index.html.
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SRC = REPO / "mockup" / "index.html"
OUT = REPO / "mockup" / "views"
CSS_DIR = REPO / "mockup" / "css"
OVERLAYS_DIR = REPO / "mockup" / "overlays"


VIEW_RE = re.compile(
    r'<section class="view" id="(view-[a-z-]+)">(.*?)</section>',
    re.DOTALL,
)
# Overlays are floating dialogs / wizards in the mockup. Each is a
# top-level <div id="..."> at the same nesting as <main>. They're NOT
# <section class="view">, so the VIEW_RE above misses them.
OVERLAY_IDS = [
    "tax-wizard-overlay",          # 4-step dimension creation wizard
    "custom-scale-overlay",        # custom scale dialog (opened from wizard step 2)
    "dimension-picker-overlay",     # per-project dimension assignment
]


def extract_views(html: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for m in VIEW_RE.finditer(html):
        out[m.group(1)] = m.group(2).strip()
    return out


def extract_overlays(html: str) -> dict[str, str]:
    """Walk brace-counted divs to find the body of each overlay.

    The naive regex assumes the overlay ends with three nested
    </div></div></div>, which is the structure in the current mockup.
    If the structure changes we will need a real HTML parser, but for
    now this is enough.
    """
    out: dict[str, str] = {}
    for overlay_id in OVERLAY_IDS:
        open_tag = re.search(
            rf'<div id="{re.escape(overlay_id)}"\s+style="[^"]*">',
            html,
        )
        if not open_tag:
            continue
        start = open_tag.end()
        depth = 1
        i = start
        while i < len(html) and depth > 0:
            if html[i] == "<" and html[i + 1 : i + 4] == "div":
                depth += 1
            elif html[i : i + 6] == "</div>":
                depth -= 1
                if depth == 0:
                    break
            i += 1
        if depth == 0:
            out[overlay_id] = html[start:i].strip()
    return out


def extract_global_css(html: str) -> tuple[str, str]:
    """Split the inline <style> block into 'shared' and 'styles'.

    - shared: :root vars, reset, app shell, sidebar, topbar, kpi,
      grid, table, badge, btn, etc.
    - styles: per-component classes (tax-*, dim-*, role-*, tk-*,
      view-*, login-*, bench-row, etc.)
    """
    m = re.search(r"<style>(.*?)</style>", html, re.DOTALL)
    if not m:
        return "", ""
    css = m.group(1)

    # Crude split: anything that's NOT one of the "shared" selectors
    # below is considered per-component and goes into styles.css.
    shared_selectors = (
        ":root",
        "*",
        "html",
        "body",
        "button",
        "a",
        "code",
        "kbd",
        ".app",
        ".side",
        ".side ",
        ".top",
        ".top ",
        ".page",
        ".page ",
        ".card",
        ".card ",
        ".kpi",
        ".kpi ",
        ".grid",
        ".grid ",
        ".g-2",
        ".g-3",
        ".g-4",
        ".g-split",
        ".g-34",
        ".g-23",
        "table",
        "td",
        "th",
        "tr",
        "tr:last-child",
        "tr:hover",
        ".tag",
        ".tag ",
        ".tag.sesgo",
        ".tag.intensidad",
        ".tag.status",
        ".view",
        ".view.active",
        "@keyframes",
        ".et-head",
        ".et-head ",
        ".et-grid",
        ".context-box",
        ".context-box ",
        ".frag-card",
        ".frag-card ",
        ".dims",
        ".dim",
        ".dim ",
        ".opts",
        ".opt",
        ".opt.",
        ".notes",
        ".actions",
        ".actions ",
        ".btn",
        ".btn.",
        ".btn:",
        ".progress",
        ".progress ",
        ".bench-row",
        ".bench-row ",
        ".bar-bg",
        ".bar-fill",
        ".bar-fill.",
        ".diff",
        ".diff.",
        ".compare ",
        ".vs",
        ".vs.",
        ".login-wrap",
        ".login-art",
        ".login-art ",
        ".login-art::before",
        ".login-form",
        ".login-form ",
        ".ic",
        ".empty",
    )
    # Split the CSS by top-level rules; for each, decide shared vs styles.
    shared_chunks: list[str] = []
    style_chunks: list[str] = []
    depth = 0
    buf: list[str] = []
    selectors: list[str] = []
    in_rule = False
    rule_start_idx = 0

    # Walk char-by-char to split into balanced {} blocks. Each rule starts
    # with a selector (up to '{') and ends at the matching '}'.
    i = 0
    n = len(css)
    while i < n:
        # Collect a rule
        brace = css.find("{", i)
        if brace == -1:
            break
        selector = css[i:brace].strip().splitlines()[-1].strip()
        # find matching close brace
        depth = 1
        j = brace + 1
        while j < n and depth > 0:
            if css[j] == "{":
                depth += 1
            elif css[j] == "}":
                depth -= 1
            j += 1
        body = css[brace + 1 : j - 1]
        sel_norm = selector.lstrip(".")
        is_shared = any(sel_norm == s.lstrip(".") for s in shared_selectors) or any(
            sel_norm.startswith(s.lstrip(".") + " ") or sel_norm.startswith(s.lstrip(".") + ":")
            for s in shared_selectors
        )
        block = f"{selector} {{\n{body}\n}}\n\n"
        (shared_chunks if is_shared else style_chunks).append(block)
        i = j
    return "".join(shared_chunks), "".join(style_chunks)


def wrap_view(view_id: str, body: str) -> str:
    """Wrap the extracted body in a self-contained HTML doc with a
    banner that explains what the file is and which issue it maps to.
    """
    issue = VIEW_TO_ISSUE.get(view_id, "—")
    title = view_id.replace("view-", "").replace("-", " ").title()
    return f"""<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>{title} — mockup (issue {issue})</title>
  <link rel="stylesheet" href="../css/view-styles.css">
  <link rel="stylesheet" href="../css/view-shared.css">
</head>
<body style="padding: 24px; background: #fafaf7;">
  <header style="margin-bottom: 16px; font-family: system-ui, sans-serif; font-size: 13px; color: #555;">
    <strong>{view_id}</strong> · mockup extraído de
    <code>gh-pages/index.html</code> · <strong>issue #{issue}</strong> ·
    <a href="../../index.html">ver original</a>
  </header>
  <section class="view active" id="{view_id}">
{body}
  </section>
</body>
</html>
"""


# Map mockup view ids → GH issue numbers (from the issues already in
# the project, see docs/ROADMAP.md). When a view maps to multiple
# issues, we pick the primary one.
VIEW_TO_ISSUE = {
    "view-login": "— (no issue — auth shell)",
    "view-dashboard": "— (no issue)",
    "view-upload": "19 (Excel import)",
    "view-dimensions": "15 (UI dimension editor) + 18 (dimension CRUD)",
    "view-taxonomy-groups": "— (no issue)",
    "view-taxonomies": "15 (UI dimension editor) + 18 (dimension CRUD)",
    "view-roles": "5 (user invitation + roles) + 8 (user management per project)",
    "view-paquetes": "23 (divide corpus into packages) + 24 (assign mirror pairs) + 30 (package grid)",
    "view-segmentation": "17 (UI segmentation config) + 21 (worker segmentation)",
    "view-tagging": "25 (annotation screen) + 26 (offline draft) + 27 (keyboard shortcuts)",
    "view-discrepancias": "28 (inconsistencies worker) + 29 (discrepancy report)",
    "view-validacion": "— (validación cualitativa — backlog)",
    "view-reporte": "— (reporte — backlog)",
    "view-kappa": "— (kappa — backlog)",
}

# Status as of the last extraction. Updated manually as features land.
VIEW_STATUS = {
    "view-login": "✓ done (#3)",
    "view-dashboard": "~ partial (KPIs only, no project list table yet)",
    "view-upload": "✗ not started",
    "view-dimensions": "✗ not started (the per-project 'Taxonomías del proyecto' tabs view, distinct from the catalog)",
    "view-taxonomy-groups": "~ partial (global catalog exists at /taxonomias but not the per-project assignment)",
    "view-taxonomies": "✓ done (#15, #18 — tax-card styling aligned)",
    "view-roles": "✓ done (#5, #8 simplified — no team grouping yet)",
    "view-paquetes": "✗ not started",
    "view-segmentation": "✗ not started",
    "view-tagging": "✗ not started",
    "view-discrepancias": "✗ not started",
    "view-validacion": "✗ not started",
    "view-reporte": "✗ not started",
    "view-kappa": "✗ not started",
}

# Map overlay ids to the issues they relate to.
OVERLAY_TO_ISSUE = {
    "tax-wizard-overlay": "15 (UI dimension editor) + 18 (dimension CRUD) — 4-step wizard with stepper",
    "custom-scale-overlay": "16 (UI intensity scale editor) — dialog opened from wizard step 2",
    "dimension-picker-overlay": "15 (per-project dimension assignment — checkbox grid)",
}

# Status of the overlays (i.e. how much of the current app matches).
OVERLAY_STATUS = {
    "tax-wizard-overlay": "≈ close — current app has a 4-step wizard modal but step 2 uses a <select> instead of the mockup's card grid, step 3 is read-only instead of editable, step 4 lacks the summary block",
    "custom-scale-overlay": "≈ close — current app has a CreateScaleModal but the form is simpler (no scale count / numerical range, no inline preview)",
    "dimension-picker-overlay": "✗ not started",
}


def wrap_overlay(overlay_id: str, body: str) -> str:
    """Wrap an overlay's body in a self-contained HTML doc."""
    issue = OVERLAY_TO_ISSUE.get(overlay_id, "—")
    title = overlay_id.replace("-", " ").title()
    return f"""<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>{title} — mockup</title>
  <link rel="stylesheet" href="../css/view-shared.css">
  <link rel="stylesheet" href="../css/view-styles.css">
  <link rel="stylesheet" href="../css/overlay-styles.css">
</head>
<body style="padding: 24px; background: #fafaf7;">
  <header style="margin-bottom: 16px; font-family: system-ui, sans-serif; font-size: 13px; color: #555;">
    <strong>{overlay_id}</strong> · mockup extraído de
    <code>gh-pages/index.html</code> · <strong>{issue}</strong> ·
    <a href="../../index.html">ver original</a>
  </header>
  <p style="font-family: system-ui, sans-serif; font-size: 12px; color: #888; max-width: 600px;">
    Los overlays son modales / wizards flotantes del mockup (no son
    <code>&lt;section class="view"&gt;</code>). En el HTML original
    están ocultos con <code>display:none</code>; en estos archivos
    extraídos les quitamos el <code>display:none</code> para que se
    puedan ver al abrirlos en el navegador.
  </p>
  <div id="{overlay_id}" style="position:relative;inset:auto;background:transparent;backdrop-filter:none;padding:0">
{body}
  </div>
</body>
</html>
"""


def extract_overlay_css(html: str) -> str:
    """Pull the .wiz-* and other overlay-specific CSS out of the global
    <style> block. We grab the same 'styles' chunk as the views and
    additionally filter for overlay-specific classes.
    """
    _, styles = extract_global_css(html)
    return styles


def main() -> int:
    if not SRC.exists():
        print(
            f"error: {SRC} not found.\n"
            f"  First time: copy the mockup into the repo with\n"
            f"    git show origin/gh-pages:index.html > {SRC}\n"
            f"  Or fetch the raw file from GitHub."
        )
        return 1

    html = SRC.read_text(encoding="utf-8")
    OUT.mkdir(parents=True, exist_ok=True)
    CSS_DIR.mkdir(parents=True, exist_ok=True)
    OVERLAYS_DIR.mkdir(parents=True, exist_ok=True)

    views = extract_views(html)
    for view_id, body in views.items():
        out = OUT / f"{view_id}.html"
        out.write_text(wrap_view(view_id, body), encoding="utf-8")
        print(f"  wrote {out.relative_to(REPO)} ({len(body)} chars)")

    overlays = extract_overlays(html)
    for overlay_id, body in overlays.items():
        out = OVERLAYS_DIR / f"{overlay_id}.html"
        out.write_text(wrap_overlay(overlay_id, body), encoding="utf-8")
        print(f"  wrote {out.relative_to(REPO)} ({len(body)} chars)")

    shared, styles = extract_global_css(html)
    (CSS_DIR / "view-shared.css").write_text(shared, encoding="utf-8")
    (CSS_DIR / "view-styles.css").write_text(styles, encoding="utf-8")
    # Overlay CSS is shared with the views (same <style> block) — just
    # symlink for clarity. If the mockup ever moves overlay styles
    # to a separate block, update this.
    (CSS_DIR / "overlay-styles.css").write_text(styles, encoding="utf-8")
    print(f"  wrote {CSS_DIR / 'view-shared.css'}")
    print(f"  wrote {CSS_DIR / 'view-styles.css'}")
    print(f"  wrote {CSS_DIR / 'overlay-styles.css'}")

    # Index of all extracted views + overlays
    index = OUT / "INDEX.md"
    lines = [
        "# Mockup views (gh-pages reference)",
        "",
        "Each view below was extracted from `gh-pages/index.html` once.",
        "Use these files as the source of truth when implementing a",
        "feature — don't re-grep the original HTML each time.",
        "",
        "## Views (page-level screens)",
        "",
        "| View | Issue(s) | Status |",
        "| --- | --- | --- |",
    ]
    for view_id in sorted(views):
        issue = VIEW_TO_ISSUE.get(view_id, "—")
        status = VIEW_STATUS.get(view_id, "—")
        file = f"{view_id}.html"
        lines.append(f"| [{view_id}]({file}) | {issue} | {status} |")
    lines += [
        "",
        "## Overlays (floating dialogs / wizards)",
        "",
        "These are NOT `<section class=\"view\">` — they live as",
        "sibling `<div id=\"...\">` blocks at the same nesting as `<main>`",
        "and are hidden with `display:none` until JS opens them.",
        "",
        "| Overlay | Issue(s) | Status |",
        "| --- | --- | --- |",
    ]
    for overlay_id in sorted(overlays):
        issue = OVERLAY_TO_ISSUE.get(overlay_id, "—")
        status = OVERLAY_STATUS.get(overlay_id, "—")
        file = f"../overlays/{overlay_id}.html"
        lines.append(f"| [{overlay_id}]({file}) | {issue} | {status} |")
    lines += [
        "",
        "Re-run `python3 scripts/extract_mockup.py` to regenerate from a",
        "newer `mockup/index.html` (pull it with",
        "`git show origin/gh-pages:index.html > mockup/index.html`).",
        "",
    ]
    index.write_text("\n".join(lines), encoding="utf-8")
    print(f"  wrote {index.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
