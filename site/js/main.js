import { supabase, isSchoolEmail } from './supabaseClient.js';

/* ============================================================
   Navegación entre secciones
   ============================================================ */
const navButtons = document.querySelectorAll('.main-nav button[data-section]');
const sections = document.querySelectorAll('.section');
const mainNav = document.getElementById('mainNav');
const navToggle = document.getElementById('navToggle');

function showSection(name) {
  sections.forEach(s => s.classList.toggle('active', s.id === `sec-${name}`));
  navButtons.forEach(b => b.classList.toggle('active', b.dataset.section === name));
  mainNav.classList.remove('open');
  window.scrollTo({ top: document.querySelector('.hero').nextElementSibling.offsetTop - 90, behavior: 'smooth' });
}
navButtons.forEach(btn => btn.addEventListener('click', () => showSection(btn.dataset.section)));
navToggle.addEventListener('click', () => mainNav.classList.toggle('open'));

// Deep-link vía hash (#posiciones, #inscripcion, etc.)
const hashSection = location.hash.replace('#', '');
if (hashSection && document.getElementById(`sec-${hashSection}`)) showSection(hashSection);

/* ============================================================
   Utilidades
   ============================================================ */
const fmtDate = (iso) => {
  if (!iso) return 'A confirmar';
  const d = new Date(iso);
  return d.toLocaleString('es-AR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const statusLabel = { scheduled: 'Programado', played: 'Jugado', suspended: 'Suspendido', postponed: 'Postergado' };

function teamName(map, id) { return map[id]?.name ?? 'Equipo'; }

/* ============================================================
   Portada - carrusel de fotos
   ============================================================ */
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

async function loadCoverCarousel() {
  const { data: photos } = await supabase
    .from('cover_photos')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  const track = document.getElementById('carouselTrack');
  const prevBtn = document.getElementById('carouselPrev');
  const nextBtn = document.getElementById('carouselNext');
  const dotsEl = document.getElementById('carouselDots');

  if (!photos || !photos.length) return; // deja el estado vacío ya presente en el HTML

  track.innerHTML = photos.map(p => `
    <div class="carousel-slide">
      <img src="${p.image_url}" alt="${p.caption ? p.caption.replace(/"/g, '&quot;') : 'Foto del torneo'}" loading="lazy" />
      ${p.caption ? `<div class="carousel-caption">${p.caption}</div>` : ''}
    </div>`).join('');

  dotsEl.innerHTML = photos.map((_, i) => `<button class="carousel-dot${i === 0 ? ' active' : ''}" data-i="${i}" aria-label="Ir a la foto ${i + 1}"></button>`).join('');

  let current = 0;
  const dots = [...dotsEl.querySelectorAll('.carousel-dot')];
  const total = photos.length;

  function goTo(i) {
    current = (i + total) % total;
    track.style.transform = `translateX(-${current * 100}%)`;
    dots.forEach((d, idx) => d.classList.toggle('active', idx === current));
  }

  if (total > 1) {
    prevBtn.hidden = false;
    nextBtn.hidden = false;
    prevBtn.addEventListener('click', () => { goTo(current - 1); resetAutoplay(); });
    nextBtn.addEventListener('click', () => { goTo(current + 1); resetAutoplay(); });
    dots.forEach(d => d.addEventListener('click', () => { goTo(parseInt(d.dataset.i)); resetAutoplay(); }));

    // Swipe táctil
    let startX = null;
    track.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    track.addEventListener('touchend', e => {
      if (startX === null) return;
      const diff = e.changedTouches[0].clientX - startX;
      if (Math.abs(diff) > 40) { diff > 0 ? goTo(current - 1) : goTo(current + 1); resetAutoplay(); }
      startX = null;
    }, { passive: true });

    let autoplayTimer = null;
    function startAutoplay() {
      if (prefersReducedMotion) return;
      autoplayTimer = setInterval(() => goTo(current + 1), 5000);
    }
    function resetAutoplay() {
      clearInterval(autoplayTimer);
      startAutoplay();
    }
    const carousel = document.getElementById('coverCarousel');
    carousel.addEventListener('mouseenter', () => clearInterval(autoplayTimer));
    carousel.addEventListener('mouseleave', startAutoplay);
    startAutoplay();
  }
}

/* ============================================================
   Avisos en la portada (duran 224 horas desde su creación)
   ============================================================ */
const AVISO_HORAS_VIGENCIA = 224;

async function loadPortadaAvisos() {
  const { data } = await supabase
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false });

  const wrap = document.getElementById('portadaAvisos');
  const inner = document.getElementById('portadaAvisosInner');

  const vigentes = (data || []).filter(a => {
    const hoursOld = (Date.now() - new Date(a.created_at).getTime()) / 36e5;
    return hoursOld < AVISO_HORAS_VIGENCIA && !sessionStorage.getItem(`dismissed-${a.id}`);
  });

  if (!vigentes.length) { wrap.hidden = true; inner.innerHTML = ''; return; }

  inner.innerHTML = vigentes.map(a => `
    <div class="portada-aviso-item ${a.kind}" data-id="${a.id}">
      <span class="portada-aviso-icon">${a.kind === 'suspension' ? '🌧️' : 'ℹ️'}</span>
      <div class="portada-aviso-text">
        <strong>${a.title}</strong>
        ${a.message}
      </div>
      <button class="portada-aviso-close" aria-label="Cerrar aviso" data-id="${a.id}">✕</button>
    </div>`).join('');

  inner.querySelectorAll('.portada-aviso-close').forEach(btn => {
    btn.addEventListener('click', () => {
      sessionStorage.setItem(`dismissed-${btn.dataset.id}`, '1');
      btn.closest('.portada-aviso-item').remove();
      if (!inner.querySelector('.portada-aviso-item')) wrap.hidden = true;
    });
  });

  wrap.hidden = false;
}

