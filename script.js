/* ═══════════════════════════════
   DEVNOTES STUDIO — script.js
   ═══════════════════════════════ */

'use strict';

// ── STATE ──
let zoomLevel = 100;
let a4Mode = false;
let currentTheme = 'vscode';
let autoSaveTimer = null;
let savedThemes = JSON.parse(localStorage.getItem('dns_themes') || '{}');
let codeBlockCounter = 0;

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  initMarked();
  loadSavedContent();
  renderSavedThemesList();
  initDragDrop();
  initKeyboardShortcuts();
  updateColorPickers();
  // Load sample on first visit
  if (!localStorage.getItem('dns_content')) loadSample();
  renderPreview();
});

// ── MARKED.JS SETUP ──
function initMarked() {
  marked.setOptions({
    breaks: true,
    gfm: true,
    highlight: null,
  });
}

// ── CORE: RENDER PREVIEW ──
function renderPreview() {
  const raw = document.getElementById('editor').value;
  const processed = preprocessContent(raw);
  const html = marked.parse(processed);
  const enhanced = postprocessHTML(html);
  document.getElementById('previewInner').innerHTML = enhanced;
  Prism.highlightAllUnder(document.getElementById('previewInner'));
  updateEditorStats(raw);
}

// ── PREPROCESS: Handle special blocks before markdown ──
function preprocessContent(text) {
  // Page breaks
  text = text.replace(/---PAGE BREAK---/gi, '\n\n<div class="page-break"></div>\n\n');

  // Alert boxes: NOTE, IMPORTANT, TIP, WARNING
  text = text.replace(/^(NOTE|IMPORTANT|TIP|WARNING):\s*(.+)$/gim, (_, type, content) => {
    const icons = { NOTE: '📌', IMPORTANT: '⚠️', TIP: '💡', WARNING: '🚨' };
    const cls = type.toLowerCase();
    return `<div class="alert-box ${cls}"><span class="alert-icon">${icons[type]}</span><div class="alert-content"><span class="alert-label">${type}</span>${content}</div></div>`;
  });

  // Q&A pattern: Q1. or Q. or Q:
  text = text.replace(/^(Q\d*[:.]\s*.+?)(?=\nA[:.])(.|\n)*?(?=\n(?:Q\d*[:.] |#{1,6} |\n\n|$))/gim, (match) => {
    return match; // handled in postprocess
  });

  // Output / Result blocks (multi-line)
  text = text.replace(/^(Output:|Result:|Output\s*:)\s*\n([\s\S]*?)(?=\n\n|\n#|\n```|$)/gim, (_, label, content) => {
    return `<div class="terminal-output"><div class="terminal-header"><div class="window-dots"><span class="dot-red"></span><span class="dot-yellow"></span><span class="dot-green"></span></div><span class="terminal-title">Terminal — ${label.trim()}</span></div><div class="terminal-body">${escapeHtml(content.trim())}</div></div>`;
  });

  return text;
}

// ── POSTPROCESS: Parse Q&A blocks and code windows from HTML ──
function postprocessHTML(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Handle Q&A paragraphs
  doc.querySelectorAll('p').forEach(p => {
    const text = p.textContent;
    const qMatch = text.match(/^(Q\d*[:.]\s*)(.+)/);
    if (qMatch) {
      const num = qMatch[1].trim().replace(':', '').replace('.', '');
      const qText = qMatch[2].trim();
      // Look for answer in next sibling
      let answerHTML = '';
      let next = p.nextElementSibling;
      if (next && /^A[:.]/i.test(next.textContent.trim())) {
        answerHTML = `<div class="q-card-body">${next.textContent.replace(/^A[:.]\s*/i, '')}</div>`;
        next.remove();
      }
      const card = doc.createElement('div');
      card.className = 'q-card';
      card.innerHTML = `<div class="q-card-header"><span class="q-badge">${num}</span><div class="q-text">${qText}</div></div>${answerHTML}`;
      p.replaceWith(card);
    }
  });

  // Handle code blocks — replace pre>code with .code-window
  doc.querySelectorAll('pre > code').forEach(code => {
    const langClass = code.className || '';
    const langMatch = langClass.match(/language-(\w+)/);
    const lang = langMatch ? langMatch[1] : 'code';
    const id = 'cb' + (++codeBlockCounter);
    const pre = code.parentElement;

    const wrapper = doc.createElement('div');
    wrapper.className = 'code-window';
    wrapper.innerHTML = `
      <div class="code-window-header">
        <div class="window-dots">
          <span class="dot-red"></span>
          <span class="dot-yellow"></span>
          <span class="dot-green"></span>
        </div>
        <span class="window-filename">${lang}</span>
        <button class="copy-btn" onclick="copyCode('${id}')">Copy</button>
      </div>
      <div class="code-window-body" id="${id}">
        <pre class="language-${lang}"><code class="language-${lang}">${code.innerHTML}</code></pre>
      </div>
    `;
    pre.replaceWith(wrapper);
  });

  return doc.body.innerHTML;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── EDITOR INPUT HANDLER ──
function onEditorInput() {
  renderPreview();
  triggerAutoSave();
  updateEditorStats(document.getElementById('editor').value);
}

function updateEditorStats(text) {
  const chars = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const lines = text.split('\n').length;
  document.getElementById('charCount').textContent = chars + ' chars';
  document.getElementById('wordCount').textContent = words + ' words';
  document.getElementById('lineCount').textContent = lines + ' lines';
}

// ── AUTO SAVE ──
function triggerAutoSave() {
  clearTimeout(autoSaveTimer);
  document.getElementById('autosaveIndicator').textContent = '● Saving...';
  document.getElementById('autosaveIndicator').style.color = 'var(--note-color)';
  autoSaveTimer = setTimeout(() => {
    localStorage.setItem('dns_content', document.getElementById('editor').value);
    document.getElementById('autosaveIndicator').textContent = '✓ Saved';
    document.getElementById('autosaveIndicator').style.color = 'var(--tip-color)';
  }, 800);
}

function loadSavedContent() {
  const saved = localStorage.getItem('dns_content');
  if (saved) document.getElementById('editor').value = saved;
}

// ── THEMES ──
const THEMES = {
  vscode: { '--bg-app':'#0d1117','--bg-sidebar':'#161b22','--bg-editor':'#0f172a','--preview-bg':'#1a1f2e','--border-color':'#30363d','--heading-color':'#79c0ff','--body-text':'#c9d1d9','--accent-color':'#00d2ff','--glow-color':'#00d2ff','--card-bg':'#1e2836cc','--code-bg':'#0d1117','--code-text':'#e6edf3','--q-color':'#00d2ff','--warning-color':'#ff7b72','--tip-color':'#3fb950','--note-color':'#d29922','--shadow-color':'#00d2ff33','--bg-navbar':'#0d1117cc' },
  dracula: { '--bg-app':'#282a36','--bg-sidebar':'#21222c','--bg-editor':'#282a36','--preview-bg':'#282a36','--border-color':'#44475a','--heading-color':'#bd93f9','--body-text':'#f8f8f2','--accent-color':'#bd93f9','--glow-color':'#bd93f9','--card-bg':'#44475acc','--code-bg':'#21222c','--code-text':'#f8f8f2','--q-color':'#8be9fd','--note-color':'#f1fa8c','--tip-color':'#50fa7b','--warning-color':'#ff5555','--bg-navbar':'#21222ccc' },
  monokai: { '--bg-app':'#272822','--bg-sidebar':'#1e1f1c','--bg-editor':'#272822','--preview-bg':'#272822','--border-color':'#49483e','--heading-color':'#a6e22e','--body-text':'#f8f8f2','--accent-color':'#a6e22e','--glow-color':'#a6e22e','--card-bg':'#3e3d32cc','--code-bg':'#1e1f1c','--code-text':'#f8f8f2','--q-color':'#66d9e8','--note-color':'#e6db74','--tip-color':'#a6e22e','--warning-color':'#f92672','--bg-navbar':'#1e1f1ccc' },
  onedark: { '--bg-app':'#282c34','--bg-sidebar':'#21252b','--bg-editor':'#282c34','--preview-bg':'#282c34','--border-color':'#3e4452','--heading-color':'#61afef','--body-text':'#abb2bf','--accent-color':'#61afef','--glow-color':'#61afef','--card-bg':'#3e4452cc','--code-bg':'#21252b','--code-text':'#abb2bf','--q-color':'#c678dd','--note-color':'#e5c07b','--tip-color':'#98c379','--warning-color':'#e06c75','--bg-navbar':'#21252bcc' },
  minimal: { '--bg-app':'#f5f5f5','--bg-sidebar':'#ffffff','--bg-editor':'#fafafa','--preview-bg':'#ffffff','--border-color':'#e0e0e0','--heading-color':'#1a1a1a','--body-text':'#333333','--accent-color':'#2563eb','--glow-color':'#2563eb','--card-bg':'#f0f0f0cc','--code-bg':'#f5f5f5','--code-text':'#333333','--q-color':'#2563eb','--note-color':'#d97706','--tip-color':'#16a34a','--warning-color':'#dc2626','--bg-navbar':'#ffffffcc','--shadow-color':'#2563eb22' },
  obsidian: { '--bg-app':'#0f0f0f','--bg-sidebar':'#1a1a1a','--bg-editor':'#141414','--preview-bg':'#1a1a1a','--border-color':'#333','--heading-color':'#7f6df2','--body-text':'#dcddde','--accent-color':'#7f6df2','--glow-color':'#7f6df2','--card-bg':'#252525cc','--code-bg':'#0f0f0f','--code-text':'#dcddde','--q-color':'#a991f2','--note-color':'#d29922','--tip-color':'#3fb950','--warning-color':'#ff7b72','--bg-navbar':'#1a1a1acc' },
  cyberpunk: { '--bg-app':'#0a0010','--bg-sidebar':'#0f0018','--bg-editor':'#050008','--preview-bg':'#0a0010','--border-color':'#ff009060','--heading-color':'#ff0090','--body-text':'#e0aaff','--accent-color':'#00ffff','--glow-color':'#ff0090','--card-bg':'#1a002bcc','--code-bg':'#050008','--code-text':'#00ffff','--q-color':'#00ffff','--note-color':'#ffff00','--tip-color':'#00ff9f','--warning-color':'#ff0090','--bg-navbar':'#0f0018cc','--glow-size':'20px' },
  amoled: { '--bg-app':'#000000','--bg-sidebar':'#0a0a0a','--bg-editor':'#000000','--preview-bg':'#000000','--border-color':'#1a1a1a','--heading-color':'#00ff9f','--body-text':'#cccccc','--accent-color':'#00ff9f','--glow-color':'#00ff9f','--card-bg':'#0d0d0dcc','--code-bg':'#050505','--code-text':'#00ff9f','--q-color':'#00ff9f','--note-color':'#ffff00','--tip-color':'#00ff9f','--warning-color':'#ff4444','--bg-navbar':'#000000cc' },
  hacker: { '--bg-app':'#001100','--bg-sidebar':'#001a00','--bg-editor':'#000d00','--preview-bg':'#001100','--border-color':'#00440060','--heading-color':'#00ff41','--body-text':'#00cc33','--accent-color':'#00ff41','--glow-color':'#00ff41','--card-bg':'#002200cc','--code-bg':'#000800','--code-text':'#00ff41','--q-color':'#00ff41','--note-color':'#88ff00','--tip-color':'#00ff41','--warning-color':'#ffff00','--bg-navbar':'#001a00cc' },
  pastel: { '--bg-app':'#fef6fb','--bg-sidebar':'#fff0f8','--bg-editor':'#fef6fb','--preview-bg':'#fff8fd','--border-color':'#f0c4e4','--heading-color':'#c24d8e','--body-text':'#4a3050','--accent-color':'#e8a0c8','--glow-color':'#e8a0c8','--card-bg':'#ffe8f4cc','--code-bg':'#fff0f8','--code-text':'#6b3080','--q-color':'#9b59b6','--note-color':'#e8963a','--tip-color':'#4caf6e','--warning-color':'#e05555','--bg-navbar':'#fef6fbcc','--shadow-color':'#e8a0c830' },
};

function applyTheme(name) {
  currentTheme = name;
  const vars = THEMES[name];
  if (!vars) return;
  const root = document.documentElement;
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
  // Update body data attr for CSS selectors
  document.body.removeAttribute('data-theme');
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.theme-btn[data-theme="${name}"]`)?.classList.add('active');
  updateColorPickers();
  renderPreview();
  showToast(`Theme: ${name}`, 'success');
}

function updateColorPickers() {
  const root = getComputedStyle(document.documentElement);
  const map = {
    'c-previewBg': '--preview-bg',
    'c-heading': '--heading-color',
    'c-body': '--body-text',
    'c-accent': '--accent-color',
    'c-codeBg': '--code-bg',
    'c-codeText': '--code-text',
    'c-cardBg': '--card-bg',
    'c-glow': '--glow-color',
  };
  Object.entries(map).forEach(([id, varName]) => {
    const el = document.getElementById(id);
    if (el) {
      const val = root.getPropertyValue(varName).trim();
      // Only set if valid hex
      if (/^#[0-9a-f]{3,8}/i.test(val)) el.value = val.slice(0, 7);
    }
  });
}

function applyColor(varName, value) {
  document.documentElement.style.setProperty(varName, value);
  renderPreview();
}

function applyFont() {
  const val = document.getElementById('bodyFont').value;
  document.documentElement.style.setProperty('--body-font', val);
  renderPreview();
}

function applyFontSize(v) {
  document.documentElement.style.setProperty('--font-size', v + 'px');
  document.getElementById('fontSizeVal').textContent = v + 'px';
  renderPreview();
}

function applyLineHeight(v) {
  document.documentElement.style.setProperty('--line-height', v);
  document.getElementById('lineHeightVal').textContent = v;
  renderPreview();
}

function applyGlow(v) {
  document.documentElement.style.setProperty('--glow-size', v + 'px');
  document.getElementById('glowVal').textContent = v + 'px';
  renderPreview();
}

function applyBorderRadius(v) {
  document.documentElement.style.setProperty('--radius', v + 'px');
  document.getElementById('radiusVal').textContent = v + 'px';
  renderPreview();
}

function applyBlur(v) {
  document.documentElement.style.setProperty('--blur-val', v + 'px');
  document.getElementById('blurVal').textContent = v + 'px';
  renderPreview();
}

function applyExportPadding(v) {
  document.documentElement.style.setProperty('--export-padding', v + 'px');
  document.getElementById('paddingVal').textContent = v + 'px';
}

function toggleAnimatedBg(on) {
  document.getElementById('previewContent').classList.toggle('animated-bg', on);
}

function toggleGridOverlay(on) {
  document.getElementById('gridOverlayLayer').classList.toggle('active', on);
}

function toggleWatermark(on) {
  document.getElementById('watermarkText').classList.toggle('active', on);
}

// ── ZOOM ──
function zoomPreview(delta) {
  zoomLevel = Math.min(200, Math.max(30, zoomLevel + delta));
  document.getElementById('previewContent').style.transform = `scale(${zoomLevel / 100})`;
  document.getElementById('zoomDisplay').textContent = zoomLevel + '%';
}

function resetZoom() {
  zoomLevel = 100;
  document.getElementById('previewContent').style.transform = 'scale(1)';
  document.getElementById('zoomDisplay').textContent = '100%';
}

function toggleA4Mode() {
  a4Mode = !a4Mode;
  document.getElementById('previewContent').classList.toggle('a4-mode', a4Mode);
  document.getElementById('a4ModeBtn').style.color = a4Mode ? 'var(--accent-color)' : '';
  showToast(a4Mode ? 'A4 Mode ON' : 'A4 Mode OFF');
}

// ── SIDEBAR SECTIONS ──
function toggleSection(header) {
  const body = header.nextElementSibling;
  header.classList.toggle('collapsed');
  body.classList.toggle('hidden');
}

// ── MOBILE TAB SWITCHING ──
function switchMobileTab(tab) {
  const editor = document.getElementById('editorPanel');
  const preview = document.getElementById('previewPanel');
  const sidebar = document.getElementById('sidebar');
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.nav-tab[data-tab="${tab}"]`).classList.add('active');

  if (tab === 'editor') {
    editor.classList.remove('hidden');
    preview.classList.remove('visible');
    sidebar.classList.remove('mobile-open');
  } else if (tab === 'preview') {
    editor.classList.add('hidden');
    preview.classList.add('visible');
    sidebar.classList.remove('mobile-open');
  } else if (tab === 'settings') {
    editor.classList.remove('hidden');
    preview.classList.remove('visible');
    sidebar.classList.toggle('mobile-open');
  }
}

// ── HELP MODAL ──
function toggleHelp() {
  document.getElementById('helpOverlay').classList.toggle('active');
}

function switchHelpTab(btn, panel) {
  document.querySelectorAll('.help-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.help-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('help-' + panel).classList.add('active');
}

// ── EDITOR TOOLS ──
function insertTemplate(type) {
  const editor = document.getElementById('editor');
  const templates = {
    qna: '\nQ1. What is [Topic]?\n\nA: [Answer here...]\n\nQ2. Explain [Concept]?\n\nA: [Explanation...]\n',
    code: '\n```python\n# Your code here\nprint("Hello, World!")\n```\n\nOutput:\nHello, World!\n',
    note: '\nNOTE: This is an important note about the topic.\n\nIMPORTANT: Remember this key concept.\n\nTIP: Here is a helpful tip.\n',
    table: '\n| Feature | Description | Example |\n|---------|-------------|--------|\n| Item 1 | Detail here | Example |\n| Item 2 | Detail here | Example |\n',
  };
  const t = templates[type] || '';
  const pos = editor.selectionStart;
  editor.value = editor.value.slice(0, pos) + t + editor.value.slice(pos);
  editor.focus();
  renderPreview();
}

function insertPageBreak() {
  const editor = document.getElementById('editor');
  const pos = editor.selectionStart;
  const pb = '\n\n---PAGE BREAK---\n\n';
  editor.value = editor.value.slice(0, pos) + pb + editor.value.slice(pos);
  editor.focus();
  renderPreview();
  showToast('Page break inserted');
}

function clearEditor() {
  if (confirm('Clear all content?')) {
    document.getElementById('editor').value = '';
    renderPreview();
    showToast('Editor cleared');
  }
}

function loadSample() {
  document.getElementById('editor').value = SAMPLE_CONTENT;
  renderPreview();
  showToast('Sample loaded!', 'success');
}

// ── COPY CODE ──
function copyCode(id) {
  const el = document.getElementById(id);
  const code = el?.querySelector('code');
  if (!code) return;
  navigator.clipboard.writeText(code.textContent).then(() => {
    const btn = el.previousElementSibling?.querySelector('.copy-btn');
    if (btn) {
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
    }
  });
}

// ── DRAG & DROP ──
function initDragDrop() {
  const zone = document.getElementById('dropZone');
  const overlay = document.getElementById('dropOverlay');
  zone.addEventListener('dragover', e => { e.preventDefault(); overlay.classList.add('active'); });
  zone.addEventListener('dragleave', () => overlay.classList.remove('active'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    overlay.classList.remove('active');
    const file = e.dataTransfer.files[0];
    if (file && (file.type === 'text/plain' || file.type === 'text/markdown' || file.name.endsWith('.md'))) {
      const reader = new FileReader();
      reader.onload = ev => {
        document.getElementById('editor').value = ev.target.result;
        renderPreview();
        showToast('File loaded: ' + file.name, 'success');
      };
      reader.readAsText(file);
    } else {
      showToast('Only .md or .txt files supported', 'error');
    }
  });
}

// ── KEYBOARD SHORTCUTS ──
function initKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'h') { e.preventDefault(); toggleHelp(); }
      if (e.key === 's') { e.preventDefault(); localStorage.setItem('dns_content', document.getElementById('editor').value); showToast('Saved!', 'success'); }
      if (e.key === 'e') { e.preventDefault(); exportPDF(); }
      if (e.key === 'P' && e.shiftKey) { e.preventDefault(); exportPNG(); }
    }
    // Tab in editor
    if (e.key === 'Tab' && e.target.id === 'editor') {
      e.preventDefault();
      const t = e.target;
      const s = t.selectionStart;
      t.value = t.value.slice(0, s) + '  ' + t.value.slice(t.selectionEnd);
      t.selectionStart = t.selectionEnd = s + 2;
    }
  });
}

