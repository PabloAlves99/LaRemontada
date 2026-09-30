# La Remontada

Aplicativo local em PHP 8.1+ e SQLite, sem Node.js, npm ou serviços externos.

Para arquitetura, mapa de arquivos e padrões de manutenção, consulte [DOCUMENTACAO-TECNICA.md](DOCUMENTACAO-TECNICA.md).

## Primeiro acesso

Se estiver em C:\Apache24\htdocs\laRemontada, acesse:
http://localhost:8090/laRemontada/?view=admin

O Apache desta máquina está configurado na porta 8090. Se estiver parado, inicie-o pelo procedimento que você já usa.

Alternativa independente do Apache: abra INICIAR-LOCAL.cmd e acesse http://localhost:8092/?view=admin. A janela precisa continuar aberta.

No primeiro acesso, crie a senha do administrador PabloHAlves99@gmail.com. Nenhuma senha padrão acompanha o projeto. A criação inicial só é aceita na própria máquina (localhost); configure antes de transferir para a hospedagem.

## Fluxo de uso

1. Em Jogadores, cadastre nome, posição e frequência. Nota provisória é opcional.
2. Em Ajustes, defina os goleiros fixos e até mais dois administradores.
3. Em Avaliações, crie um link individual para cada avaliador. Copie e guarde o link no momento da criação.
4. Em Rodada, selecione até 18 presentes. As vagas restantes viram Convidado 1, Convidado 2 etc.
5. Sorteie, use a seta de cada jogador para trocar posições entre times ou preencher convidados e publique.
6. Compartilhe a página principal com o grupo. Somente times publicados e histórico são exibidos.

## Presença, painel e compartilhamento

Na aba Rodada, use **Presenças** para marcar quem confirmou ou ainda está como talvez em cada data. O botão **Usar confirmados** leva a lista diretamente ao sorteio; a seleção manual continua disponível.

A aba **Painel** reúne as confirmações registradas, o relatório de equilíbrio da rodada aberta e permite baixar as estatísticas em CSV. Antes de publicar, a Rodada oferece dois textos: **Enviar times sem notas**, próprio para o grupo, e **Enviar nomes e notas**, para a diretoria votar na prévia. No compartilhamento dos times, **Baixar card** cria uma imagem PNG pronta para encaminhar no WhatsApp, sem notas ou avaliações.

## Acessos administrativos

`pablohalves99@gmail.com` é o administrador **Master**: somente ele pode criar, editar, desativar ou excluir avaliações. Os demais administradores podem consultar todas as notas e administrar o restante do aplicativo, inclusive cadastrar novos administradores, mas não podem alterar avaliações.

Os links localhost só funcionam no computador que executa o app. Para outras pessoas acessarem, use a hospedagem ou um endereço de rede acessível a elas. Links criados localmente precisarão usar o novo domínio após a transferência; mantenha a mesma parte ?avaliar=... para preservar o convite.

## Gols e resultados

Abra **Administração → Gols e resultados**, selecione a data e use **Cadastrar novo jogo** para escolher dois times diferentes da rodada. Os dois times aparecem lado a lado (empilhados no celular). Use **+1 gol** no jogador que marcou. **Gol contra** acrescenta um ponto ao adversário, sem contar para a artilharia. Convidados podem ter seus gols registrados no placar, mas não entram no ranking individual.

O limite é fixo em **2 gols por time**. Ao atingir esse teto, novos gols ficam bloqueados, mas a partida pode ser encerrada a qualquer momento e em qualquer placar, inclusive 0×0 ou 1×0. Ao clicar em **Encerrar jogo**, gols e vitória/derrota ou empate são registrados automaticamente no ranking. Há no máximo um jogo em andamento por rodada; ao encerrar ou cancelar, cadastre o próximo confronto, repetindo os times se necessário. Para preenchimento posterior, cadastre e encerre cada confronto individualmente.

Os acessos administrativos cadastrados e ativos podem lançar ou cancelar, inclusive corrigir rodadas passadas. Para delegar o preenchimento, use **Ajustes → Senha de lançamento**: defina uma senha de pelo menos 10 caracteres e copie o link. O jogador informa seu nome e essa senha em `?view=lancamentos`, sem precisar de conta administrativa. O nome é informado pela própria pessoa e aparece identificado no histórico administrativo como acesso por senha.

