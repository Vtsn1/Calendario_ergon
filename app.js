const STATUS = {
  done: { label: "Concluida", color: "#1D9E75", bg: "#EAF3DE", tx: "#27500A" },
  hoje: { label: "Em andamento", color: "#378ADD", bg: "#E6F1FB", tx: "#0C447C" },
  atraso: { label: "Em atraso", color: "#E24B4A", bg: "#FCEBEB", tx: "#791F1F" },
  pendente: { label: "Pendente", color: "#888780", bg: "#F1EFE8", tx: "#5F5E5A" },
  feriado: { label: "Feriado", color: "#8B5CF6", bg: "#F3EEFE", tx: "#5B21B6" }
};

const PHASE_COLORS = {
  "Estudos": "#1D9E75",
  "Kick-off": "#185FA5",
  "Revisao": "#854F0B",
  "Desenvolv.": "#7F77DD",
  "Integracao": "#D85A30",
  "Deploy": "#D4537E",
  "Monitoramento": "#888780",
  "Entrega": "#3B6D11"
};

let DB = null;
let state = {
  month: 3,
  year: 2026,
  selected: null,
  filter: null
};

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[ch]));

const fmtDate = iso => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const dayMs = 86400000;
const todayIso = () => DB.config.hoje || new Date().toISOString().slice(0, 10);
const byDate = () => [...DB.dias].sort((a, b) => a.data.localeCompare(b.data));
const dayInfo = iso => DB.dias.find(d => d.data === iso);
const statusOf = day => day?.status || "pendente";
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
const firstDow = (y, m) => (new Date(y, m, 1).getDay() + 6) % 7;
const isWeekend = iso => {
  const dow = new Date(`${iso}T12:00:00`).getDay();
  return dow === 0 || dow === 6;
};

function init() {
  fetch("dados.json", { cache: "no-store" })
    .then(res => {
      if (!res.ok) throw new Error("Nao foi possivel carregar dados.json");
      return res.json();
    })
    .then(data => {
      DB = data;
      state.selected = todayIso();
      render();
    })
    .catch(err => {
      document.body.innerHTML = `<main class="shell"><section class="card"><h1>Erro</h1><p>${esc(err.message)}</p></section></main>`;
    });
}

function render() {
  $("subtitle").textContent = `${DB.config.descricao} · ${fmtDate(DB.config.inicio)} a ${fmtDate(DB.config.fim)} · ${DB.config.horasDia}h/dia · ${DB.config.totalHoras}h totais`;
  renderKpis();
  renderDonut();
  renderProgress();
  renderPhases();
  renderAlerts();
  renderFilters();
  renderCalendar();
  renderDetail();
  renderChart();
  renderNotes();
  renderHistory();
}

function counts() {
  return DB.dias.reduce((acc, day) => {
    const st = statusOf(day);
    acc[st] = (acc[st] || 0) + 1;
    return acc;
  }, { done: 0, hoje: 0, atraso: 0, pendente: 0, feriado: 0 });
}

function filteredDays() {
  return state.filter ? DB.dias.filter(day => statusOf(day) === state.filter) : DB.dias;
}

function renderKpis() {
  const done = DB.dias.filter(d => statusOf(d) === "done").length;
  const total = DB.config.total || DB.dias.length;
  const pct = Math.round((done / total) * 100);
  const hours = DB.dias.reduce((sum, d) => sum + (Number(d.horas) || 0), 0);
  const bugs = DB.dias.reduce((sum, d) => sum + (Number(d.bugs) || 0), 0);
  const remaining = Math.max(0, DB.config.totalHoras - hours);

  $("kpis").innerHTML = [
    kpi("Progresso geral", `${pct}%`, `${done} / ${total} tarefas`, "#185FA5"),
    kpi("Carga horaria", `${hours}h`, `${DB.config.totalHoras}h totais`, "#854F0B"),
    kpi("Bugs encontrados", bugs, "acumulados", "#A32D2D"),
    kpi("Horas restantes", `${remaining}h`, "ate completar a meta", "#5F5E5A")
  ].join("");
}

function kpi(label, value, sub, color) {
  return `<article class="kpi">
    <div class="kpi-label">${label}</div>
    <div class="kpi-value" style="color:${color}">${value}</div>
    <div class="kpi-sub">${sub}</div>
  </article>`;
}

