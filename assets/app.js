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
  teamName,
} from "./football.mjs?v=4";
import {
  $,
  $$,
  actionButton as button,
  emptyState as empty,
  escapeHtml as esc,
  formatDay as day,
  formatNumber as num,
  selectOptions as options,
} from "./js/ui.js?v=1";
import { createApiClient } from "./js/api-client.js?v=1";
import {
  buildVotingText,
  downloadTeamCard as saveTeamCard,
  exportPlayersCsv,
} from "./js/exports.js?v=1";
const params = new URLSearchParams(location.search),
  token = params.get("avaliar");
const adminTabs = new Set([
  "rodada",
  "estatisticas",
  "jogadores",
  "avaliacoes",
  "historico",
  "painel",
  "ajustes",
]);
let session = {},
  data = {},
  tab = adminTabs.has(params.get("tab")) ? params.get("tab") : "rodada",
  selected = new Set(),
  round = null,
  date = nextTuesday(),
  dirty = false,
  publicRounds = [],
  publicDate = "",
  evaluation = {},
  saving = false,
  playerSort = "name";
const api = createApiClient(() => session.csrf);
const app = $("#app"),
  modal = $("#modal");
const isMaster = () =>
  Boolean(session.user?.owner) &&
  session.user?.email === "pablohalves99@gmail.com";
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
  if (params.get("view") === "lancamentos") {
    await renderScoringAccess();
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
    if (params.get("view") === "ranking") {
      await renderRankingPage();
      return;
    }
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
  if (!setup)
    $(".auth").insertAdjacentHTML(
      "beforeend",
      '<p><a class="button" href="?view=lancamentos">Entrar com senha de lançamento</a></p>',
    );
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
    estatisticas: [
      "Cada lance conta.",
      "Gols e resultados por rodada.",
    ],
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
    painel: [
      "O termômetro da turma.",
      "Presenças, equilíbrio da próxima rodada e dados para decidir melhor.",
    ],
    ajustes: [
      "Do nosso jeito.",
      "Goleiros, critérios e quem organiza a partida.",
    ],
  };
  const [title, sub] = titles[tab];
  const currentUrl = new URL(location.href);
  currentUrl.searchParams.set("view", "admin");
  if (tab === "rodada") currentUrl.searchParams.delete("tab");
  else currentUrl.searchParams.set("tab", tab);
  history.replaceState({ tab }, "", currentUrl);
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
      estatisticas: "Gols e resultados",
      jogadores: "Jogadores",
      avaliacoes: "Avaliações",
      historico: "Histórico",
      painel: "Painel",
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
    '</nav><section class="tab-content" id="content" tabindex="-1"></section></main>';
  $$("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        tab = b.dataset.tab;
        renderAdmin();
        $("#content")?.focus({ preventScroll: true });
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
    estatisticas: renderStatistics,
    jogadores: renderPlayers,
    avaliacoes: renderReviews,
    historico: renderHistory,
    painel: renderDashboard,
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
          '<article class="team"><div class="team-top"><div><span class="team-sub">LA REMONTADA</span><h3>' +
          teamName(t) +
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
function renderRoundBase() {
  const active = data.players.filter((p) => p.active);
  selected = new Set(
    [...selected].filter((id) => active.some((p) => p.id === id)),
  );
  const roundStep = round ? (round.published && !dirty ? 3 : 2) : 1;
  $("#content").innerHTML =
    '<ol class="workflow" aria-label="Etapas para organizar a rodada"><li class="workflow-step ' +
    (roundStep > 1 ? "done" : "active") +
    '"><strong>1</strong> Confirme quem vai jogar</li><li class="workflow-step ' +
    (roundStep === 2 ? "active" : roundStep > 2 ? "done" : "") +
    '"><strong>2</strong> Sorteie e ajuste os times</li><li class="workflow-step ' +
    (roundStep === 3 ? "active" : "") +
    '"><strong>3</strong> Salve ou publique</li></ol><div class="panel-head"><div class="actions"><label for="roundDate">Data da rodada</label><input id="roundDate" type="date" value="' +
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
function editMemberBase(t, i) {
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
                '">' +
                teamName(k) +
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
function renderPlayersBase() {
  const ps = data.players.filter((p) => p.active);
  $("#content").innerHTML =
    '<div class="summary"><div><strong>' +
    ps.length +
    "</strong><span>Jogadores ativos</span></div><div><strong>" +
    ps.filter((p) => p.count).length +
    "</strong><span>Já avaliados</span></div><div><strong>" +
    ps.filter((p) => !p.scores).length +
    '</strong><span>Ainda sem nota</span></div></div><div class="panel"><div class="panel-head"><div class="actions"><input id="searchPlayers" type="search" placeholder="Buscar jogador" aria-label="Buscar jogador"><label class="field compact">Ordenar por<select id="playerSort"><option value="name">Nome</option><option value="position">Posição</option><option value="rating">Maior média</option><option value="reviews">Mais avaliações</option><option value="frequency">Frequência</option></select></label></div>' +
    button("+ Novo jogador", "new", "dark") +
    '</div><div class="table-wrap"><table><thead><tr><th>Jogador</th><th>Posição</th><th>Nota final</th><th>Avaliações</th><th>Ações</th></tr></thead><tbody id="playerRows"></tbody></table></div></div>';
  function list(q = "") {
    $("#playerRows").innerHTML =
      data.players
        .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => {
          const rating = (p) => mean(p.scores) ?? -1;
          if (playerSort === "rating")
            return rating(b) - rating(a) || a.name.localeCompare(b.name);
          if (playerSort === "reviews")
            return b.count - a.count || a.name.localeCompare(b.name);
          if (playerSort === "frequency")
            return (
              Number(b.frequent) - Number(a.frequent) ||
              a.name.localeCompare(b.name)
            );
          if (playerSort === "position")
            return (
              (a.position || "zz").localeCompare(b.position || "zz") ||
              a.name.localeCompare(b.name)
            );
          return a.name.localeCompare(b.name);
        })
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
            '">Editar</button><button class="button small" data-detail="' +
            p.id +
            '">Notas</button>' +
            (isMaster()
              ? '<button class="button small" data-rate="' +
                p.id +
                '">Avaliar</button>'
              : "") +
            "</div></td></tr>",
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
  $("#playerSort").value = playerSort;
  $("#playerSort").onchange = (e) => {
    playerSort = e.target.value;
    list($("#searchPlayers").value);
  };
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
    $$("input", $("#provisionalFields")).forEach(
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
function detailModalSummary(p) {
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
function renderReviewsBase() {
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
function renderHistorySummary() {
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
function renderSettingsBase() {
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
            ? '<span class="pill green">Master</span>'
            : session.user.owner
              ? '<button class="button small danger" data-remove="' +
                a.id +
                '">Remover</button>'
              : "") +
          "</div>",
      )
      .join("") +
    (data.admins.length < 3
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
        '<h2>Adicionar administrador</h2><p class="muted">O novo acesso pode administrar o app e cadastrar usuários, mas só visualiza as avaliações. Apenas o Master altera notas.</p><form id="adminForm"><label class="field">Nome<input name="name" required maxlength="100"></label><label class="field">E-mail<input name="email" type="email" required></label><label class="field">Senha inicial<input name="password" type="password" minlength="10" maxlength="128" autocomplete="new-password" required><small>Ao entrar, a pessoa pode alterar a própria senha.</small></label><button class="button dark">Adicionar acesso</button></form>',
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
function renderPublicBase() {
  const r = publicRounds.find((r) => r.date === publicDate) || publicRounds[0];
  $("#modeLink").textContent = "Área administrativa";
  $("#modeLink").href = "?view=admin";
  app.innerHTML =
    '<main><div class="public-intro"><div><p class="eyebrow">FUTEBOL DE TERÇA</p><h1>O jogo começa aqui.</h1></div><a class="button primary" href="?view=ranking">Ranking de gols</a></div>' +
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
function teamsTextForVote(r) {
  return buildVotingText(r);
}
function shareTeamsBase(r, withScores = false) {
  const text = withScores ? teamsTextForVote(r) : teamsText(r);
  openModal(
    "<h2>" +
      (withScores ? "Enviar prévia para votação" : "Enviar os times") +
      '</h2><p class="muted">' +
      (withScores
        ? "Inclui as notas da rodada para a diretoria votar antes da publicação."
        : "Texto com os nomes e goleiros, sem notas ou avaliações.") +
      "</p>" +
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
function renderRoundManaged() {
  renderRoundBase();
  if (!round) return;
  const bar = document.createElement("div");
  bar.className = "management-actions";
  bar.innerHTML =
    button("Enviar times sem notas", "textTeams", "primary") +
    button("Enviar nomes e notas", "textTeamsWithScores", "dark") +
    button("Editar goleiros desta rodada", "roundKeepers");
  $("#content .panel-head").after(bar);
  $("[data-action=textTeams]").onclick = () => shareTeams(round);
  $("[data-action=textTeamsWithScores]").onclick = () =>
    shareTeams(round, true);
  $("[data-action=roundKeepers]").onclick = () => {
    openModal(
      '<h2>Goleiros desta rodada</h2><form id="roundKeeperForm">' +
        [0, 1, 2]
          .map(
            (i) =>
              '<label class="field">' +
              teamName(i) +
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
}
function renderPlayers() {
  renderPlayersBase();
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
}
function detailModal(p) {
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
            "</div>" +
            (isMaster()
              ? '<div class="management-actions"><button class="button small" data-reviewedit="' +
                r.id +
                '">Editar notas</button><button class="button small" data-reviewstatus="' +
                r.id +
                '">' +
                (disabled ? "Reativar" : "Desativar") +
                '</button><button class="button small danger" data-reviewdelete="' +
                r.id +
                '">Excluir</button></div>'
              : "") +
            "</article>"
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
}
function renderReviews() {
  renderReviewsBase();
  if (!isMaster()) {
    $("[data-action=invite]")?.remove();
    $$("[data-review]").forEach((button) => button.remove());
    const note = document.createElement("p");
    note.className = "screen-note";
    note.textContent =
      "Você tem acesso somente para visualizar as avaliações. Apenas o administrador Master pode alterá-las.";
    $("#content").prepend(note);
  }
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
}
function renderHistory() {
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
}
function renderSettings() {
  renderSettingsBase();
  if (isMaster())
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
  renderScorerSettings();
  renderMatchSettings();
}
async function renderMatchSettings() {
  const panel = document.createElement("section");
  panel.className = "panel";
  $("#content").append(panel);
  panel.innerHTML = '<h2>Regras dos confrontos</h2><p><b>Limite fixo: 2 gols.</b></p><p class="muted">O jogo pode ser encerrado a qualquer momento. Nenhum time pode ultrapassar dois gols.</p>';
}
async function renderScorerSettings() {
  const panel = document.createElement("section");
  panel.className = "panel";
  $("#content").append(panel);
  try {
    const config = await api("scorekeeperSettings");
    if (!panel.isConnected) return;
    panel.innerHTML = `<h2>Senha de lançamento</h2><p>Compartilhe esta senha com quem vai marcar os gols e resultados. Ela permite cadastrar confrontos e lançar gols somente na próxima rodada publicada (incluindo a de hoje). A pessoa pode corrigir os próprios lances enquanto o jogo estiver aberto. Rodadas passadas ficam bloqueadas.</p><p class="muted">${config.enabled ? "Acesso por senha ativado." : "Acesso por senha desativado."} A senha vale até você trocá-la ou desativá-la. Cada troca encerra os acessos anteriores.</p><p>${config.round ? `Rodada liberada: ${day(config.round)} de ${config.round.slice(0, 4)}.` : "Publique a próxima rodada para liberar os confrontos."}</p><form id="scorerSettingsForm"><label class="field">Nova senha<input name="password" type="password" autocomplete="new-password" minlength="10" maxlength="128" required><small>Pelo menos 10 caracteres. A senha salva não é exibida.</small></label><button class="button dark">${config.enabled ? "Trocar senha" : "Ativar senha"}</button></form><div class="actions public-share-actions"><button class="button" id="copyScoringLink">Copiar link de lançamento</button>${config.enabled ? '<button class="button danger" id="disableScoring">Desativar acesso por senha</button>' : ""}</div>`;
    $("#copyScoringLink").onclick = () =>
      copyLink(new URL("?view=lancamentos", location.href).href);
    $("#scorerSettingsForm").onsubmit = async (e) => {
      e.preventDefault();
      const form = e.target;
      $("button", form).disabled = true;
      try {
        await api("scorekeeperSettings", {
          password: new FormData(form).get("password"),
          enabled: true,
        });
        toast(
          "Senha atualizada. Os acessos com a senha anterior foram encerrados.",
        );
        renderSettings();
      } catch (err) {
        error(err.message, form);
      } finally {
        $("button", form).disabled = false;
      }
    };
    if ($("#disableScoring"))
      $("#disableScoring").onclick = async (e) => {
        e.target.disabled = true;
        try {
          await api("scorekeeperSettings", { enabled: false });
          toast("Acesso por senha desativado.");
          renderSettings();
        } catch (err) {
          toast(err.message);
          e.target.disabled = false;
        }
      };
  } catch (err) {
    panel.innerHTML = `<p role="alert">${esc(err.message)}</p>`;
  }
}

async function renderScoringAccess() {
  $("#modeLink").href = "?view=admin";
  $("#modeLink").textContent = session.user ? "Área administrativa" : "Login";
  if (!session.user && !session.scorekeeper) {
    app.innerHTML =
      '<main><div class="auth"><p class="eyebrow">GOLS E RESULTADOS</p><h1>Marcar os lances.</h1><p>Use a senha de lançamento fornecida pela organização.</p><div class="panel"><form id="scoringLogin"><label class="field">Seu nome<input name="name" autocomplete="username" required maxlength="100"></label><label class="field">Senha de lançamento<input name="password" type="password" autocomplete="current-password" required maxlength="128"></label><button class="button primary">Entrar para lançar</button></form></div><a class="button" href="?view=admin">Entrar com login administrativo</a></div></main>';
    $("#scoringLogin").onsubmit = async (e) => {
      e.preventDefault();
      const form = e.target;
      $("button", form).disabled = true;
      try {
        await api("scorekeeperLogin", Object.fromEntries(new FormData(form)));
        await load();
      } catch (err) {
        error(err.message, form);
      } finally {
        $("button", form).disabled = false;
      }
    };
    return;
  }
  data = await api("scoringRounds");
  tab = "estatisticas";
  app.innerHTML =
    "<main>" +
    header(
      "Gols e resultados.",
      "Selecione a rodada e registre os lances.",
      '<a class="button" href="./">Ver os times</a><button class="button" id="scoringLogout">Sair</button>',
    ) +
    '<section id="content"></section></main>';
  $("#scoringLogout").onclick = async () => {
    await api("logout", {});
    await load();
  };
  await renderStatistics();
}
function renderDrawPreferences() {
  const f = $("#settingsForm"),
    rules = normalizeRules(data.rules);
  const keepers = data.keepers
    .map(
      (k, i) =>
        '<label class="field">Goleiro do ' +
        teamName(i) +
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
function renderPublic() {
  renderPublicBase();
  const r = publicRounds.find((r) => r.date === publicDate) || publicRounds[0];
  if (r && session.user) {
    const actions = document.createElement("div");
    actions.className = "public-share-actions";
    const b = document.createElement("button");
    b.className = "button dark";
    b.textContent = "Copiar times";
    b.onclick = () => shareTeams(r);
    actions.append(b);
    $("#app main").append(actions);
  }
  if (r) {
    const summary = document.createElement("section");
    summary.className = "public-round-summary";
    summary.setAttribute("aria-label", "Resultados e histórico da rodada");
    $("#app main").append(summary);
    renderPublicRoundSummary(r, summary);
  }
}

async function renderPublicRoundSummary(round, target) {
  target.innerHTML =
    '<p class="muted" role="status">Carregando os resultados desta rodada…</p>';
  try {
    const [stats, games] = await Promise.all([
      api("ranking", null, "&date=" + encodeURIComponent(round.date)),
      api("publicMatches", null, "&date=" + encodeURIComponent(round.date)),
    ]);
    if (!target.isConnected) return;
    const dateLabel = `${day(round.date)} de ${round.date.slice(0, 4)}`;
    target.innerHTML = `<details class="panel"><summary>Confrontos do dia · ${dateLabel}</summary>${publicMatchCards(games.matches)}</details><details class="panel"><summary>Resultados por formação · ${dateLabel}</summary>
      <div class="table-wrap"><table><thead><tr><th>Time</th><th>Vitórias</th><th>Empates</th><th>Derrotas</th></tr></thead><tbody>${round.teams
        .map((members, index) => {
          const team = stats.teams.find((t) => Number(t.team_index) === index);
          return `<tr><td><b>${teamName(index)}</b><details><summary>Jogadores</summary>${members.map((p) => esc(p.name)).join(", ")}</details></td><td>${team?.win || 0}</td><td>${team?.draw || 0}</td><td>${team?.loss || 0}</td></tr>`;
        })
        .join("")}</tbody></table></div></details>
      <details class="panel"><summary>Histórico de lançamentos · ${dateLabel}</summary>${statHistory(stats.events)}</details>`;
  } catch (err) {
    if (!target.isConnected) return;
    target.innerHTML = `<p role="alert">${esc(err.message)}</p><button class="button">Tentar novamente</button>`;
    $("button", target).onclick = () => renderPublicRoundSummary(round, target);
  }
}

function editMember(t, i) {
  editMemberBase(t, i);
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
}

function attendanceMap(forDate = date) {
  return Object.fromEntries(
    (data.attendance || [])
      .filter((a) => a.round_date === forDate)
      .map((a) => [a.player_id, a.status]),
  );
}
function manageAttendance(forDate = date) {
  const current = attendanceMap(forDate);
  const players = data.players.filter((p) => p.active);

  // Último grupo presente antes desta data: última rodada com confirmações;
  // se não houver, cai para a última rodada publicada.
  function lastPresent() {
    const att = data.attendance || [];
    const prev = [
      ...new Set(
        att
          .filter((a) => a.status === "confirmed" && a.round_date < forDate)
          .map((a) => a.round_date),
      ),
    ]
      .sort()
      .reverse()[0];
    if (prev)
      return {
        date: prev,
        ids: new Set(
          att
            .filter((a) => a.round_date === prev && a.status === "confirmed")
            .map((a) => a.player_id),
        ),
      };
    const r = data.rounds.find((r) => r.published && r.date < forDate);
    if (r)
      return {
        date: r.date,
        ids: new Set(
          r.teams
            .flat()
            .filter((p) => !p.guest)
            .map((p) => p.id),
        ),
      };
    return null;
  }

  openModal(
    "<h2>Confirmação de presença</h2>" +
      '<label class="field">Rodada<input id="attendanceDate" type="date" value="' +
      forDate +
      '"></label>' +
      '<div class="actions">' +
      button("Marcar últimos presentes", "attLast", "small") +
      button("Selecionar todos", "attAll", "small") +
      button("Limpar", "attNone", "small") +
      "</div>" +
      '<p class="screen-note" id="attendanceCount"></p>' +
      '<form id="attendanceForm"><div class="attendance-list">' +
      (players.length
        ? players
            .map(
              (p) =>
                '<label class="roster-row"><input type="checkbox" name="' +
                p.id +
                '" ' +
                (current[p.id] === "confirmed" ? "checked" : "") +
                '><span class="name">' +
                esc(p.name) +
                "<small>" +
                esc(p.position || "Posição livre") +
                "</small></span></label>",
            )
            .join("")
        : '<p class="muted">Nenhum jogador ativo cadastrado.</p>') +
      '</div><button class="button dark">Salvar confirmações</button></form>',
  );

  const form = $("#attendanceForm");
  const boxes = () => $$("input[type=checkbox]", form);
  const count = () => {
    const n = boxes().filter((b) => b.checked).length;
    $("#attendanceCount").textContent =
      n +
      " confirmado(s) de " +
      players.length +
      (n > 18 ? " · acima das 18 vagas de linha" : "");
  };
  const setAll = (fn) => {
    boxes().forEach((b) => (b.checked = fn(b.name)));
    count();
  };

  $("#attendanceDate").onchange = (e) =>
    e.target.value && manageAttendance(e.target.value);
  $("[data-action=attAll]").onclick = () => setAll(() => true);
  $("[data-action=attNone]").onclick = () => setAll(() => false);
  $("[data-action=attLast]").onclick = () => {
    const last = lastPresent();
    if (!last) {
      toast("Ainda não há rodada anterior para copiar.");
      return;
    }
    setAll((id) => last.ids.has(id));
    toast("Marcados os presentes de " + day(last.date) + ".");
  };
  form.addEventListener("change", count);
  count();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const statuses = {};
    boxes()
      .filter((b) => b.checked)
      .forEach((b) => (statuses[b.name] = "confirmed"));
    if (
      await manageAction(
        "attendance",
        { date: forDate, statuses },
        "Presenças salvas.",
      )
    ) {
      modal.close();
      renderAdmin();
    }
  };
}

function renderDashboard() {
  const stats = Object.fromEntries(
    (data.attendanceStats || []).map((s) => [s.id, Number(s.confirmed)]),
  );
  const confirmed = Object.values(attendanceMap()).filter(
    (s) => s === "confirmed",
  ).length;
  const report = round
    ? round.teams.map((team, i) => ({
        team: i + 1,
        average: strength(team),
        rated: team.filter((p) => p.scores).length,
        positions:
          positions
            .filter((pos) => team.some((p) => p.position === pos))
            .join(", ") || "Sem posição",
      }))
    : [];
  $("#content").innerHTML =
    '<div class="summary"><div><strong>' +
    confirmed +
    "</strong><span>Confirmados para " +
    esc(day(date)) +
    "</span></div><div><strong>" +
    data.rounds.filter((r) => r.published).length +
    "</strong><span>Rodadas publicadas</span></div><div><strong>" +
    data.players.filter((p) => p.count).length +
    "</strong><span>Jogadores avaliados</span></div></div>" +
    '<div class="panel"><div class="panel-head"><div><h2>Presença da rodada</h2><p class="muted">Confirme a lista antes de sortear.</p></div>' +
    button("Gerenciar presença", "attendance", "dark") +
    '</div><p class="screen-note">Use “Confirmados” na aba Rodada para levar a lista direto ao sorteio.</p></div>' +
    '<div class="panel"><div class="panel-head"><h2>Participação confirmada</h2>' +
    button("Baixar CSV", "exportCsv") +
    '</div><div class="table-wrap"><table><thead><tr><th>Jogador</th><th>Confirmações</th><th>Avaliações</th></tr></thead><tbody>' +
    data.players
      .filter((p) => p.active)
      .sort(
        (a, b) =>
          (stats[b.id] || 0) - (stats[a.id] || 0) ||
          a.name.localeCompare(b.name),
      )
      .map(
        (p) =>
          "<tr><td>" +
          esc(p.name) +
          "</td><td>" +
          (stats[p.id] || 0) +
          "</td><td>" +
          p.count +
          "</td></tr>",
      )
      .join("") +
    "</tbody></table></div></div>" +
    (report.length
      ? '<div class="panel"><h2>Relatório de equilíbrio — rodada atual</h2><div class="table-wrap"><table><thead><tr><th>Time</th><th>Média</th><th>Com nota</th><th>Posições</th></tr></thead><tbody>' +
        report
          .map(
            (r) =>
              "<tr><td>" +
              teamName(r.team - 1) +
              "</td><td>" +
              num(r.average) +
              "</td><td>" +
              r.rated +
              "/6</td><td>" +
              esc(r.positions) +
              "</td></tr>",
          )
          .join("") +
        '</tbody></table></div><p class="notice">' +
        (warnings(round.teams, data.rules).map(esc).join("<br>") ||
          "Nenhum alerta nas preferências selecionadas.") +
        "</p></div>"
      : '<div class="panel"><h2>Relatório de equilíbrio</h2><p class="muted">Sorteie uma rodada para comparar os times aqui.</p></div>');
  $("[data-action=attendance]").onclick = () => manageAttendance();
  $("[data-action=exportCsv]").onclick = exportCsv;
}
function exportCsv() {
  exportPlayersCsv(data.players, data.attendanceStats || []);
}
function renderRound() {
  renderRoundManaged();
  const actions = $("#content .round-roster .actions");
  if (!actions) return;
  const attendance = attendanceMap();
  const confirmed = Object.entries(attendance)
    .filter(([, status]) => status === "confirmed")
    .map(([id]) => id);
  const presence = document.createElement("div");
  presence.className = "management-actions";
  presence.innerHTML =
    button("Presenças (" + confirmed.length + ")", "attendance", "small") +
    button("Usar confirmados", "confirmed", "small");
  actions.after(presence);
  $("[data-action=attendance]", presence).onclick = manageAttendance;
  $("[data-action=confirmed]", presence).onclick = () => {
    if (confirmed.length > 18) {
      toast("Há mais de 18 confirmados. Ajuste a lista manualmente.");
      return;
    }
    selected = new Set(confirmed);
    renderRound();
  };
}
function shareTeams(r, withScores = false) {
  shareTeamsBase(r, withScores);
  const actions = $("#teamMessage").closest(".field").nextElementSibling;
  const imageButton = document.createElement("button");
  imageButton.className = "button";
  imageButton.textContent = "Baixar card";
  imageButton.onclick = () => downloadTeamCard(r);
  actions.append(imageButton);
}
function downloadTeamCard(r) {
  saveTeamCard(r);
}

let statsDate = "",
  statsBusy = false;
const statLabels = {
  goal: "Gols",
  win: "Vitórias",
  draw: "Empates",
  loss: "Derrotas",
};

let selectedMatchId = "";
const matchRequestIds = new Map();
const newRequestId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;
function matchTitle(m) {
  return `${teamName(Number(m.teams[0].team_index))} ${m.score[m.team_a]} × ${m.score[m.team_b]} ${teamName(Number(m.teams[1].team_index))}`;
}
function matchStatus(m) {
  if (m.status === "cancelled") return "Cancelado";
  if (m.status === "open") return "Em andamento";
  if (m.score[m.team_a] === m.score[m.team_b]) return "Empate";
  return `Vitória do ${teamName(Number(m.teams.find((t) => t.id === (m.score[m.team_a] > m.score[m.team_b] ? m.team_a : m.team_b)).team_index))}`;
}
function publicMatchCards(matches) {
  return matches.length
    ? `<div class="match-list">${matches
        .map(
          (m, i) =>
            `<article class="match-list-item"><div><small>Jogo ${i + 1} · ${matchStatus(m)}</small><h3>${matchTitle(m)}</h3><details><summary>Lances</summary>${
              m.goals
                .filter((g) => !g.cancelled_at)
                .map(
                  (g) =>
                    `<p>${esc(g.player_name)}${g.own_goal ? " · gol contra" : " · gol"}</p>`,
                )
                .join("") || "<p>Sem gols.</p>"
            }</details></div></article>`,
        )
        .join("")}</div>`
    : '<p class="muted">Nenhum confronto cadastrado nesta data.</p>';
}
async function renderStatistics() {
  const content = $("#content");
  content.innerHTML = '<p role="status">Carregando os confrontos…</p>';
  try {
    if (!data.rounds.length) {
      content.innerHTML = empty(
        "Nenhuma rodada disponível.",
        session.user
          ? "Salve os times de uma rodada para cadastrar os jogos."
          : "Aguarde a publicação da próxima rodada. Rodadas passadas ficam bloqueadas.",
      );
      return;
    }
    const round =
      data.rounds.find((r) => r.date === statsDate) || data.rounds[0];
    statsDate = round.date;
    const payload = await api(
      "matches",
      null,
      "&date=" + encodeURIComponent(round.date),
    );
    if (tab !== "estatisticas" || !content.isConnected) return;
    const openMatch = payload.matches.find((m) => m.status === "open");
    const current =
      payload.matches.find((m) => m.id === selectedMatchId) ||
      openMatch ||
      payload.matches.at(-1);
    selectedMatchId = current?.id || "";
    content.innerHTML = `<div class="stats-toolbar"><label class="field">Data do jogo<select id="matchRound">${data.rounds.map((r) => `<option value="${r.date}" ${r.date === round.date ? "selected" : ""}>${day(r.date)} de ${r.date.slice(0, 4)}${r.published ? "" : " · Rascunho"}</option>`).join("")}</select></label><div class="actions"><a class="button" href="?view=ranking">Ver ranking</a><button class="button primary" id="newMatch" ${openMatch ? "disabled" : ""}>Cadastrar novo jogo</button><button class="button" id="refreshMatches">Atualizar</button></div></div>
      ${round.published ? "" : '<p class="notice">Os jogos desta rodada só aparecerão publicamente quando os times forem publicados.</p>'}
      <p class="muted">Cada time pode marcar no máximo ${payload.goalLimit} gols. O jogo pode ser encerrado a qualquer momento.</p>
      ${payload.matches.length ? `<label class="field">Confrontos desta data<select id="selectMatch">${payload.matches.map((m, i) => `<option value="${m.id}" ${m.id === selectedMatchId ? "selected" : ""}>Jogo ${i + 1} · ${matchTitle(m)} · ${matchStatus(m)}</option>`).join("")}</select></label>` : empty("Vamos começar um jogo?", "Escolha os dois times em Cadastrar novo jogo. Você poderá criar outros confrontos quando a partida terminar.")}
      <div id="matchFeedback" role="alert"></div><div id="matchEditor"></div>`;
    $("#matchRound").onchange = (e) => {
      statsDate = e.target.value;
      selectedMatchId = "";
      renderStatistics();
    };
    $("#refreshMatches").onclick = renderStatistics;
    if ($("#selectMatch"))
      $("#selectMatch").onchange = (e) => {
        selectedMatchId = e.target.value;
        renderStatistics();
      };
    const mutate = async (action, body) => {
      if (statsBusy) return;
      statsBusy = true;
      const key = action + JSON.stringify(body);
      if (["matchCreate", "matchGoal"].includes(action)) {
        if (!matchRequestIds.has(key)) matchRequestIds.set(key, newRequestId());
        body = { ...body, requestId: matchRequestIds.get(key) };
      }
      const controls = $$("button,select,input", content).map((el) => ({
        el,
        disabled: el.disabled,
      }));
      controls.forEach(({ el }) => (el.disabled = true));
      try {
        const result = await api(action, body);
        matchRequestIds.delete(key);
        if (action === "matchCreate") selectedMatchId = result.id;
        if (action === "matchDelete") selectedMatchId = "";
        if (modal.open) modal.close();
        toast(
          action === "matchFinish"
            ? "Jogo encerrado. Ranking atualizado."
            : action === "matchDelete"
              ? "Confronto excluído definitivamente."
            : "Confronto atualizado.",
        );
        await renderStatistics();
      } catch (err) {
        toast(err.message);
        if (modal.open) error(err.message, $("#modalBody"));
        else if ($("#matchFeedback"))
          $("#matchFeedback").textContent =
            err.message + " Use Atualizar para conferir o estado do jogo.";
      } finally {
        statsBusy = false;
        controls.forEach(({ el, disabled }) => {
          if (el.isConnected) el.disabled = disabled;
        });
      }
    };
    $("#newMatch").onclick = () => {
      openModal(
        `<h2>Cadastrar novo jogo</h2><p>${day(round.date)} · limite de ${payload.goalLimit} gols</p><form id="newMatchForm"><label class="field">Primeiro time<select name="teamA">${round.teams.map((_, i) => `<option value="${i}">${teamName(i)}</option>`).join("")}</select></label><label class="field">Segundo time<select name="teamB">${round.teams.map((_, i) => `<option value="${i}" ${i === 1 ? "selected" : ""}>${teamName(i)}</option>`).join("")}</select></label><button class="button primary">Criar confronto</button></form>`,
      );
      $("#newMatchForm").onsubmit = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        if (f.get("teamA") === f.get("teamB")) {
          error("Escolha dois times diferentes.", e.target);
          return;
        }
        await mutate("matchCreate", {
          date: round.date,
          teamA: Number(f.get("teamA")),
          teamB: Number(f.get("teamB")),
        });
      };
    };
    if (!current) return;
    const active = current.status === "open";
    const reached =
      Math.max(...Object.values(current.score)) >= current.goal_limit;
    const finishable = active;
    const activeGoals = current.goals.filter((g) => !g.cancelled_at);
    const matchNumber =
      payload.matches.findIndex((m) => m.id === current.id) + 1;
    $("#matchEditor").innerHTML =
      `<section class="match-scoreboard"><p class="eyebrow">JOGO ${matchNumber} · ${matchStatus(current).toUpperCase()}</p><div class="match-score"><span>${teamName(Number(current.teams[0].team_index))}</span><strong>${current.score[current.team_a]} <small>×</small> ${current.score[current.team_b]}</strong><span>${teamName(Number(current.teams[1].team_index))}</span></div><p>Limite deste jogo: ${current.goal_limit} gols${active ? " · Pode ser encerrado a qualquer momento." : ""}</p></section>
      ${active && reached ? '<p class="notice">Limite atingido. Confira os lances e encerre o jogo para registrar o resultado.</p>' : ""}
      <div class="match-team-grid">${current.teams.map((t) => `<section class="panel"><h2>${teamName(Number(t.team_index))}</h2>${t.members.map((p) => `<div class="stats-player"><div><b>${esc(p.name)}</b><small>${activeGoals.filter((g) => !g.own_goal && g.player_id === p.id && g.team_id === t.id).length} gols${Number(p.guest) ? " · Convidado, sem ranking individual" : ""}</small></div>${active ? `<div class="stats-buttons"><button class="button" data-match-goal="${esc(p.id)}" data-team="${t.id}" ${reached ? "disabled" : ""}>+1 gol</button><button class="button" data-own-goal="${esc(p.id)}" data-team="${t.id}" ${reached ? "disabled" : ""}>Gol contra</button></div>` : ""}</div>`).join("")}</section>`).join("")}</div>
      <section class="panel"><h2>Lances deste confronto</h2><p class="muted">Gol contra soma um ponto para o adversário e não entra na artilharia.</p>${
        current.goals.length
          ? current.goals
              .map((g) => {
                const t = current.teams.find((t) => t.id === g.team_id);
                return `<article class="match-goal-row ${g.cancelled_at ? "stat-cancelled" : ""}"><div><b>${esc(g.player_name)} · ${g.own_goal ? "gol contra" : "gol"}</b><small>${teamName(Number(t.team_index))}${g.cancelled_at ? " · Cancelado" : ""}</small></div>${g.can_edit ? `<button class="button small" data-undo-goal="${g.id}">Desfazer gol</button>` : ""}</article>`;
              })
              .join("")
          : "<p>Nenhum gol registrado.</p>"
      }</section>
      <div class="actions">${active ? `<button class="button primary" id="finishMatch" ${finishable ? "" : "disabled"}>Encerrar jogo</button>` : ""}${current.can_cancel ? '<button class="button danger" id="cancelMatch">Cancelar confronto</button>' : ""}${current.can_delete ? '<button class="button danger" id="deleteMatch">Excluir do banco</button>' : ""}</div>${current.cancelled_reason ? `<p class="notice">Cancelado: ${esc(current.cancelled_reason)}</p>` : ""}`;
    const base = { matchId: current.id, version: current.version };
    const confirmAction = (title, message, action, body) => {
      openModal(
        `<h2>${esc(title)}</h2><p>${esc(message)}</p><form id="confirmMatchAction"><button class="button primary">Confirmar</button></form>`,
      );
      $("#confirmMatchAction").onsubmit = (e) => {
        e.preventDefault();
        mutate(action, body);
      };
    };
    $$("[data-match-goal]").forEach(
      (b) =>
        (b.onclick = () =>
          mutate("matchGoal", {
            ...base,
            teamId: b.dataset.team,
            playerId: b.dataset.matchGoal,
            ownGoal: false,
          })),
    );
    $$("[data-own-goal]").forEach(
      (b) =>
        (b.onclick = () =>
          confirmAction(
            "Registrar gol contra",
            "O ponto será do adversário.",
            "matchGoal",
            {
              ...base,
              teamId: b.dataset.team,
              playerId: b.dataset.ownGoal,
              ownGoal: true,
            },
          )),
    );
    $$("[data-undo-goal]").forEach(
      (b) =>
        (b.onclick = () =>
          confirmAction(
            "Desfazer gol",
            "O gol será retirado do placar.",
            "matchUndoGoal",
            { ...base, goalId: b.dataset.undoGoal },
          )),
    );
    if ($("#finishMatch"))
      $("#finishMatch").onclick = () =>
        confirmAction(
          "Encerrar jogo",
          `${matchTitle(current)}. O resultado será registrado no ranking.`,
          "matchFinish",
          base,
        );
    if ($("#cancelMatch"))
      $("#cancelMatch").onclick = () => {
        openModal(
          '<h2>Cancelar confronto</h2><p>Os gols e o resultado deste jogo deixarão de contar no ranking. O confronto ficará visível somente para administradores e poderá ser excluído depois.</p><form id="cancelMatchForm"><label class="field">Motivo<input name="reason" required maxlength="250"></label><button class="button danger">Confirmar cancelamento</button></form>',
        );
        $("#cancelMatchForm").onsubmit = (e) => {
          e.preventDefault();
          mutate("matchCancel", {
            ...base,
            reason: new FormData(e.target).get("reason"),
          });
        };
      };
    if ($("#deleteMatch"))
      $("#deleteMatch").onclick = () =>
        confirmAction(
          "Excluir confronto do banco",
          "Esta exclusão é definitiva. O confronto cancelado e todos os seus lances serão removidos.",
          "matchDelete",
          base,
        );
  } catch (err) {
    if (!content.isConnected) return;
    content.innerHTML = `<p role="alert">${esc(err.message)}</p><button class="button" id="retryMatches">Atualizar acesso</button>`;
    $("#retryMatches").onclick = load;
  }
}

function statHistory(events, administrative = false) {
  if (!events.length)
    return '<p class="muted">Nenhum lançamento por aqui ainda.</p>';
  return `<div class="stats-history">${events.map((e) => `<article class="stats-history-row ${e.cancelled_at ? "stat-cancelled" : ""}"><div><b>${e.quantity} ${e.quantity === 1 ? { goal: "gol", win: "vitória", draw: "empate", loss: "derrota" }[e.kind] : statLabels[e.kind].toLowerCase()}${e.player_name ? ` · ${esc(e.player_name)}` : ""}</b><small>${day(e.round_date)} de ${e.round_date.slice(0, 4)} · ${teamName(Number(e.team_index))} · ${new Date(e.created).toLocaleString("pt-BR")}${administrative ? ` · ${esc(e.author)}` : ""}</small>${e.cancelled_at ? `<small>Cancelado${administrative ? `: ${esc(e.cancel_reason)}` : ""}</small>` : ""}</div>${administrative && !e.cancelled_at && e.can_cancel !== false ? `<button class="button small" data-stat-cancel="${e.id}">Cancelar</button>` : ""}</article>`).join("")}</div>`;
}

async function renderRankingPage() {
  $("#modeLink").href = "?view=admin";
  $("#modeLink").textContent = "Área administrativa";
  let stats = await api("ranking");
  let period = "",
    sortKey = "win",
    ascending = false;
  const columns = [
    ["name", "Jogador"],
    ["goal", "Gols"],
    ["win", "Vitórias"],
    ["draw", "Empates"],
    ["loss", "Derrotas"],
    ["confirmed", "Dias confirmados"],
  ];
  const render = () => {
    const ranked = [...stats.players].sort((a, b) => {
      const comparison =
        sortKey === "name"
          ? a.name.localeCompare(b.name, "pt-BR")
          : Number(a[sortKey]) - Number(b[sortKey]);
      return (
        (ascending ? comparison : -comparison) ||
        a.name.localeCompare(b.name, "pt-BR")
      );
    });
    app.innerHTML = `<main>
      <div class="page-heading"><div><p class="eyebrow">LA REMONTADA / RANKING</p><h1>Ranking dos jogadores.</h1><p class="muted">Toda a turma, todos os números.</p></div><a class="button" href="./">Ver os times</a></div>
      <div class="stats-toolbar"><p class="muted">Clique em uma coluna para ordenar. Clique novamente para inverter.</p><label class="field">Período<select id="rankPeriod"><option value="">Todas as datas</option>${stats.dates.map((d) => `<option value="${esc(d)}" ${period === d ? "selected" : ""}>${day(d)} de ${d.slice(0, 4)}</option>`).join("")}</select></label></div>
      <section class="panel"><div class="panel-head"><h2>Classificação geral</h2><span class="pill">${ranked.length} jogadores</span></div>
      ${ranked.length ? `<div class="table-wrap ranking-table-wrap" tabindex="0" role="region" aria-label="Ranking dos jogadores, role para ver todas as colunas"><table class="ranking-table" aria-describedby="rankExplanation"><thead><tr>${columns.map(([key, label]) => `<th scope="col" aria-sort="${sortKey === key ? (ascending ? "ascending" : "descending") : "none"}"><button class="rank-sort" data-sort="${key}">${label}<span aria-hidden="true">${sortKey === key ? (ascending ? "↑" : "↓") : "↕"}</span></button></th>`).join("")}</tr></thead><tbody>${ranked.map((p) => `<tr>${columns.map(([key]) => (key === "name" ? `<th scope="row">${esc(p.name)}</th>` : `<td${sortKey === key ? ' class="rank-selected"' : ""}>${Number(p[key])}</td>`)).join("")}</tr>`).join("")}</tbody></table></div>` : '<p class="muted">Nenhum jogador cadastrado ainda.</p>'}
      </section>
      </main>`;
    $$("[data-sort]").forEach(
      (button) =>
        (button.onclick = () => {
          const key = button.dataset.sort;
          ascending = sortKey === key ? !ascending : key === "name";
          sortKey = key;
          const scroll = $(".ranking-table-wrap").scrollLeft;
          render();
          $(".ranking-table-wrap").scrollLeft = scroll;
          $(`[data-sort="${key}"]`).focus({ preventScroll: true });
        }),
    );
    $("#rankPeriod").onchange = async (e) => {
      const select = e.target,
        nextPeriod = select.value;
      select.disabled = true;
      try {
        stats = await api(
          "ranking",
          null,
          "&date=" + encodeURIComponent(nextPeriod),
        );
        period = nextPeriod;
        render();
      } catch (err) {
        select.value = period;
        toast(err.message);
      } finally {
        select.disabled = false;
      }
    };
  };
  render();
}
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
let hiddenAt = 0;
document.addEventListener("visibilitychange", async () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    return;
  }
  if (Date.now() - hiddenAt < 60000 || dirty || modal.open) return;
  try {
    const fresh = await api("session");
    session.csrf = fresh.csrf;
    if (
      Boolean(fresh.user) !== Boolean(session.user) ||
      Boolean(fresh.scorekeeper) !== Boolean(session.scorekeeper)
    )
      location.reload();
  } catch {}
});
