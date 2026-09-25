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
    (await fetch(origin + "/storage/la-remontada.sqlite")).status === 403,
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
    output.includes("TIME 1") &&
      output.includes("TIME 2") &&
      output.includes("TIME 3") &&
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

  check((await req("logout", {})).status === 200, "Logout");
  check((await req("admin")).status === 401, "Sessão encerrada perde acesso");
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
