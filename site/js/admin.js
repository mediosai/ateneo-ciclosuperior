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
  document.getElementById('adminEmailChip').textContent = session.user.email;

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
  const matchdayVal = document.getElementById('annMatchday').value;
  const alertEl = document.getElementById('annAlert');
  if (!title || !message) { showAlert(alertEl, 'error', 'Completá título y mensaje.'); return; }
  const { error } = await supabase.from('announcements').insert({
    kind, title, message, matchday: matchdayVal ? parseInt(matchdayVal) : null
  });
  if (error) { showAlert(alertEl, 'error', error.message); return; }
  showAlert(alertEl, 'success', 'Aviso publicado.');
  document.getElementById('annTitle').value = '';
  document.getElementById('annMessage').value = '';
  document.getElementById('annMatchday').value = '';
  loadAdminAnnouncements();
});

/* ---------------- Equipos ---------------- */
async function loadAdminTeams() {
  await loadTeamsIntoState();
  document.getElementById('teamsCountBadge').textContent = `${TEAMS.length} equipo${TEAMS.length === 1 ? '' : 's'}`;
  const el = document.getElementById('adminTeamsList');
  if (!TEAMS.length) { el.innerHTML = `<div class="empty-state">Todavía no se inscribió ningún equipo.</div>`; }
  else {
    el.innerHTML = `<table>
      <thead><tr><th>Equipo</th><th>Curso</th><th>Capitán</th><th>Inscripto</th></tr></thead>
      <tbody>${TEAMS.map(t => `<tr><td class="team-name" data-label="Equipo">${t.name}</td><td data-label="Curso">${t.course}</td><td data-label="Capitán">${t.captain_email}</td><td data-label="Inscripto">${new Date(t.created_at).toLocaleDateString('es-AR')}</td></tr>`).join('')}</tbody>
    </table>`;
  }
  fillTeamSelects();
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
  const whenVal = document.getElementById('matchWhen').value;
  const venue = document.getElementById('matchVenue').value.trim();
  const alertEl = document.getElementById('matchAlert');

  if (!home_team_id || !away_team_id || home_team_id === away_team_id) {
    showAlert(alertEl, 'error', 'Elegí dos equipos distintos.'); return;
  }
  const { error } = await supabase.from('matches').insert({
    home_team_id, away_team_id, matchday,
    scheduled_at: whenVal ? new Date(whenVal).toISOString() : null,
    venue: venue || null, status: 'scheduled'
  });
  if (error) { showAlert(alertEl, 'error', error.message); return; }
  showAlert(alertEl, 'success', 'Partido programado.');
  document.getElementById('matchVenue').value = '';
  loadAdminMatches();
});

