# Documentação técnica — La Remontada

## 1. Visão geral

Aplicação web local ou hospedada, construída com PHP 8.1+, SQLite e JavaScript nativo. Não há etapa de build, framework ou gerenciador de pacotes. O navegador carrega módulos ES diretamente da pasta `assets/`.

Fluxo principal:

1. `index.php` entrega a estrutura HTML e as políticas de segurança.
2. `assets/app.js` inicializa a aplicação e escolhe a tela conforme a URL e a sessão.
3. O frontend chama `api.php?action=...` usando o cliente de `assets/js/api-client.js`.
4. `api.php` valida método, JSON e CSRF e encaminha a ação ao domínio correspondente.
5. Os módulos PHP usam as funções de persistência de `app/bootstrap.php` e gravam no SQLite.

## 2. Estrutura de diretórios

### Raiz

- `index.php`: documento HTML, CSP, metadados e carregamento dos assets.
- `api.php`: ponto de entrada HTTP da API. Deve conter apenas validação global e despacho de rotas.
- `router.php`: roteador do servidor PHP embutido usado em desenvolvimento.
- `.htaccess`: bloqueio de arquivos privados e configuração do Apache.
- `config.example.php`: exemplo para configurar `storage_path` fora da pasta pública.
- `LEIA-ME.md`: manual funcional, instalação e operação.
- `DOCUMENTACAO-TECNICA.md`: arquitetura e guia de manutenção.

### Backend — `app/`

- `bootstrap.php`: configuração, conexão PDO, inicialização do schema, helpers de consulta, sessão, autenticação e leitura comum de jogadores/rodadas.
- `matches.php`: domínio de confrontos. Criação, gols, placar, encerramento, cancelamento e exclusão definitiva.
- `statistics.php`: domínio de ranking e resultados agregados por jogador e formação.
- `api/sports.php`: rotas HTTP de confrontos, ranking e estatísticas. Faz a ponte entre `api.php` e os domínios esportivos.
- `.htaccess`: impede acesso HTTP direto ao código interno.

### Frontend — `assets/`

- `app.js`: composição das telas, estado da sessão e coordenação dos recursos.
- `football.mjs`: regras puras do sorteio, cálculo de força, avisos e texto dos times.
- `style.css`: estilos globais e responsivos.
- `favicon.svg`: ícone da aplicação.

### Frontend compartilhado — `assets/js/`

- `ui.js`: DOM, escape de HTML, formatação brasileira, botões, estados vazios e opções de select.
- `api-client.js`: único cliente HTTP do frontend; aplica JSON, CSRF e normaliza erros.
- `exports.js`: geração do texto de votação, CSV e card PNG dos times.

### Dados — `storage/`

- `LaRemontada.sqlite`: banco principal.
- `sessions/`: arquivos de sessão PHP.
- `automatic-backups/`: até 12 cópias anteriores a exclusões destrutivas.

Essa pasta contém dados privados e não deve ser publicada, versionada ou enviada em commits de código.

### Verificação — `tools/`

- `test.mjs`: suíte de integração. Cria uma instalação temporária, inicia um servidor PHP isolado e não altera o banco real.

## 3. Domínios e tabelas

### Administração e autenticação

- `admins`: contas administrativas, hash de senha, estado e Master.
- `login_attempts`: limitação de tentativas por origem.
- `settings`: preferências serializadas em JSON.
- Sessões: administrador normal ou acesso limitado por senha de lançamento.

O administrador Master é identificado pelo campo `owner` e pelo e-mail definido em `OWNER_EMAIL`. Apenas ele altera avaliações. Administradores comuns mantêm as demais permissões administrativas.

### Jogadores e avaliações

- `players`: cadastro, posição, frequência, estado e nota provisória.
- `invites`: links individuais de avaliação; somente o hash do token é persistido.
- `reviews`: versões das avaliações, autor, notas, estado e auditoria de edição.

A média considera apenas a versão ativa mais recente de cada avaliador por jogador.

### Rodadas e presença

- `rounds`: snapshot dos três times, goleiros, publicação e versão de concorrência.
- `attendance`: confirmação por jogador e data.

Rodadas guardam o snapshot das notas usadas no sorteio. Avaliações posteriores não alteram rodadas antigas.

### Confrontos e ranking

- `stat_teams`: identidade de uma formação em determinada rodada.
- `stat_members`: snapshot dos jogadores da formação.
- `matches`: confronto, times, teto de gols, status e autoria.
- `match_goals`: lances de gol e cancelamentos de lances.
- `stat_events`: gols e resultados consolidados para o ranking.
- `match_stat_links`: vínculo entre confronto e eventos consolidados.

Regras atuais:

- teto fixo de 2 gols;
- encerramento permitido em qualquer placar;
- somente um confronto aberto por rodada;
- cancelamento retira todos os efeitos do ranking;
- cancelados aparecem apenas para administradores;
- exclusão definitiva exige cancelamento prévio e gera backup automático;
- assistências antigas permanecem apenas como legado de banco e não são aceitas, calculadas ou exibidas.

