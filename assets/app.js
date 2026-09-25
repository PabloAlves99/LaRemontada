import {
  criteria,
  descriptions,
  grades,
  positions,
  mean,
  strength,
  draw,
  nextTuesday,
  warnings,
  teamsText,
  normalizeRules,
} from "./football.mjs?v=3";
const $ = (s, el = document) => el.querySelector(s),
  $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const num = (n) =>
  n == null
    ? "—"
    : n.toLocaleString("pt-BR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
const day = (d) =>
  new Date(d + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
  });
const params = new URLSearchParams(location.search),
  token = params.get("avaliar");
let session = {},
  data = {},
  tab = "rodada",
  selected = new Set(),
  round = null,
  date = nextTuesday(),
  dirty = false,
  publicRounds = [],
  publicDate = "",
  evaluation = {},
  saving = false;
const app = $("#app"),
  modal = $("#modal");
function toast(t) {
  $("#toast").textContent = t;
  $("#toast").classList.add("show");
  setTimeout(() => $("#toast").classList.remove("show"), 4500);
}
function error(t, form) {
  let el = $(".form-error", form);
  if (!el) {
    el = document.createElement("p");
    el.className = "form-error";
    el.setAttribute("role", "alert");
    form.append(el);
  }
  el.textContent = t;
}
async function api(action, body = null, extra = "") {
  const r = await fetch("api.php?action=" + action + extra, {
    method: body ? "POST" : "GET",
    headers: body
      ? { "Content-Type": "application/json", "X-CSRF-Token": session.csrf }
      : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let value;
  try {
    value = await r.json();
  } catch {
    throw Error("O servidor não respondeu corretamente. Tente novamente.");
  }
  if (!r.ok) throw Error(value.error || "Não foi possível concluir.");
  return value;
}
function openModal(html) {
  $("#modalBody").innerHTML = html;
  if (!modal.open) modal.showModal();
}
$(".close").onclick = () => modal.close();
modal.addEventListener("click", (e) => {
  if (e.target === modal) {
    const r = modal.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      modal.close();
  }
});
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
function button(label, action, cls = "") {
  return (
    '<button class="button ' +
    cls +
    '" data-action="' +
    action +
    '">' +
    label +
    "</button>"
  );
}
function empty(title, text, action = "") {
  return (
    '<div class="empty"><div class="big">◇</div><h2>' +
    title +
    "</h2><p>" +
    text +
    "</p>" +
    action +
    "</div>"
  );
}
function options(values, value, blank = "Não informada") {
  return (
    '<option value="">' +
    blank +
    "</option>" +
    values
      .map(
        (p) =>
          "<option " +
          (p === value ? "selected" : "") +
          ">" +
          esc(p) +
          "</option>",
      )
      .join("")
  );
}
function scoreBadge(p) {
  return (
    '<span class="score ' +
    (!p.scores ? "none" : "") +
    '">' +
    num(mean(p.scores)) +
    "</span>"
  );
}
function gradeFields(values = [], prefix = "s") {
  return criteria
    .map(
      (c, i) =>
        '<fieldset class="criterion"><legend>' +
        c +
        "</legend><p>" +
        descriptions[i] +
        '</p><div class="rating-options">' +
        grades
          .map(
            (g, j) =>
              '<label><input required type="radio" name="' +
              prefix +
              i +
              '" value="' +
              (j + 1) +
              '" ' +
              (values[i] === j + 1 ? "checked" : "") +
              "><span><b>" +
              (j + 1) +
              "</b>" +
              g +
              "</span></label>",
          )
          .join("") +
        "</div></fieldset>",
    )
    .join("");
}
function readGrades(form, prefix = "s") {
  return criteria.map((_, i) => Number(new FormData(form).get(prefix + i)));
}
function legend() {
  return (
    '<div class="legend">' +
    grades
      .map((g, i) => "<div><b>" + (i + 1) + "</b>" + g + "</div>")
      .join("") +
    "</div>"
  );
}
async function load() {
  session = await api("session");
  if (token) {
    await loadEvaluation();
    return;
  }
  if (params.get("view") === "admin") {
    if (!session.user) {
      renderAuth();
      return;
    }
    data = await api("admin");
    if (!round) {
      round = structuredClone(data.rounds.find((r) => r.date === date) || null);
      if (round)
        selected = new Set(
          round.teams
            .flat()
            .filter((p) => !p.guest)
            .map((p) => p.id),
        );
    }
    renderAdmin();
  } else {
    publicRounds = (await api("public")).rounds;
    renderPublic();
  }
}
function renderAuth() {
  const setup = session.setup;
  $("#modeLink").textContent = "Ver os times ↗";
  $("#modeLink").href = "./";
  app.innerHTML =
    '<main><div class="auth"><p class="eyebrow">ÁREA DA ORGANIZAÇÃO</p><h1>' +
    (setup ? "O primeiro apito." : "De volta ao jogo.") +
    '</h1><p class="muted">' +
    (setup
      ? "Crie sua senha para começar a organizar o La Remontada."
      : "Entre para organizar a próxima terça.") +
    '</p><div class="panel"><form id="authForm">' +
    (setup
      ? '<label class="field">Administrador<input value="PabloHAlves99@gmail.com" disabled></label>'
      : '<label class="field">E-mail<input name="email" type="email" autocomplete="username" required></label>') +
    '<label class="field">' +
    (setup ? "Crie uma senha" : "Senha") +
    '<input name="password" type="password" autocomplete="' +
    (setup ? "new-password" : "current-password") +
    '" minlength="' +
    (setup ? "10" : "1") +
    '" maxlength="128" required>' +
    (setup ? "<small>Pelo menos 10 caracteres.</small>" : "") +
    "</label>" +
    (setup
      ? '<label class="field">Confirme a senha<input name="confirm" type="password" autocomplete="new-password" required></label>'
      : "") +
    '<button class="button primary">' +
    (setup ? "Criar meu acesso" : "Entrar na administração") +
    '</button></form></div><p class="auth-note">' +
    (setup && !session.local
      ? "Abra esta página na máquina onde o app foi instalado para configurar o primeiro acesso."
      : "As avaliações ficam restritas à administração.") +
    "</p></div></main>";
  $("#authForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target,
      b = Object.fromEntries(new FormData(f));
    if (setup && b.password !== b.confirm) {
      error("As senhas não coincidem.", f);
      return;
    }
    const btn = $("button", f);
    btn.disabled = true;
    try {
      await api(setup ? "setup" : "login", b);
      await load();
    } catch (err) {
      error(err.message, f);
    } finally {
      btn.disabled = false;
    }
  };
}
function header(title, subtitle, actions = "") {
  return (
    '<div class="page-heading"><div><p class="eyebrow">LA REMONTADA / ORGANIZAÇÃO</p><h1>' +
    title +
    '</h1><p class="muted">' +
    subtitle +
    '</p></div><div class="actions">' +
    actions +
    "</div></div>"
  );
}
function renderAdmin() {
  $("#modeLink").href = "./";
  $("#modeLink").textContent = "Visão do grupo ↗";
  const titles = {
    rodada: ["A próxima terça.", "A turma de sempre. Novas combinações."],
    jogadores: [
      "Quem veste a camisa.",
      "Cadastre a turma e acompanhe o nível de cada jogador.",
    ],
    avaliacoes: [
      "Cada olhar conta.",
      "A última avaliação de cada pessoa entra na média.",
    ],
    historico: [
      "A história do jogo.",
      "As formações que já passaram pelo nosso futebol.",
    ],
    ajustes: [
      "Do nosso jeito.",
      "Goleiros, critérios e quem organiza a partida.",
    ],
  };
  const [title, sub] = titles[tab];
  app.innerHTML =
    "<main>" +
    header(
      title,
      sub,
      button("Copiar link do grupo", "share") + button("Sair", "logout"),
    ) +
    '<nav class="tabs" aria-label="Administração">' +
    Object.entries({
      rodada: "Rodada",
      jogadores: "Jogadores",
      avaliacoes: "Avaliações",
      historico: "Histórico",
      ajustes: "Ajustes",
    })
      .map(
        ([id, label]) =>
          '<button data-tab="' +
          id +
          '" class="' +
          (tab === id ? "active" : "") +
          '" ' +
          (tab === id ? 'aria-current="page"' : "") +
          ">" +
          label +
          "</button>",
      )
      .join("") +
    '</nav><section class="tab-content" id="content"></section></main>';
  $$("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        tab = b.dataset.tab;
        renderAdmin();
      }),
  );
  $("[data-action=logout]").onclick = async () => {
    if (
      dirty &&
      !confirm("Há alterações de times não salvas. Sair mesmo assim?")
    )
      return;
    dirty = false;
    await api("logout", {});
    location.href = "?view=admin";
  };
  $("[data-action=share]").onclick = () =>
    copyLink(new URL("./", location.href).href);
  ({
    rodada: renderRound,
    jogadores: renderPlayers,
    avaliacoes: renderReviews,
    historico: renderHistory,
    ajustes: renderSettings,
  })[tab]();
}
function teamCards(r, editable = false, privateView = false) {
  return (
    '<div class="teams ' +
    (!privateView ? "public-teams" : "") +
    '">' +
    r.teams
      .map(
        (team, t) =>
          '<article class="team"><div class="team-top"><div><span class="team-sub">LA REMONTADA</span><h3>Time ' +
          (t + 1) +
          '</h3></div><span class="team-number">0' +
          (t + 1) +
          "</span></div>" +
          (privateView
            ? '<div class="team-stats"><span>Média ' +
              num(strength(team)) +
              "</span><span>" +
              team.filter((p) => p.scores).length +
              "/6 com nota</span></div>"
            : "") +
          "<ul>" +
          team
            .map(
              (p, i) =>
                '<li class="' +
                (p.guest ? "guest" : "") +
                '"><span class="jersey">' +
                String(i + 1).padStart(2, "0") +
                '</span><div class="player-info"><b>' +
                esc(p.name) +
                "</b><small>" +
                esc(
                  p.position ||
                    (p.guest ? "Vaga para preencher" : "Posição livre"),
                ) +
                "</small></div>" +
                (privateView ? scoreBadge(p) : "") +
                (editable
                  ? '<button class="team-edit" data-edit="' +
                    t +
                    ":" +
                    i +
                    '" aria-label="Editar ' +
                    esc(p.name) +
                    '">↔</button>'
                  : "") +
                "</li>",
            )
            .join("") +
          '</ul><div class="team-footer">GOLEIRO FIXO<b>' +
          esc(r.keepers?.[t] || "A definir") +
          "</b></div></article>",
      )
      .join("") +
    "</div>"
  );
}
function renderRound() {
  const active = data.players.filter((p) => p.active);
  selected = new Set(
    [...selected].filter((id) => active.some((p) => p.id === id)),
  );
  $("#content").innerHTML =
    '<div class="panel-head"><div class="actions"><label for="roundDate">Data da rodada</label><input id="roundDate" type="date" value="' +
    date +
    '"></div><span class="pill ' +
    (round?.published ? "green" : "") +
    '">' +
    (round?.published ? "Publicada" : round ? "Rascunho" : "Nova rodada") +
    (dirty ? " · alterações pendentes" : "") +
    '</span></div><div class="round-layout"><aside><div class="panel round-roster"><div class="panel-head"><h2>Lista da terça</h2><span class="count">' +
    selected.size +
    '<span>/18</span></span></div><div class="progress"><span></span></div><div class="actions">' +
    button("Marcar frequentes", "frequent", "small") +
    button("+ Jogador", "newPlayer", "small") +
    '</div><div class="roster">' +
    (active.length
      ? active
          .map(
            (p) =>
              '<label class="roster-row"><input type="checkbox" data-player="' +
              p.id +
              '" ' +
              (selected.has(p.id) ? "checked" : "") +
              '><span class="name">' +
              esc(p.name) +
              "<small>" +
              esc(p.position || "Posição livre") +
              "</small></span>" +
              scoreBadge(p) +
              "</label>",
          )
          .join("")
      : '<p class="screen-note">Cadastre seus jogadores ou sorteie com vagas de convidados.</p>') +
    '</div><p class="screen-note">' +
    (18 - selected.size) +
    " vaga(s) serão preenchidas com convidados.</p>" +
    button("↗ Sortear os três times", "draw", "primary full") +
    "</div></aside><div>" +
    (!round
      ? empty(
          "O campo está esperando.",
          "Selecione quem vai jogar. As vagas restantes viram convidados, e você pode ajustar tudo depois.",
        )
      : teamCards(round, true, true) +
        '<div class="notice">' +
        (warnings(round.teams, data.rules).map(esc).join("<br>") ||
          "Nenhum alerta nas preferências selecionadas.") +
        '</div><div class="actions">' +
        button("Salvar rascunho", "save") +
        button(
          round.published ? "Atualizar publicação" : "Publicar para o grupo",
          "publish",
          "dark",
        ) +
        '</div><p class="screen-note">Só rodadas publicadas entram no histórico de companheiros. Salvar como rascunho retira a rodada da visão do grupo.</p>') +
    "</div></div>";
  // Width is set by a DOM property so the policy does not need inline styles.
  $(".progress span").style.width = (selected.size / 18) * 100 + "%";
  $("#roundDate").onchange = (e) => {
    if (dirty && !confirm("Descartar as alterações não salvas desta rodada?")) {
      e.target.value = date;
      return;
    }
    date = e.target.value;
    round = structuredClone(data.rounds.find((r) => r.date === date) || null);
    selected = new Set(
      round
        ? round.teams
            .flat()
            .filter((p) => !p.guest)
            .map((p) => p.id)
        : [],
    );
    dirty = false;
    renderRound();
  };
  $$("[data-player]").forEach(
    (el) =>
      (el.onchange = () => {
        if (el.checked && selected.size >= 18) {
          el.checked = false;
          toast("A lista comporta 18 jogadores.");
          return;
        }
        el.checked
          ? selected.add(el.dataset.player)
          : selected.delete(el.dataset.player);
        renderRound();
      }),
  );
  $("[data-action=frequent]").onclick = () => {
    const ps = active.filter((p) => p.frequent);
    if (ps.length > 18) {
      toast("Há mais de 18 frequentes. Selecione os presentes manualmente.");
      return;
    }
    selected = new Set(ps.map((p) => p.id));
    renderRound();
  };
  $("[data-action=newPlayer]").onclick = () => playerModal();
  $("[data-action=draw]").onclick = async () => {
    if (
      round &&
      !confirm(
        "Gerar uma nova combinação para esta rodada? A versão salva só muda quando você salvar.",
      )
    )
      return;
    const btn = $("[data-action=draw]");
    btn.disabled = true;
    btn.textContent = "Montando os times…";
    await new Promise((r) => setTimeout(r, 50));
    try {
      const teams = draw(
        active.filter((p) => selected.has(p.id)),
        data.rounds.filter((r) => r.published && r.date < date),
        data.rules,
      );
      round = {
        date,
        teams,
        keepers: [...data.keepers],
        published: round?.published || false,
        updated: round?.updated,
      };
      dirty = true;
      renderRound();
      toast("Times sorteados. Você pode trocar os jogadores.");
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
    }
  };
  if (round) {
    $$("[data-edit]").forEach(
      (b) =>
        (b.onclick = () =>
          editMember(...b.dataset.edit.split(":").map(Number))),
    );
    $("[data-action=save]").onclick = () => saveRound(false);
    $("[data-action=publish]").onclick = () => saveRound(true);
  }
}
async function saveRound(publish) {
  if (saving) return;
  if (
    !publish &&
    round.published &&
    !confirm(
      "Salvar como rascunho vai retirar esta rodada da visão do grupo. Continuar?",
    )
  )
    return;
  saving = true;
  try {
    const r = await api("round", {
      ...round,
      date,
      version: round.updated,
      publish,
    });
    round.updated = r.updated;
    round.published = r.published;
    dirty = false;
    data.rounds = [
      structuredClone(round),
      ...data.rounds.filter((r) => r.date !== date),
    ].sort((a, b) => b.date.localeCompare(a.date));
    if (tab === "rodada") renderRound();
    toast(publish ? "Times publicados para o grupo." : "Rascunho salvo.");
  } catch (err) {
    toast(err.message);
  } finally {
    saving = false;
  }
}
function editMember(t, i) {
  const p = round.teams[t][i],
    used = new Set(round.teams.flat().map((p) => p.id));
  openModal(
    "<h2>" +
      esc(p.name) +
      '</h2><p class="muted">Troque de time ou preencha esta vaga.</p><form id="swapForm"><label class="field">Trocar de lugar com<select name="target" required><option value="">Escolha um jogador</option>' +
      round.teams
        .flatMap((team, k) =>
          team.map((q, j) =>
            k === t
              ? ""
              : '<option value="' +
                k +
                ":" +
                j +
                '">Time ' +
                (k + 1) +
                " · " +
                esc(q.name) +
                "</option>",
          ),
        )
        .join("") +
      '</select></label><button class="button dark">Trocar jogadores</button></form>' +
      (p.guest
        ? '<div class="divider"></div><form id="replaceForm"><label class="field">Substituir por jogador cadastrado<select name="player"><option value="">Novo convidado</option>' +
          data.players
            .filter((q) => q.active && !used.has(q.id))
            .map(
              (q) =>
                '<option value="' + q.id + '">' + esc(q.name) + "</option>",
            )
            .join("") +
          '</select></label><label class="field">Nome de quem chegou<input name="name" maxlength="100" placeholder="Nome do convidado"></label><label class="check"><input type="checkbox" name="register">Cadastrar este convidado para próximas rodadas</label><button class="button">Preencher vaga</button></form>'
        : ""),
  );
  $("#swapForm").onsubmit = (e) => {
    e.preventDefault();
    const [k, j] = new FormData(e.target).get("target").split(":").map(Number);
    [round.teams[t][i], round.teams[k][j]] = [
      round.teams[k][j],
      round.teams[t][i],
    ];
    dirty = true;
    modal.close();
    renderRound();
  };
  if (p.guest)
    $("#replaceForm").onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target,
        fd = new FormData(f),
        id = fd.get("player");
      try {
        if (id)
          round.teams[t][i] = structuredClone(
            data.players.find((q) => q.id === id),
          );
        else {
          const name = fd.get("name").trim();
          if (!name) {
            error("Informe um nome ou selecione um jogador.", f);
            return;
          }
          if (fd.get("register")) {
            const r = await api("player", {
              name,
              position: "",
              frequent: false,
              provisional: null,
            });
            data = await api("admin");
            round.teams[t][i] = structuredClone(
              data.players.find((q) => q.id === r.id),
            );
          } else round.teams[t][i] = { ...p, name };
        }
        dirty = true;
        modal.close();
        renderRound();
      } catch (err) {
        error(err.message, f);
      }
    };
}
function renderPlayers() {
  const ps = data.players.filter((p) => p.active);
  $("#content").innerHTML =
    '<div class="summary"><div><strong>' +
    ps.length +
    "</strong><span>Jogadores ativos</span></div><div><strong>" +
    ps.filter((p) => p.count).length +
    "</strong><span>Já avaliados</span></div><div><strong>" +
    ps.filter((p) => !p.scores).length +
    '</strong><span>Ainda sem nota</span></div></div><div class="panel"><div class="panel-head"><input id="searchPlayers" type="search" placeholder="Buscar jogador" aria-label="Buscar jogador">' +
    button("+ Novo jogador", "new", "dark") +
    '</div><div class="table-wrap"><table><thead><tr><th>Jogador</th><th>Posição</th><th>Nota final</th><th>Avaliações</th><th>Ações</th></tr></thead><tbody id="playerRows"></tbody></table></div></div>';
  function list(q = "") {
    $("#playerRows").innerHTML =
      data.players
        .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
        .map(
          (p) =>
            "<tr><td><b>" +
            esc(p.name) +
            "</b><small>" +
            (!p.active ? "Arquivado" : p.frequent ? "Frequente" : "Convidado") +
            "</small></td><td>" +
            esc(p.position || "Não informada") +
            "</td><td>" +
            scoreBadge(p) +
            "<small>" +
            (!p.count && p.scores ? "Provisória" : "") +
            "</small></td><td>" +
            p.count +
            ' pessoa(s)</td><td><div class="actions"><button class="button small" data-pedit="' +
            p.id +
            '">Editar</button><button class="button small" data-rate="' +
            p.id +
            '">Avaliar</button><button class="button small" data-detail="' +
            p.id +
            '">Notas</button></div></td></tr>',
        )
        .join("") || '<tr><td colspan="5">Nenhum jogador encontrado.</td></tr>';
    $$("[data-pedit]").forEach(
      (b) =>
        (b.onclick = () =>
          playerModal(data.players.find((p) => p.id === b.dataset.pedit))),
    );
    $$("[data-rate]").forEach(
      (b) =>
        (b.onclick = () =>
          ratingModal(data.players.find((p) => p.id === b.dataset.rate))),
    );
    $$("[data-detail]").forEach(
      (b) =>
        (b.onclick = () =>
          detailModal(data.players.find((p) => p.id === b.dataset.detail))),
    );
  }
  list();
  $("#searchPlayers").oninput = (e) => list(e.target.value);
  $("[data-action=new]").onclick = () => playerModal();
}
function playerModal(p = {}) {
  openModal(
    "<h2>" +
      (p.id ? "Editar jogador" : "Novo jogador") +
      '</h2><form id="playerForm"><div class="form-grid"><label class="field">Nome ou apelido<input name="name" value="' +
      esc(p.name || "") +
      '" maxlength="100" required></label><label class="field">Posição<select name="position">' +
      options(positions, p.position) +
      '</select></label></div><label class="check"><input name="frequent" type="checkbox" ' +
      (p.frequent !== false ? "checked" : "") +
      ">Costuma jogar com a turma</label>" +
      (p.id
        ? '<label class="check"><input name="active" type="checkbox" ' +
          (p.active ? "checked" : "") +
          ">Jogador ativo na lista</label>"
        : "") +
      '<label class="check"><input id="provisionalCheck" name="useProvisional" type="checkbox" ' +
      (p.provisional ? "checked" : "") +
      '>Usar nota provisória</label><p class="screen-note">Sem avaliação e sem nota provisória, entra aleatoriamente no sorteio.</p><div id="provisionalFields" ' +
      (!p.provisional ? "hidden" : "") +
      ">" +
      gradeFields(p.provisional || []) +
      '</div><div class="actions"><button class="button dark">Salvar jogador</button></div></form>',
  );
  const f = $("#playerForm");
  function toggle() {
    const enabled = $("#provisionalCheck").checked;
    $("#provisionalFields").hidden = !enabled;
    $$("input", $$("#provisionalFields")).forEach(
      (x) => (x.disabled = !enabled),
    );
  }
  toggle();
  $("#provisionalCheck").onchange = toggle;
  f.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(f),
      btn = $("button", f);
    btn.disabled = true;
    try {
      await api("player", {
        id: p.id,
        name: fd.get("name"),
        position: fd.get("position"),
        frequent: fd.has("frequent"),
        active: p.id ? fd.has("active") : true,
        provisional: fd.has("useProvisional") ? readGrades(f) : null,
      });
      data = await api("admin");
      modal.close();
      renderAdmin();
      toast("Jogador salvo.");
    } catch (err) {
      error(err.message, f);
    } finally {
      btn.disabled = false;
    }
  };
}
function detailModal(p) {
  const rs = data.reviews.filter((r) => r.player_id === p.id),
    seen = new Set();
  openModal(
    "<h2>" +
      esc(p.name) +
      '</h2><p class="muted">Média geral: <b>' +
      num(mean(p.scores)) +
      "</b> · " +
      p.count +
      ' avaliador(es)</p><div class="review-scores">' +
      criteria
        .map(
          (c, i) => "<span>" + c + ": <b>" + num(p.scores?.[i]) + "</b></span>",
        )
        .join("") +
      '</div><div class="divider"></div><h3>Avaliações individuais</h3><p class="screen-note">Cada pessoa tem o mesmo peso. Versões anteriores ficam apenas no histórico.</p><div class="review-list">' +
      (rs
        .map((r) => {
          const old = seen.has(r.evaluator);
          seen.add(r.evaluator);
          return (
            '<article class="review-item"><b>' +
            esc(r.label) +
            '</b> <span class="pill">' +
            (old ? "Versão anterior" : "Na média") +
            "</span><small>" +
            new Date(r.created).toLocaleString("pt-BR") +
            '</small><div class="review-scores">' +
            JSON.parse(r.scores)
              .map(
                (v, i) => "<span>" + criteria[i] + ": <b>" + v + "</b></span>",
              )
              .join("") +
            "</div></article>"
          );
        })
        .join("") || '<p class="muted">Nenhuma avaliação recebida.</p>') +
      "</div>",
  );
}
function ratingModal(p) {
  if (p.active === false) {
    toast("Reative o jogador para receber novas avaliações.");
    return;
  }
  const mine = token
    ? evaluation.mine[p.id]?.scores
    : data.reviews.find(
        (r) =>
          r.player_id === p.id && r.evaluator === "admin:" + session.user.id,
      )?.scores;
  const values = typeof mine === "string" ? JSON.parse(mine) : mine || [];
  openModal(
    "<h2>Avaliar " +
      esc(p.name) +
      '</h2><p class="muted">Considere as partidas em que vocês jogaram juntos.</p><form id="ratingForm">' +
      gradeFields(values) +
      '<p class="screen-note">Sua nova avaliação substitui a anterior na média.</p><div class="actions"><button class="button dark">Salvar avaliação</button><button class="button" type="button" id="skip">Não conheço o suficiente</button></div></form>',
  );
  $("#skip").onclick = () => modal.close();
  $("#ratingForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target,
      btn = $("button", f);
    btn.disabled = true;
    try {
      await api("review", { token, playerId: p.id, scores: readGrades(f) });
      modal.close();
      if (token) await loadEvaluation();
      else {
        data = await api("admin");
        renderAdmin();
      }
      toast("Avaliação salva. Obrigado!");
    } catch (err) {
      error(err.message, f);
    } finally {
      btn.disabled = false;
    }
  };
}
function renderReviews() {
  $("#content").innerHTML =
    '<div class="panel dark"><div class="panel-head"><div><h2>Convide quem conhece a turma.</h2><p class="muted">Cada pessoa recebe um link individual e avalia somente quem conhece.</p></div>' +
    button("+ Criar link", "invite", "primary") +
    '</div></div><div class="panel"><h2>Como as notas funcionam</h2>' +
    legend() +
    '<p class="screen-note">Os cinco critérios têm o mesmo peso. A média considera uma avaliação por pessoa para cada jogador. A nota provisória deixa de valer assim que chega a primeira avaliação.</p></div><div class="panel"><h2>Avaliadores convidados</h2>' +
    (data.invites.length
      ? '<div class="table-wrap"><table><thead><tr><th>Pessoa</th><th>Jogadores avaliados</th><th>Status</th><th></th></tr></thead><tbody>' +
        data.invites
          .map(
            (inv) =>
              "<tr><td>" +
              esc(inv.label) +
              "</td><td>" +
              new Set(
                data.reviews
                  .filter((r) => r.evaluator === "invite:" + inv.id)
                  .map((r) => r.player_id),
              ).size +
              '</td><td><span class="pill">' +
              (inv.active ? "Ativo" : "Desativado") +
              "</span></td><td>" +
              (inv.active
                ? '<button class="button small danger" data-revoke="' +
                  inv.id +
                  '">Desativar link</button>'
                : "") +
              "</td></tr>",
          )
          .join("") +
        "</tbody></table></div>"
      : '<p class="muted">Nenhum convite criado ainda.</p>') +
    '</div><div class="panel"><h2>Notas por jogador</h2><div class="review-list">' +
    data.players
      .filter((p) => p.active)
      .map(
        (p) =>
          '<div class="eval-player"><div><h3>' +
          esc(p.name) +
          "</h3><small>" +
          p.count +
          " avaliação(ões) · Média " +
          num(mean(p.scores)) +
          '</small></div><div class="actions"><button class="button small" data-notes="' +
          p.id +
          '">Ver notas</button><button class="button small" data-review="' +
          p.id +
          '">Avaliar</button></div></div>',
      )
      .join("") +
    "</div></div>";
  $("[data-action=invite]").onclick = () => {
    openModal(
      '<h2>Link de avaliação</h2><p class="muted">Crie um link por pessoa. Ele permite avaliar e revisar as próprias notas.</p><form id="inviteForm"><label class="field">Nome do avaliador<input name="label" maxlength="100" required placeholder="Ex.: Rafael"></label><button class="button dark">Criar link</button></form>',
    );
    $("#inviteForm").onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        const r = await api("invite", { label: new FormData(f).get("label") });
        const url = new URL("./", location.href);
        url.searchParams.set("avaliar", r.token);
        data = await api("admin");
        renderReviews();
        openModal(
          '<h2>Convite pronto</h2><p>Envie este link somente para a pessoa escolhida. Guarde-o agora: por segurança, ele não será exibido novamente.</p><p class="link-box">' +
            esc(url.href) +
            "</p>" +
            button("Copiar link", "copy", "dark") +
            '<p class="screen-note">Enquanto o app estiver local, o endereço só funciona nesta máquina ou com um endereço de rede acessível ao grupo.</p>',
        );
        $("[data-action=copy]").onclick = () => copyLink(url.href);
      } catch (err) {
        error(err.message, f);
      }
    };
  };
  $$("[data-revoke]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (
          !confirm(
            "Desativar este link? As avaliações já recebidas serão mantidas.",
          )
        )
          return;
        try {
          await api("revoke", { id: b.dataset.revoke });
          data = await api("admin");
          renderReviews();
        } catch (err) {
          toast(err.message);
        }
      }),
  );
  $$("[data-notes]").forEach(
    (b) =>
      (b.onclick = () =>
        detailModal(data.players.find((p) => p.id === b.dataset.notes))),
  );
  $$("[data-review]").forEach(
    (b) =>
      (b.onclick = () =>
        ratingModal(data.players.find((p) => p.id === b.dataset.review))),
  );
}
function renderHistory() {
  $("#content").innerHTML = data.rounds.length
    ? '<div class="history-grid">' +
      data.rounds
        .map(
          (r) =>
            '<button class="panel history-card" data-round="' +
            r.date +
            '"><div class="panel-head"><span class="eyebrow">' +
            r.date.slice(0, 4) +
            '</span><span class="pill ' +
            (r.published ? "green" : "") +
            '">' +
            (r.published ? "Publicada" : "Rascunho") +
            "</span></div><h3>" +
            day(r.date) +
            '</h3><p class="muted">3 times · 18 jogadores de linha</p><span class="screen-note">Abrir e editar rodada ↗</span><div class="mini-teams"><span></span><span></span><span></span></div></button>',
        )
        .join("") +
      "</div>"
    : empty(
        "A história começa na próxima terça.",
        "As rodadas salvas aparecem aqui. Publique para o grupo acompanhar.",
      );
  $$("[data-round]").forEach(
    (b) =>
      (b.onclick = () => {
        if (
          dirty &&
          !confirm("Descartar alterações não salvas da rodada atual?")
        )
          return;
        date = b.dataset.round;
        round = structuredClone(data.rounds.find((r) => r.date === date));
        selected = new Set(
          round.teams
            .flat()
            .filter((p) => !p.guest)
            .map((p) => p.id),
        );
        dirty = false;
        tab = "rodada";
        renderAdmin();
      }),
  );
}
function renderSettings() {
  $("#content").innerHTML =
    '<div class="form-grid"><div class="panel"><h2>Goleiros fixos</h2><form id="settingsForm">' +
    data.keepers
      .map(
        (k, i) =>
          '<label class="field">Goleiro do time ' +
          (i + 1) +
          '<input name="keeper' +
          i +
          '" maxlength="100" value="' +
          esc(k) +
          '" placeholder="Nome do goleiro"></label>',
      )
      .join("") +
    '<div class="divider"></div><h2>Preferências do sorteio</h2><label class="field">Distribuir jogadores com média até<select name="weak">' +
    [1, 1.5, 2, 2.5, 3]
      .map(
        (n) =>
          '<option value="' +
          n +
          '" ' +
          (n === data.rules.weak ? "selected" : "") +
          ">" +
          num(n) +
          "</option>",
      )
      .join("") +
    '</select></label><label class="field">Considerar as últimas rodadas publicadas<select name="history">' +
    [3, 6, 10]
      .map(
        (n) =>
          "<option " +
          (n === data.rules.history ? "selected" : "") +
          ">" +
          n +
          "</option>",
      )
      .join("") +
    '</select></label><label class="check"><input name="separatePivot" type="checkbox" ' +
    (data.rules.separatePivot ? "checked" : "") +
    '>Preferir pivôs em times diferentes</label><p class="screen-note">São preferências. Quando não for possível atender a todas, o app mostra os conflitos. Os goleiros são aplicados aos próximos sorteios.</p><button class="button dark">Salvar ajustes</button></form></div><div><div class="panel"><div class="panel-head"><h2>Administração</h2><span class="pill">' +
    data.admins.length +
    "/3 acessos</span></div>" +
    data.admins
      .map(
        (a) =>
          '<div class="eval-player"><div><h3>' +
          esc(a.name) +
          "</h3><small>" +
          esc(a.email) +
          "</small></div>" +
          (a.owner
            ? '<span class="pill green">Responsável</span>'
            : session.user.owner
              ? '<button class="button small danger" data-remove="' +
                a.id +
                '">Remover</button>'
              : "") +
          "</div>",
      )
      .join("") +
    (session.user.owner && data.admins.length < 3
      ? '<div class="divider"></div>' +
        button("+ Adicionar administrador", "addAdmin")
      : "") +
    '</div><div class="panel"><h2>Sua conta</h2>' +
    button("Alterar minha senha", "password") +
    '</div><div class="panel"><h2>Backup</h2><p class="muted">Baixe uma cópia completa dos jogadores, avaliações, acessos e rodadas.</p><a class="button" href="api.php?action=backup" download>Baixar banco de dados</a><p class="screen-note">O arquivo contém dados privados. Guarde em local seguro.</p></div></div></div>';
  $("#settingsForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target,
      fd = new FormData(f);
    try {
      await api("settings", {
        keepers: [0, 1, 2].map((i) => fd.get("keeper" + i)),
        rules: {
          weak: Number(fd.get("weak")),
          history: Number(fd.get("history")),
          separatePivot: fd.has("separatePivot"),
        },
      });
      data = await api("admin");
      toast("Ajustes salvos.");
    } catch (err) {
      error(err.message, f);
    }
  };
  if ($("[data-action=addAdmin]"))
    $("[data-action=addAdmin]").onclick = () => {
      openModal(
        '<h2>Adicionar administrador</h2><form id="adminForm"><label class="field">Nome<input name="name" required maxlength="100"></label><label class="field">E-mail<input name="email" type="email" required></label><label class="field">Senha inicial<input name="password" type="password" minlength="10" maxlength="128" autocomplete="new-password" required><small>Ao entrar, a pessoa pode alterar a própria senha.</small></label><button class="button dark">Adicionar acesso</button></form>',
      );
      $("#adminForm").onsubmit = async (e) => {
        e.preventDefault();
        try {
          await api("adminAdd", Object.fromEntries(new FormData(e.target)));
          data = await api("admin");
          modal.close();
          renderSettings();
          toast("Administrador adicionado.");
        } catch (err) {
          error(err.message, e.target);
        }
      };
    };
  $$("[data-remove]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (!confirm("Remover o acesso deste administrador?")) return;
        try {
          await api("adminRemove", { id: b.dataset.remove });
          data = await api("admin");
          renderSettings();
        } catch (err) {
          toast(err.message);
        }
      }),
  );
  $("[data-action=password]").onclick = () => {
    openModal(
      '<h2>Alterar minha senha</h2><form id="passwordForm"><label class="field">Senha atual<input name="current" type="password" autocomplete="current-password" required></label><label class="field">Nova senha<input name="password" type="password" minlength="10" maxlength="128" autocomplete="new-password" required></label><button class="button dark">Salvar senha</button></form>',
    );
    $("#passwordForm").onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api("password", Object.fromEntries(new FormData(e.target)));
        modal.close();
        toast("Senha alterada.");
      } catch (err) {
        error(err.message, e.target);
      }
    };
  };
}
async function copyLink(url) {
  try {
    await navigator.clipboard.writeText(url);
    toast("Link copiado.");
  } catch {
    openModal(
      '<h2>Copiar link</h2><p class="link-box">' +
        esc(url) +
        "</p><p>Selecione e copie o endereço acima.</p>",
    );
  }
}
function renderPublic() {
  const r = publicRounds.find((r) => r.date === publicDate) || publicRounds[0];
  $("#modeLink").textContent = "Administração ↗";
  $("#modeLink").href = "?view=admin";
  app.innerHTML =
    '<main><div class="public-intro"><div><p class="eyebrow">FUTEBOL DE TERÇA</p><h1>O jogo começa aqui.</h1></div><span class="pill">3 times · 6 na linha · Goleiros fixos</span></div>' +
    (r
      ? '<div class="page-heading"><div><p class="eyebrow">TIMES CONFIRMADOS</p><h2>' +
        day(r.date) +
        " de " +
        r.date.slice(0, 4) +
        '</h2></div><label class="field">Ver outra rodada<select id="publicRound">' +
        publicRounds
          .map(
            (x) =>
              '<option value="' +
              x.date +
              '" ' +
              (x.date === r.date ? "selected" : "") +
              ">" +
              day(x.date) +
              " de " +
              x.date.slice(0, 4) +
              "</option>",
          )
          .join("") +
        "</select></label></div>" +
        teamCards(r, false, false)
      : empty(
          "Em breve, os times da terça.",
          "A organização ainda não publicou uma rodada. Volte aqui para conferir a divisão.",
        )) +
    "</main>";
  if (r)
    $("#publicRound").onchange = (e) => {
      publicDate = e.target.value;
      renderPublic();
    };
}
async function loadEvaluation() {
  evaluation = await api(
    "evaluation",
    null,
    "&token=" + encodeURIComponent(token),
  );
  $("#modeLink").href = "./";
  $("#modeLink").textContent = "Ver os times ↗";
  const done = evaluation.players.filter((p) => evaluation.mine[p.id]).length;
  app.innerHTML =
    '<main><div class="eval-shell"><p class="eyebrow">AVALIAÇÃO DA TURMA</p><h1>Seu olhar ajuda o jogo.</h1><p class="muted">Olá, ' +
    esc(evaluation.label) +
    '. Avalie somente os jogadores que você conhece.</p><div class="panel">' +
    legend() +
    '<p class="screen-note">Suas notas são privadas e ajudam a montar os times. Você pode voltar por este mesmo link para revisar.</p><div class="panel-head"><h2>Jogadores</h2><span class="pill green">' +
    done +
    "/" +
    evaluation.players.length +
    " avaliados</span></div>" +
    evaluation.players
      .map(
        (p) =>
          '<div class="eval-player"><div><h3>' +
          esc(p.name) +
          "</h3><small>" +
          esc(p.position || "Posição não informada") +
          (evaluation.mine[p.id] ? " · Avaliação salva" : "") +
          '</small></div><button class="button ' +
          (evaluation.mine[p.id] ? "" : "dark") +
          '" data-eval="' +
          p.id +
          '">' +
          (evaluation.mine[p.id] ? "Reavaliar" : "Avaliar") +
          "</button></div>",
      )
      .join("") +
    (!evaluation.players.length
      ? "<p>A organização ainda está cadastrando os jogadores.</p>"
      : "") +
    "</div></div></main>";
  $$("[data-eval]").forEach(
    (b) =>
      (b.onclick = () =>
        ratingModal(evaluation.players.find((p) => p.id === b.dataset.eval))),
  );
}