// ── EXPORT SYSTEM ──
function showExportLoading(msg) {
  let el = document.getElementById('exportLoading');
  if (!el) {
    el = document.createElement('div');
    el.id = 'exportLoading';
    el.className = 'export-loading';
    el.innerHTML = `<div class="spinner"></div><div class="loading-text" id="loadingText"></div>`;
    document.body.appendChild(el);
  }
  el.querySelector('#loadingText').textContent = msg;
  el.classList.add('active');
}
function hideExportLoading() {
  document.getElementById('exportLoading')?.classList.remove('active');
}

function getScale() {
  const q = document.getElementById('exportQuality').value;
  return q === 'standard' ? 1 : q === 'high' ? 2 : 4;
}

function quickExportPDF() { exportPDF(); }

async function exportPDF() {
  showExportLoading('Generating PDF...');
  await new Promise(r => setTimeout(r, 100));
  try {
    const ratio = document.getElementById('exportRatio').value;
    const isLandscape = ratio === 'a4landscape';
    const el = document.getElementById('previewContent');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
    const scale = getScale();
    const canvas = await html2canvas(el, {
      scale,
      useCORS: true,
      backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--preview-bg').trim() || '#1a1f2e',
    });
    const imgW = isLandscape ? 297 : 210;
    const imgH = isLandscape ? 210 : 297;
    const pageH = imgH;
    const canvH = canvas.height;
    const canvW = canvas.width;
    const ratio2 = canvW / imgW;
    const totalPageH = canvH / ratio2;
    let y = 0;
    let pageNum = 1;
    while (y < totalPageH) {
      if (pageNum > 1) pdf.addPage();
      const srcY = y * ratio2;
      const srcH = Math.min(pageH * ratio2, canvH - srcY);
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvW;
      pageCanvas.height = srcH;
      pageCanvas.getContext('2d').drawImage(canvas, 0, srcY, canvW, srcH, 0, 0, canvW, srcH);
      pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, imgW, srcH / ratio2);
      // Footer
      pdf.setFontSize(8);
      pdf.setTextColor(150);
      pdf.text(`DevNotes Studio — Page ${pageNum}`, imgW / 2, imgH - 5, { align: 'center' });
      y += pageH;
      pageNum++;
    }
    pdf.save('devnotes-export.pdf');
    showToast('PDF exported!', 'success');
  } catch (e) {
    showToast('Export failed: ' + e.message, 'error');
  }
  hideExportLoading();
}