## 4. Padrões de código

### PHP

- `declare(strict_types=1)` em todo módulo.
- Funções de domínio recebem dados já decodificados e o usuário autenticado.
- Consultas sempre preparadas por `query()`; nunca concatenar entrada do usuário em SQL.
- Respostas terminam em `result()` e erros em `fail()`.
- Operações com múltiplas gravações usam `BEGIN IMMEDIATE`, `COMMIT` e rollback em exceções.
- Endpoints destrutivos validam versão, autorização e criam backup quando necessário.
- Novas rotas de um domínio devem ficar em `app/api/<dominio>.php`, não diretamente em `api.php`.

### JavaScript

- Módulos ES com imports explícitos.
- HTML dinâmico deve passar dados por `escapeHtml`/`esc`.
- Toda chamada HTTP passa pelo cliente criado por `createApiClient`.
- Regras sem DOM devem ficar em módulos puros, como `football.mjs` ou `exports.js`.
- Uma função `render...` é responsável por desenhar e ligar os eventos de uma tela.
- Não sobrescrever funções depois da declaração. Variações devem usar nomes explícitos (`renderRoundBase`, `renderRoundManaged`, `renderRound`).
- Estado mutável global fica temporariamente concentrado no topo de `app.js`; novos recursos devem preferir estado local ao módulo.

## 5. Como localizar uma alteração

| Necessidade | Arquivo principal |
|---|---|
| Regra do sorteio | `assets/football.mjs` |
| Tela de rodada e times | `assets/app.js` (`renderRound...`) |
| Jogadores | `assets/app.js` (`renderPlayers...`) e ações em `api.php` |
| Avaliações | `assets/app.js` (`renderReviews...`) e ações em `api.php` |
| Presenças e painel | `assets/app.js` (`manageAttendance`, `renderDashboard`) |
| Compartilhamento, CSV e card | `assets/js/exports.js` |
| Confrontos e gols | `app/matches.php` |
| Rotas de confrontos/ranking | `app/api/sports.php` |
| Ranking e agregações | `app/statistics.php` |
| Login, sessão e permissões | `app/bootstrap.php` e `api.php` |
| Aparência | `assets/style.css` |
| Segurança HTTP | `index.php`, `.htaccess`, `api.php` |
| Instalação/hospedagem | `LEIA-ME.md` |

## 6. Como adicionar um endpoint

1. Escolha ou crie o módulo de domínio em `app/`.
2. Implemente uma função de domínio que valide invariantes e faça a transação.
3. Registre a ação em `app/api/<dominio>.php`.
4. Use `postOnly()` para mutações e autentique com `admin()` ou `statisticsUser()`.
5. No frontend, chame `api("nomeDaAcao", corpo)`.
6. Cubra sucesso, autorização, validação, idempotência e concorrência em `tools/test.mjs`.

## 7. Segurança e dados

- CSRF obrigatório em todo POST.
- Cookies de sessão `HttpOnly`, `SameSite=Lax` e `Secure` sob HTTPS.
- Senhas armazenadas com `password_hash`.
- Tokens de avaliação armazenados como SHA-256.
- CSP bloqueia scripts, estilos e conexões de terceiros.
- Banco e backups devem permanecer fora de `public_html` sempre que possível.
- Não adicionar `storage/LaRemontada.sqlite`, sessões ou backups a commits.

## 8. Implantação

Ao atualizar a Hostinger, envie os arquivos de código alterados e preserve o SQLite existente. A inicialização executada por `database()` cria estruturas ausentes e aplica ajustes compatíveis. Confirme que o PHP possui escrita no diretório privado configurado em `storage_path`.

Sempre incremente a versão do asset em `index.php` quando alterar JavaScript ou CSS para evitar cache antigo no navegador.

## 9. Refatorações ainda recomendadas

A estrutura está em transição e já não usa sobrescritas implícitas de funções. Para completar a separação por domínio sem uma mudança arriscada única:

1. Extrair de `assets/app.js` as telas de confrontos/ranking para `assets/js/features/sports.js`.
2. Extrair jogadores/avaliações para `assets/js/features/players.js` e `reviews.js`.
3. Extrair rodada/presença para `assets/js/features/rounds.js` e `attendance.js`.
4. Dividir as ações restantes de `api.php` em rotas `auth`, `players`, `reviews`, `rounds` e `settings`.
5. Separar `app/bootstrap.php` em conexão/schema, autenticação e repositórios de leitura.
6. Dividir `style.css` em base, componentes e páginas, mantendo uma folha agregadora.
7. Substituir migrações implícitas por uma tabela `schema_migrations` numerada.

Essas etapas devem ser feitas uma por vez, mantendo a suíte verde entre cada extração.
