// ── Dashboard: post list ───────────────────────────────────────────────────────

let currentPage = 1;
let totalPages = 1;
let pendingDeleteId = null;
let searchTimer = null;

async function fetchPosts() {
  const search = document.getElementById('searchInput').value.trim();
  const status = document.getElementById('statusFilter').value;

  const params = new URLSearchParams({
    page: currentPage,
    limit: 15,
    ...(status && { status }),
    ...(search && { search }),
  });

  const tbody = document.getElementById('postsTable');
  tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted)"><span class="spinner"></span></td></tr>`;

  const res = await apiFetch(`/api/posts?${params}`);
  if (!res) return;
  const { posts, total, totalPages: tp } = await res.json();
  totalPages = tp || 1;

  // Update stats (only on first unfiltered load)
  if (!search && !status && currentPage === 1) {
    updateStats(posts, total);
  }

  updatePagination(total);

  if (!posts.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted)">No posts found</td></tr>`;
    return;
  }

  tbody.innerHTML = posts.map(post => `
    <tr>
      <td>
        <a href="/admin/editor/${post.id}" style="font-weight:500;color:var(--text)">${escHtml(post.title || 'Untitled')}</a>
      </td>
      <td>
        <span class="badge badge-${post.status}">${post.status}</span>
      </td>
      <td>
        <div style="display:flex;flex-wrap:wrap;gap:4px">
          ${(post.tags || []).slice(0, 3).map(t => `<span class="badge badge-draft">#${escHtml(t)}</span>`).join('')}
        </div>
      </td>
      <td style="font-family:var(--font-mono);font-size:.8rem;color:var(--text-muted);white-space:nowrap">
        ${post.status === 'scheduled' && post.publishAt
          ? '🕐 ' + formatDate(post.publishAt)
          : formatDate(post.publishedAt || post.createdAt)
        }
      </td>
      <td style="text-align:right">
        <div class="dropdown">
          <button class="btn btn-ghost btn-sm" onclick="toggleDropdown(this)">⋯</button>
          <div class="dropdown-menu">
            <a href="/admin/editor/${post.id}">Edit</a>
            <a href="/post/${escHtml(post.slug)}" target="_blank">View</a>
            <button class="danger" onclick="openDeleteModal('${post.id}')">Delete</button>
          </div>
        </div>
      </td>
    </tr>
  `).join('');
}

async function fetchStats() {
  // Fetch counts for each status
  const [all, pub, draft, sched] = await Promise.all([
    apiFetch('/api/posts?limit=1').then(r => r?.json()),
    apiFetch('/api/posts?limit=1&status=published').then(r => r?.json()),
    apiFetch('/api/posts?limit=1&status=draft').then(r => r?.json()),
    apiFetch('/api/posts?limit=1&status=scheduled').then(r => r?.json()),
  ]);
  document.getElementById('statTotal').textContent = all?.total ?? '–';
  document.getElementById('statPublished').textContent = pub?.total ?? '–';
  document.getElementById('statDraft').textContent = draft?.total ?? '–';
  document.getElementById('statScheduled').textContent = sched?.total ?? '–';
}

function updateStats(posts, total) {
  // Live update from current data if available
  document.getElementById('statTotal').textContent = total;
}

function updatePagination(total) {
  document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${totalPages}`;
  document.getElementById('prevBtn').disabled = currentPage <= 1;
  document.getElementById('nextBtn').disabled = currentPage >= totalPages;
}

function toggleDropdown(btn) {
  // Close all others first
  document.querySelectorAll('.dropdown-menu.open').forEach(m => {
    if (m !== btn.nextElementSibling) m.classList.remove('open');
  });
  btn.nextElementSibling.classList.toggle('open');
}

function openDeleteModal(id) {
  pendingDeleteId = id;
  document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
  document.getElementById('deleteModal').classList.add('open');
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.addEventListener('DOMContentLoaded', () => {
  fetchStats();
  fetchPosts();

  document.getElementById('searchInput').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { currentPage = 1; fetchPosts(); }, 350);
  });

  document.getElementById('statusFilter').addEventListener('change', () => {
    currentPage = 1; fetchPosts();
  });

  document.getElementById('prevBtn').addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; fetchPosts(); }
  });
  document.getElementById('nextBtn').addEventListener('click', () => {
    if (currentPage < totalPages) { currentPage++; fetchPosts(); }
  });

  document.getElementById('cancelDelete').addEventListener('click', () => {
    document.getElementById('deleteModal').classList.remove('open');
    pendingDeleteId = null;
  });

  document.getElementById('confirmDelete').addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    const btn = document.getElementById('confirmDelete');
    btn.disabled = true; btn.textContent = 'Deleting…';
    const res = await apiFetch(`/api/posts/${pendingDeleteId}`, { method: 'DELETE' });
    document.getElementById('deleteModal').classList.remove('open');
    pendingDeleteId = null;
    btn.disabled = false; btn.textContent = 'Delete';
    if (res?.ok) {
      showToast('Post deleted', 'success');
      fetchPosts(); fetchStats();
    } else {
      showToast('Failed to delete post', 'error');
    }
  });

  // Close dropdowns on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('.dropdown')) {
      document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
    }
  });
});