async function exportPNG() {
  showExportLoading('Rendering PNG...');
  await new Promise(r => setTimeout(r, 100));
  try {
    const scale = getScale();
    const el = document.getElementById('previewContent');
    const canvas = await html2canvas(el, {
      scale,
      useCORS: true,
      backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--preview-bg').trim(),
    });
    const link = document.createElement('a');
    link.download = 'devnotes-export.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast('PNG exported!', 'success');
  } catch (e) {
    showToast('Export failed: ' + e.message, 'error');
  }
  hideExportLoading();
}

async function exportJPG() {
  showExportLoading('Rendering JPG...');
  await new Promise(r => setTimeout(r, 100));
  try {
    const scale = getScale();
    const el = document.getElementById('previewContent');
    const canvas = await html2canvas(el, {
      scale,
      useCORS: true,
      backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--preview-bg').trim(),
    });
    const link = document.createElement('a');
    link.download = 'devnotes-export.jpg';
    link.href = canvas.toDataURL('image/jpeg', 0.92);
    link.click();
    showToast('JPG exported!', 'success');
  } catch (e) {
    showToast('Export failed: ' + e.message, 'error');
  }
  hideExportLoading();
}

function exportHTML() {
  const previewHTML = document.getElementById('previewContent').innerHTML;
  const styles = Array.from(document.styleSheets)
    .filter(s => { try { return s.cssRules; } catch { return false; } })
    .map(s => Array.from(s.cssRules).map(r => r.cssText).join('\n'))
    .join('\n');
  const root = document.documentElement;
  const cssVars = Array.from(root.style).map(k => `${k}: ${root.style.getPropertyValue(k)};`).join('\n');
  const blob = new Blob([`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>DevNotes Export</title><style>:root{${cssVars}}${styles}</style></head><body style="background:var(--preview-bg);padding:40px">${previewHTML}</body></html>`], { type: 'text/html' });
  const link = document.createElement('a');
  link.download = 'devnotes-export.html';
  link.href = URL.createObjectURL(blob);
  link.click();
  showToast('HTML exported!', 'success');
}

