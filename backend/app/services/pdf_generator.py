"""
PDF Generator Service
=====================
Uses Playwright (headless Chromium) to render rich HTML/CSS content to PDF.
Supports premium academic styling: typography, callouts, tables, code blocks, print layout.
"""

import logging
import os
import uuid
import re
from datetime import datetime
from typing import Tuple

logger = logging.getLogger(__name__)


def _sanitize_filename(name: str, max_len: int = 50) -> str:
    """Converts a title into a safe filesystem filename."""
    slug = re.sub(r"[^\w\s-]", "", name.lower())
    slug = re.sub(r"[\s_-]+", "_", slug).strip("_")
    return slug[:max_len] if len(slug) > max_len else slug or "notes"


def _build_full_html(title: str, html_body: str, generated_at: str) -> str:
    """Wraps the agent-generated HTML body in a full premium print-ready document."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Merriweather:ital,wght@0,300;0,400;0,700;1,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    /* ==================== CSS Reset & Base ==================== */
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}

    /* ==================== Print Page Layout ==================== */
    @page {{
      size: A4;
      margin: 20mm 18mm 22mm 18mm;
      @bottom-center {{
        content: "Page " counter(page) " of " counter(pages);
        font-family: 'Inter', sans-serif;
        font-size: 9px;
        color: #9ca3af;
      }}
    }}

    /* ==================== Typography & Body ==================== */
    html, body {{
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 10.5pt;
      line-height: 1.7;
      color: #1a1a2e;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }}

    /* ==================== Cover / Title Block ==================== */
    .note-cover {{
      padding: 32px 0 28px;
      border-bottom: 3px solid #fa5d19;
      margin-bottom: 28px;
    }}
    .note-cover .label {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 8pt;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #fa5d19;
      margin-bottom: 10px;
    }}
    .note-cover h1 {{
      font-family: 'Merriweather', Georgia, serif;
      font-size: 22pt;
      font-weight: 700;
      line-height: 1.25;
      color: #0f0f23;
      margin-bottom: 10px;
    }}
    .note-cover .meta {{
      font-size: 8.5pt;
      color: #6b7280;
      display: flex;
      gap: 18px;
    }}
    .note-cover .meta span {{ display: flex; align-items: center; gap: 4px; }}

    /* ==================== Headings ==================== */
    h1 {{ font-family: 'Merriweather', Georgia, serif; font-size: 17pt; font-weight: 700; color: #0f0f23; margin: 26px 0 10px; line-height: 1.3; }}
    h2 {{
      font-family: 'Inter', sans-serif;
      font-size: 13pt;
      font-weight: 700;
      color: #1e293b;
      margin: 22px 0 8px;
      padding-bottom: 5px;
      border-bottom: 1.5px solid #e5e7eb;
      line-height: 1.35;
    }}
    h3 {{ font-size: 11pt; font-weight: 600; color: #374151; margin: 16px 0 6px; }}
    h4 {{ font-size: 10pt; font-weight: 600; color: #4b5563; margin: 12px 0 5px; }}

    /* ==================== Paragraphs & Lists ==================== */
    p {{ margin-bottom: 10px; orphans: 3; widows: 3; }}
    ul, ol {{ margin: 8px 0 12px 20px; }}
    ul {{ list-style: disc; }}
    ol {{ list-style: decimal; }}
    li {{ margin-bottom: 4px; line-height: 1.65; }}
    ul ul, ol ol, ul ol, ol ul {{ margin-top: 4px; margin-bottom: 4px; }}

    /* ==================== Emphasis ==================== */
    strong {{ font-weight: 700; color: #111827; }}
    em {{ font-style: italic; color: #374151; }}
    mark {{ background: #fef3c7; color: #92400e; padding: 1px 4px; border-radius: 3px; }}

    /* ==================== Tables ==================== */
    table {{
      width: 100%;
      border-collapse: collapse;
      margin: 14px 0 18px;
      font-size: 9.5pt;
      page-break-inside: avoid;
    }}
    thead tr {{ background: #1e293b; color: #ffffff; }}
    thead th {{
      padding: 8px 12px;
      text-align: left;
      font-weight: 600;
      font-size: 8.5pt;
      letter-spacing: 0.04em;
    }}
    tbody tr:nth-child(even) {{ background: #f8fafc; }}
    tbody tr:hover {{ background: #f1f5f9; }}
    td {{ padding: 7px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }}

    /* ==================== Code ==================== */
    code {{
      font-family: 'JetBrains Mono', 'Courier New', monospace;
      font-size: 8.5pt;
      background: #f1f5f9;
      color: #be185d;
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
    }}
    pre {{
      font-family: 'JetBrains Mono', 'Courier New', monospace;
      font-size: 8.5pt;
      background: #0f172a;
      color: #e2e8f0;
      padding: 14px 16px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 12px 0 16px;
      line-height: 1.6;
      page-break-inside: avoid;
      border-left: 4px solid #fa5d19;
    }}
    pre code {{ background: none; color: inherit; padding: 0; border: none; font-size: inherit; }}

    /* ==================== Callout / Alert Boxes ==================== */
    .callout {{
      display: flex;
      gap: 12px;
      border-radius: 8px;
      padding: 12px 14px;
      margin: 14px 0 18px;
      page-break-inside: avoid;
    }}
    .callout-icon {{ font-size: 16px; flex-shrink: 0; margin-top: 1px; }}
    .callout-body {{ flex: 1; }}
    .callout-body .callout-title {{ font-weight: 700; font-size: 9.5pt; margin-bottom: 3px; }}

    .callout.tip {{ background: #ecfdf5; border-left: 4px solid #10b981; }}
    .callout.tip .callout-title {{ color: #065f46; }}
    .callout.tip .callout-body {{ color: #064e3b; }}

    .callout.note {{ background: #eff6ff; border-left: 4px solid #3b82f6; }}
    .callout.note .callout-title {{ color: #1e3a8a; }}
    .callout.note .callout-body {{ color: #1e40af; }}

    .callout.warning {{ background: #fffbeb; border-left: 4px solid #f59e0b; }}
    .callout.warning .callout-title {{ color: #92400e; }}
    .callout.warning .callout-body {{ color: #78350f; }}

    .callout.important {{ background: #fff1f2; border-left: 4px solid #f43f5e; }}
    .callout.important .callout-title {{ color: #881337; }}
    .callout.important .callout-body {{ color: #9f1239; }}

    .callout.formula {{ background: #faf5ff; border-left: 4px solid #8b5cf6; }}
    .callout.formula .callout-title {{ color: #4c1d95; }}
    .callout.formula .callout-body {{ color: #5b21b6; font-family: 'JetBrains Mono', monospace; font-size: 9pt; }}

    /* ==================== Key Concept Box ==================== */
    .key-concept {{
      background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%);
      border: 1px solid #fed7aa;
      border-left: 5px solid #fa5d19;
      border-radius: 8px;
      padding: 14px 16px;
      margin: 14px 0;
      page-break-inside: avoid;
    }}
    .key-concept .key-concept-label {{
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #c2410c;
      margin-bottom: 5px;
    }}

    /* ==================== Section Divider ==================== */
    hr {{ border: none; border-top: 1.5px solid #e5e7eb; margin: 22px 0; }}

    /* ==================== Blockquote ==================== */
    blockquote {{
      border-left: 4px solid #fa5d19;
      padding: 8px 14px;
      margin: 12px 0;
      color: #4b5563;
      font-style: italic;
      background: #fafafa;
      border-radius: 0 6px 6px 0;
    }}

    /* ==================== Summary Box ==================== */
    .exec-summary {{
      background: #0f1729;
      color: #e2e8f0;
      border-radius: 10px;
      padding: 16px 18px;
      margin: 0 0 24px;
      page-break-inside: avoid;
    }}
    .exec-summary .exec-label {{
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #fa5d19;
      margin-bottom: 7px;
    }}
    .exec-summary p {{ color: #cbd5e1; margin-bottom: 0; }}

    /* ==================== Review Questions ==================== */
    .review-questions {{
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 10px;
      padding: 14px 16px;
      margin: 20px 0;
    }}
    .review-questions .rq-label {{
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #166534;
      margin-bottom: 9px;
    }}
    .review-questions ol {{ margin-left: 16px; }}
    .review-questions li {{ color: #15803d; margin-bottom: 6px; }}

    /* ==================== Page Break Control ==================== */
    .page-break {{ page-break-after: always; }}
    .no-break {{ page-break-inside: avoid; }}

    /* ==================== Footer ==================== */
    .note-footer {{
      margin-top: 32px;
      padding-top: 14px;
      border-top: 1.5px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 8pt;
      color: #9ca3af;
    }}
    .note-footer .brand {{ font-weight: 700; color: #fa5d19; }}
  </style>
</head>
<body>
  <!-- Cover Block -->
  <div class="note-cover">
    <div class="label">&#128196; AI-Generated Study Notes</div>
    <h1>{title}</h1>
    <div class="meta">
      <span>&#128197; {generated_at}</span>
      <span>&#129302; Cloud PDF Reader</span>
    </div>
  </div>

  <!-- Main Content (Agent-generated HTML body) -->
  {html_body}

  <!-- Footer -->
  <div class="note-footer">
    <span><span class="brand">Cloud PDF Reader</span> &mdash; AI Notes Engine</span>
    <span>Generated {generated_at}</span>
  </div>
</body>
</html>"""


