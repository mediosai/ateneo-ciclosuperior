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

// Logo/nombre del colegio: vuelve al inicio.
// El enlace apunta a index.html, asi que aunque este JS no llegue a
// cargar (cache vieja, error de red), tocarlo igual vuelve al home.
// Con el JS activo evitamos la recarga y hacemos la vuelta suave.
document.getElementById('brandLink').addEventListener('click', (e) => {
  e.preventDefault();
  mainNav.classList.remove('open');
  sections.forEach(s => s.classList.toggle('active', s.id === 'sec-posiciones'));
  navButtons.forEach(b => b.classList.toggle('active', b.dataset.section === 'posiciones'));
  if (location.hash) history.replaceState(null, '', location.pathname);
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// Deep-link vía hash (#posiciones, #inscripcion, etc.)
const hashSection = location.hash.replace('#', '');
if (hashSection && document.getElementById(`sec-${hashSection}`)) showSection(hashSection);

/* ============================================================
   Logo animado: ubica la pelota en el lugar exacto de la O
   ============================================================ */
function ajustarLogo() {
  const svg = document.querySelector('.ateneo-logo');
  const word = document.getElementById('alWord');
  const ball = svg && svg.querySelector('.al-ball');
  if (!svg || !word || !ball) return;

  // Ancho de una "O" con la misma tipografía, medido sobre el propio SVG
  const probe = word.cloneNode(false);
  probe.removeAttribute('id');
  probe.setAttribute('visibility', 'hidden');
  probe.textContent = 'O';
  svg.appendChild(probe);
  const oWidth = probe.getComputedTextLength();
  svg.removeChild(probe);
  if (!oWidth) return;

  // El alto hay que medirlo aparte: getBBox() de un <text> devuelve la caja
  // de línea (con ascendentes y descendentes), no el alto real de la letra.
  const cs = getComputedStyle(word);
  const fontSize = parseFloat(cs.fontSize) || 62;
  let inkAscent = fontSize * 0.71;   // respaldo aproximado si no hay canvas
  let inkDescent = fontSize * 0.01;
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const m = ctx.measureText('O');
    if (m.actualBoundingBoxAscent) {
      inkAscent = m.actualBoundingBoxAscent;
      inkDescent = m.actualBoundingBoxDescent || 0;
    }
  } catch (_) { /* nos quedamos con la aproximación */ }
  const oHeight = inkAscent + inkDescent;

  // "ATENE" + la pelota-O tienen que quedar centrados como una sola palabra
  const wordWidth = word.getComputedTextLength();
  const left = 200 - (wordWidth + oWidth) / 2;
  word.setAttribute('text-anchor', 'start');
  word.setAttribute('x', left);

  const baseline = Number(word.getAttribute('y')) || 292;
  const oCenterX = left + wordWidth + oWidth / 2;
  const oCenterY = baseline - (inkAscent - inkDescent) / 2;

  ball.style.setProperty('--al-dx', (oCenterX - 200) + 'px');
  ball.style.setProperty('--al-dy', (oCenterY - 196) + 'px');
  ball.style.setProperty('--al-s', oHeight / 54); // 54 = diámetro de la pelota
}

// Se mide con la tipografía ya cargada; si tarda, igual hay valores de respaldo
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(ajustarLogo);
} else {
  window.addEventListener('load', ajustarLogo);
}

/* ============================================================
   Utilidades
   ============================================================ */
