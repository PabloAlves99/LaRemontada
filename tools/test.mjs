import { strict as assert } from "node:assert";
import { mkdtemp, cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
const source = resolve(process.argv[2] || "."),
  base = await mkdtemp(join(tmpdir(), "remontada-test-")),
  folder = join(base, "app");
await mkdir(folder);
for (const name of ["app", "assets", "api.php", "index.php", "router.php"])
  await cp(join(source, name), join(folder, name), { recursive: true });
await mkdir(join(folder, "storage"));
const php = process.env.PHP_BINARY || "C:/php/php.exe";
const port = process.env.TEST_PORT || "18092";
const child = spawn(
  php,
  ["-S", "127.0.0.1:" + port, "-t", folder, join(folder, "router.php")],
  { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
);
let log = "";
child.stderr.on("data", (c) => {
  log += c;
});
const origin = "http://127.0.0.1:" + port;
let cookie = "",
  csrf = "",
  checks = [];
const check = (c, s) => {
  assert.ok(c, s);
  checks.push(s);
};
async function req(action, body = null, auth = true) {
  let r = await fetch(origin + "/api.php?action=" + action, {
    method: body ? "POST" : "GET",
    headers: {
      ...(auth ? { Cookie: cookie } : {}),
      ...(body
        ? { "Content-Type": "application/json", "X-CSRF-Token": csrf }
        : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let c = r.headers.get("set-cookie");
  if (c && auth) cookie = c.split(";")[0];
  return { status: r.status, data: await r.json() };
}
try {
  for (let i = 0; i < 40; i++) {
    try {
      await fetch(origin);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  let session = await req("session");
  csrf = session.data.csrf;
  check(session.data.setup, "Primeiro acesso disponível");
  check(
    (await req("setup", { password: "Teste-temporario-923!" })).status === 200,
    "Configuração do responsável",
  );
  check(
    (await req("admin", null, false)).status === 401,
    "Visitante não acessa dados administrativos",
  );
  const football = await import(
    pathToFileURL(join(source, "assets/football.mjs"))
  );
  for (let i = 0; i < 15; i++)
    check(
      (
        await req("player", {
          name: "Jogador " + String(i + 1).padStart(2, "0"),
          position: football.positions[i % 4],
          frequent: true,
          provisional: i < 12 ? Array(5).fill((i % 5) + 1) : null,
        })
      ).status === 200,
      "Cadastro " + (i + 1),
    );
  let data = (await req("admin")).data,
    pid = data.players[0].id;
  await req("review", { playerId: pid, scores: [1, 1, 1, 1, 1] });
  await req("review", { playerId: pid, scores: [5, 5, 5, 5, 5] });
  let invitation = await req("invite", { label: "Avaliador de teste" }),
    token = invitation.data.token;
  await req("review", { token, playerId: pid, scores: [3, 3, 3, 3, 3] });
  data = (await req("admin")).data;
  let p = data.players.find((p) => p.id === pid);
  check(
    p.count === 2 && p.scores.every((n) => n === 4),
    "Média usa a última nota por avaliador e substitui a provisória",
  );
  let ev = (await req("evaluation&token=" + token, null, false)).data;
  check(
    !JSON.stringify(ev).includes("provisional") &&
      !JSON.stringify(ev).includes("password"),
    "Avaliador não recebe dados privados de terceiros",
  );
  check(
    (await req("review", { playerId: pid, scores: [0, 2, 3, 4, 5] })).status ===
      400,
    "Validação de notas de 1 a 5",
  );
  let teams = football.draw(data.players, [], data.rules);
  check(
    teams.every((t) => t.length === 6) &&
      new Set(teams.flat().map((p) => p.id)).size === 18,
    "Três times com seis jogadores distintos",
  );
  check(
    teams.flat().filter((p) => p.guest).length === 3,
    "Vagas vazias viram convidados",
  );
  check(
    football
      .draw([], [], data.rules)
      .flat()
      .every((p) => p.guest),
    "Sorteio sem qualquer nota funciona",
  );
  assert.throws(
    () => football.draw([...data.players, ...data.players]),
    /18|duplicados/,
  );
  checks.push("Lista acima de 18 rejeitada");
  let save = await req("round", {
    date: "2026-09-29",
    teams,
    keepers: ["A", "B", "C"],
    publish: false,
  });
  check(save.status === 200, "Salvar rascunho");
  check(
    (await req("public", null, false)).data.rounds.length === 0,
    "Rascunho invisível para o grupo",
  );
  let pub = await req("round", {
    date: "2026-09-29",
    teams,
    keepers: ["A", "B", "C"],
    version: save.data.updated,
    publish: true,
  });
  check(pub.status === 200, "Publicar rodada");
  let group = (await req("public", null, false)).data;
  check(
    group.rounds.length === 1 && !JSON.stringify(group).includes("scores"),
    "Visão pública sem notas",
  );
  let edited = structuredClone(teams);
  [edited[0][0], edited[1][0]] = [edited[1][0], edited[0][0]];
  let edit = await req("round", {
    date: "2026-09-29",
    teams: edited,
    keepers: ["A", "B", "C"],
    version: pub.data.updated,
    publish: true,
  });
  check(
    edit.status === 200 &&
      (await req("public", null, false)).data.rounds[0].teams[0][0].id ===
        edited[0][0].id,
    "Edição manual persiste no histórico público",
  );
  check(
    (
      await req("round", {
        date: "2026-09-29",
        teams,
        keepers: ["A", "B", "C"],
        version: save.data.updated,
        publish: true,
      })
    ).status === 409,
    "Conflito de edição não sobrescreve a rodada",
  );
  let duplicate = structuredClone(teams);
  duplicate[0][0] = duplicate[1][0];
  check(
    (
      await req("round", {
        date: "2026-09-30",
        teams: duplicate,
        keepers: ["A", "B", "C"],
        publish: true,
      })
    ).status === 400,
    "Servidor rejeita jogador duplicado",
  );
  for (let i = 0; i < 2; i++)
    check(
      (
        await req("adminAdd", {
          name: "Admin " + i,
          email: "teste" + i + "@example.test",
          password: "Senha-inicial-123!",
        })
      ).status === 200,
      "Adicionar administrador " + i,
    );
  check(
    (
      await req("adminAdd", {
        name: "Quarto",
        email: "quarto@example.test",
        password: "Senha-inicial-123!",
      })
    ).status === 400,
    "Limite de três administradores",
  );
  await req("revoke", { id: data.invites[0].id });
  check(
    (await req("evaluation&token=" + token, null, false)).status === 404,
    "Link revogado não permite acesso",
  );
  let backup = await fetch(origin + "/api.php?action=backup", {
      headers: { Cookie: cookie },
    }),
    bytes = new Uint8Array(await backup.arrayBuffer());
  check(
    backup.status === 200 &&
      new TextDecoder().decode(bytes.slice(0, 15)) === "SQLite format 3",
    "Backup válido",
  );
  check(
    (
      await fetch(origin + "/api.php?action=player", {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: "{}",
      })
    ).status === 403,
    "Proteção CSRF",
  );
  check(
    (await fetch(origin + "/storage/LaRemontada.sqlite")).status === 403,
    "Banco bloqueado para download direto",
  );
  check(
    (await fetch(origin + "/app/bootstrap.php")).status === 403,
    "Pasta interna bloqueada",
  );

  // Management and sharing regression tests.
  const updatedRules = {
    distribution: "mixed",
    weak: 2.5,
    history: 3,
    useRating: false,
    useCriteria: true,
    usePosition: true,
    separateWeak: false,
    useHistory: true,
    avoidSameTeam: true,
  };
  check(
    (
      await req("settings", {
        keepers: ["GK1", "GK2", "GK3"],
        rules: updatedRules,
      })
    ).status === 200,
    "Salvar novas preferências",
  );
  let managed = (await req("admin")).data;
  check(
    JSON.stringify(managed.rules) === JSON.stringify(updatedRules),
    "Preferências persistidas",
  );
  check(
    (
      await req("settings", {
        keepers: ["", "", ""],
        rules: { ...updatedRules, distribution: "invalida" },
      })
    ).status === 400,
    "Distribuição inválida rejeitada",
  );
  const output = football.teamsText({
    date: "2026-09-29",
    teams,
    keepers: ["GK1", "GK2", "GK3"],
  });
  check(
    output.includes("TIME AZUL") &&
      output.includes("TIME VERMELHO") &&
      output.includes("TIME PRETO") &&
      output.includes("29/09/2026") &&
      output.includes("Goleiro: GK1"),
    "Texto separado por time, com data e goleiros",
  );
  const sameNames = teams.map((t) =>
    t.map((p) => ({
      ...p,
      scores: [1, 2, 3, 4, 5],
      count: 99,
      provisional: [5, 5, 5, 5, 5],
    })),
  );
  check(
    output ===
      football.teamsText({
        date: "2026-09-29",
        teams: sameNames,
        keepers: ["GK1", "GK2", "GK3"],
      }),
    "Texto é independente de notas e avaliações",
  );
  for (const mode of ["balanced", "mixed", "random"])
    check(
      football
        .draw(managed.players, [], { ...updatedRules, distribution: mode })
        .every((t) => t.length === 6),
      "Modo " + mode + " mantém seis por time",
    );
  const positional = Array.from({ length: 18 }, (_, i) => ({
    id: "pos" + i,
    name: "P" + i,
    position: football.positions[i % 3],
    scores: [3, 3, 3, 3, 3],
  }));
  const distributed = football.draw(positional, [], {
    distribution: "balanced",
    useRating: false,
    useCriteria: false,
    usePosition: true,
    separateWeak: false,
    useHistory: false,
    avoidSameTeam: false,
  });
  check(
    distributed.every((t) =>
      football.positions
        .slice(0, 3)
        .every((pos) => t.filter((p) => p.position === pos).length === 2),
    ),
    "Preferência distribui todas as posições informadas",
  );
  const latest = managed.reviews.find(
    (r) => r.player_id === pid && r.evaluator.startsWith("admin:"),
  );
  check(
    (await req("reviewEdit", { id: latest.id, scores: [4, 4, 4, 4, 4] }))
      .status === 200,
    "Administrador edita avaliação",
  );
  managed = (await req("admin")).data;
  check(
    managed.players.find((p) => p.id === pid).scores[0] === 3.5 &&
      managed.reviews.find((r) => r.id === latest.id).edited_by === "Pablo",
    "Média recalculada e edição identificada",
  );
  await req("reviewStatus", { id: latest.id, active: false });
  check(
    (await req("admin")).data.players.find((p) => p.id === pid).scores[0] === 2,
    "Desativação usa a versão ativa anterior",
  );
  await req("reviewStatus", { id: latest.id, active: true });
  check(
    (await req("admin")).data.players.find((p) => p.id === pid).scores[0] ===
      3.5,
    "Reativação restaura contribuição",
  );
  await req("reviewDelete", { id: latest.id });
  check(
    !(await req("admin")).data.reviews.some((r) => r.id === latest.id),
    "Excluir versão de avaliação",
  );
  await req("playerStatus", { id: pid, active: false });
  check(
    !(await req("admin")).data.players.find((p) => p.id === pid).active,
    "Desativar jogador",
  );
  await req("playerStatus", { id: pid, active: true });
  check(
    (await req("admin")).data.players.find((p) => p.id === pid).active,
    "Reativar jogador",
  );
  await req("inviteEdit", {
    id: data.invites[0].id,
    label: "Nome corrigido",
    active: true,
  });
  check(
    (await req("evaluation&token=" + token, null, false)).data.label ===
      "Nome corrigido",
    "Editar e reativar convite",
  );
  await req("inviteDelete", { id: data.invites[0].id });
  check(
    (await req("evaluation&token=" + token, null, false)).status === 404,
    "Excluir convite bloqueia o link",
  );
  check(
    (await req("admin")).data.reviews.some((r) =>
      r.evaluator.startsWith("invite:"),
    ),
    "Excluir convite preserva avaliações",
  );
  managed = (await req("admin")).data;
  const owner = managed.admins.find((a) => Number(a.owner)),
    other = managed.admins.find((a) => !Number(a.owner));
  check(
    (
      await req("adminEdit", {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        active: false,
        password: "",
      })
    ).status === 400,
    "Responsável não perde o próprio acesso",
  );
  check(
    (
      await req("adminEdit", {
        id: other.id,
        name: "Nome editado",
        email: other.email,
        active: false,
        password: "",
      })
    ).status === 200,
    "Desativar e editar administrador",
  );
  const anonSession = await fetch(origin + "/api.php?action=session");
  const anonCookie = anonSession.headers.get("set-cookie").split(";")[0];
  const anonCsrf = (await anonSession.json()).csrf;
  const blockedLogin = await fetch(origin + "/api.php?action=login", {
    method: "POST",
    headers: {
      Cookie: anonCookie,
      "Content-Type": "application/json",
      "X-CSRF-Token": anonCsrf,
    },
    body: JSON.stringify({
      email: other.email,
      password: "Senha-inicial-123!",
    }),
  });
  check(
    blockedLogin.status === 401,
    "Administrador desativado não consegue entrar",
  );
  await req("adminEdit", {
    id: other.id,
    name: "Nome editado",
    email: other.email,
    active: true,
    password: "",
  });
  check(
    Number(
      (await req("admin")).data.admins.find((a) => a.id === other.id).active,
    ) === 1,
    "Reativar administrador",
  );
  managed = (await req("admin")).data;
  let savedRound = managed.rounds[0];
  await req("roundStatus", {
    date: savedRound.date,
    version: savedRound.updated,
    published: false,
  });
  check(
    (await req("public", null, false)).data.rounds.length === 0,
    "Despublicar rodada",
  );
  savedRound = (await req("admin")).data.rounds[0];
  await req("roundStatus", {
    date: savedRound.date,
    version: savedRound.updated,
    published: true,
  });
  check(
    (await req("public", null, false)).data.rounds.length === 1,
    "Republicar rodada",
  );
  await req("playerDelete", { id: pid });
  managed = (await req("admin")).data;
  check(
    !managed.players.some((p) => p.id === pid) &&
      !managed.reviews.some((r) => r.player_id === pid),
    "Excluir jogador e suas avaliações",
  );
  savedRound = managed.rounds[0];
  check(
    savedRound.teams.flat().some((p) => p.id === pid),
    "Exclusão preserva nomes nas rodadas históricas",
  );
  check(
    (
      await req("round", {
        ...savedRound,
        version: savedRound.updated,
        publish: true,
      })
    ).status === 200,
    "Rodada histórica permanece editável após excluir jogador",
  );
  savedRound = (await req("admin")).data.rounds[0];
  check(
    (
      await req("roundDelete", {
        date: savedRound.date,
        version: savedRound.updated,
      })
    ).status === 200,
    "Excluir rodada",
  );
  check(
    (await req("public", null, false)).data.rounds.length === 0,
    "Rodada excluída sai da visão pública",
  );

  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const statDate = nextWeek.toISOString().slice(0, 10);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const statLaterDate = nextWeek.toISOString().slice(0, 10);
  const statTeams = football.draw(
    (await req("admin")).data.players,
    [],
    data.rules,
  );
  const statSave = await req("round", {
    date: statDate,
    teams: statTeams,
    keepers: ["", "", ""],
    publish: false,
  });
  check(statSave.status === 200, "Criar rodada para estatísticas");
  const member = statTeams[0].find((p) => !p.guest);
  const outsider = statTeams[1].find((p) => !p.guest);
  await req("attendance", {
    date: statDate,
    statuses: { [member.id]: "confirmed", [outsider.id]: "maybe" },
  });
  await req("attendance", {
    date: statLaterDate,
    statuses: { [member.id]: "confirmed" },
  });
  await req("attendance", {
    date: statLaterDate,
    statuses: { [member.id]: "confirmed" },
  });
  const initialRanking = (await req("ranking", null, false)).data;
  check(
    initialRanking.players.length === (await req("admin")).data.players.length,
    "Ranking inclui todos os jogadores sem lançamentos",
  );
  check(
    initialRanking.players.find((p) => p.id === member.id).confirmed === 2,
    "Dias confirmados contam datas distintas, mesmo sem rodada publicada",
  );
  check(
    initialRanking.players.find((p) => p.id === outsider.id).confirmed === 0,
    "Talvez não conta como dia confirmado",
  );
  const event = {
    date: statDate,
    team: 0,
    playerId: member.id,
    kind: "goal",
    quantity: 3,
    requestId: "test-goals",
  };
  check(
    (await req("statAdd", event)).status === 200,
    "Lançar três gols de uma vez",
  );
  check(
    (await req("statAdd", event)).status === 200,
    "Repetir pedido é idempotente",
  );
  check(
    (await req("statistics")).data.events.length === 1,
    "Reenvio não duplica gols",
  );
  check(
    (await req("ranking", null, false)).data.events.length === 0,
    "Ranking esconde lançamentos de rascunho",
  );
  check(
    (await req("statistics", null, false)).status === 401,
    "Histórico administrativo exige login",
  );
  for (const quantity of [0, -1, 1.5, 1000, "2"])
    check(
      (
        await req("statAdd", {
          ...event,
          quantity,
          requestId: "invalid-" + quantity,
        })
      ).status === 400,
      "Rejeitar quantidade inválida " + quantity,
    );
  check(
    (
      await req("statAdd", {
        ...event,
        playerId: outsider.id,
        requestId: "wrong-team",
      })
    ).status === 400,
    "Rejeitar jogador de outro time",
  );
  const guest = statTeams.flat().find((p) => p.guest);
  const guestTeam = statTeams.findIndex((t) =>
    t.some((p) => p.id === guest.id),
  );
  check(
    (
      await req("statAdd", {
        ...event,
        team: guestTeam,
        playerId: guest.id,
        requestId: "guest",
      })
    ).status === 400,
    "Convidado temporário não entra no ranking",
  );
  check(
    (await req("statAdd", { ...event, quantity: 4 })).status === 409,
    "Mesmo identificador não aceita conteúdo diferente",
  );
  check(
    (await req("statAdd", { ...event, kind: "assist", requestId: "assist" }))
      .status === 400,
    "Assistências não são aceitas",
  );
  for (const kind of ["win", "draw", "loss"])
    check(
      (
        await req("statAdd", {
          ...event,
          playerId: null,
          kind,
          quantity: 2,
          requestId: kind,
        })
      ).status === 200,
      "Lançar resultado " + kind,
    );
  check(
    (
      await req("roundStatus", {
        date: statDate,
        version: statSave.data.updated,
        published: true,
      })
    ).status === 200,
    "Publicar rodada com estatísticas",
  );
  let ranking = (await req("ranking", null, false)).data;
  let rankedPlayer = ranking.players.find((p) => p.id === member.id);
  check(
    rankedPlayer.goal === 3 &&
      rankedPlayer.win === 2 &&
      rankedPlayer.draw === 2 &&
      rankedPlayer.loss === 2,
    "Totais de jogador incluem os resultados do seu time",
  );
  check(
    ranking.players.find((p) => p.id === outsider.id).win === 0,
    "Resultado não é atribuído a jogadores de outro time",
  );
  const filteredRanking = (await req("ranking&date=" + statDate, null, false))
    .data;
  check(
    filteredRanking.players.find((p) => p.id === member.id).confirmed === 1 &&
      filteredRanking.players.find((p) => p.id === member.id).win === 2,
    "Filtro de data limita presenças e resultados juntos",
  );
  const attendanceOnly = (
    await req("ranking&date=" + statLaterDate, null, false)
  ).data;
  check(
    attendanceOnly.players.find((p) => p.id === member.id).confirmed === 1 &&
      attendanceOnly.players.every((p) => p.win === 0 && p.goal === 0),
    "Data sem rodada mostra confirmações e desempenho zerado",
  );
  check(
    (await req("ranking&date=2026-02-30", null, false)).status === 400,
    "Ranking rejeita data inválida",
  );
  check(
    ranking.teams[0].win === 2 &&
      ranking.teams[0].members.some((p) => p.id === member.id),
    "Time preserva vínculo dos jogadores",
  );
  check(
    !JSON.stringify(ranking).includes("created_by") &&
      !JSON.stringify(ranking).includes("author") &&
      !JSON.stringify(ranking).includes("scores"),
    "Ranking não expõe responsáveis nem avaliações",
  );
  let statRound = (await req("admin")).data.rounds.find(
    (r) => r.date === statDate,
  );
  const swapped = structuredClone(statTeams);
  [swapped[0][0], swapped[1][0]] = [swapped[1][0], swapped[0][0]];
  check(
    (
      await req("round", {
        ...statRound,
        teams: swapped,
        version: statRound.updated,
        publish: true,
      })
    ).status === 409,
    "Formação com histórico não pode mudar",
  );
  check(
    (await req("roundDelete", { date: statDate, version: statRound.updated }))
      .status === 409,
    "Rodada com histórico não pode ser apagada",
  );
  const goalEvent = ranking.events.find((e) => e.kind === "goal");
  check(
    (
      await req("statCancel", {
        id: goalEvent.id,
        reason: "Quantidade incorreta",
      })
    ).status === 200,
    "Cancelar lançamento",
  );
  await req("statCancel", { id: goalEvent.id, reason: "Reenvio" });
  ranking = (await req("ranking", null, false)).data;
  const administrativeStats = (await req("statistics")).data;
  check(
    ranking.players.find((p) => p.id === member.id).goal === 0 &&
      administrativeStats.events.find((e) => e.id === goalEvent.id)
        .cancelled_at,
    "Cancelamento repetido preserva histórico e não gera totais negativos",
  );
  check(
    (await req("statistics")).data.events.find((e) => e.id === goalEvent.id)
      .cancel_reason === "Quantidade incorreta",
    "Cancelamento preserva o motivo original",
  );
  await req("roundStatus", {
    date: statDate,
    version: statRound.updated,
    published: false,
  });
  check(
    (await req("ranking", null, false)).data.players.every(
      (p) =>
        p.goal === 0 &&
        p.win === 0 &&
        p.draw === 0 &&
        p.loss === 0,
    ),
    "Despublicação remove totais públicos e mantém os jogadores",
  );
  const anonymousSession = await fetch(origin + "/api.php?action=session");
  const anonymousData = await anonymousSession.json();
  const unauthorized = await fetch(origin + "/api.php?action=statAdd", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: anonymousSession.headers.get("set-cookie").split(";")[0],
      "X-CSRF-Token": anonymousData.csrf,
    },
    body: JSON.stringify({ ...event, requestId: "anonymous" }),
  });
  check(
    unauthorized.status === 401,
    "Visitante com CSRF válido não pode lançar estatísticas",
  );
  check(
    (await req("scorekeeperSettings", { password: "curta" })).status === 400,
    "Senha de lançamento curta rejeitada",
  );
  check(
    (
      await req("scorekeeperSettings", {
        password: "Lancamentos-semana-01",
        enabled: true,
      })
    ).status === 200,
    "Administrador configura senha de lançamento",
  );
  const accessSettings = (await req("scorekeeperSettings")).data;
  check(
    accessSettings.enabled &&
      !JSON.stringify(accessSettings).includes("hash") &&
      !JSON.stringify(accessSettings).includes("Lancamentos"),
    "Ajustes não retornam senha ou hash",
  );
  const guestSessionResponse = await fetch(origin + "/api.php?action=session");
  const guestSession = await guestSessionResponse.json();
  let scoringCookie = guestSessionResponse.headers
    .get("set-cookie")
    .split(";")[0];
  async function scoringReq(
    action,
    body = null,
    csrfToken = guestSession.csrf,
  ) {
    const response = await fetch(origin + "/api.php?action=" + action, {
      method: body ? "POST" : "GET",
      headers: {
        Cookie: scoringCookie,
        ...(body
          ? { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }
          : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.headers.get("set-cookie"))
      scoringCookie = response.headers.get("set-cookie").split(";")[0];
    return { status: response.status, data: await response.json() };
  }
  check(
    (
      await scoringReq("scorekeeperLogin", {
        name: "Anotador",
        password: "errada",
      })
    ).status === 401,
    "Senha de lançamento incorreta rejeitada",
  );
  check(
    (
      await scoringReq("scorekeeperLogin", {
        name: "Anotador",
        password: "Lancamentos-semana-01",
      })
    ).status === 200,
    "Jogador entra sem conta administrativa",
  );
  const limitedSession = (await scoringReq("session")).data;
  check(
    !limitedSession.user && limitedSession.scorekeeper.limited,
    "Sessão de lançamento não vira administrador",
  );
  for (const action of ["admin", "backup", "scorekeeperSettings"])
    check(
      (await scoringReq(action)).status === 401,
      "Anotador não acessa " + action,
    );
  check(
    (
      await scoringReq("player", {
        name: "Indevido",
        position: "",
        frequent: true,
        provisional: null,
      })
    ).status === 401,
    "Anotador não cadastra jogadores",
  );
  check(
    (await scoringReq("scorekeeperSettings", { enabled: false })).status ===
      401,
    "Anotador não altera senha compartilhada",
  );
  check(
    (await scoringReq("scoringRounds")).data.rounds.length === 0,
    "Anotador não vê rodadas em rascunho",
  );
  check(
    (await scoringReq("statAdd", { ...event, requestId: "limited-draft" }))
      .status === 403,
    "Anotador não lança em rascunho",
  );
  statRound = (await req("admin")).data.rounds.find((r) => r.date === statDate);
  await req("roundStatus", {
    date: statDate,
    version: statRound.updated,
    published: true,
  });
  await req("round", {
    date: "2001-01-01",
    teams: statTeams,
    keepers: ["", "", ""],
    publish: true,
  });
  await req("round", {
    date: statLaterDate,
    teams: statTeams,
    keepers: ["", "", ""],
    publish: true,
  });
  const limitedRounds = (await scoringReq("scoringRounds")).data;
  check(
    limitedRounds.rounds.length === 3 &&
      limitedRounds.rounds[0].date === statLaterDate &&
      limitedRounds.rounds.some((round) => round.date === statDate) &&
      limitedRounds.rounds.some((round) => round.date === "2001-01-01") &&
      !JSON.stringify(limitedRounds).includes("scores"),
    "Anotador escolhe qualquer rodada publicada, sem avaliações",
  );
  check(
    (
      await scoringReq("statAdd", {
        ...event,
        date: "2001-01-01",
        requestId: "limited-past",
      })
    ).status === 403,
    "Anotador não usa lançamento avulso em rodada anterior",
  );
  check(
    (
      await scoringReq("statAdd", {
        ...event,
        date: statLaterDate,
        requestId: "limited-future",
      })
    ).status === 403,
    "Anotador não usa lançamento avulso em outra rodada",
  );
  const pastEvent = await req("statAdd", {
    ...event,
    date: "2001-01-01",
    requestId: "admin-past",
  });
  check(
    pastEvent.status === 200,
    "Administrador continua podendo corrigir rodada passada",
  );
  check(
    (
      await scoringReq("statCancel", {
        id: pastEvent.data.id,
        reason: "Indevido",
      })
    ).status === 403,
    "Anotador não cancela lançamento de rodada passada",
  );
  check(
    (
      await scoringReq(
        "statAdd",
        { ...event, requestId: "limited-no-csrf" },
        "invalid",
      )
    ).status === 403,
    "Lançamento delegado exige CSRF",
  );
  check(
    (
      await scoringReq("statAdd", {
        ...event,
        quantity: 1,
        requestId: "limited-goal",
      })
    ).status === 403,
    "Anotador não lança estatísticas fora de um confronto",
  );
  check(
    (await scoringReq("matchSettings", { goalLimit: 9 })).status === 401,
    "Anotador não altera regra de gols",
  );
  check(
    (await req("matchSettings")).data.goalLimit === 2,
    "Confrontos começam com limite de dois gols",
  );
  check(
    (await req("matchSettings", { goalLimit: 0 })).status === 400,
    "Limite de gols inválido rejeitado",
  );
  check(
    (
      await scoringReq("matchCreate", {
        date: "2001-01-01",
        teamA: 0,
        teamB: 1,
        requestId: "match-past",
      })
    ).status === 200,
    "Anotador cria confronto em rodada publicada anterior",
  );
  check(
    (await scoringReq("matches&date=2001-01-01")).status === 200,
    "Anotador acessa confronto de rodada publicada anterior",
  );
  check(
    (
      await scoringReq("matchCreate", {
        date: statLaterDate,
        teamA: 0,
        teamB: 1,
        requestId: "match-later",
      })
    ).status === 200,
    "Anotador cria confronto em outra rodada publicada",
  );
  check(
    (
      await scoringReq("matchCreate", {
        date: statDate,
        teamA: 0,
        teamB: 0,
        requestId: "match-same",
      })
    ).status === 400,
    "Confronto exige times distintos",
  );
  const matchInput = {
    date: statDate,
    teamA: 0,
    teamB: 1,
    requestId: "first-match",
  };
  const createdMatch = await scoringReq("matchCreate", matchInput);
  check(createdMatch.status === 200, "Anotador cria novo confronto");
  check(
    (await scoringReq("matchCreate", matchInput)).data.id ===
      createdMatch.data.id,
    "Reenvio não duplica confronto",
  );
  const anotherOpen = await scoringReq("matchCreate", {
    date: statDate,
    teamA: 1,
    teamB: 2,
    requestId: "another-open",
  });
  check(
    anotherOpen.status === 200 && anotherOpen.data.id !== createdMatch.data.id,
    "Dois responsáveis podem abrir confrontos diferentes",
  );
  const simultaneousMatches = await scoringReq("matches&date=" + statDate);
  check(
    simultaneousMatches.data.matches.filter((m) => m.status === "open")
      .length === 2 &&
      simultaneousMatches.data.matches.every((m) => m.author),
    "Jogos em aberto informam o responsável",
  );
  const extraMatch = simultaneousMatches.data.matches.find(
    (m) => m.id === anotherOpen.data.id,
  );
  check(
    (
      await scoringReq("matchCancel", {
        matchId: extraMatch.id,
        version: extraMatch.version,
        reason: "Fim do teste simultâneo",
      })
    ).status === 200,
    "Responsável pode cancelar o confronto simultâneo",
  );
  let match = (await scoringReq("matches&date=" + statDate)).data.matches[0];
  const getMatch = async (id) =>
    (await scoringReq("matches&date=" + statDate)).data.matches.find(
      (m) => m.id === id,
    );
  const baseline = (await req("ranking")).data.players.find(
    (p) => p.id === member.id,
  );
  const addFirstGoal = {
    matchId: match.id,
    version: match.version,
    teamId: match.team_a,
    playerId: member.id,
    ownGoal: false,
    requestId: "match-goal-one",
  };
  check(
    (await scoringReq("matchGoal", addFirstGoal)).status === 200,
    "Gol lançado dentro do confronto",
  );
  check(
    (await scoringReq("matchGoal", addFirstGoal)).status === 200,
    "Reenvio de gol não duplica placar",
  );
  check(
    (
      await scoringReq("matchGoal", {
        ...addFirstGoal,
        requestId: "stale-goal",
      })
    ).status === 409,
    "Versão desatualizada não altera placar",
  );
  match = await getMatch(match.id);
  check(
    match.score[match.team_a] === 1 && match.goals.length === 1,
    "Placar derivado dos gols ativos",
  );
  check(
    (
      await scoringReq("matchGoal", {
        matchId: match.id,
        version: match.version,
        teamId: match.team_b,
        playerId: outsider.id,
        ownGoal: true,
        requestId: "own-goal",
      })
    ).status === 200,
    "Gol contra registrado",
  );
  match = await getMatch(match.id);
  check(
    match.score[match.team_a] === 2 && match.score[match.team_b] === 0,
    "Gol contra pontua para adversário",
  );
  check(
    (
      await scoringReq("matchGoal", {
        matchId: match.id,
        version: match.version,
        teamId: match.team_b,
        playerId: outsider.id,
        ownGoal: false,
        requestId: "after-limit",
      })
    ).status === 409,
    "Limite atingido bloqueia novos gols de ambos os times",
  );
  const ownGoal = match.goals.find((g) => g.own_goal);
  check(
    (
      await scoringReq("matchUndoGoal", {
        matchId: match.id,
        version: match.version,
        goalId: ownGoal.id,
      })
    ).status === 200,
    "Gol incorreto pode ser desfeito antes de encerrar",
  );
  match = await getMatch(match.id);
  check(match.score[match.team_a] === 1, "Desfazer gol recalcula placar");
  await scoringReq("matchGoal", {
    matchId: match.id,
    version: match.version,
    teamId: match.team_b,
    playerId: outsider.id,
    ownGoal: true,
    requestId: "own-goal-corrected",
  });
  match = await getMatch(match.id);
  check(
    (await req("ranking")).data.players.find((p) => p.id === member.id).goal ===
      baseline.goal,
    "Jogo aberto ainda não soma no ranking",
  );
  const finish = { matchId: match.id, version: match.version };
  check(
    (await scoringReq("matchFinish", finish)).status === 200,
    "Encerrar 2 a 0 calcula resultado",
  );
  check(
    (await scoringReq("matchFinish", finish)).status === 200,
    "Encerramento repetido não duplica estatísticas",
  );
  const afterMatch = (await req("ranking")).data;
  const winner = afterMatch.players.find((p) => p.id === member.id);
  check(
    winner.goal === baseline.goal + 1 && winner.win === baseline.win + 1,
    "Ranking soma um gol normal e vitória do confronto",
  );
  check(
    afterMatch.players.find((p) => p.id === outsider.id).goal === 0 &&
      afterMatch.players.find((p) => p.id === outsider.id).loss === 1,
    "Gol contra não entra na artilharia e derrota é automática",
  );
  check(
    (
      await scoringReq("matchGoal", {
        ...addFirstGoal,
        version: 99,
        requestId: "closed-goal",
      })
    ).status === 409,
    "Jogo encerrado não recebe gols",
  );
  match = await getMatch(match.id);
  check(
    (
      await scoringReq("matchCancel", {
        matchId: match.id,
        version: match.version,
        reason: "Teste",
      })
    ).status === 403,
    "Anotador não cancela jogo já encerrado",
  );
  const generatedEvent = (await req("statistics")).data.events.find(
    (e) => e.author.includes("Anotador") && !e.cancelled_at,
  );
  check(
    (await req("statCancel", { id: generatedEvent.id, reason: "Parcial" }))
      .status === 409,
    "Resultado de confronto não pode ser cancelado parcialmente",
  );
  check(
    (
      await req("matchCancel", {
        matchId: match.id,
        version: match.version,
        reason: "Correção completa",
      })
    ).status === 200,
    "Administrador cancela confronto completo",
  );
  check(
    (await req("ranking")).data.players.find((p) => p.id === member.id).win ===
      baseline.win,
    "Cancelar confronto remove todos os efeitos no ranking",
  );
  const cancelledMatch = (
    await req("matches&date=" + statDate)
  ).data.matches.find((m) => m.id === match.id);
  check(
    cancelledMatch?.status === "cancelled" &&
      !(await req("publicMatches&date=" + statDate, null, false)).data.matches.some(
        (m) => m.id === match.id,
      ),
    "Confronto cancelado aparece somente para administrador",
  );
  check(
    (
      await req("matchDelete", {
        matchId: cancelledMatch.id,
        version: cancelledMatch.version,
      })
    ).status === 200 &&
      !(await req("matches&date=" + statDate)).data.matches.some(
        (m) => m.id === match.id,
      ),
    "Administrador exclui confronto cancelado do banco",
  );
  async function newTestMatch(label) {
    const c = await scoringReq("matchCreate", {
      ...matchInput,
      requestId: label,
    });
    check(c.status === 200, "Criar confronto " + label);
    return getMatch(c.data.id);
  }
  let earlyMatch = await newTestMatch("1x0");
  await scoringReq("matchGoal", {
    matchId: earlyMatch.id,
    version: earlyMatch.version,
    teamId: earlyMatch.team_a,
    playerId: member.id,
    ownGoal: false,
    requestId: "early-goal",
  });
  earlyMatch = await getMatch(earlyMatch.id);
  check(
    (
      await scoringReq("matchFinish", {
        matchId: earlyMatch.id,
        version: earlyMatch.version,
      })
    ).status === 200,
    "Jogo pode ser encerrado em 1 a 0 antes do limite",
  );
  let zeroMatch = await newTestMatch("0x0");
  check(
    (
      await scoringReq("matchFinish", {
        matchId: zeroMatch.id,
        version: zeroMatch.version,
      })
    ).status === 200,
    "Empate 0 a 0 permitido",
  );
  let tieMatch = await newTestMatch("1x1");
  for (const [teamId, playerId] of [
    [tieMatch.team_a, member.id],
    [tieMatch.team_b, outsider.id],
  ]) {
    await scoringReq("matchGoal", {
      matchId: tieMatch.id,
      version: tieMatch.version,
      teamId,
      playerId,
      ownGoal: false,
      requestId: "tie-" + teamId,
    });
    tieMatch = await getMatch(tieMatch.id);
  }
  check(
    (
      await scoringReq("matchFinish", {
        matchId: tieMatch.id,
        version: tieMatch.version,
      })
    ).status === 200,
    "Empate 1 a 1 permitido",
  );
  let closeMatch = await newTestMatch("2x1");
  for (const [n, teamId, playerId] of [
    [0, closeMatch.team_b, outsider.id],
    [1, closeMatch.team_a, member.id],
    [2, closeMatch.team_a, member.id],
  ]) {
    await scoringReq("matchGoal", {
      matchId: closeMatch.id,
      version: closeMatch.version,
      teamId,
      playerId,
      ownGoal: false,
      requestId: "close-" + n,
    });
    closeMatch = await getMatch(closeMatch.id);
  }
  check(
    closeMatch.score[closeMatch.team_a] === 2 &&
      closeMatch.score[closeMatch.team_b] === 1,
    "Placar 2 a 1 permitido",
  );
  await scoringReq("matchFinish", {
    matchId: closeMatch.id,
    version: closeMatch.version,
  });
  const publicGames = (await req("publicMatches&date=" + statDate, null, false))
    .data;
  check(
    publicGames.matches.length === 4 &&
      !JSON.stringify(publicGames).includes("created_by") &&
      !JSON.stringify(publicGames).includes("request_id"),
    "Confrontos públicos preservam histórico sem dados de acesso",
  );
  let oldLimit = await newTestMatch("fixed-limit");
  check(
    (await req("matchSettings", { goalLimit: 3 })).status === 400 &&
      (await getMatch(oldLimit.id)).goal_limit === 2,
    "Limite de dois gols é fixo",
  );
  await scoringReq("matchCancel", {
    matchId: oldLimit.id,
    version: oldLimit.version,
    reason: "Jogo não começou",
  });
  let newLimit = await newTestMatch("new-fixed-limit");
  check(newLimit.goal_limit === 2, "Novo confronto usa limite de dois gols");
  await scoringReq("matchCancel", {
    matchId: newLimit.id,
    version: newLimit.version,
    reason: "Teste de regra",
  });
  const limitedStats = (await scoringReq("statistics")).data;
  check(
    !JSON.stringify(limitedStats).includes("created_by"),
    "Anotador não recebe dados privados de acesso",
  );
  await req("scorekeeperSettings", {
    password: "Lancamentos-semana-02",
    enabled: true,
  });
  check(
    (await scoringReq("statistics")).status === 401 &&
      (await scoringReq("session")).data.scorekeeper === null,
    "Troca de senha invalida sessões anteriores",
  );
  check(
    (await scoringReq("statAdd", { ...event, requestId: "limited-revoked" }))
      .status === 401,
    "Sessão revogada não grava lançamentos",
  );
  check(
    (
      await scoringReq("scorekeeperLogin", {
        name: "Anotador",
        password: "Lancamentos-semana-01",
      })
    ).status === 401,
    "Senha antiga não funciona após troca",
  );
  check(
    (
      await scoringReq("scorekeeperLogin", {
        name: "Anotador",
        password: "Lancamentos-semana-02",
      })
    ).status === 200,
    "Nova senha permite novo acesso",
  );
  await req("scorekeeperSettings", { enabled: false });
  check(
    (await scoringReq("statistics")).status === 401,
    "Desativação revoga acesso existente",
  );
  check(
    (await req("statistics")).status === 200,
    "Desativação mantém acesso administrativo",
  );
  for (let attempt = 0; attempt < 10; attempt++)
    await scoringReq("scorekeeperLogin", {
      name: "Anotador",
      password: "errada",
    });
  check(
    (
      await scoringReq("scorekeeperLogin", {
        name: "Anotador",
        password: "errada",
      })
    ).status === 429,
    "Tentativas repetidas de senha são limitadas",
  );
  check((await req("logout", {})).status === 200, "Logout");
  check((await req("admin")).status === 401, "Sessão encerrada perde acesso");
  check(
    output.includes("TIME AZUL") &&
      output.includes("TIME VERMELHO") &&
      output.includes("TIME PRETO") &&
      output.includes("29/09/2026") &&
      output.includes("Goleiro: GK1"),
    "Texto separado por time, com data e goleiros",
  );
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} catch (e) {
  console.error(e);
  console.error(log);
  process.exitCode = 1;
} finally {
  child.kill();
  await new Promise((r) => child.on("exit", r));
  const target = resolve(base);
  if (target.startsWith(resolve(tmpdir()) + requireSeparator()))
    await rm(target, { recursive: true, force: true });
}
function requireSeparator() {
  return process.platform === "win32" ? "\\" : "/";
}