async def generate_pdf_notes(
    title: str,
    html_body: str,
) -> Tuple[bytes, str]:
    """
    Renders `html_body` inside a premium A4 print layout and returns PDF bytes in-memory.
    No file is saved to disk or object store.

    Args:
        title:      Human-readable title for the notes document.
        html_body:  The agent-produced semantic HTML body content.

    Returns:
        Tuple of (pdf_bytes, filename)
    """
    from playwright.async_api import async_playwright  # lazy import to avoid startup cost

    generated_at = datetime.utcnow().strftime("%B %d, %Y at %H:%M UTC")
    full_html = _build_full_html(title=title, html_body=html_body, generated_at=generated_at)

    slug = _sanitize_filename(title)
    filename = f"{slug}.pdf"

    logger.info("[PDFGenerator] Rendering '%s' to in-memory PDF", title)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page()

        # Set full HTML content and wait for network (Google Fonts) to load
        await page.set_content(full_html, wait_until="networkidle")

        pdf_bytes = await page.pdf(
            format="A4",
            print_background=True,
            margin={"top": "20mm", "bottom": "22mm", "left": "18mm", "right": "18mm"},
            display_header_footer=False,
        )
        await browser.close()

    logger.info("[PDFGenerator] In-memory PDF generated: %s (%d bytes)", filename, len(pdf_bytes))
    return pdf_bytes, filename