function exportMD() {
  const md = document.getElementById('editor').value;
  const blob = new Blob([md], { type: 'text/markdown' });
  const link = document.createElement('a');
  link.download = 'devnotes-export.md';
  link.href = URL.createObjectURL(blob);
  link.click();
  showToast('Markdown exported!', 'success');
}

// ── CUSTOM THEMES ──
function getCurrentVars() {
  const root = document.documentElement;
  const vars = {};
  const keys = ['--bg-app','--bg-sidebar','--bg-editor','--preview-bg','--border-color','--heading-color','--body-text','--accent-color','--glow-color','--card-bg','--code-bg','--code-text','--q-color','--warning-color','--tip-color','--note-color'];
  keys.forEach(k => { vars[k] = root.style.getPropertyValue(k) || getComputedStyle(root).getPropertyValue(k).trim(); });
  return vars;
}

function saveCustomTheme() {
  const name = document.getElementById('themeName').value.trim();
  if (!name) { showToast('Enter a theme name', 'error'); return; }
  savedThemes[name] = getCurrentVars();
  localStorage.setItem('dns_themes', JSON.stringify(savedThemes));
  renderSavedThemesList();
  showToast('Theme saved: ' + name, 'success');
  document.getElementById('themeName').value = '';
}

function applyCustomTheme(name) {
  const vars = savedThemes[name];
  if (!vars) return;
  const root = document.documentElement;
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
  updateColorPickers();
  renderPreview();
  showToast('Applied: ' + name, 'success');
}