function renderDonut() {
  const cnt = counts();
  const total = Object.values(cnt).reduce((a, b) => a + b, 0);
  const segments = Object.entries(cnt).filter(([, n]) => n > 0);
  const cx = 90, cy = 90, r = 70, ri = 44;
  let angle = -90;
  let paths = "";

  const polar = (radius, deg) => ({
    x: cx + radius * Math.cos(deg * Math.PI / 180),
    y: cy + radius * Math.sin(deg * Math.PI / 180)
  });

  for (const [key, n] of segments) {
    const end = angle + (n / total) * 360;
    const large = n / total > .5 ? 1 : 0;
    const s1 = polar(r, angle), e1 = polar(r, end), s2 = polar(ri, end), e2 = polar(ri, angle);
    const d = `M${s1.x.toFixed(2)},${s1.y.toFixed(2)} A${r},${r},0,${large},1,${e1.x.toFixed(2)},${e1.y.toFixed(2)} L${s2.x.toFixed(2)},${s2.y.toFixed(2)} A${ri},${ri},0,${large},0,${e2.x.toFixed(2)},${e2.y.toFixed(2)} Z`;
    const dim = state.filter && state.filter !== key ? .25 : 1;
    paths += `<path d="${d}" fill="${STATUS[key].color}" opacity="${dim}" data-filter="${key}"></path>`;
    angle = end;
  }

  const donePct = Math.round(((cnt.done || 0) / total) * 100);
  const legend = segments.map(([key, n]) => `<button class="${state.filter === key ? "active" : ""}" data-filter="${key}">
    <span class="dot" style="background:${STATUS[key].color}"></span>
    ${STATUS[key].label}<b style="color:${STATUS[key].color}">${n}</b>
  </button>`).join("");

  $("donut").innerHTML = `<svg width="180" height="180" viewBox="0 0 180 180">
    ${paths}
    <text x="90" y="84" text-anchor="middle" font-size="22" font-weight="700">${donePct}%</text>
    <text x="90" y="106" text-anchor="middle" font-size="11" fill="#66717f">concluido</text>
  </svg>
  <div class="donut-legend">${legend}</div>`;

  $("donut").querySelectorAll("[data-filter]").forEach(el => {
    el.addEventListener("click", () => toggleFilter(el.dataset.filter));
  });
}

function renderProgress() {
  const sorted = byDate();
  const done = sorted.filter(d => statusOf(d) === "done").length;
  const total = DB.config.total || sorted.length;
  const pct = Math.round((done / total) * 100);
  const ini = new Date(`${DB.config.inicio}T12:00:00`);
  const fim = new Date(`${DB.config.fim}T12:00:00`);
  const hoje = new Date(`${todayIso()}T12:00:00`);
  const timePct = Math.max(0, Math.min(100, Math.round(((hoje - ini) / (fim - ini)) * 100)));
  const color = pct >= timePct ? "#1D9E75" : pct >= timePct - 15 ? "#EF9F27" : "#E24B4A";

  $("progress").innerHTML = `<div class="bar-caption">
    <span>Inicio: ${fmtDate(DB.config.inicio)}</span>
    <strong style="color:${color}">${pct}% concluido - ${done} / ${total}</strong>
    <span>Fim: ${fmtDate(DB.config.fim)}</span>
  </div>
  <div class="bar">
    <div class="bar-fill" style="width:${pct}%;background:${color}"></div>
    <div class="today-mark" style="left:${timePct}%"></div>
  </div>
  <p class="hint">Hoje: ${fmtDate(todayIso())} (${timePct}% do periodo)</p>`;
}

function renderPhases() {
  const phases = [...new Set(DB.dias.map(d => d.fase))];
  $("phases").innerHTML = phases.map(phase => {
    const days = DB.dias.filter(d => d.fase === phase);
    const done = days.filter(d => statusOf(d) === "done").length;
    const pct = Math.round((done / days.length) * 100);
    const color = PHASE_COLORS[phase] || "#888";
    return `<div class="phase-row">
      <span class="dot" style="background:${color}"></span>
      <span>${esc(phase)}</span>
      <span class="mini-bar"><span class="mini-fill" style="width:${pct}%;background:${color}"></span></span>
      <strong>${pct}%</strong>
      <span class="phase-count">${done}/${days.length}</span>
    </div>`;
  }).join("");
}

