import { supabase } from './supabaseClient.js';

function showAlert(el, type, msg) {
  el.className = `alert show alert-${type}`;
  el.textContent = msg;
}

/* ---------------- Login ---------------- */
document.getElementById('adminSendLink').addEventListener('click', async () => {
  const email = document.getElementById('adminEmail').value.trim();
  const password = document.getElementById('adminPassword').value;
  const alertEl = document.getElementById('adminAuthAlert');
  if (!email || !password) {
    showAlert(alertEl, 'error', 'Completá usuario y contraseña.');
    return;
  }
  const btn = document.getElementById('adminSendLink');
  btn.disabled = true; btn.textContent = 'Ingresando...';
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  btn.disabled = false; btn.textContent = 'Iniciar sesión';
  if (error) showAlert(alertEl, 'error', 'Usuario o contraseña incorrectos.');
});

document.getElementById('adminPassword').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('adminSendLink').click();
});

document.getElementById('adminLogout').addEventListener('click', async () => {
  await supabase.auth.signOut();
  location.reload();
});

/* ---------------- Estado / gate de admin ---------------- */
async function checkAdminAndBoot(session) {
  const loginPanel = document.getElementById('loginPanel');
  const dashboard = document.getElementById('adminDashboard');

  if (!session) {
    loginPanel.style.display = '';
    dashboard.style.display = 'none';
    return;
  }
  loginPanel.style.display = 'none';
  dashboard.style.display = '';

  const { data: adminRow } = await supabase.from('admins').select('*').eq('user_id', session.user.id).maybeSingle();

  const notAdminAlert = document.getElementById('notAdminAlert');
  const adminContent = document.getElementById('adminContent');
  if (!adminRow) {
    showAlert(notAdminAlert, 'error', 'Tu cuenta no tiene permisos de organizador. Pedile a un administrador existente que te agregue.');
    adminContent.style.display = 'none';
    return;
  }
  notAdminAlert.classList.remove('show');
  adminContent.style.display = '';
  bootDashboard();
}

/* ---------------- Data cache ---------------- */
let TEAMS = [];

async function loadTeamsIntoState() {
  const { data } = await supabase.from('teams').select('*').order('name');
  TEAMS = data || [];
  return TEAMS;
}

/* ---------------- Avisos ---------------- */
async function loadAdminAnnouncements() {
  const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
  const el = document.getElementById('adminAnnList');
  el.innerHTML = (data || []).map(a => `
    <div class="announce-item ${a.kind}">
      <span class="icon">${a.kind === 'suspension' ? '🌧️' : 'ℹ️'}</span>
      <div style="flex:1">
        <strong>${a.title}</strong>${a.message}
        <div class="when">${new Date(a.created_at).toLocaleString('es-AR')}${a.matchday ? ' · Fecha ' + a.matchday : ''}</div>
      </div>
      <button class="btn btn-outline btn-sm" data-del-ann="${a.id}">Borrar</button>
    </div>`).join('') || `<div class="empty-state">Sin avisos todavía.</div>`;

  el.querySelectorAll('[data-del-ann]').forEach(b => b.addEventListener('click', async () => {
    await supabase.from('announcements').delete().eq('id', b.dataset.delAnn);
    loadAdminAnnouncements();
  }));
}

document.getElementById('publishAnnBtn').addEventListener('click', async () => {
  const kind = document.getElementById('annKind').value;
  const title = document.getElementById('annTitle').value.trim();
  const message = document.getElementById('annMessage').value.trim();
  const alertEl = document.getElementById('annAlert');
  if (!title || !message) { showAlert(alertEl, 'error', 'Completá título y mensaje.'); return; }
  const { error } = await supabase.from('announcements').insert({ kind, title, message });
  if (error) { showAlert(alertEl, 'error', error.message); return; }
  showAlert(alertEl, 'success', 'Aviso publicado.');
  document.getElementById('annTitle').value = '';
  document.getElementById('annMessage').value = '';
  loadAdminAnnouncements();
});