async function manageAction(action, body, message) {
  try {
    await api(action, body);
    data = await api("admin");
    session = await api("session");
    toast(message);
    return true;
  } catch (e) {
    toast(e.message);
    return false;
  }
}
function shareTeams(r) {
  const text = teamsText(r);
  openModal(
    '<h2>Enviar os times</h2><p class="muted">Texto com os nomes e goleiros, sem notas ou avaliações.</p>' +
      (!r.published
        ? '<p class="notice warning">Esta divisão ainda não foi publicada. Copiar não salva a rodada.</p>'
        : "") +
      '<label class="field">Texto para compartilhar<textarea class="share-text" id="teamMessage" readonly></textarea></label><div class="actions">' +
      button("Copiar texto", "copyTeams", "dark") +
      button("Compartilhar", "shareTeams") +
      "</div>",
  );
  $("#teamMessage").value = text;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Times copiados. Cole no WhatsApp ou onde preferir.");
    } catch {
      $("#teamMessage").focus();
      $("#teamMessage").select();
      toast("Selecione o texto e use Ctrl+C ou Copiar.");
    }
  };
  $("[data-action=copyTeams]").onclick = copy;
  $("[data-action=shareTeams]").onclick = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "La Remontada", text });
      } catch (e) {
        if (e.name !== "AbortError") await copy();
      }
    } else await copy();
  };
}
const originalRound = renderRound;
renderRound = function () {
  originalRound();
  if (!round) return;
  const bar = document.createElement("div");
  bar.className = "management-actions";
  bar.innerHTML =
    button("Enviar times sem notas", "textTeams", "primary") +
    button("Editar goleiros desta rodada", "roundKeepers");
  $("#content .panel-head").after(bar);
  $("[data-action=textTeams]").onclick = () => shareTeams(round);
  $("[data-action=roundKeepers]").onclick = () => {
    openModal(
      '<h2>Goleiros desta rodada</h2><form id="roundKeeperForm">' +
        [0, 1, 2]
          .map(
            (i) =>
              '<label class="field">Time ' +
              (i + 1) +
              '<input name="k' +
              i +
              '" maxlength="100" value="' +
              esc(round.keepers[i] || "") +
              '"></label>',
          )
          .join("") +
        '<button class="button dark">Aplicar aos times</button></form>',
    );
    $("#roundKeeperForm").onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      round.keepers = [0, 1, 2].map((i) => f.get("k" + i).trim());
      dirty = true;
      modal.close();
      renderRound();
    };
  };
};
const originalPlayers = renderPlayers;
renderPlayers = function () {
  originalPlayers();
  function controls() {
    $$("[data-pedit]").forEach((b) => {
      const p = data.players.find((p) => p.id === b.dataset.pedit),
        box = b.parentElement;
      if ($(".player-manage", box)) return;
      const toggle = document.createElement("button");
      toggle.className = "button small player-manage";
      toggle.textContent = p.active ? "Desativar" : "Reativar";
      toggle.onclick = async () => {
        if (
          await manageAction(
            "playerStatus",
            { id: p.id, active: !p.active },
            "Status atualizado.",
          )
        )
          renderPlayers();
      };
      const del = document.createElement("button");
      del.className = "button small danger";
      del.textContent = "Excluir";
      del.onclick = async () => {
        if (
          !confirm(
            "Excluir " +
              p.name +
              " e todas as avaliações dele? Os nomes nos times já salvos serão preservados. Esta exclusão é permanente.",
          )
        )
          return;
        if (
          await manageAction("playerDelete", { id: p.id }, "Jogador excluído.")
        ) {
          selected.delete(p.id);
          renderPlayers();
        }
      };
      box.append(toggle, del);
    });
  }
  controls();
  $("#searchPlayers").addEventListener("input", controls);
};
detailModal = function (p) {
  const rs = data.reviews.filter((r) => r.player_id === p.id),
    seen = new Set();
  openModal(
    "<h2>" +
      esc(p.name) +
      "</h2><p>Média: <b>" +
      num(mean(p.scores)) +
      "</b> · " +
      p.count +
      ' avaliador(es)</p><div class="review-scores">' +
      criteria
        .map(
          (c, i) => "<span>" + c + ": <b>" + num(p.scores?.[i]) + "</b></span>",
        )
        .join("") +
      '</div><p class="screen-note">Só a última versão ativa de cada avaliador entra na média. Desativar ou excluir uma versão pode fazer a anterior voltar à média.</p><div class="review-list">' +
      (rs
        .map((r) => {
          const disabled = !Number(r.active),
            old = seen.has(r.evaluator);
          if (!disabled) seen.add(r.evaluator);
          return (
            '<article class="review-item ' +
            (disabled ? "inactive" : "") +
            '"><b>' +
            esc(r.label) +
            '</b> <span class="pill">' +
            (disabled ? "Desativada" : old ? "Versão anterior" : "Na média") +
            "</span><small>" +
            new Date(r.created).toLocaleString("pt-BR") +
            "</small>" +
            (r.edited_by
              ? "<small>Editada por " + esc(r.edited_by) + "</small>"
              : "") +
            '<div class="review-scores">' +
            JSON.parse(r.scores)
              .map(
                (n, i) => "<span>" + criteria[i] + ": <b>" + n + "</b></span>",
              )
              .join("") +
            '</div><div class="management-actions"><button class="button small" data-reviewedit="' +
            r.id +
            '">Editar notas</button><button class="button small" data-reviewstatus="' +
            r.id +
            '">' +
            (disabled ? "Reativar" : "Desativar") +
            '</button><button class="button small danger" data-reviewdelete="' +
            r.id +
            '">Excluir</button></div></article>'
          );
        })
        .join("") || "<p>Nenhuma avaliação recebida.</p>") +
      "</div>",
  );
  const redraw = () => detailModal(data.players.find((x) => x.id === p.id));
  $$("[data-reviewedit]").forEach(
    (b) =>
      (b.onclick = () => {
        const r = rs.find((x) => String(x.id) === b.dataset.reviewedit);
        openModal(
          "<h2>Editar avaliação de " +
            esc(r.label) +
            "</h2><p>" +
            esc(p.name) +
            ' · A alteração será identificada como feita pela administração.</p><form id="editReviewForm">' +
            gradeFields(JSON.parse(r.scores)) +
            '<button class="button dark">Salvar notas</button></form>',
        );
        $("#editReviewForm").onsubmit = async (e) => {
          e.preventDefault();
          if (
            await manageAction(
              "reviewEdit",
              { id: r.id, scores: readGrades(e.target) },
              "Notas atualizadas.",
            )
          ) {
            renderAdmin();
            redraw();
          }
        };
      }),
  );
  $$("[data-reviewstatus]").forEach(
    (b) =>
      (b.onclick = async () => {
        const r = rs.find((x) => String(x.id) === b.dataset.reviewstatus);
        if (
          await manageAction(
            "reviewStatus",
            { id: r.id, active: !Number(r.active) },
            "Avaliação atualizada.",
          )
        ) {
          renderAdmin();
          redraw();
        }
      }),
  );
  $$("[data-reviewdelete]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (
          !confirm(
            "Excluir permanentemente esta versão da avaliação? A média será recalculada.",
          )
        )
          return;
        if (
          await manageAction(
            "reviewDelete",
            { id: Number(b.dataset.reviewdelete) },
            "Avaliação excluída.",
          )
        ) {
          renderAdmin();
          redraw();
        }
      }),
  );
};
const originalReviews = renderReviews;
renderReviews = function () {
  originalReviews();
  $$(".table-wrap tbody tr").forEach((tr, i) => {
    const inv = data.invites[i];
    if (!inv) return;
    const b = document.createElement("button");
    b.className = "button small";
    b.textContent = "Gerenciar";
    b.onclick = () => {
      openModal(
        '<h2>Gerenciar avaliador</h2><form id="manageInvite"><label class="field">Nome<input name="label" required maxlength="100" value="' +
          esc(inv.label) +
          '"></label><label class="check"><input name="active" type="checkbox" ' +
          (Number(inv.active) ? "checked" : "") +
          '>Link ativo</label><div class="actions"><button class="button dark">Salvar</button><button class="button danger" type="button" id="deleteInvite">Excluir convite</button></div></form>',
      );
      $("#manageInvite").onsubmit = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        if (
          await manageAction(
            "inviteEdit",
            { id: inv.id, label: f.get("label"), active: f.has("active") },
            "Convite atualizado.",
          )
        ) {
          modal.close();
          renderReviews();
        }
      };
      $("#deleteInvite").onclick = async () => {
        if (
          !confirm(
            "Excluir este convite permanentemente? O link para de funcionar. As avaliações recebidas ficam disponíveis em Notas por jogador.",
          )
        )
          return;
        if (
          await manageAction(
            "inviteDelete",
            { id: inv.id },
            "Convite excluído.",
          )
        ) {
          modal.close();
          renderReviews();
        }
      };
    };
    tr.lastElementChild.append(b);
  });
};
renderHistory = function () {
  $("#content").innerHTML = data.rounds.length
    ? '<div class="history-grid">' +
      data.rounds
        .map(
          (r) =>
            '<article class="panel history-card"><div class="panel-head"><span class="eyebrow">' +
            r.date.slice(0, 4) +
            '</span><span class="pill">' +
            (r.published ? "Publicada" : "Rascunho") +
            "</span></div><h3>" +
            day(r.date) +
            '</h3><p class="muted">3 times · 18 jogadores</p><div class="actions"><button class="button small" data-openround="' +
            r.date +
            '">Editar times</button><button class="button small" data-textround="' +
            r.date +
            '">Enviar texto</button><button class="button small" data-statusround="' +
            r.date +
            '">' +
            (r.published ? "Despublicar" : "Publicar") +
            '</button><button class="button small danger" data-deleteround="' +
            r.date +
            '">Excluir</button></div></article>',
        )
        .join("") +
      "</div>"
    : empty("Nenhuma rodada salva.", "Monte os times na aba Rodada.");
  $$("[data-openround]").forEach(
    (b) =>
      (b.onclick = () => {
        if (dirty && !confirm("Descartar alterações não salvas?")) return;
        date = b.dataset.openround;
        round = structuredClone(data.rounds.find((r) => r.date === date));
        selected = new Set(
          round.teams
            .flat()
            .filter((p) => !p.guest)
            .map((p) => p.id),
        );
        dirty = false;
        tab = "rodada";
        renderAdmin();
      }),
  );
  $$("[data-textround]").forEach(
    (b) =>
      (b.onclick = () =>
        shareTeams(data.rounds.find((r) => r.date === b.dataset.textround))),
  );
  for (const kind of ["status", "delete"])
    $$("[data-" + kind + "round]").forEach(
      (b) =>
        (b.onclick = async () => {
          const r = data.rounds.find(
            (r) => r.date === b.dataset[kind + "round"],
          );
          if (
            kind === "delete" &&
            !confirm(
              "Excluir permanentemente a rodada de " +
                day(r.date) +
                "? Ela sai da visão do grupo e do histórico do sorteio.",
            )
          )
            return;
          if (dirty && round?.date === r.date) {
            toast(
              "Salve ou descarte as alterações da rodada antes desta ação.",
            );
            return;
          }
          if (
            await manageAction(
              kind === "delete" ? "roundDelete" : "roundStatus",
              { date: r.date, version: r.updated, published: !r.published },
              kind === "delete" ? "Rodada excluída." : "Publicação atualizada.",
            )
          ) {
            if (round?.date === r.date)
              round = structuredClone(
                data.rounds.find((x) => x.date === r.date) || null,
              );
            renderHistory();
          }
        }),
    );
};
const originalSettings = renderSettings;
renderSettings = function () {
  originalSettings();
  if (session.user.owner)
    $$("#content .eval-player").forEach((row, i) => {
      const a = data.admins[i];
      if (!a) return;
      const b = document.createElement("button");
      b.className = "button small";
      b.textContent = "Editar acesso";
      b.onclick = () => {
        openModal(
          '<h2>Editar administrador</h2><form id="editAdmin"><label class="field">Nome<input name="name" required maxlength="100" value="' +
            esc(a.name) +
            '"></label><label class="field">E-mail<input name="email" type="email" required value="' +
            esc(a.email) +
            '"></label><label class="field">Nova senha (opcional)<input name="password" type="password" minlength="10" maxlength="128" autocomplete="new-password"><small>Deixe em branco para manter a senha atual.</small></label><label class="check"><input name="active" type="checkbox" ' +
            (Number(a.active) ? "checked" : "") +
            " " +
            (a.owner ? "disabled" : "") +
            '>Acesso ativo</label><button class="button dark">Salvar acesso</button></form>',
        );
        $("#editAdmin").onsubmit = async (e) => {
          e.preventDefault();
          const f = new FormData(e.target);
          if (
            await manageAction(
              "adminEdit",
              {
                id: a.id,
                name: f.get("name"),
                email: f.get("email"),
                password: f.get("password"),
                active: a.owner ? true : f.has("active"),
              },
              "Acesso atualizado.",
            )
          ) {
            modal.close();
            renderSettings();
          }
        };
      };
      row.append(b);
      if (!Number(a.active)) {
        const tag = document.createElement("span");
        tag.className = "pill amber";
        tag.textContent = "Desativado";
        row.append(tag);
      }
    });
  renderDrawPreferences();
};
function renderDrawPreferences() {
  const f = $("#settingsForm"),
    rules = normalizeRules(data.rules);
  const keepers = data.keepers
    .map(
      (k, i) =>
        '<label class="field">Goleiro do time ' +
        (i + 1) +
        '<input name="keeper' +
        i +
        '" maxlength="100" value="' +
        esc(k) +
        '"></label>',
    )
    .join("");
  const flags = {
    useRating: "Equilibrar a média geral dos times",
    useCriteria: "Equilibrar ataque, defesa, físico, habilidade e toque",
    usePosition: "Separar usando a posição como parâmetro",
    separateWeak: "Distribuir jogadores de menor nível",
    useHistory: "Evitar companheiros repetidos recentemente",
    avoidSameTeam: "Evitar repetir a formação completa de um time",
  };
  f.innerHTML =
    keepers +
    '<div class="divider"></div><h2>Preferências do sorteio</h2><label class="field">Como distribuir os jogadores<select name="distribution"><option value="balanced">Equilibrado — priorizar força semelhante</option><option value="mixed">Mais misturado — priorizar novos companheiros</option><option value="random">Aleatório — sem critérios de equilíbrio</option></select></label><div id="drawCriteria">' +
    Object.entries(flags)
      .map(
        ([key, label]) =>
          '<label class="check"><input type="checkbox" name="' +
          key +
          '" ' +
          (rules[key] ? "checked" : "") +
          ">" +
          label +
          "</label>",
      )
      .join("") +
    '<label class="field">Faixa de menor nível: média até<select name="weak">' +
    [1, 1.5, 2, 2.5, 3]
      .map(
        (n) =>
          '<option value="' +
          n +
          '" ' +
          (n === rules.weak ? "selected" : "") +
          ">" +
          num(n) +
          "</option>",
      )
      .join("") +
    '</select></label><label class="field">Quantas rodadas anteriores considerar<select name="history">' +
    [3, 6, 10]
      .map(
        (n) =>
          "<option " +
          (n === rules.history ? "selected" : "") +
          ">" +
          n +
          "</option>",
      )
      .join("") +
    '</select></label></div><p class="screen-note">As preferências valem para jogadores com nota. Quem está sem nota continua entrando aleatoriamente. A posição distribui fixos, alas, meios e pivôs entre os times; não é uma regra obrigatória.</p><button class="button dark">Salvar ajustes</button>';
  $("[name=distribution]", f).value = rules.distribution;
  function mode() {
    const random = $("[name=distribution]", f).value === "random";
    $$("input,select", $("#drawCriteria")).forEach(
      (el) => (el.disabled = random),
    );
  }
  $("[name=distribution]", f).onchange = mode;
  mode();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(f),
      next = {
        distribution: fd.get("distribution"),
        weak: Number($("[name=weak]", f).value),
        history: Number($("[name=history]", f).value),
      };
    for (const key of Object.keys(flags))
      next[key] = $("[name=" + key + "]", f).checked;
    if (
      await manageAction(
        "settings",
        { keepers: [0, 1, 2].map((i) => fd.get("keeper" + i)), rules: next },
        "Preferências salvas para os próximos sorteios.",
      )
    )
      renderSettings();
  };
}
const originalPublic = renderPublic;
renderPublic = function () {
  originalPublic();
  const r = publicRounds.find((r) => r.date === publicDate) || publicRounds[0];
  if (r) {
    const b = document.createElement("button");
    b.className = "button dark";
    b.textContent = "Enviar times sem notas";
    b.onclick = () => shareTeams(r);
    $("#app main").append(b);
  }
};