function renderAlerts() {
  const today = todayIso();
  const active = DB.dias.filter(d => d.data === today);
  const next = DB.dias.find(d => d.data > today);
  const late = DB.dias.filter(d => d.data < today && !["done", "feriado"].includes(statusOf(d)));
  const alerts = [];

  if (active.length) alerts.push(["Tarefa ativa hoje", active.map(d => `${d.id} - ${d.atividade}`).join(", ")]);
  if (next) {
    const diff = Math.round((new Date(`${next.data}T12:00:00`) - new Date(`${today}T12:00:00`)) / dayMs);
    alerts.push([`Proxima tarefa em ${diff} dia${diff === 1 ? "" : "s"}`, `${next.id} - ${next.atividade} · ${fmtDate(next.data)}`]);
  }
  if (late.length) alerts.push([`${late.length} tarefa${late.length === 1 ? "" : "s"} em atraso`, late.slice(0, 5).map(d => d.id).join(", ")]);

  $("alerts").innerHTML = alerts.length
    ? alerts.map(([title, text]) => `<div class="alert"><div><strong>${esc(title)}</strong><span>${esc(text)}</span></div></div>`).join("")
    : `<p class="hint">Nenhum aviso.</p>`;
}

function renderFilters() {
  const cnt = counts();
  const buttons = Object.entries(STATUS).map(([key, s]) => `<button class="filter-btn ${state.filter === key ? "active" : ""}" data-filter="${key}">
    <span class="dot" style="background:${s.color}"></span>${s.label} (${cnt[key] || 0})
  </button>`).join("");
  const clear = state.filter ? `<button class="filter-btn" data-filter="">Todos</button>` : "";
  $("filters").innerHTML = buttons + clear;
  $("filters").querySelectorAll("[data-filter]").forEach(btn => {
    btn.addEventListener("click", () => toggleFilter(btn.dataset.filter || null));
  });
}

function toggleFilter(value) {
  state.filter = state.filter === value ? null : value;
  render();
}

function renderCalendar() {
  const months = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const weekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];
  const total = daysInMonth(state.year, state.month);
  const start = firstDow(state.year, state.month);
  let cells = "";

  for (let i = 0; i < start; i++) cells += `<div></div>`;
  for (let d = 1; d <= total; d++) {
    const iso = `${state.year}-${String(state.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const info = dayInfo(iso);
    const st = info ? statusOf(info) : null;
    const meta = st ? STATUS[st] : null;
    const dim = state.filter && st !== state.filter ? "dim" : "";
    const selected = state.selected === iso ? "selected" : "";
    const weekend = isWeekend(iso) ? "weekend" : "";
    const bg = meta ? `background:${meta.bg}` : "";
    const title = info ? esc(info.atividade) : "";
    cells += `<button class="day ${dim} ${selected} ${weekend}" style="${bg}" title="${title}" data-day="${iso}">
      ${d}${meta ? `<small style="background:${meta.color}"></small>` : ""}
    </button>`;
  }

  $("calendar").innerHTML = `<div class="calendar-head">
    <button class="nav-btn" id="prev-month" aria-label="Mes anterior">&lsaquo;</button>
    <strong>${months[state.month]} ${state.year}</strong>
    <button class="nav-btn" id="next-month" aria-label="Proximo mes">&rsaquo;</button>
  </div>
  <div class="cal-grid">${weekdays.map(w => `<div class="weekday">${w}</div>`).join("")}${cells}</div>
  <div class="legend">${Object.entries(STATUS).map(([, s]) => `<span><i class="dot" style="background:${s.color}"></i>${s.label}</span>`).join("")}</div>`;

  $("prev-month").onclick = () => {
    state.month === 0 ? (state.month = 11, state.year--) : state.month--;
    render();
  };
  $("next-month").onclick = () => {
    state.month === 11 ? (state.month = 0, state.year++) : state.month++;
    render();
  };
  $("calendar").querySelectorAll("[data-day]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.selected = btn.dataset.day;
      render();
    });
  });
}

function renderDetail() {
  const day = dayInfo(state.selected);
  if (!day) {
    $("detail").innerHTML = `<div class="empty">Selecione um dia com atividade no calendario.</div>`;
    return;
  }

  const st = statusOf(day);
  const meta = STATUS[st] || STATUS.pendente;
  const date = new Date(`${day.data}T12:00:00`);
  const dows = ["Domingo", "Segunda-feira", "Terca-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sabado"];
  const color = PHASE_COLORS[day.fase] || meta.color;

  $("detail").innerHTML = `<div class="detail-title">
    <div>
      <div class="detail-date">${fmtDate(day.data)}</div>
      <div class="detail-dow">${dows[date.getDay()]}</div>
    </div>
    <span class="pill" style="background:${meta.bg};color:${meta.tx}">${meta.label}</span>
  </div>
  <div class="task-block" style="border-left-color:${color}">
    <div class="task-meta">${esc(day.id)} · ${esc(day.fase)}</div>
    <div class="task-name">${esc(day.atividade)}</div>
  </div>
  <div class="metric-grid">
    <div class="metric"><b>${Number(day.horas) || 0}h</b><span>Horas registradas</span></div>
    <div class="metric"><b>${Number(day.bugs) || 0}</b><span>Bugs</span></div>
    <div class="metric"><b>${esc(meta.label)}</b><span>Status</span></div>
  </div>
  <div class="note-box">${day.anotacao ? esc(day.anotacao) : "Sem anotacao registrada."}</div>`;
}

function renderChart() {
  const sorted = byDate();
  const total = DB.config.total || sorted.length;
  const W = 720, H = 220, PL = 48, PR = 22, PT = 20, PB = 38;
  let acc = 0;
  const actual = sorted.map(day => {
    if (statusOf(day) === "done") acc++;
    return acc;
  });
  const planned = sorted.map((_, i) => i + 1);
  const x = i => PL + (i / Math.max(1, sorted.length - 1)) * (W - PL - PR);
  const y = v => H - PB - (v / total) * (H - PT - PB);
  const path = pts => pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const grid = [0, 10, 20, 30, 40, total].map(v => `<line x1="${PL}" x2="${W - PR}" y1="${y(v)}" y2="${y(v)}" stroke="#e4e7eb"/><text x="${PL - 7}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="#66717f">${v}</text>`).join("");
  const labels = sorted.filter((_, i) => i === 0 || i === sorted.length - 1 || i % 9 === 0).map(day => {
    const i = sorted.indexOf(day);
    const [, m, d] = day.data.split("-");
    return `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#66717f">${d}/${m}</text>`;
  }).join("");
  const todayIndex = sorted.findIndex(day => day.data === todayIso());
  const todayLine = todayIndex >= 0 ? `<line x1="${x(todayIndex)}" x2="${x(todayIndex)}" y1="${PT}" y2="${H - PB}" stroke="#E24B4A" stroke-dasharray="4,3"/><text x="${x(todayIndex) + 5}" y="${PT + 12}" font-size="10" fill="#E24B4A">hoje</text>` : "";

  $("chart").innerHTML = `<div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}">
    ${grid}
    <path d="${path(planned)}" fill="none" stroke="#c8c8c8" stroke-width="1.5" stroke-dasharray="5,4"></path>
    <path d="${path(actual)}" fill="none" stroke="#1D9E75" stroke-width="2.5" stroke-linejoin="round"></path>
    ${todayLine}
    ${labels}
  </svg></div>`;
}

