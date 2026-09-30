import { mean, teamName } from "../football.mjs?v=4";
import { formatDay, formatNumber } from "./ui.js?v=1";

export function buildVotingText(round) {
  return [
    "⚽ LA REMONTADA — PRÉVIA PARA VOTAÇÃO",
    formatDay(round.date),
    "Notas: média geral de cada jogador.",
    ...round.teams.map((team, index) =>
      [
        teamName(index).toUpperCase(),
        ...(round.keepers?.[index]
          ? [`Goleiro: ${round.keepers[index]}`]
          : []),
        ...team.map((player, playerIndex) => {
          const position = `${playerIndex + 1}. ${player.name}`;
          if (!player.scores) return `${position} — sem nota`;
          return `${position} — média ${formatNumber(mean(player.scores))}`;
        }),
      ].join("\n"),
    ),
  ].join("\n\n");
}

export function exportPlayersCsv(players, attendanceStats) {
  const confirmations = Object.fromEntries(
    attendanceStats.map((item) => [item.id, item.confirmed]),
  );
  const rows = [
    ["Jogador", "Posição", "Confirmações", "Avaliações", "Média"],
    ...players.map((player) => [
      player.name,
      player.position,
      confirmations[player.id] || 0,
      player.count,
      mean(player.scores)?.toFixed(1) || "",
    ]),
  ];
  const content =
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
          .join(";"),
      )
      .join("\r\n");
  downloadBlob(
    new Blob([content], { type: "text/csv;charset=utf-8" }),
    "la-remontada-estatisticas.csv",
  );
}

export function downloadTeamCard(round) {
  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = 1080 * scale;
  canvas.height = 1320 * scale;

  const context = canvas.getContext("2d");
  context.scale(scale, scale);
  context.fillStyle = "#101c1b";
  context.fillRect(0, 0, 1080, 1320);
  context.fillStyle = "#c9f96b";
  context.font = "800 38px Arial";
  context.fillText("⚽  LA REMONTADA", 60, 85);
  context.fillStyle = "#f4f9ed";
  context.font = "700 30px Arial";
  context.fillText(formatDay(round.date).toUpperCase(), 60, 132);

  round.teams.forEach((team, index) => {
    const x = 60 + index * 340;
    context.fillStyle = "#20352e";
    context.fillRect(x, 185, 300, 1030);
    context.fillStyle = "#c9f96b";
    context.font = "800 27px Arial";
    context.fillText(teamName(index).toUpperCase(), x + 24, 235);
    context.fillStyle = "#b4bdb6";
    context.font = "18px Arial";
    context.fillText(
      `GOLEIRO: ${round.keepers?.[index] || "A definir"}`,
      x + 24,
      275,
    );
    context.fillStyle = "#f4f9ed";
    context.font = "22px Arial";
    team.forEach((player, playerIndex) => {
      context.fillText(
        `${playerIndex + 1}. ${player.name.slice(0, 22)}`,
        x + 24,
        335 + playerIndex * 105,
      );
    });
  });

  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `la-remontada-${round.date}.png`;
  link.click();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
