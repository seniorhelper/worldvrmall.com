/* World VR Mall house icons (Oct 2026) — outlined, colored, squared. One swap map replaces the generic emoji the UI used to lean on.
   Content people typed (posts, comments, Hearts answers, composer) is never touched. */
const P = (d, extra = '') => `<svg class="hic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}${extra}</svg>`;
export const HICON = {
  '✕': P('<path d="M6 6l12 12M18 6L6 18"/>'),
  '✨': P('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>'),
  '🌍': P('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>'),
  '🤝': P('<path d="M8 12l3 3 2-2M3 9l4-3h4l3 3 4-3 3 3-5 6-3 3-4-1-3-3z"/>'),
  '✅': P('<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12l3 3 5-6"/>'),
  '🎨': P('<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2s0-2 1.5-2h2a3 3 0 0 0 0-6c-2 0-2-1-2-2 0-3-1-6-3-6z"/><circle cx="8" cy="10" r="1"/><circle cx="12" cy="7" r="1"/><circle cx="7" cy="15" r="1"/>'),
  '💼': P('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/>'),
  '❤': P('<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>'),
  '🎯': P('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'),
  '💬': P('<path d="M4 5h16v11H9l-5 4z"/>'),
  '📍': P('<path d="M12 21s6-6 6-11a6 6 0 1 0-12 0c0 5 6 11 6 11z"/><circle cx="12" cy="10" r="2"/>'),
  '🚀': P('<path d="M14 4c3 0 6 3 6 6l-8 8-4-4z"/><path d="M8 14l-3 1 1 3 3-1M12 10l2 2"/>'),
  '🐞': P('<circle cx="12" cy="13" r="7"/><path d="M12 6v14M5 13h14M8 4l2 2M16 4l-2 2"/>'),
  '🔗': P('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  '🏡': P('<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'),
  '🏠': P('<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'),
  '🔥': P('<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z"/>'),
  '📞': P('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>'),
  '📰': P('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h6M7 12h10M7 16h10M15 8h2"/>'),
  '👋': P('<path d="M7 11V6a1.5 1.5 0 0 1 3 0v5M10 10V4a1.5 1.5 0 0 1 3 0v6M13 10V5a1.5 1.5 0 0 1 3 0v7M16 12V8a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-12 0v-2a2 2 0 0 1 2-2"/>'),
  '🌱': P('<path d="M12 21v-8M12 13c0-4 3-6 7-6 0 4-3 6-7 6zM12 13c0-3-2-5-6-5 0 3 2 5 6 5z"/>'),
  '🐕': P('<path d="M4 13l3-6h6l4 3h4v3l-3 1v3H8v-4z"/><circle cx="9.5" cy="10.5" r="1"/>'),
  '🤗': P('<circle cx="12" cy="12" r="9"/><path d="M8 10h.01M16 10h.01M8 15c2 2 6 2 8 0"/>'),
  '🛍': P('<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'),
  '📡': P('<path d="M5 12a7 7 0 0 1 7-7M8 12a4 4 0 0 1 4-4"/><circle cx="12" cy="12" r="1"/><path d="M12 13v8"/>'),
  '🌐': P('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
  '🏔': P('<path d="M3 20l6-10 4 6 2-3 6 7z"/><path d="M8 12l1-2 1 2"/>'),
  '🎢': P('<path d="M3 18c4 0 4-10 8-10s4 10 8 10"/><path d="M5 18v3M9 12v9M13 12v9M17 18v3"/>'),
  '🔑': P('<circle cx="8" cy="12" r="4"/><path d="M12 12h9M17 12v3M20 12v2"/>'),
  '📅': P('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  '🎉': P('<path d="M4 20l4-12 8 8z"/><path d="M14 6l1-2M18 8l2-1M16 12l2 1M12 4l.5 2"/>'),
  '☀': P('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>'),
  '🏆': P('<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v3M8 20h8"/>'),
  '🏮': P('<ellipse cx="12" cy="12" rx="6" ry="7"/><path d="M9 3h6M9 21h6M12 5v14"/>'),
  '💡': P('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10c1 1 1 2 1 3h6c0-1 0-2 1-3a6 6 0 0 0-4-10z"/>'),
  '📣': P('<path d="M4 10v4h3l7 5V5L7 10z"/><path d="M17 9a4 4 0 0 1 0 6"/>'),
  '🌙': P('<path d="M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z"/>'),
  '🖼': P('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="1.5"/><path d="M21 16l-5-5-8 8"/>'),
  '👤': P('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  '🪐': P('<circle cx="12" cy="12" r="5"/><path d="M3 10c5-3 13-3 18 0M3 14c5 3 13 3 18 0"/>'),
  '🚶': P('<circle cx="13" cy="4" r="2"/><path d="M10 22l2-7 3 2v5M8 13l3-6 4 1 2 4 3 1M11 10l-1 5-3 4"/>'),
  '👀': P('<ellipse cx="8" cy="12" rx="4" ry="5"/><ellipse cx="16" cy="12" rx="4" ry="5"/><circle cx="9" cy="13" r="1.5" fill="currentColor"/><circle cx="17" cy="13" r="1.5" fill="currentColor"/>'),
  '👩': P('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  '🧍': P('<circle cx="12" cy="5" r="2"/><path d="M12 7v8M9 10l3-1 3 1M10 22l2-7 2 7"/>'),
  '📺': P('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 21h8M9 3l3 3 3-3"/>'),
  '🗺': P('<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>'),
  '🧊': P('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>'),
  '🕶': P('<path d="M3 9a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3h-3l-2-3h-2l-2 3H6a3 3 0 0 1-3-3z"/>'),
  '🔍': P('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>'),
  '🧑': P('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  '📻': P('<rect x="3" y="8" width="18" height="12" rx="2"/><circle cx="8" cy="14" r="2.5"/><path d="M13 12h5M13 16h5M6 8l10-5"/>'),
  '⛶': P('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>'),
  '🎒': P('<path d="M7 9a5 5 0 0 1 10 0v11H7z"/><path d="M9 9V6a3 3 0 0 1 6 0v3M7 14h10"/>'),
  '🪙': P('<circle cx="12" cy="12" r="8"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/>'),
  '❔': P('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01"/>'),
  '🧭': P('<circle cx="12" cy="12" r="9"/><path d="M15 9l-2 6-4 2 2-6z"/>'),
  '🧱': P('<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 10h18M3 14h18M8 5v5M16 5v5M12 10v4M8 14v5M16 14v5"/>'),
  '🧠': P('<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3h1V4zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3h-1V4z"/>')
};
export const ICON_CSS = `.hic{width:1.1em;height:1.1em;vertical-align:-0.18em;display:inline-block;color:currentColor}`;
const RX = new RegExp('(' + Object.keys(HICON).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\uFE0F?', 'g');
const SKIP = 'textarea, input, [contenteditable], canvas, #orbit-tab, .glove, #aou-lumi .face, .txt, .cmts, .cmt, .hearts, #hearts, .lb .out, .no-icons, code, pre, .fl-feed .say';
export function swapEmoji(root) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => { if (!n.nodeValue || !RX.test(n.nodeValue)) return NodeFilter.FILTER_REJECT; RX.lastIndex = 0; const p = n.parentElement; if (!p || p.closest(SKIP) || p.closest('svg')) return NodeFilter.FILTER_REJECT; return NodeFilter.FILTER_ACCEPT; } });
  const nodes = []; let n; while ((n = walker.nextNode())) nodes.push(n);
  for (const t of nodes) { const span = document.createElement('span'); span.innerHTML = t.nodeValue.replace(RX, (m, k) => HICON[k] || m); t.replaceWith(...span.childNodes); }
}
export function watchEmoji(root) {
  swapEmoji(root);
  const mo = new MutationObserver((muts) => { for (const m of muts) m.addedNodes.forEach(a => { if (a.nodeType === 1) swapEmoji(a); else if (a.nodeType === 3 && a.parentElement) swapEmoji(a.parentElement); }); });
  mo.observe(root, { childList: true, subtree: true }); return mo;
}