Esse acesso permite somente a próxima rodada publicada: a primeira data igual ou posterior a hoje, no fuso de São Paulo. A rodada de hoje permanece disponível durante o dia. Rodadas passadas, rascunhos e rodadas posteriores à próxima são bloqueadas também no servidor. Quem usa essa senha pode criar e encerrar confrontos, lançar gols, corrigir os próprios lances enquanto o jogo estiver aberto e cancelar um jogo aberto que criou no mesmo acesso. Não pode cancelar jogos encerrados nem lançar vitórias manualmente. Não tem acesso a avaliações, cadastros de jogadores, backups ou ajustes.

A senha não troca automaticamente: você pode atualizá-la semanalmente nos Ajustes. Ela vale até ser trocada ou desativada, sempre limitada à próxima rodada elegível. Trocar ou desativar a senha revoga os acessos anteriores imediatamente; o login administrativo permanece disponível. O sistema guarda somente o hash da senha e limita tentativas incorretas. Sem próxima rodada publicada, o anotador deve aguardar a publicação.

Os jogadores precisam estar vinculados ao time da rodada; convidados temporários devem ser cadastrados e associados antes de começar. Os goleiros que hoje são apenas nomes livres em Ajustes não possuem ficha de jogador e não entram nas estatísticas individuais.

O **Ranking**, acessível pela página principal ou por `?view=ranking`, dispensa login. A tabela inclui todos os jogadores cadastrados, mesmo com números zerados, e mostra nome, gols, vitórias, empates, derrotas e dias confirmados. Começa ordenada por vitórias, da maior para a menor; clique em qualquer coluna para ordenar e novamente para inverter. Empates no valor usam o nome em ordem alfabética. Os resultados individuais somam os resultados dos times que o jogador integrou. Somente rodadas publicadas entram nos totais esportivos; dias confirmados contam datas distintas marcadas como confirmadas, inclusive sem rodada publicada ("talvez" não conta). O filtro de data vale para todas as colunas. Resultados por formação e histórico ficam na página inicial, abaixo dos times, filtrados pela data do jogo selecionada. O acesso do topo mostra Área administrativa para quem está logado e Login para visitantes. Não são divulgadas notas, contas ou nomes dos responsáveis pelos lançamentos.

Antes de encerrar, use **Desfazer gol** para corrigir o placar. Depois de encerrar, um administrador pode **Cancelar confronto**, informando o motivo, e cadastrar o jogo correto. O cancelamento remove todos os efeitos do confronto no ranking e oculta a partida de visitantes e lançadores; ela continua visível somente na área administrativa. Um administrador pode então usar **Excluir do banco** para apagar definitivamente o confronto cancelado e seus lances. Reenviar um gol ou um encerramento após uma falha de conexão não duplica o registro. Estatísticas antigas, anteriores ao cadastro por confrontos, são preservadas.

Ao receber o primeiro lançamento, a formação daquele time fica preservada: seus jogadores não podem mais ser trocados nessa rodada, mesmo após cancelamentos. Times com histórico pertencem à data da rodada; o Time 1 de outra terça é uma formação diferente. Rodadas com estatísticas podem ser despublicadas, mas não excluídas.

As tabelas `stat_teams`, `stat_members`, `stat_events`, `matches`, `match_goals` e `match_stat_links` são criadas automaticamente no SQLite existente. Os confrontos guardam formação, placar, lances, autores e cancelamentos. O encerramento publica os totais de forma atômica. A leitura administrativa em `api.php?action=statistics` também agrega vitórias, empates e derrotas por jogador, preparando a futura integração com o sorteio; os critérios atuais do sorteio permanecem como estão. Os backups existentes incluem essas tabelas.

O endereço localhost continua acessível apenas nesta máquina; para compartilhar fora dela, hospede o aplicativo PHP conforme as instruções deste documento.

## Avaliações dos jogadores

Cada critério usa 1 — Muito ruim; 2 — Ruim; 3 — Regular; 4 — Bom; 5 — Muito bom.

Físico, ataque, defesa, habilidade e toque têm pesos iguais.
A última avaliação de cada avaliador para cada jogador entra na média.
Versões anteriores permanecem no histórico administrativo.
A primeira avaliação real substitui a nota provisória no cálculo.
Quem não conhece o jogador pode pular a avaliação.
Links de avaliação são pessoais; quem tiver o link poderá atualizar as notas daquele avaliador. Desative links em Avaliações quando necessário. Desativar não apaga notas recebidas.