/* ---------------- Equipos: lista deslizable (editar / eliminar) ---------------- */
async function loadAdminTeams() {
  await loadTeamsIntoState();
  document.getElementById('teamsCountBadge').textContent = `${TEAMS.length} equipo${TEAMS.length === 1 ? '' : 's'}`;
  const el = document.getElementById('adminTeamsList');

  if (!TEAMS.length) {
    el.innerHTML = `<div class="empty-state">Todavía no se inscribió ningún equipo.</div>`;
    fillTeamSelects();
    return;
  }

  el.innerHTML = TEAMS.map(t => `
    <div class="swipe-item" data-id="${t.id}">
      <div class="swipe-actions">
        <button class="swipe-action edit" data-action="edit">Editar</button>
        <button class="swipe-action delete" data-action="delete">Eliminar</button>
      </div>
      <div class="swipe-content">
        <div class="swipe-main">
          <strong>${t.name}</strong> <span class="badge">${t.course}</span>
          <div class="swipe-sub">${t.captain_email} · inscripto el ${new Date(t.created_at).toLocaleDateString('es-AR')}</div>
        </div>
      </div>
    </div>`).join('');

  attachSwipeHandlers();
  fillTeamSelects();
}

const ACTIONS_WIDTH = 156; // 78px x 2 botones

function closeAllSwipes(except) {
  document.querySelectorAll('.swipe-content').forEach(c => {
    if (c !== except) { c.style.transition = 'transform .25s var(--ease)'; c.style.transform = 'translateX(0)'; }
  });
}

function attachSwipeHandlers() {
  document.querySelectorAll('.swipe-item').forEach(item => {
    const content = item.querySelector('.swipe-content');
    const teamId = item.dataset.id;
    let startX = 0, openX = 0, dragging = false, moved = false;

    function setX(x, animate) {
      x = Math.max(-ACTIONS_WIDTH, Math.min(0, x));
      content.style.transition = animate ? 'transform .25s var(--ease)' : 'none';
      content.style.transform = `translateX(${x}px)`;
      openX = x;
    }

    content.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.swipe-edit-form')) return; // no arrastrar mientras se edita
      dragging = true; moved = false;
      startX = e.clientX;
      try { content.setPointerCapture(e.pointerId); } catch (_) {}
      closeAllSwipes(content);
    });
    content.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) moved = true;
      setX(openX + dx, false);
      startX = e.clientX;
    });
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      setX(openX < -ACTIONS_WIDTH / 2 ? -ACTIONS_WIDTH : 0, true);
    }
    content.addEventListener('pointerup', endDrag);
    content.addEventListener('pointercancel', endDrag);

    item.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      const team = TEAMS.find(t => t.id === teamId);
      if (!confirm(`¿Eliminar el equipo "${team?.name || ''}" y sus jugadores? Esta acción no se puede deshacer.`)) return;
      await supabase.from('teams').delete().eq('id', teamId);
      loadAdminTeams();
    });

    item.querySelector('[data-action="edit"]').addEventListener('click', () => {
      const team = TEAMS.find(t => t.id === teamId);
      if (!team) return;
      setX(0, true);
      content.innerHTML = `
        <div class="swipe-edit-form">
          <div class="two-col">
            <div class="form-row"><label>Nombre</label><input class="edit-name" value="${team.name}" /></div>
            <div class="form-row"><label>Curso</label><input class="edit-course" value="${team.course}" /></div>
          </div>
          <div class="form-row"><label>Mail de contacto</label><input class="edit-email" value="${team.captain_email}" /></div>
          <div class="swipe-edit-actions">
            <button class="btn btn-primary btn-sm edit-save">Guardar</button>
            <button class="btn btn-outline btn-sm edit-cancel">Cancelar</button>
          </div>
        </div>`;
      content.querySelector('.edit-cancel').addEventListener('click', () => loadAdminTeams());
      content.querySelector('.edit-save').addEventListener('click', async () => {
        const name = content.querySelector('.edit-name').value.trim();
        const course = content.querySelector('.edit-course').value.trim();
        const captain_email = content.querySelector('.edit-email').value.trim();
        if (!name || !course || !captain_email) return;
        const { error } = await supabase.from('teams').update({ name, course, captain_email }).eq('id', teamId);
        if (error) { alert('Error al guardar: ' + error.message); return; }
        loadAdminTeams();
      });
    });
  });
}

function fillTeamSelects() {
  const opts = TEAMS.map(t => `<option value="${t.id}">${t.name} (${t.course})</option>`).join('');
  document.getElementById('matchHome').innerHTML = opts;
  document.getElementById('matchAway').innerHTML = opts;
}

