// ── Post editor ────────────────────────────────────────────────────────────────

let mde;
let postId = null;
let tags = [];
let coverImageUrl = null;

function getPostIdFromUrl() {
  const parts = window.location.pathname.split('/');
  const idx = parts.indexOf('editor');
  return idx !== -1 && parts[idx + 1] ? parts[idx + 1] : null;
}

function initEditor() {
  mde = new EasyMDE({
    element: document.getElementById('mdEditor'),
    spellChecker: false,
    autosave: { enabled: true, uniqueId: 'cms-editor-draft', delay: 5000 },
    toolbar: [
      'bold', 'italic', 'heading', '|',
      'quote', 'unordered-list', 'ordered-list', '|',
      'link', 'image', '|',
      'preview', 'side-by-side', 'fullscreen', '|',
      'guide',
    ],
    placeholder: 'Write your post in Markdown…',
    status: ['lines', 'words'],
  });

  // Image button — open media picker
  mde.codemirror.on('change', () => {
    // Autosave hint
  });
}

function renderTags() {
  const wrap = document.getElementById('tagsWrap');
  const input = document.getElementById('tagInput');
  // Remove existing pills
  wrap.querySelectorAll('.tag-pill').forEach(p => p.remove());
  tags.forEach((tag, i) => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.innerHTML = `#${escHtml(tag)} <button type="button" data-i="${i}">×</button>`;
    pill.querySelector('button').addEventListener('click', () => {
      tags.splice(i, 1); renderTags();
    });
    wrap.insertBefore(pill, input);
  });
}

function setCover(url) {
  coverImageUrl = url;
  if (url) {
    document.getElementById('coverImg').src = url;
    document.getElementById('coverPreview').style.display = 'block';
    document.getElementById('coverEmpty').style.display = 'none';
  } else {
    document.getElementById('coverPreview').style.display = 'none';
    document.getElementById('coverEmpty').style.display = 'block';
  }
}

function collectData() {
  const status = document.getElementById('statusSelect').value;
  const publishAt = document.getElementById('publishAtInput').value;
  const slug = document.getElementById('slugInput').value.trim() ||
    slugify(document.getElementById('titleInput').value.trim());

  return {
    title: document.getElementById('titleInput').value.trim(),
    slug,
    content: mde.value(),
    excerpt: document.getElementById('excerptInput').value.trim(),
    status,
    publishAt: status === 'scheduled' && publishAt ? new Date(publishAt).toISOString() : null,
    tags,
    coverImage: coverImageUrl || null,
  };
}