/* ---------------- Gestión de partidos (resultado + goles) ---------------- */
async function loadAdminMatches() {
  const { data: matches } = await supabase.from('matches').select('*').order('scheduled_at', { ascending: true });
  const teamMap = Object.fromEntries(TEAMS.map(t => [t.id, t]));
  const el = document.getElementById('adminMatchesList');

  if (!matches || !matches.length) { el.innerHTML = `<div class="empty-state">No hay partidos cargados todavía.</div>`; return; }

  el.innerHTML = matches.map(m => `
    <div class="match-card" style="margin-bottom:14px;" data-match="${m.id}">
      <div class="match-meta">
        <span>Fecha ${m.matchday} · ${teamMap[m.home_team_id]?.name || '?'} vs ${teamMap[m.away_team_id]?.name || '?'}</span>
      </div>
      <div class="two-col">
        <div class="form-row">
          <label>Estado</label>
          <select class="m-status">
            <option value="scheduled" ${m.status === 'scheduled' ? 'selected' : ''}>Programado</option>
            <option value="played" ${m.status === 'played' ? 'selected' : ''}>Jugado</option>
            <option value="suspended" ${m.status === 'suspended' ? 'selected' : ''}>Suspendido</option>
            <option value="postponed" ${m.status === 'postponed' ? 'selected' : ''}>Postergado</option>
          </select>
        </div>
        <div class="form-row" style="display:flex; gap:8px;">
          <div style="flex:1"><label>Goles local</label><input type="number" min="0" class="m-home-score" value="${m.home_score ?? ''}" /></div>
          <div style="flex:1"><label>Goles visitante</label><input type="number" min="0" class="m-away-score" value="${m.away_score ?? ''}" /></div>
        </div>
      </div>
      <div style="display:flex; gap:8px; margin-top:10px;">
        <button class="btn btn-primary btn-sm m-save">Guardar resultado</button>
        <button class="btn btn-outline btn-sm m-delete">Eliminar partido</button>
      </div>
      <div class="alert m-alert"></div>

      <h4 style="margin:16px 0 8px;">Goles del partido</h4>
      <div class="goals-list"></div>
      <div class="two-col" style="align-items:end;">
        <div class="form-row">
          <label>Jugador/a</label>
          <select class="g-player"></select>
        </div>
        <div class="form-row" style="display:flex; gap:8px;">
          <div style="flex:1"><label>Minuto</label><input type="number" min="0" class="g-minute" placeholder="Ej: 23" /></div>
          <button class="btn btn-primary btn-sm g-add" style="align-self:end;">+ Gol</button>
        </div>
      </div>
    </div>`).join('');

  for (const m of matches) {
    const card = el.querySelector(`[data-match="${m.id}"]`);
    card.querySelector('.m-save').addEventListener('click', async () => {
      const status = card.querySelector('.m-status').value;
      const hs = card.querySelector('.m-home-score').value;
      const as = card.querySelector('.m-away-score').value;
      const alertEl = card.querySelector('.m-alert');
      const { error } = await supabase.from('matches').update({
        status,
        home_score: hs === '' ? null : parseInt(hs),
        away_score: as === '' ? null : parseInt(as),
        updated_at: new Date().toISOString()
      }).eq('id', m.id);
      if (error) showAlert(alertEl, 'error', error.message);
      else { showAlert(alertEl, 'success', 'Guardado.'); }
    });
    card.querySelector('.m-delete').addEventListener('click', async () => {
      if (!confirm('¿Eliminar este partido y sus goles?')) return;
      await supabase.from('matches').delete().eq('id', m.id);
      loadAdminMatches();
    });

    const homePlayers = await supabase.from('players').select('*').eq('team_id', m.home_team_id);
    const awayPlayers = await supabase.from('players').select('*').eq('team_id', m.away_team_id);
    const allPlayers = [
      ...(homePlayers.data || []).map(p => ({ ...p, teamLabel: teamMap[m.home_team_id]?.name })),
      ...(awayPlayers.data || []).map(p => ({ ...p, teamLabel: teamMap[m.away_team_id]?.name }))
    ];
    const playerSel = card.querySelector('.g-player');
    playerSel.innerHTML = allPlayers.map(p => `<option value="${p.id}" data-team="${p.team_id}">${p.first_name} ${p.last_name} (${p.teamLabel})</option>`).join('') || `<option disabled>Sin jugadores cargados</option>`;

    async function refreshGoals() {
      const { data: goals } = await supabase.from('goals').select('*, players(first_name,last_name)').eq('match_id', m.id).order('minute');
      const list = card.querySelector('.goals-list');
      list.innerHTML = (goals || []).length
        ? goals.map(g => `<div class="announce-item info" style="padding:8px 12px;">
             <span class="icon">⚽</span>
             <div style="flex:1">${g.players?.first_name || ''} ${g.players?.last_name || ''} ${g.minute != null ? `· min ${g.minute}` : ''}</div>
             <button class="btn btn-outline btn-sm" data-del-goal="${g.id}">Quitar</button>
           </div>`).join('')
        : `<div class="empty-state" style="padding:10px;">Sin goles cargados.</div>`;
      list.querySelectorAll('[data-del-goal]').forEach(b => b.addEventListener('click', async () => {
        await supabase.from('goals').delete().eq('id', b.dataset.delGoal);
        refreshGoals();
      }));
    }
    refreshGoals();

    card.querySelector('.g-add').addEventListener('click', async () => {
      const playerId = playerSel.value;
      const teamId = playerSel.selectedOptions[0]?.dataset.team;
      const minuteVal = card.querySelector('.g-minute').value;
      if (!playerId || !teamId) return;
      await supabase.from('goals').insert({
        match_id: m.id, player_id: playerId, team_id: teamId,
        minute: minuteVal ? parseInt(minuteVal) : null
      });
      card.querySelector('.g-minute').value = '';
      refreshGoals();
    });
  }
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
