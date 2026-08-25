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
      css/
        view-shared.css           ← the global :root / *, .app etc.
        view-styles.css           ← any per-component .view-* classes

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


VIEW_RE = re.compile(
    r'<section class="view" id="(view-[a-z-]+)">(.*?)</section>',
    re.DOTALL,
)


def extract_views(html: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for m in VIEW_RE.finditer(html):
        out[m.group(1)] = m.group(2).strip()
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
    "view-dimensions": "✗ not started (the wizard in the app is from a Figma screenshot, not this view)",
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

    views = extract_views(html)
    for view_id, body in views.items():
        out = OUT / f"{view_id}.html"
        out.write_text(wrap_view(view_id, body), encoding="utf-8")
        print(f"  wrote {out.relative_to(REPO)} ({len(body)} chars)")

    shared, styles = extract_global_css(html)
    (CSS_DIR / "view-shared.css").write_text(shared, encoding="utf-8")
    (CSS_DIR / "view-styles.css").write_text(styles, encoding="utf-8")
    print(f"  wrote {CSS_DIR / 'view-shared.css'}")
    print(f"  wrote {CSS_DIR / 'view-styles.css'}")

    # Index of all extracted views
    index = OUT / "INDEX.md"
    lines = [
        "# Mockup views (gh-pages reference)",
        "",
        "Each view below was extracted from `gh-pages/index.html` once.",
        "Use these files as the source of truth when implementing a",
        "feature — don't re-grep the original HTML each time.",
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