/* ---------------- Crear partido ---------------- */
document.getElementById('createMatchBtn').addEventListener('click', async () => {
  const home_team_id = document.getElementById('matchHome').value;
  const away_team_id = document.getElementById('matchAway').value;
  const matchday = parseInt(document.getElementById('matchDay').value || '1');
  const dateVal = document.getElementById('matchDate').value;
  const timeVal = document.getElementById('matchTime').value;
  const venue = document.getElementById('matchVenue').value;
  const alertEl = document.getElementById('matchAlert');

  if (!home_team_id || !away_team_id || home_team_id === away_team_id) {
    showAlert(alertEl, 'error', 'Elegí dos equipos distintos.'); return;
  }
  const { error } = await supabase.from('matches').insert({
    home_team_id, away_team_id, matchday,
    scheduled_at: dateVal ? new Date(`${dateVal}T${timeVal}`).toISOString() : null,
    venue, status: 'scheduled'
  });
  if (error) { showAlert(alertEl, 'error', error.message); return; }
  showAlert(alertEl, 'success', 'Partido programado.');
  document.getElementById('matchDate').value = '';
  loadAdminMatches();
});

/* ---------------- Gestión de partidos: fechas > partidos > detalle ---------------- */
// Nivel actual del panel: 'matchdays' (lista de fechas), 'matches'
// (partidos de una fecha) o 'detail' (carga de datos de un partido).
let matchesView = { level: 'matchdays', matchday: null, matchId: null };
let MATCHES = [];

const STATUS_LABEL = {
  scheduled: 'Programado',
  played: 'Jugado',
  suspended: 'Suspendido',
  postponed: 'Postergado'
};

async function loadAdminMatches() {
  const { data } = await supabase.from('matches').select('*').order('scheduled_at', { ascending: true });
  MATCHES = data || [];
  renderMatchesPanel();
}

function teamLabel(id) {
  const t = TEAMS.find(x => x.id === id);
  return t ? t.name : '?';
}