const originalMember = editMember;
editMember = function (t, i) {
  originalMember(t, i);
  const p = round.teams[t][i],
    used = new Set(round.teams.flat().map((x) => x.id));
  if (!$("#replaceForm")) {
    $("#modalBody").insertAdjacentHTML(
      "beforeend",
      '<div class="divider"></div><form id="replaceForm"><label class="field">Substituir por<select name="player"><option value="">Novo convidado</option>' +
        data.players
          .filter((x) => x.active && !used.has(x.id))
          .map(
            (x) => '<option value="' + x.id + '">' + esc(x.name) + "</option>",
          )
          .join("") +
        '</select></label><label class="field">Nome do convidado<input name="name" maxlength="100"></label><label class="check"><input name="register" type="checkbox">Cadastrar para próximas rodadas</label><button class="button">Substituir jogador</button></form>',
    );
  }
  $("#replaceForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target,
      fd = new FormData(f),
      id = fd.get("player");
    let next;
    try {
      if (id) next = structuredClone(data.players.find((x) => x.id === id));
      else {
        const name = String(fd.get("name") || "").trim();
        if (!name) {
          error("Informe o nome ou escolha um jogador.", f);
          return;
        }
        if (fd.has("register")) {
          const res = await api("player", {
            name,
            position: "",
            frequent: false,
            provisional: null,
          });
          data = await api("admin");
          next = structuredClone(data.players.find((x) => x.id === res.id));
        } else
          next = {
            id: crypto.randomUUID(),
            name,
            guest: true,
            position: "",
            scores: null,
            count: 0,
          };
      }
      selected.delete(p.id);
      if (!next.guest) selected.add(next.id);
      round.teams[t][i] = next;
      dirty = true;
      modal.close();
      renderRound();
    } catch (err) {
      error(err.message, f);
    }
  };
  const remove = document.createElement("button");
  remove.className = "button danger";
  remove.textContent = "Retirar do time e deixar vaga";
  remove.onclick = () => {
    if (
      !confirm(
        "Retirar " +
          p.name +
          " desta formação? O cadastro do jogador será mantido.",
      )
    )
      return;
    round.teams[t][i] = {
      id: crypto.randomUUID(),
      name: "Convidado — time " + (t + 1) + ", vaga " + (i + 1),
      guest: true,
      position: "",
      scores: null,
      count: 0,
    };
    selected.delete(p.id);
    dirty = true;
    modal.close();
    renderRound();
  };
  $("#modalBody").append(remove);
};

load().catch((err) => {
  app.innerHTML =
    "<main>" +
    empty(
      "Não foi possível abrir o app.",
      esc(err.message),
      '<a class="button dark" href="' +
        esc(location.href) +
        '">Tentar novamente</a>',
    ) +
    "</main>";
});