const fmtDate = (iso) => {
  if (!iso) return 'A confirmar';
  const d = new Date(iso);
  return d.toLocaleString('es-AR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
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
        ${a.message || ''}
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
  const fullEl = document.getElementById('fullStandingsContainer');

  if (error || !data) {
    el.innerHTML = fullEl.innerHTML = `<div class="empty-state">No se pudo cargar la tabla.</div>`;
    return;
  }

  const count = `${data.length} equipo${data.length === 1 ? '' : 's'}`;
  document.getElementById('standingsBadge').textContent = count;
  document.getElementById('fullStandingsBadge').textContent = count;

  if (!data.length) {
    el.innerHTML = fullEl.innerHTML = `<div class="empty-state"><div class="icon-big">🗒️</div>Todavía no hay equipos inscriptos.</div>`;
    return;
  }

  // Home: versión resumida, solo el orden
  el.innerHTML = `
    <div class="table-wrap">
      <table class="standings-table">
        <thead><tr>
          <th>#</th><th class="team-col">Equipo</th><th>Curso</th><th>Pts</th>
        </tr></thead>
        <tbody>
          ${data.map((t, i) => `
            <tr>
              <td data-label="#"><span class="pos-num">${i + 1}</span></td>
              <td class="team-name" data-label="Equipo">${t.name}</td>
              <td data-label="Curso">${t.course}</td>
              <td class="pts-cell" data-label="Pts">${t.pts}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  // Pestaña Posiciones: tabla completa de doble entrada
  fullEl.innerHTML = `
    <div class="table-wrap grid-table">
      <table class="full-standings">
        <thead>
          <tr>
            <th class="col-pos">#</th>
            <th class="col-team">Equipo</th>
            <th title="Puntos">Pts</th>
            <th title="Partidos jugados">PJ</th>
            <th title="Partidos ganados">PG</th>
            <th title="Partidos empatados">PE</th>
            <th title="Partidos perdidos">PP</th>
            <th title="Goles a favor">GF</th>
            <th title="Goles en contra">GC</th>
            <th title="Diferencia de goles">DG</th>
          </tr>
        </thead>
        <tbody>
          ${data.map((t, i) => `
            <tr>
              <td class="col-pos"><span class="pos-num">${i + 1}</span></td>
              <td class="col-team">
                <span class="ft-name">${t.name}</span>
                <span class="ft-course">${t.course}</span>
              </td>
              <td class="pts-cell">${t.pts}</td>
              <td>${t.pj}</td>
              <td>${t.pg}</td>
              <td>${t.pe}</td>
              <td>${t.pp}</td>
              <td>${t.gf}</td>
              <td>${t.gc}</td>
              <td>${t.dg > 0 ? '+' + t.dg : t.dg}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <p class="table-legend">Pts: puntos · PJ: jugados · PG: ganados · PE: empatados · PP: perdidos · GF: goles a favor · GC: goles en contra · DG: diferencia</p>`;
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
  const { data } = await supabase.from('top_scorers').select('*');
  const el = document.getElementById('scorersContainer');
  const total = data?.length || 0;
  if (!total) { el.innerHTML = `<div class="empty-state"><div class="icon-big">🥅</div>Todavía no hay goles cargados.</div>`; return; }

  const top3 = data.slice(0, 3);
  const medals = ['🥇', '🥈', '🥉'];
  const visualOrder = [1, 0, 2]; // 2º, 1º, 3º de izquierda a derecha

  el.innerHTML = `
    <div class="podium">
      ${visualOrder.filter(i => top3[i]).map(i => {
        const p = top3[i];
        return `
        <div class="podium-place place-${i + 1}" tabindex="0" role="button" aria-pressed="false">
          <div class="podium-medal">${medals[i]}</div>
          <div class="podium-goals">${p.goals}<span>${p.goals === 1 ? 'gol' : 'goles'}</span></div>
          <div class="podium-bar">
            <div class="podium-name">${p.first_name} ${p.last_name}</div>
            <div class="podium-detail">${p.team_name}</div>
          </div>
        </div>`;
      }).join('')}
    </div>`;

  el.querySelectorAll('.podium-place').forEach(place => {
    const toggle = () => {
      const wasPicked = place.classList.contains('picked');
      el.querySelectorAll('.podium-place').forEach(p => { p.classList.remove('picked'); p.setAttribute('aria-pressed', 'false'); });
      if (!wasPicked) { place.classList.add('picked'); place.setAttribute('aria-pressed', 'true'); }
    };
    place.addEventListener('click', toggle);
    place.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  });
}

/* ============================================================
   Inscripción - formulario directo, sin login ni verificación de mail
   ============================================================ */
function showAlert(el, type, msg) {
  // No pisar className: el elemento puede tener clases propias
  el.classList.remove('alert-error', 'alert-success', 'alert-info');
  el.classList.add('alert', 'show', `alert-${type}`);
  el.textContent = msg;
}

let pendingPlayers = [];

function renderPendingPlayers() {
  const list = document.getElementById('playersList');
  list.innerHTML = pendingPlayers.map((p, i) => `
    <div class="player-row">
      <div class="form-row"><label>Nombre</label><input value="${p.first_name}" disabled /></div>
      <div class="form-row"><label>Apellido</label><input value="${p.last_name}" disabled /></div>
      <div class="form-row"><label>Curso</label><input value="${p.course}" disabled /></div>
      <button class="remove-player" type="button" title="Quitar jugador" data-i="${i}">✕</button>
    </div>`).join('');
  list.querySelectorAll('.remove-player').forEach(btn => {
    btn.addEventListener('click', () => {
      pendingPlayers.splice(parseInt(btn.dataset.i), 1);
      renderPendingPlayers();
    });
  });
}

document.getElementById('addPlayerBtn').addEventListener('click', () => {
  const first_name = document.getElementById('newFirstName').value.trim();
  const last_name = document.getElementById('newLastName').value.trim();
  const course = document.getElementById('newCourse').value.trim();
  const alertEl = document.getElementById('teamAlert');
  if (!first_name || !last_name || !course) { showAlert(alertEl, 'error', 'Completá nombre, apellido y curso del jugador antes de agregarlo.'); return; }
  pendingPlayers.push({ first_name, last_name, course });
  document.getElementById('newFirstName').value = '';
  document.getElementById('newLastName').value = '';
  document.getElementById('newCourse').value = '';
  renderPendingPlayers();
});

document.getElementById('submitTeamBtn').addEventListener('click', async () => {
  const name = document.getElementById('teamNameInput').value.trim();
  const course = document.getElementById('teamCourseInput').value.trim();
  const captain_email = document.getElementById('teamEmailInput').value.trim();
  const alertEl = document.getElementById('teamAlert');

  if (!name || !course) { showAlert(alertEl, 'error', 'Completá nombre del equipo y curso.'); return; }
  if (!isSchoolEmail(captain_email)) { showAlert(alertEl, 'error', 'Usá un mail institucional @csjsf.edu.ar o @jsfernandez.org.'); return; }
  if (!pendingPlayers.length) { showAlert(alertEl, 'error', 'Agregá al menos un jugador antes de inscribir el equipo.'); return; }

  const btn = document.getElementById('submitTeamBtn');
  btn.disabled = true; btn.textContent = 'Inscribiendo...';

  const { data: team, error: teamError } = await supabase.from('teams')
    .insert({ name, course, captain_email })
    .select().single();

  if (teamError) {
    btn.disabled = false; btn.textContent = 'Inscribir equipo';
    showAlert(alertEl, 'error', 'Error al inscribir el equipo: ' + teamError.message);
    return;
  }

  const { error: playersError } = await supabase.from('players')
    .insert(pendingPlayers.map(p => ({ ...p, team_id: team.id })));

  btn.disabled = false; btn.textContent = 'Inscribir equipo';

  if (playersError) {
    showAlert(alertEl, 'error', 'El equipo se creó, pero hubo un error al cargar los jugadores: ' + playersError.message);
    return;
  }

  showAlert(alertEl, 'success', `¡Listo! ${name} quedó inscripto con ${pendingPlayers.length} jugador${pendingPlayers.length === 1 ? '' : 'es'}.`);
  document.getElementById('teamNameInput').value = '';
  document.getElementById('teamCourseInput').value = '';
  document.getElementById('teamEmailInput').value = '';
  pendingPlayers = [];
  renderPendingPlayers();
  loadStandings();
});

/* ============================================================
   Boot
   ============================================================ */
async function boot() {
  loadCoverCarousel();
  loadPortadaAvisos();
  loadStandings();
  loadMatches();
  loadScorers();
  renderPendingPlayers();
}
boot();