function deleteCustomTheme(name) {
  delete savedThemes[name];
  localStorage.setItem('dns_themes', JSON.stringify(savedThemes));
  renderSavedThemesList();
  showToast('Deleted: ' + name);
}

function renderSavedThemesList() {
  const el = document.getElementById('savedThemesList');
  el.innerHTML = '';
  Object.keys(savedThemes).forEach(name => {
    const div = document.createElement('div');
    div.className = 'saved-theme-item';
    div.innerHTML = `<span>${name}</span><div><button onclick="applyCustomTheme('${name}')">Apply</button><button onclick="deleteCustomTheme('${name}')">✕</button></div>`;
    el.appendChild(div);
  });
}

function exportTheme() {
  const vars = getCurrentVars();
  const blob = new Blob([JSON.stringify(vars, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.download = 'devnotes-theme.json';
  link.href = URL.createObjectURL(blob);
  link.click();
  showToast('Theme exported!', 'success');
}

function importThemeFile() {
  document.getElementById('themeFileInput').click();
}

function handleThemeImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const vars = JSON.parse(e.target.result);
      const root = document.documentElement;
      Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
      updateColorPickers();
      renderPreview();
      showToast('Theme imported!', 'success');
    } catch {
      showToast('Invalid theme file', 'error');
    }
  };
  reader.readAsText(file);
}

