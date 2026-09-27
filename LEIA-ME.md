# La Remontada

Aplicativo local em PHP 8.1+ e SQLite, sem Node.js, npm ou serviços externos.

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

## Avaliações

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