async function savePost(overrideStatus) {
  const data = collectData();
  if (overrideStatus) data.status = overrideStatus;

  if (!data.title) { showToast('Title is required', 'error'); return; }
  if (data.status === 'scheduled' && !data.publishAt) {
    showToast('Please set a publish date for scheduled posts', 'error'); return;
  }

  const btn = document.getElementById('saveBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner" style="border-top-color:#fff;border-color:rgba(255,255,255,.3)"></span>';

  const method = postId ? 'PUT' : 'POST';
  const url = postId ? `/api/posts/${postId}` : '/api/posts';

  const res = await apiFetch(url, {
    method,
    body: JSON.stringify(data),
  });

  btn.disabled = false; btn.textContent = 'Save';

  if (!res) return;
  const result = await res.json();

  if (res.ok) {
    if (!postId) {
      postId = result.id;
      history.replaceState(null, '', `/admin/editor/${postId}`);
      document.getElementById('pageTitle').textContent = 'Edit Post';
    }
    showToast(
      data.status === 'published' ? 'Post published!' :
      data.status === 'scheduled' ? 'Post scheduled' : 'Draft saved',
      'success'
    );
  } else {
    showToast(result.error || 'Failed to save', 'error');
  }
}

async function loadPost(id) {
  const res = await apiFetch(`/api/posts/${id}`);
  if (!res?.ok) { showToast('Failed to load post', 'error'); return; }
  const post = await res.json();

  document.getElementById('pageTitle').textContent = 'Edit Post';
  document.getElementById('titleInput').value = post.title || '';
  document.getElementById('excerptInput').value = post.excerpt || '';
  document.getElementById('slugInput').value = post.slug || '';
  document.getElementById('slugPreview').textContent = post.slug || '…';
  document.getElementById('statusSelect').value = post.status || 'draft';

  if (post.status === 'scheduled') {
    document.getElementById('scheduleGroup').style.display = 'block';
    if (post.publishAt?._seconds) {
      const d = new Date(post.publishAt._seconds * 1000);
      document.getElementById('publishAtInput').value = d.toISOString().slice(0, 16);
    }
  }

  tags = post.tags || [];
  renderTags();

  if (post.coverImage) setCover(post.coverImage);

  mde.value(post.content || '');
  // Clear autosave for this specific post
  mde.clearAutosavedValue();
}

async function loadMediaForPicker() {
  const res = await apiFetch('/api/media?limit=48');
  if (!res?.ok) return;
  const { items } = await res.json();
  const grid = document.getElementById('mediaPickerGrid');
  if (!items.length) { grid.innerHTML = '<p style="color:var(--text-muted);font-size:.875rem">No media uploaded yet.</p>'; return; }
  grid.innerHTML = items.map(item => `
    <div class="media-item" style="cursor:pointer" data-url="${escAttr(item.url)}">
      <img src="${escAttr(item.url)}" alt="${escAttr(item.originalName)}" loading="lazy">
      <div class="media-item-info"><div class="media-item-name">${escHtml(item.originalName)}</div></div>
    </div>
  `).join('');
  grid.querySelectorAll('.media-item').forEach(el => {
    el.addEventListener('click', () => {
      const url = el.dataset.url;
      setCover(url);
      document.getElementById('mediaModal').classList.remove('open');
    });
  });
}

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s) { return String(s).replace(/"/g,'&quot;'); }

document.addEventListener('DOMContentLoaded', () => {
  initEditor();
  postId = getPostIdFromUrl();
  if (postId) loadPost(postId);

  // Title → slug auto-generate
  document.getElementById('titleInput').addEventListener('input', function () {
    const s = slugify(this.value);
    document.getElementById('slugInput').value = s;
    document.getElementById('slugPreview').textContent = s || '…';
  });

  document.getElementById('slugInput').addEventListener('input', function () {
    document.getElementById('slugPreview').textContent = this.value || '…';
  });

  // Status → show/hide schedule picker
  document.getElementById('statusSelect').addEventListener('change', function () {
    document.getElementById('scheduleGroup').style.display =
      this.value === 'scheduled' ? 'block' : 'none';
  });

  // Tags input
  document.getElementById('tagInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = e.target.value.trim().toLowerCase().replace(/,/g, '');
      if (val && !tags.includes(val)) { tags.push(val); renderTags(); }
      e.target.value = '';
    }
    if (e.key === 'Backspace' && !e.target.value && tags.length) {
      tags.pop(); renderTags();
    }
  });
  document.getElementById('tagsWrap').addEventListener('click', () =>
    document.getElementById('tagInput').focus());

  // Cover image
  document.getElementById('coverUrlInput').addEventListener('change', function () {
    if (this.value) setCover(this.value.trim());
  });
  document.getElementById('removeCoverBtn').addEventListener('click', () => {
    setCover(null);
    document.getElementById('coverUrlInput').value = '';
  });
  document.getElementById('chooseCoverBtn').addEventListener('click', () => {
    document.getElementById('mediaModal').classList.add('open');
    loadMediaForPicker();
  });
  document.getElementById('closeMediaModal').addEventListener('click', () =>
    document.getElementById('mediaModal').classList.remove('open'));

  // Save buttons
  document.getElementById('saveBtn').addEventListener('click', () => savePost());

  const saveDropdownBtn = document.getElementById('saveDropdownBtn');
  saveDropdownBtn.addEventListener('click', () =>
    document.getElementById('saveDropdown').classList.toggle('open'));

  document.getElementById('saveDraftBtn').addEventListener('click', () => {
    document.getElementById('saveDropdown').classList.remove('open');
    savePost('draft');
  });
  document.getElementById('savePublishBtn').addEventListener('click', () => {
    document.getElementById('saveDropdown').classList.remove('open');
    savePost('published');
  });

  // Close dropdown on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('#saveDropdownBtn') && !e.target.closest('#saveDropdown')) {
      document.getElementById('saveDropdown').classList.remove('open');
    }
  });

  // Keyboard shortcut: Ctrl/Cmd+S
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault(); savePost();
    }
  });
});
