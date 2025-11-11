// =====================
// JS para la vista de Logs
// =====================

// Configuración recibida desde el backend vía Handlebars
const config = {
  apiEndpoint: window.apiEndpoint || '/logs/ui/api',
  defaultPageSize: window.defaultPageSize || 20,
  maxPageSize: window.maxPageSize || 100,
};

// Estado global
let state = {
  page: 1,
  pageSize: config.defaultPageSize,
  sort: 'desc',
  filters: {},
};

// Referencias al DOM
const elements = {
  content: document.getElementById('content'),
  pagination: document.querySelector('.pagination'),
  pageInfo: document.getElementById('pg'),
  pageCount: document.getElementById('pgc'),
  prevBtn: document.getElementById('prevBtn'),
  nextBtn: document.getElementById('nextBtn'),
  pageSize: document.getElementById('ps'),
  refreshBtn: document.getElementById('refreshBtn'),
  refreshIcon: document.getElementById('refreshIcon'),
  refreshText: document.getElementById('refreshText'),
  clearFiltersBtn: document.getElementById('clearFiltersBtn'),
};

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  setupModalHandlers();
  loadLogs();
});

// =====================
// Función principal
// =====================
async function loadLogs() {
  try {
    const container = document.querySelector('.table-container');
    if (container) container.classList.add('loading');
    elements.content.innerHTML = '<div class="loading">Cargando logs...</div>';

    const params = new URLSearchParams();
    params.set('page', state.page);
    params.set('limit', state.pageSize);
    params.set('orderDir', state.sort.toUpperCase());

    Object.entries(state.filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.set(k, v);
    });

    // 🔹 AQUI EL CAMBIO IMPORTANTE
    const token = window.API_TOKEN || localStorage.getItem('access_token');
    if (!token) {
      throw new Error('Token no disponible');
    }
    const res = await fetch(`${config.apiEndpoint}?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`, // ✅ Envía el JWT al backend
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status} - ${text}`);
    }

    const data = await res.json();
    renderLogs(data);
  } catch (e) {
    console.error('❌ Error cargando logs:', e);
    elements.content.innerHTML = `<div class="error">Error cargando logs: ${e.message}</div>`;
  } finally {
    const container = document.querySelector('.table-container');
    if (container) container.classList.remove('loading');
  }
}

// =====================
// Render de tabla
// =====================
function renderLogs(data) {
  const items = data.data || [];
  if (!items.length) {
    elements.content.innerHTML =
      '<div class="no-data">No se encontraron logs</div>';
    elements.pagination.style.display = 'none';
    return;
  }

  const rows = items
    .map(
      (log) => `
    <tr>
      <td><code>${formatDate(log.occurredAt)}</code></td>
      <td><code>${log.statusCode ?? '-'}</code></td>
      <td><code>${log.exceptionType ?? '-'}</code></td>
      <td><code title="${escapeHtml(log.message || '')}">${truncateText(log.message, 60)}</code></td>
      <td><code>${log.route ?? '-'}</code></td>
      <td><code>${log.httpMethod ?? '-'}</code></td>
      <td><code>${log.userId ?? '-'}</code></td>
      <td><code>${log.host ?? '-'}</code></td>
      <td><code>${log.appVersion ?? '-'}</code></td>
      <td><code>${log.correlationId ?? '-'}</code></td>
      <td><code>${Array.isArray(log.tags) ? log.tags.join(', ') : (log.tags ?? '-')}</code></td>
      <td><code>${log.handled ? '✅' : '❌'}</code></td>

      <td class="json-cell">
        <span class="json-preview" data-type="stack" data-content="${encodeURIComponent(log.stackTrace || '')}">
          ${log.stackTrace ? '📋 Stack' : '-'}
        </span>
      </td>

      <td class="json-cell">
        <span class="json-preview" data-type="headers" data-content="${encodeURIComponent(JSON.stringify(log.headers || {}, null, 2))}">
          ${log.headers ? '🧾 Headers' : '-'}
        </span>
      </td>

      <td class="json-cell">
        <span class="json-preview" data-type="context" data-content="${encodeURIComponent(JSON.stringify(log.context || {}, null, 2))}">
          ${log.context ? '🧠 Context' : '-'}
        </span>
      </td>

      <td class="json-cell">
        <span class="json-preview" data-type="body" data-content="${encodeURIComponent(JSON.stringify(log.requestBody || {}, null, 2))}">
          ${log.requestBody ? '📦 Body' : '-'}
        </span>
      </td>
    </tr>
  `,
    )
    .join('');

  elements.content.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th onclick="toggleSort()" class="sortable">Fecha <span class="pill">${state.sort}</span></th>
            <th>Código</th>
            <th>Tipo de Excepción</th>
            <th>Mensaje</th>
            <th>Ruta</th>
            <th>Método</th>
            <th>Usuario</th>
            <th>Host</th>
            <th>Versión</th>
            <th>Correlation ID</th>
            <th>Tags</th>
            <th>Manejada</th>
            <th>Stack</th>
            <th>Headers</th>
            <th>Context</th>
            <th>Body</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  updatePagination(data);
}

// =====================
// Paginación
// =====================
function updatePagination(data) {
  // ✅ Detectar si viene en formato Nest (plano) o Express (meta anidado)
  const meta = data.meta || {
    total: data.total,
    page: data.page,
    pageCount: data.pageCount,
  };

  const currentPage = Number(meta.page) || 1;
  const totalPages = Number(meta.pageCount) || 1;
  const totalLogs = Number(meta.total) || 0;

  elements.pageInfo.textContent = currentPage;
  elements.pageCount.textContent = totalPages;
  elements.prevBtn.disabled = currentPage <= 1;
  elements.nextBtn.disabled = currentPage >= totalPages;
  elements.pagination.style.display = 'flex';

  const totalEl = document.getElementById('totalElements');
  totalEl.textContent = totalLogs;
}

// =====================
// Filtros y eventos
// =====================
function setupEventListeners() {
  const filterMap = {
    'f-status': 'statusCode',
    'f-message': 'messageContains',
    'f-path': 'route',
    'f-op': 'exceptionType',
    'f-email': 'userId',
    'f-correlation': 'correlationId',
    'f-host': 'host',
    'f-appVersion': 'appVersion',
    'f-tags': 'tags',
    'f-handled': 'handled',
  };

  Object.entries(filterMap).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (!el) return;

    if (el.tagName === 'SELECT') {
      el.addEventListener('change', () => applyFilter(key, el.value));
    } else {
      el.addEventListener(
        'keyup',
        (e) => e.key === 'Enter' && applyFilter(key, el.value),
      );
    }
  });

  // Fecha/hora
  ['f-start-datetime', 'f-end-datetime'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', syncFiltersFromDOM);
  });

  // Paginación
  elements.pageSize.addEventListener('change', () => {
    state.pageSize =
      parseInt(elements.pageSize.value, 10) || config.defaultPageSize;
    state.page = 1;
    loadLogs();
  });
}

function applyFilter(key, value) {
  state.filters[key] = value.trim() || undefined;
  state.page = 1;
  loadLogs();
}

function syncFiltersFromDOM() {
  const get = (id) => (document.getElementById(id)?.value || '').trim();
  const next = {
    statusCode: get('f-status'),
    messageContains: get('f-message'),
    route: get('f-path'),
    exceptionType: get('f-op'),
    userId: get('f-email'),
    correlationId: get('f-correlation'),
    host: get('f-host'),
    appVersion: get('f-appVersion'),
    tags: get('f-tags'),
    handled: get('f-handled'),
    fromDate: get('f-start-datetime') || undefined,
    toDate: get('f-end-datetime') || undefined,
  };
  Object.keys(next).forEach((k) => !next[k] && delete next[k]);
  state.filters = next;
  state.page = 1;
}

// =====================
// Acciones generales
// =====================
function previousPage() {
  if (state.page > 1) {
    state.page--;
    loadLogs();
  }
}
function nextPage() {
  state.page++;
  loadLogs();
}
function toggleSort() {
  state.sort = state.sort === 'asc' ? 'desc' : 'asc';
  loadLogs();
}
function truncateText(t, n) {
  return t && t.length > n ? t.slice(0, n) + '...' : t || '-';
}
function escapeHtml(t) {
  return t
    ? t
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
    : '';
}
function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleString('es-VE', { hour12: true });
}
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =====================
// Modal
// =====================
let currentModalData = null;

function setupModalHandlers() {
  document.addEventListener('click', (e) => {
    const el = e.target;
    if (el.classList.contains('json-preview')) {
      const type = el.getAttribute('data-type');
      const data = decodeURIComponent(el.getAttribute('data-content') || '');
      openModal(type, data, type.toUpperCase());
    } else if (el.classList.contains('modal-overlay')) {
      closeModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

function openModal(type, data, title) {
  const modalOverlay = document.getElementById('modalOverlay');
  const modalTitle = document.getElementById('modalTitle');
  const modalContent = document.getElementById('modalContent');
  modalTitle.textContent = title;

  let content = '';
  const decoded = decodeURIComponent(data);

  if (type === 'stack') {
    content = formatStack(decoded);
  } else {
    try {
      const parsed = JSON.parse(decoded);
      content = `<pre class="json-viewer" style="background:#0f172a;color:#e2e8f0;padding:12px;border-radius:6px;overflow-x:auto;white-space:pre-wrap;">${formatJson(parsed)}</pre>`;
    } catch {
      content = `<code>${escapeHtml(decoded)}</code>`;
    }
  }

  modalContent.innerHTML = content;
  modalOverlay.classList.add('show');
  document.body.style.overflow = 'hidden';
  currentModalData = { title, data };
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('show');
  document.body.style.overflow = 'auto';
  currentModalData = null;
}

function copyModalContent() {
  if (!currentModalData) return;

  // Si el contenido está codificado, lo decodificamos antes de copiar
  const decodedData = decodeURIComponent(currentModalData.data);

  navigator.clipboard
    .writeText(decodedData)
    .then(showCopyIndicator)
    .catch(showCopyIndicator);
}

function showCopyIndicator() {
  const indicator = document.getElementById('copyIndicator');
  indicator.classList.add('show');
  setTimeout(() => indicator.classList.remove('show'), 2000);
}

// =====================
// Utilidades extra
// =====================
function formatJson(objOrText) {
  // Si ya es string, tratamos de parsearlo
  let jsonText = '';

  if (typeof objOrText === 'string') {
    try {
      const parsed = JSON.parse(objOrText);
      jsonText = JSON.stringify(parsed, null, 2);
    } catch {
      // No es JSON válido, usamos texto sin tocar
      jsonText = objOrText;
    }
  } else {
    jsonText = JSON.stringify(objOrText, null, 2);
  }

  // 🔹 Formateo con colores (solo afecta al HTML, no texto plano)
  return (
    jsonText
      // Claves en azul
      .replace(/"([^"]+)":/g, '<span style="color:#60a5fa;">"$1"</span>:')
      // Strings en verde
      .replace(/: "([^"]*)"/g, ': <span style="color:#34d399;">"$1"</span>')
      // Números en amarillo
      .replace(/\b(\d+)\b/g, '<span style="color:#fbbf24;">$1</span>')
      // Booleanos en violeta
      .replace(/\b(true|false)\b/g, '<span style="color:#a78bfa;">$1</span>')
      // Null en gris
      .replace(/\bnull\b/g, '<span style="color:#9ca3af;">null</span>')
  );
}

function formatStack(stack) {
  if (!stack) return '-';
  return stack
    .split('\n')
    .map((line) => {
      const l = line.trim();
      if (l.startsWith('at '))
        return `<div><span style="color:#60a5fa;">${escapeHtml(l)}</span></div>`;
      if (l.includes('Error:'))
        return `<div style="color:#ef4444;font-weight:bold;">${escapeHtml(l)}</div>`;
      return `<div style="color:#9ca3af;">${escapeHtml(l)}</div>`;
    })
    .join('');
}

// =====================
// Cerrar sesión
// =====================
async function logout() {
  if (!confirm('¿Seguro que deseas cerrar sesión?')) return;

  try {
    // Si guardas el token en local/sessionStorage, pásalo como Bearer (opcional si usas cookie httpOnly)
    const token =
      localStorage.getItem('access_token') ||
      sessionStorage.getItem('access_token');

    await fetch('/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include', // necesario si la cookie es httpOnly
    });
  } catch (e) {
    console.warn('No se pudo notificar logout al servidor:', e);
    // Continuamos con limpieza local de todas formas
  }

  // 🔒 Limpieza del lado del cliente
  localStorage.removeItem('access_token');
  sessionStorage.removeItem('access_token');
  document.cookie = 'access_token=; Max-Age=0; Path=/; SameSite=Lax';

  // (opcional) Notifica a otras pestañas
  try {
    localStorage.setItem('logout_broadcast', Date.now().toString());
  } catch {}

  // Redirige al login de logs (o a donde quieras)
  window.location.href = '/logs/ui/login';
}

// =====================
// Botones de acción (Actualizar / Limpiar filtros)
// =====================

function refreshData() {
  try {
    // Tomar todos los filtros del DOM y sincronizarlos con el estado global
    syncFiltersFromDOM();

    // Reiniciar la página al inicio
    state.page = 1;

    // Mostrar animación visual en el botón (opcional)
    elements.refreshIcon.textContent = '⏳';
    elements.refreshText.textContent = 'Cargando...';
    elements.refreshBtn.disabled = true;

    // Recargar logs con filtros activos
    loadLogs().finally(() => {
      elements.refreshIcon.textContent = '🔄';
      elements.refreshText.textContent = 'Actualizar';
      elements.refreshBtn.disabled = false;
    });
  } catch (e) {
    console.error('❌ Error al refrescar:', e);
  }
}

function clearAllFilters() {
  try {
    // Limpiar inputs de texto
    document.querySelectorAll('.filters input').forEach((input) => {
      input.value = '';
    });

    // Reiniciar selects
    document.querySelectorAll('.filters select').forEach((select) => {
      select.value = '';
    });

    // Limpiar fechas
    document.getElementById('f-start-datetime').value = '';
    document.getElementById('f-end-datetime').value = '';

    // Vaciar el estado de filtros
    state.filters = {};
    state.page = 1;

    // Recargar logs sin filtros
    loadLogs();

    // Feedback visual opcional
    elements.clearFiltersBtn.textContent = '🧹 Limpiando...';
    elements.clearFiltersBtn.disabled = true;
    setTimeout(() => {
      elements.clearFiltersBtn.textContent = '🗑️ Limpiar filtros';
      elements.clearFiltersBtn.disabled = false;
    }, 1000);
  } catch (e) {
    console.error('❌ Error al limpiar filtros:', e);
  }
}