function renderNotes() {
  const rows = byDate().filter(d => d.anotacao && d.anotacao.trim());
  $("notes").innerHTML = rows.length ? rows.map(day => {
    const [, m, d] = day.data.split("-");
    const month = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(m) - 1];
    const st = statusOf(day);
    const meta = STATUS[st] || STATUS.pendente;
    return `<div class="notes-row" data-day="${day.data}">
      <div class="notes-day"><b>${d}</b><span>${month}</span></div>
      <div class="note-line"></div>
      <div><div class="hint">${esc(day.id)} - ${esc(day.atividade)}</div><div>${esc(day.anotacao)}</div></div>
      <span class="pill" style="background:${meta.bg};color:${meta.tx}">${meta.label}</span>
    </div>`;
  }).join("") : `<p class="hint">Nenhuma observacao registrada ainda.</p>`;

  $("notes").querySelectorAll("[data-day]").forEach(row => row.addEventListener("click", () => {
    state.selected = row.dataset.day;
    const [, m] = state.selected.split("-");
    state.month = Number(m) - 1;
    render();
  }));
}

function renderHistory() {
  const days = filteredDays().sort((a, b) => a.data.localeCompare(b.data));
  $("history-title").textContent = state.filter ? `Historico - ${STATUS[state.filter].label}` : "Historico";
  if (!days.length) {
    $("history").innerHTML = `<p class="hint">Nenhuma tarefa para este filtro.</p>`;
    return;
  }
  $("history").innerHTML = `<div style="overflow-x:auto"><table>
    <thead><tr><th>Data</th><th>Tarefa</th><th>Horas</th><th>Bugs</th><th>Status</th></tr></thead>
    <tbody>${days.map(day => {
      const st = statusOf(day);
      const meta = STATUS[st] || STATUS.pendente;
      return `<tr>
        <td>${fmtDate(day.data)}</td>
        <td><span class="hint">${esc(day.id)}</span> ${esc(day.atividade)}</td>
        <td>${Number(day.horas) || 0}h</td>
        <td>${Number(day.bugs) || 0}</td>
        <td><span class="pill" style="background:${meta.bg};color:${meta.tx}">${meta.label}</span></td>
      </tr>`;
    }).join("")}</tbody>
  </table></div>`;
}

init();
