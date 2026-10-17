export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const PRINT_CSS = `
  body { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #13222b; margin: 24px; font-size: 13px; line-height: 1.45; }
  h1 { font-size: 20px; margin: 0 0 4px; } h2 { font-size: 14px; margin: 18px 0 6px; border-bottom: 1px solid #cbd5d1; padding-bottom: 3px; }
  p.meta { color: #52605b; margin: 0 0 12px; } table { border-collapse: collapse; width: 100%; } td, th { padding: 4px 6px; text-align: left; vertical-align: top; }
  td.n, th.n { text-align: right; white-space: nowrap; } tr { border-bottom: 1px solid #e5e9e7; } ul { list-style: none; padding: 0; margin: 0; }
  li { padding: 2px 0; } .box { font-size: 18px; margin-right: 6px; } .note { margin-top: 16px; padding: 8px 10px; background: #f3f4ee; border: 1px solid #d9dccb; font-size: 12px; }
  @media print { body { margin: 12mm; } }
`;

export function buildPrintDocument(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="nb"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${PRINT_CSS}</style></head><body>${bodyHtml}</body></html>`;
}

/** Skriver ut via skjult iframe – ingen popup som kan blokkeres. */
export function printHtml(title: string, bodyHtml: string): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(buildPrintDocument(title, bodyHtml));
  doc.close();
  const run = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(() => iframe.remove(), 2000);
    }
  };
  if (doc.readyState === 'complete') setTimeout(run, 50);
  else iframe.onload = run;
}

export function downloadText(filename: string, content: string, type = 'text/plain;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
