// ── Media library ──────────────────────────────────────────────────────────────

let currentPage = 1;
let totalPages = 1;
let selectedItem = null;
let pendingDeleteId = null;

async function fetchMedia() {
  const grid = document.getElementById('mediaGrid');
  grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)"><span class="spinner"></span></div>`;

  const res = await apiFetch(`/api/media?page=${currentPage}&limit=24`);
  if (!res) return;
  const { items, total, totalPages: tp } = await res.json();
  totalPages = tp || 1;

  document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${totalPages}`;
  document.getElementById('prevBtn').disabled = currentPage <= 1;
  document.getElementById('nextBtn').disabled = currentPage >= totalPages;

  if (!items.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--text-muted)">No media uploaded yet.</div>`;
    return;
  }

  grid.innerHTML = items.map(item => `
    <div class="media-item" data-id="${item.id}" data-url="${escAttr(item.url)}"
         data-name="${escAttr(item.originalName)}" data-size="${item.size}" data-type="${escAttr(item.mimeType)}">
      <img src="${escAttr(item.url)}" alt="${escAttr(item.originalName)}" loading="lazy">
      <div class="media-item-info">
        <div class="media-item-name">${escHtml(item.originalName)}</div>
      </div>
      <button class="media-item-delete" data-id="${item.id}" title="Delete">×</button>
    </div>
  `).join('');

  grid.querySelectorAll('.media-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.classList.contains('media-item-delete')) return;
      openImageModal({
        id: el.dataset.id, url: el.dataset.url,
        originalName: el.dataset.name, size: el.dataset.size, mimeType: el.dataset.type,
      });
    });
  });

  grid.querySelectorAll('.media-item-delete').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      pendingDeleteId = btn.dataset.id;
      document.getElementById('deleteModal').classList.add('open');
    });
  });
}

function openImageModal(item) {
  selectedItem = item;
  document.getElementById('modalImg').src = item.url;
  document.getElementById('modalUrl').value = item.url;
  document.getElementById('modalMeta').textContent =
    `${item.originalName} · ${formatFileSize(parseInt(item.size))} · ${item.mimeType}`;
  document.getElementById('imageModal').classList.add('open');
}

async function uploadFiles(files) {
  if (!files.length) return;
  const progress = document.getElementById('uploadProgress');
  const status = document.getElementById('uploadStatus');
  progress.style.display = 'block';

  let done = 0;
  const errors = [];

  for (const file of files) {
    status.textContent = `Uploading ${file.name} (${done + 1}/${files.length})…`;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json();
        errors.push(`${file.name}: ${err.error || 'failed'}`);
      }
      done++;
    } catch {
      errors.push(`${file.name}: network error`);
    }
  }

  progress.style.display = 'none';
  if (errors.length) {
    showToast('Some uploads failed: ' + errors.join('; '), 'error');
  } else {
    showToast(`${done} file${done !== 1 ? 's' : ''} uploaded`, 'success');
  }
  currentPage = 1;
  fetchMedia();
}

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s) { return String(s).replace(/"/g,'&quot;'); }

document.addEventListener('DOMContentLoaded', () => {
  fetchMedia();

  // File input
  document.getElementById('fileInput').addEventListener('change', function () {
    uploadFiles(Array.from(this.files));
    this.value = '';
  });

  // Drag and drop
  const dropZone = document.getElementById('dropZone');
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    uploadFiles(Array.from(e.dataTransfer.files));
  });
  dropZone.addEventListener('click', () => document.getElementById('fileInput').click());

  // Pagination
  document.getElementById('prevBtn').addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; fetchMedia(); }
  });
  document.getElementById('nextBtn').addEventListener('click', () => {
    if (currentPage < totalPages) { currentPage++; fetchMedia(); }
  });

  // Image modal
  document.getElementById('copyUrlBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(document.getElementById('modalUrl').value);
    showToast('URL copied to clipboard', 'success');
  });
  document.getElementById('closeModalBtn').addEventListener('click', () => {
    document.getElementById('imageModal').classList.remove('open');
    selectedItem = null;
  });
  document.getElementById('deleteMediaBtn').addEventListener('click', () => {
    if (!selectedItem) return;
    pendingDeleteId = selectedItem.id;
    document.getElementById('imageModal').classList.remove('open');
    document.getElementById('deleteModal').classList.add('open');
  });

  // Delete modal
  document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
    document.getElementById('deleteModal').classList.remove('open');
    pendingDeleteId = null;
  });
  document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    const btn = document.getElementById('confirmDeleteBtn');
    btn.disabled = true; btn.textContent = 'Deleting…';
    const res = await apiFetch(`/api/media/${pendingDeleteId}`, { method: 'DELETE' });
    document.getElementById('deleteModal').classList.remove('open');
    pendingDeleteId = null;
    btn.disabled = false; btn.textContent = 'Delete';
    if (res?.ok) { showToast('Image deleted', 'success'); fetchMedia(); }
    else showToast('Failed to delete', 'error');
  });

  // Close modals on backdrop click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
});