function fmtMatchDate(iso) {
  if (!iso) return 'A confirmar';
  return new Date(iso).toLocaleString('es-AR', {
    weekday: 'short', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
}

function renderMatchesPanel() {
  const el = document.getElementById('adminMatchesList');
  if (!MATCHES.length) {
    el.innerHTML = `<div class="empty-state">No hay partidos cargados todavía.</div>`;
    return;
  }
  if (matchesView.level === 'matchdays') return renderMatchdayList(el);
  if (matchesView.level === 'matches') return renderMatchList(el);
  return renderMatchDetail(el);
}

/* --- Nivel 1: fechas --- */
function renderMatchdayList(el) {
  const days = [...new Set(MATCHES.map(m => m.matchday))].sort((a, b) => a - b);

  el.innerHTML = days.map(d => {
    const ms = MATCHES.filter(m => m.matchday === d);
    const played = ms.filter(m => m.status === 'played').length;
    const done = played === ms.length;
    return `
      <button class="drill-row" data-matchday="${d}">
        <div class="drill-main">
          <strong>Fecha ${d}</strong>
          <div class="drill-sub">${ms.length} partido${ms.length === 1 ? '' : 's'} · ${played} cargado${played === 1 ? '' : 's'}</div>
        </div>
        <span class="drill-badge ${done ? 'done' : ''}">${done ? 'Completa' : `${ms.length - played} pendiente${ms.length - played === 1 ? '' : 's'}`}</span>
        <span class="drill-arrow">›</span>
      </button>`;
  }).join('');

  el.querySelectorAll('[data-matchday]').forEach(btn => {
    btn.addEventListener('click', () => {
      matchesView = { level: 'matches', matchday: parseInt(btn.dataset.matchday), matchId: null };
      renderMatchesPanel();
    });
  });
}

/* --- Nivel 2: partidos de una fecha --- */
function renderMatchList(el) {
  const ms = MATCHES.filter(m => m.matchday === matchesView.matchday);

  el.innerHTML = `
    <button class="drill-back" id="backToMatchdays">‹ Todas las fechas</button>
    <h4 style="margin:14px 0 10px;">Fecha ${matchesView.matchday}</h4>
    ${ms.map(m => `
      <button class="drill-row" data-match="${m.id}">
        <div class="drill-main">
          <strong>${teamLabel(m.home_team_id)} vs ${teamLabel(m.away_team_id)}</strong>
          <div class="drill-sub">${fmtMatchDate(m.scheduled_at)}${m.venue ? ' · ' + m.venue : ''}</div>
        </div>
        ${m.status === 'played' && m.home_score != null
          ? `<span class="drill-score">${m.home_score} - ${m.away_score}</span>`
          : `<span class="drill-badge">${STATUS_LABEL[m.status] || m.status}</span>`}
        <span class="drill-arrow">›</span>
      </button>`).join('')}`;

  document.getElementById('backToMatchdays').addEventListener('click', () => {
    matchesView = { level: 'matchdays', matchday: null, matchId: null };
    renderMatchesPanel();
  });
  el.querySelectorAll('[data-match]').forEach(btn => {
    btn.addEventListener('click', () => {
      matchesView = { ...matchesView, level: 'detail', matchId: btn.dataset.match };
      renderMatchesPanel();
    });
  });
}

/* --- Nivel 3: detalle del partido (resultado + goles) --- */
async function renderMatchDetail(el) {
  const m = MATCHES.find(x => x.id === matchesView.matchId);
  if (!m) { matchesView.level = 'matches'; return renderMatchesPanel(); }

  el.innerHTML = `
    <button class="drill-back" id="backToMatches">‹ Fecha ${m.matchday}</button>

    <div class="match-card" style="margin-top:14px;">
      <div class="match-meta"><span>Fecha ${m.matchday}</span><span>${fmtMatchDate(m.scheduled_at)}${m.venue ? ' · ' + m.venue : ''}</span></div>
      <div class="match-teams" style="margin-bottom:16px;">
        <div class="match-team home">${teamLabel(m.home_team_id)}</div>
        <div class="match-score">${m.home_score != null ? `${m.home_score} - ${m.away_score}` : 'vs'}</div>
        <div class="match-team away">${teamLabel(m.away_team_id)}</div>
      </div>

      <div class="form-row">
        <label>Estado</label>
        <select class="m-status">
          ${Object.entries(STATUS_LABEL).map(([v, l]) =>
            `<option value="${v}" ${m.status === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      <div class="two-col" style="margin-top:12px;">
        <div class="form-row"><label>Goles ${teamLabel(m.home_team_id)}</label><input type="number" min="0" class="m-home-score" value="${m.home_score ?? ''}" /></div>
        <div class="form-row"><label>Goles ${teamLabel(m.away_team_id)}</label><input type="number" min="0" class="m-away-score" value="${m.away_score ?? ''}" /></div>
      </div>
      <div style="display:flex; gap:8px; margin-top:14px; flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm m-save">Guardar resultado</button>
        <button class="btn btn-outline btn-sm m-delete" style="color:var(--red);">Eliminar partido</button>
      </div>
      <div class="alert m-alert"></div>
    </div>

    <div class="panel" style="box-shadow:none; margin-top:16px;">
      <h4 style="margin-top:0;">Goles del partido</h4>
      <p style="color:var(--text-dim); font-size:13px; margin-top:-4px;">Los jugadores son los que cada equipo cargó al inscribirse.</p>
      <div class="goals-list"></div>
      <div class="form-row" style="margin-top:12px;">
        <label>Jugador/a</label>
        <select class="g-player"></select>
      </div>
      <div class="two-col" style="align-items:end; margin-top:10px;">
        <div class="form-row"><label>Minuto (opcional)</label><input type="number" min="0" class="g-minute" placeholder="Ej: 23" /></div>
        <button class="btn btn-primary btn-sm g-add">+ Agregar gol</button>
      </div>
      <div class="alert g-alert"></div>
    </div>`;

  document.getElementById('backToMatches').addEventListener('click', () => {
    matchesView = { ...matchesView, level: 'matches', matchId: null };
    renderMatchesPanel();
  });

  const alertEl = el.querySelector('.m-alert');

  el.querySelector('.m-save').addEventListener('click', async () => {
    const status = el.querySelector('.m-status').value;
    const hs = el.querySelector('.m-home-score').value;
    const as = el.querySelector('.m-away-score').value;
    const { error } = await supabase.from('matches').update({
      status,
      home_score: hs === '' ? null : parseInt(hs),
      away_score: as === '' ? null : parseInt(as),
      updated_at: new Date().toISOString()
    }).eq('id', m.id);
    if (error) { showAlert(alertEl, 'error', error.message); return; }
    showAlert(alertEl, 'success', 'Resultado guardado.');
    const { data } = await supabase.from('matches').select('*').order('scheduled_at', { ascending: true });
    MATCHES = data || [];
  });

  el.querySelector('.m-delete').addEventListener('click', async () => {
    if (!confirm('¿Eliminar este partido y sus goles?')) return;
    await supabase.from('matches').delete().eq('id', m.id);
    matchesView = { ...matchesView, level: 'matches', matchId: null };
    loadAdminMatches();
  });

  // Jugadores inscriptos por cada equipo (datos cargados en la inscripción)
  const [homeRes, awayRes] = await Promise.all([
    supabase.from('players').select('*').eq('team_id', m.home_team_id).order('last_name'),
    supabase.from('players').select('*').eq('team_id', m.away_team_id).order('last_name')
  ]);

  const playerSel = el.querySelector('.g-player');
  const groups = [
    { label: teamLabel(m.home_team_id), players: homeRes.data || [] },
    { label: teamLabel(m.away_team_id), players: awayRes.data || [] }
  ];
  const hasPlayers = groups.some(g => g.players.length);

  playerSel.innerHTML = hasPlayers
    ? groups.filter(g => g.players.length).map(g => `
        <optgroup label="${g.label}">
          ${g.players.map(p => `<option value="${p.id}" data-team="${p.team_id}">${p.last_name}, ${p.first_name}</option>`).join('')}
        </optgroup>`).join('')
    : `<option value="" disabled selected>Ningún equipo cargó jugadores</option>`;

  const gAlert = el.querySelector('.g-alert');
  if (!hasPlayers) {
    el.querySelector('.g-add').disabled = true;
    showAlert(gAlert, 'info', 'Para cargar goles, los equipos tienen que tener jugadores inscriptos.');
  }

  async function refreshGoals() {
    const { data: goals } = await supabase
      .from('goals')
      .select('*, players(first_name,last_name), teams(name)')
      .eq('match_id', m.id)
      .order('minute');
    const list = el.querySelector('.goals-list');
    list.innerHTML = (goals || []).length
      ? goals.map(g => `
          <div class="announce-item info" style="padding:8px 12px;">
            <span class="icon">⚽</span>
            <div style="flex:1">
              <strong>${g.players?.last_name || ''}, ${g.players?.first_name || ''}</strong>
              <div class="when">${g.teams?.name || ''}${g.minute != null ? ' · min ' + g.minute : ''}</div>
            </div>
            <button class="btn btn-outline btn-sm" data-del-goal="${g.id}">Quitar</button>
          </div>`).join('')
      : `<div class="empty-state" style="padding:10px;">Sin goles cargados.</div>`;
    list.querySelectorAll('[data-del-goal]').forEach(b => b.addEventListener('click', async () => {
      await supabase.from('goals').delete().eq('id', b.dataset.delGoal);
      refreshGoals();
    }));
  }
  refreshGoals();

  el.querySelector('.g-add').addEventListener('click', async () => {
    const playerId = playerSel.value;
    const teamId = playerSel.selectedOptions[0]?.dataset.team;
    const minuteVal = el.querySelector('.g-minute').value;
    if (!playerId || !teamId) return;
    const { error } = await supabase.from('goals').insert({
      match_id: m.id, player_id: playerId, team_id: teamId,
      minute: minuteVal ? parseInt(minuteVal) : null
    });
    if (error) { showAlert(gAlert, 'error', error.message); return; }
    el.querySelector('.g-minute').value = '';
    refreshGoals();
  });
}

/* ---------------- Boot ---------------- */
async function bootDashboard() {
  await loadAdminTeams();
  await loadAdminMatches();
  await loadAdminAnnouncements();
  await loadAdminPhotos();
}

/* ---------------- Portada / carrusel de fotos ---------------- */
async function loadAdminPhotos() {
  const { data: photos } = await supabase.from('cover_photos').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true });
  const el = document.getElementById('adminPhotosList');
  document.getElementById('photosCountBadge').textContent = `${photos?.length || 0} foto${(photos?.length || 0) === 1 ? '' : 's'}`;

  if (!photos || !photos.length) {
    el.innerHTML = `<div class="empty-state"><div class="icon-big">📸</div>Todavía no subiste fotos.</div>`;
    return;
  }

  el.innerHTML = photos.map((p, i) => `
    <div class="match-card photo-card" data-id="${p.id}">
      <img src="${p.image_url}" alt="${p.caption || 'Foto del torneo'}" />
      <div class="photo-card-body">
        <div class="photo-card-caption">${p.caption || '<span style="color:var(--text-dim); font-weight:400;">Sin epígrafe</span>'}</div>
        <div class="photo-card-actions">
          <button class="btn btn-outline p-up" ${i === 0 ? 'disabled' : ''} title="Subir">↑</button>
          <button class="btn btn-outline p-down" ${i === photos.length - 1 ? 'disabled' : ''} title="Bajar">↓</button>
          <button class="btn btn-outline p-del" title="Eliminar" style="color:var(--red);">Eliminar</button>
        </div>
      </div>
    </div>`).join('');

  el.querySelectorAll('.photo-card').forEach(card => {
    const id = card.dataset.id;
    const idx = photos.findIndex(p => p.id === id);

    card.querySelector('.p-up')?.addEventListener('click', async () => {
      if (idx <= 0) return;
      await swapOrder(photos[idx], photos[idx - 1]);
      loadAdminPhotos();
    });
    card.querySelector('.p-down')?.addEventListener('click', async () => {
      if (idx >= photos.length - 1) return;
      await swapOrder(photos[idx], photos[idx + 1]);
      loadAdminPhotos();
    });
    card.querySelector('.p-del').addEventListener('click', async () => {
      if (!confirm('¿Eliminar esta foto del carrusel?')) return;
      const photo = photos[idx];
      const path = photo.image_url.split('/portada/').pop();
      if (path) await supabase.storage.from('portada').remove([path]);
      await supabase.from('cover_photos').delete().eq('id', photo.id);
      loadAdminPhotos();
    });
  });
}

async function swapOrder(a, b) {
  const orderA = a.sort_order, orderB = b.sort_order;
  const finalOrderA = orderA === orderB ? 1 : orderB;
  const finalOrderB = orderA === orderB ? 0 : orderA;
  await Promise.all([
    supabase.from('cover_photos').update({ sort_order: finalOrderA }).eq('id', a.id),
    supabase.from('cover_photos').update({ sort_order: finalOrderB }).eq('id', b.id)
  ]);
}

document.getElementById('uploadPhotoBtn').addEventListener('click', async () => {
  const fileInput = document.getElementById('photoFile');
  const caption = document.getElementById('photoCaption').value.trim();
  const alertEl = document.getElementById('photoAlert');
  const file = fileInput.files?.[0];

  if (!file) { showAlert(alertEl, 'error', 'Elegí una foto para subir.'); return; }
  if (file.size > 20 * 1024 * 1024) { showAlert(alertEl, 'error', 'La foto pesa más de 20MB.'); return; }

  const btn = document.getElementById('uploadPhotoBtn');
  btn.disabled = true; btn.textContent = 'Subiendo...';

  const ext = file.name.split('.').pop();
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from('portada').upload(path, file, { cacheControl: '3600', upsert: false });
  if (uploadError) {
    btn.disabled = false; btn.textContent = 'Subir foto';
    showAlert(alertEl, 'error', 'Error al subir: ' + uploadError.message);
    return;
  }

  const { data: pub } = supabase.storage.from('portada').getPublicUrl(path);
  const { count } = await supabase.from('cover_photos').select('*', { count: 'exact', head: true });

  const { error: insertError } = await supabase.from('cover_photos').insert({
    image_url: pub.publicUrl, caption: caption || null, sort_order: count || 0
  });

  btn.disabled = false; btn.textContent = 'Subir foto';
  if (insertError) { showAlert(alertEl, 'error', 'Error al guardar: ' + insertError.message); return; }

  showAlert(alertEl, 'success', 'Foto agregada al carrusel.');
  fileInput.value = '';
  document.getElementById('photoCaption').value = '';
  loadAdminPhotos();
});

async function boot() {
  const { data: { session } } = await supabase.auth.getSession();
  checkAdminAndBoot(session);
  supabase.auth.onAuthStateChange((_e, session) => checkAdminAndBoot(session));
}
boot();