/* ============================================================
   Posiciones
   ============================================================ */
async function loadStandings() {
  const { data, error } = await supabase.from('standings').select('*');
  const el = document.getElementById('standingsContainer');
  if (error || !data) { el.innerHTML = `<div class="empty-state">No se pudo cargar la tabla.</div>`; return; }
  document.getElementById('standingsBadge').textContent = `${data.length} equipo${data.length === 1 ? '' : 's'}`;
  if (!data.length) { el.innerHTML = `<div class="empty-state"><div class="icon-big">🗒️</div>Todavía no hay equipos inscriptos.</div>`; return; }

  el.innerHTML = `
    <div class="table-wrap">
      <table class="standings-table">
        <thead><tr>
          <th>#</th><th class="team-col">Equipo</th><th>Curso</th>
          <th>PJ</th><th>PG</th><th>PE</th><th>PP</th><th>GF</th><th>GC</th><th>DG</th><th>Pts</th>
        </tr></thead>
        <tbody>
          ${data.map((t, i) => `
            <tr>
              <td data-label="#"><span class="pos-num">${i + 1}</span></td>
              <td class="team-name" data-label="Equipo">${t.name}</td>
              <td data-label="Curso">${t.course}</td>
              <td data-label="PJ">${t.pj}</td><td data-label="PG">${t.pg}</td><td data-label="PE">${t.pe}</td><td data-label="PP">${t.pp}</td>
              <td data-label="GF">${t.gf}</td><td data-label="GC">${t.gc}</td><td data-label="DG">${t.dg > 0 ? '+' + t.dg : t.dg}</td>
              <td class="pts-cell" data-label="Pts">${t.pts}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ============================================================
   Resultados y Fixture
   ============================================================ */
async function loadMatches() {
  const { data: teams } = await supabase.from('teams').select('id,name');
  const teamMap = Object.fromEntries((teams || []).map(t => [t.id, t]));

  const { data: matches } = await supabase.from('matches').select('*').order('scheduled_at', { ascending: true });

  const played = (matches || []).filter(m => m.status === 'played').sort((a, b) => new Date(b.scheduled_at || 0) - new Date(a.scheduled_at || 0));
  const upcoming = (matches || []).filter(m => m.status !== 'played');

  document.getElementById('resultsBadge').textContent = `${played.length} jugado${played.length === 1 ? '' : 's'}`;
  document.getElementById('fixtureBadge').textContent = `${upcoming.length} próximo${upcoming.length === 1 ? '' : 's'}`;

  const cardHtml = (m, showScore) => `
    <div class="match-card">
      <div class="match-meta">
        <span>Fecha ${m.matchday}</span>
        <span class="match-status status-${m.status}">${statusLabel[m.status] || m.status}</span>
      </div>
      <div class="match-teams">
        <div class="match-team home">${teamName(teamMap, m.home_team_id)}</div>
        <div class="match-score">${showScore && m.home_score !== null && m.away_score !== null ? `${m.home_score} - ${m.away_score}` : 'vs'}</div>
        <div class="match-team away">${teamName(teamMap, m.away_team_id)}</div>
      </div>
      <div class="match-venue">🗓️ ${fmtDate(m.scheduled_at)}${m.venue ? ' · 📍 ' + m.venue : ''}</div>
    </div>`;

  const resultsEl = document.getElementById('resultsContainer');
  resultsEl.innerHTML = played.length
    ? played.map(m => cardHtml(m, true)).join('')
    : `<div class="empty-state"><div class="icon-big">⚽</div>Todavía no se jugaron partidos.</div>`;

  const fixtureEl = document.getElementById('fixtureContainer');
  fixtureEl.innerHTML = upcoming.length
    ? upcoming.map(m => cardHtml(m, false)).join('')
    : `<div class="empty-state"><div class="icon-big">📅</div>No hay partidos programados por ahora.</div>`;
}

/* ============================================================
   Goleadores
   ============================================================ */
async function loadScorers() {
  const { data } = await supabase.from('top_scorers').select('*').limit(25);
  const el = document.getElementById('scorersContainer');
  document.getElementById('scorersBadge').textContent = `${data?.length || 0} jugador${(data?.length || 0) === 1 ? '' : 'es'}`;
  if (!data || !data.length) { el.innerHTML = `<div class="empty-state"><div class="icon-big">🥅</div>Todavía no hay goles cargados.</div>`; return; }
  el.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>#</th><th>Jugador/a</th><th>Curso</th><th>Equipo</th><th>Goles</th></tr></thead>
        <tbody>
          ${data.map((p, i) => `
            <tr>
              <td data-label="#"><span class="pos-num">${i + 1}</span></td>
              <td class="team-name" data-label="Jugador/a">${p.first_name} ${p.last_name}</td>
              <td data-label="Curso">${p.course}</td>
              <td data-label="Equipo">${p.team_name}</td>
              <td class="pts-cell" data-label="Goles">${p.goals}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ============================================================
   Inscripción - Auth por mail institucional
   ============================================================ */
const authAlert = document.getElementById('authAlert');
function showAlert(el, type, msg) {
  el.className = `alert show alert-${type}`;
  el.textContent = msg;
}

document.getElementById('sendMagicLink').addEventListener('click', async () => {
  const emailInput = document.getElementById('loginEmail');
  const email = emailInput.value.trim();
  if (!isSchoolEmail(email)) {
    showAlert(authAlert, 'error', 'Usá tu mail institucional @csjsf.edu.ar o @jsfernandez.org.');
    return;
  }
  const btn = document.getElementById('sendMagicLink');
  btn.disabled = true;
  btn.textContent = 'Enviando...';
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href.split('#')[0] + '#inscripcion' }
  });
  btn.disabled = false;
  btn.textContent = 'Enviar enlace de acceso';
  if (error) {
    showAlert(authAlert, 'error', 'No se pudo enviar el enlace: ' + error.message);
  } else {
    showAlert(authAlert, 'success', `Te enviamos un enlace a ${email}. Abrilo desde este mismo dispositivo para continuar.`);
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await supabase.auth.signOut();
  renderAuthState(null);
});

async function renderAuthState(session) {
  const authStep = document.getElementById('authStep');
  const registerStep = document.getElementById('registerStep');
  if (!session) {
    authStep.style.display = '';
    registerStep.style.display = 'none';
    return;
  }
  authStep.style.display = 'none';
  registerStep.style.display = '';
  document.getElementById('sessionEmail').textContent = session.user.email;
  await renderTeamPanel(session);
}

async function renderTeamPanel(session) {
  const container = document.getElementById('teamStatus');
  container.innerHTML = `<div class="skeleton" style="height:120px"></div>`;

  const { data: myTeam } = await supabase.from('teams').select('*').eq('captain_user_id', session.user.id).maybeSingle();

  if (!myTeam) {
    container.innerHTML = `
      <div class="panel" style="box-shadow:none; padding:0; border:none;">
        <h3 style="margin-top:0;">Inscribí a tu equipo</h3>
        <div class="form-grid">
          <div class="two-col">
            <div class="form-row">
              <label for="teamNameInput">Nombre del equipo</label>
              <input id="teamNameInput" placeholder="Ej: Los Tigres" />
            </div>
            <div class="form-row">
              <label for="teamCourseInput">Curso</label>
              <input id="teamCourseInput" placeholder="Ej: 5° Año A" />
            </div>
          </div>
          <button class="btn btn-primary" id="createTeamBtn">Crear equipo</button>
        </div>
        <div class="alert" id="teamAlert"></div>
      </div>`;
    document.getElementById('createTeamBtn').addEventListener('click', async () => {
      const name = document.getElementById('teamNameInput').value.trim();
      const course = document.getElementById('teamCourseInput').value.trim();
      const alertEl = document.getElementById('teamAlert');
      if (!name || !course) { showAlert(alertEl, 'error', 'Completá nombre del equipo y curso.'); return; }
      const { error } = await supabase.from('teams').insert({
        name, course, captain_email: session.user.email, captain_user_id: session.user.id
      });
      if (error) { showAlert(alertEl, 'error', 'Error al crear el equipo: ' + error.message); return; }
      renderTeamPanel(session);
      loadStandings();
    });
    return;
  }

  await renderPlayersPanel(myTeam);
}

async function renderPlayersPanel(team) {
  const container = document.getElementById('teamStatus');
  const { data: players } = await supabase.from('players').select('*').eq('team_id', team.id).order('created_at');

  container.innerHTML = `
    <div class="panel" style="box-shadow:none; padding:0; border:none;">
      <h3 style="margin-top:0;">Equipo: ${team.name} <span class="badge">${team.course}</span></h3>
      <p style="color:var(--text-dim); font-size:13.5px;">Agregá los jugadores del plantel completando nombre, apellido y curso.</p>

      <div id="playersList">
        ${players && players.length ? players.map(p => `
          <div class="player-row" data-id="${p.id}">
            <div class="form-row"><label>Nombre</label><input value="${p.first_name}" disabled /></div>
            <div class="form-row"><label>Apellido</label><input value="${p.last_name}" disabled /></div>
            <div class="form-row"><label>Curso</label><input value="${p.course}" disabled /></div>
            <button class="remove-player" title="Quitar jugador" data-player="${p.id}">✕</button>
          </div>`).join('') : ''}
      </div>

      <h4 style="margin-bottom:8px;">Agregar jugador/a</h4>
      <div class="player-row">
        <div class="form-row"><label>Nombre</label><input id="newFirstName" placeholder="Nombre" /></div>
        <div class="form-row"><label>Apellido</label><input id="newLastName" placeholder="Apellido" /></div>
        <div class="form-row"><label>Curso</label><input id="newCourse" placeholder="Curso" value="${team.course}" /></div>
        <button class="btn btn-primary btn-sm" id="addPlayerBtn">+ Agregar</button>
      </div>
      <div class="alert" id="playersAlert"></div>
    </div>`;

  document.getElementById('addPlayerBtn').addEventListener('click', async () => {
    const first_name = document.getElementById('newFirstName').value.trim();
    const last_name = document.getElementById('newLastName').value.trim();
    const course = document.getElementById('newCourse').value.trim();
    const alertEl = document.getElementById('playersAlert');
    if (!first_name || !last_name || !course) { showAlert(alertEl, 'error', 'Completá nombre, apellido y curso.'); return; }
    const { error } = await supabase.from('players').insert({ team_id: team.id, first_name, last_name, course });
    if (error) { showAlert(alertEl, 'error', 'Error al agregar: ' + error.message); return; }
    renderPlayersPanel(team);
  });

  container.querySelectorAll('.remove-player').forEach(btn => {
    btn.addEventListener('click', async () => {
      await supabase.from('players').delete().eq('id', btn.dataset.player);
      renderPlayersPanel(team);
    });
  });
}

/* ============================================================
   Boot
   ============================================================ */
async function boot() {
  loadCoverCarousel();
  loadPortadaAvisos();
  loadStandings();
  loadMatches();
  loadScorers();

  const { data: { session } } = await supabase.auth.getSession();
  renderAuthState(session);

  supabase.auth.onAuthStateChange((_event, session) => {
    renderAuthState(session);
  });
}
boot();