## Sorteio

Três times com seis jogadores de linha; goleiros não entram no cálculo.
Jogadores sem nota e vagas temporárias são distribuídos aleatoriamente primeiro.
O algoritmo explora 2.500 combinações para os demais jogadores e escolhe entre as melhores.
Considera médias gerais e dos cinco critérios, concentração de jogadores abaixo do limite configurado, pivôs e repetição de duplas nas últimas rodadas publicadas anteriores à data escolhida.
Essas condições são preferências, e o aplicativo avisa quando não consegue cumpri-las.
Não há garantia de equilíbrio absoluto ou de nunca repetir uma formação.
Convidados temporários não entram no histórico de duplas; cadastre ou associe a pessoa para contabilizá-la.
As notas usadas ficam salvas em cada rodada, sem mudar quando chegarem avaliações novas.
A alteração só persiste depois de salvar rascunho ou publicar.
Salvar uma rodada publicada como rascunho retira-a da visão do grupo.
Uma proteção evita sobrescrever alterações salvas por outro administrador.

## Backup e restauração

Em Ajustes, use Baixar banco de dados. O arquivo contém jogadores, notas, convites, acessos (senhas em hash) e rodadas. Guarde-o em local privado.

Antes de excluir um jogador ou uma rodada, o sistema cria um backup automático. Mantém os 12 mais recentes em `storage/automatic-backups`; eles também devem ser tratados como arquivos privados.

Para restaurar:
1. Pare o acesso ao app e faça uma cópia do banco atual.
2. Substitua storage/laRemontada.sqlite pelo backup, preservando esse nome.
3. Reabra o app. O acesso inicial e as senhas serão os que estavam no backup.

Não compartilhe o banco com o grupo. Não envie a pasta storage/sessions para a hospedagem.

## Hostinger mantendo SQLite

Requisitos: PHP 8.1 ou superior, extensões pdo_sqlite, sqlite3, mbstring e sessions, servidor que respeite .htaccess (Apache/LiteSpeed) e escrita na pasta do banco.

1. Faça um backup e configure sua conta local antes da transferência.
2. Envie index.php, api.php, app/, assets/ e .htaccess para a pasta pública escolhida. Preserve os arquivos .htaccess ocultos.
3. Preferencialmente crie uma pasta privada fora de public_html para o banco.
4. Copie o backup para essa pasta com o nome laRemontada.sqlite.
5. Copie config.example.php como config.local.php na raiz pública e configure storage_path com o caminho absoluto da pasta privada.
6. Dê ao processo PHP acesso de escrita a essa pasta, sem liberar escrita irrestrita.
7. Habilite HTTPS. A sessão usa cookie seguro quando o servidor informa HTTPS.
8. Confira login, publicação, link de avaliação e backup.
9. Verifique que /storage/laRemontada.sqlite e /app/bootstrap.php respondem 403. Nunca publique o banco se ele puder ser baixado diretamente.

Não é necessário migrar para MySQL para este grupo. Confirme a disponibilidade de pdo_sqlite no plano antes do envio. Não foi realizada publicação ou configuração na Hostinger.

## Estrutura

- index.php: página e política de segurança do navegador.
- api.php: operações protegidas, avaliações e visão pública.
- app/bootstrap.php: conexão SQLite, schema e autenticação.
- assets/app.js: telas e interações.
- assets/football.mjs: sorteio e critérios.
- assets/style.css: layout responsivo.
- storage/: banco e sessões; bloqueada para acesso web.
- router.php e INICIAR-LOCAL.cmd: alternativa de desenvolvimento local.

A aplicação é entregue sem jogadores fictícios e sem credenciais padrão. Os testes foram executados em uma cópia separada.

## Instalação na pasta do Apache

Execute INSTALAR-NO-APACHE.cmd. Ele copia o app para C:\Apache24\htdocs\laRemontada sem apagar arquivos. Se já existir index.php no destino, ele interrompe para evitar sobrescrever uma instalação.

## Reexecutar testes

Com Node.js e PHP locais: node tools/test.mjs .
A suíte cria uma instalação temporária, executa 42 verificações e remove somente sua própria pasta temporária. Nenhum dado de uso real é alterado.