function resetTheme() {
  applyTheme(currentTheme);
  showToast('Theme reset', 'success');
}

// ── TOAST ──
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.className = 'toast'; }, 2500);
}

// ── SAMPLE CONTENT ──
const SAMPLE_CONTENT = `# Data Structures & Algorithms
## Unit 1: Linear Data Structures

NOTE: This material covers BCA Semester 3 topics. Perfect for exam preparation!

---

Q1. What is a Stack? Explain its operations.

A: A **Stack** is a linear data structure that follows the **LIFO** (Last In First Out) principle. The last element inserted is the first one to be removed.

**Operations:**
- **Push** — Insert element at top
- **Pop** — Remove element from top
- **Peek** — View top element
- **isEmpty** — Check if stack is empty

\`\`\`python
# Stack implementation in Python
class Stack:
    def __init__(self):
        self.items = []
    
    def push(self, item):
        self.items.append(item)
    
    def pop(self):
        if not self.is_empty():
            return self.items.pop()
    
    def peek(self):
        return self.items[-1] if self.items else None
    
    def is_empty(self):
        return len(self.items) == 0

# Usage
s = Stack()
s.push(10)
s.push(20)
s.push(30)
print(s.pop())   # Output: 30
print(s.peek())  # Output: 20
\`\`\`

Output:
30
20

---

Q2. What is a Queue? Differentiate between Stack and Queue.

A: A **Queue** is a linear data structure that follows **FIFO** (First In First Out) principle.

| Property | Stack | Queue |
|----------|-------|-------|
| Principle | LIFO | FIFO |
| Insertion | Push (top) | Enqueue (rear) |
| Deletion | Pop (top) | Dequeue (front) |
| Usage | Undo, recursion | Scheduling, BFS |

\`\`\`java
// Queue in Java using LinkedList
import java.util.Queue;
import java.util.LinkedList;

Queue<Integer> queue = new LinkedList<>();
queue.add(1);    // enqueue
queue.add(2);
queue.add(3);
System.out.println(queue.poll()); // dequeue → 1
\`\`\`

---

Q3. What is a Linked List? Write a program to implement it.

A: A **Linked List** is a sequence of nodes where each node contains data and a pointer to the next node.

\`\`\`c
// Singly Linked List in C
#include <stdio.h>
#include <stdlib.h>

struct Node {
    int data;
    struct Node* next;
};

void printList(struct Node* head) {
    while (head != NULL) {
        printf("%d → ", head->data);
        head = head->next;
    }
    printf("NULL\\n");
}

int main() {
    struct Node* head = NULL;
    // Create nodes
    struct Node* n1 = malloc(sizeof(struct Node));
    n1->data = 10;
    n1->next = NULL;
    head = n1;
    printList(head);
    return 0;
}
\`\`\`

Output:
10 → NULL

---

IMPORTANT: Always analyze Time Complexity and Space Complexity in exams!

| Algorithm | Best | Average | Worst | Space |
|-----------|------|---------|-------|-------|
| Bubble Sort | O(n) | O(n²) | O(n²) | O(1) |
| Merge Sort | O(n log n) | O(n log n) | O(n log n) | O(n) |
| Binary Search | O(1) | O(log n) | O(log n) | O(1) |

TIP: For tree traversal questions, always draw the tree first, then trace the algorithm.

WARNING: Don't confuse DFS with BFS — know which uses Stack vs Queue!

---PAGE BREAK---

## Unit 2: Trees & Graphs

Q4. What is a Binary Search Tree (BST)?

A: A **BST** is a binary tree where for every node:
- Left subtree values < Node value
- Right subtree values > Node value

\`\`\`python
class BST:
    def __init__(self, val):
        self.val = val
        self.left = None
        self.right = None
    
    def insert(self, val):
        if val < self.val:
            if self.left: self.left.insert(val)
            else: self.left = BST(val)
        else:
            if self.right: self.right.insert(val)
            else: self.right = BST(val)
\`\`\`
`;
