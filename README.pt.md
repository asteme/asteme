<p align="center">
  <img src="docs/banner.pt.jpg" alt="Asteme" width="100%">
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.zh.md">中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a> · <a href="README.de.md">Deutsch</a> · <a href="README.ru.md">Русский</a> · Português
</p>

**Em desenvolvimento:** Asteme ainda está em construção. O comportamento pode mudar, e ele pode falhar ou perder dados. Ainda não use para nada importante.

# ASTEME

Asteme é memória de longo prazo para um assistente de IA. Ela não procura palavras parecidas em conversas passadas. Guarda o que você disse junto com a situação a que aquilo se aplica, traz de volta quando essa situação se repete e muda a facilidade com que cada lembrança vem à mente conforme o uso tenha ajudado ou não.

Roda na sua máquina, em um único arquivo SQLite. Funciona como plugin do DeepSeek Harness, como servidor MCP para qualquer agente ou como biblioteca.

<p align="center">
  <img src="docs/review.png" alt="A tela de revisão" width="420">
</p>

## O que ela tem de diferente

**Quem lembra é a situação, não as palavras.** Certa vez você corrigiu um memorando: “coloque a decisão primeiro, a diretora só lê três linhas”. Dias depois, pede uma página para um investidor. Nenhuma palavra em comum, mas é a mesma situação (alguém com pouco tempo que precisa decidir), e a lembrança volta.

**O uso reescreve a memória.** Depois que uma lembrança é usada, o que você diz em seguida é lido para saber como foi. A que ajudou vem à mente com mais facilidade. A que ficou fora de lugar deixa de aparecer nesse tipo de situação e continua valendo nas outras. Nada se apaga por ser antigo, e nada é excluído porque há muita coisa.

**Toda lembrança termina nas suas próprias palavras.** Cada uma guarda a frase exata de onde veio. Você pode abrir qualquer uma e ver em que ela se apoia, onde se aplica, cada vez que foi usada e como foi, e cada mudança feita nela. Se você diz que algo está errado, a sua palavra vale mais que a do modelo.

Além disso, ela revê o que aconteceu entre as conversas e tira uma lição de ocasiões diferentes; percebe quando duas lembranças se contradizem e pergunta a você; e mantém um propósito e valores que nada do que aprende pode mudar. O [DESIGN.md](DESIGN.md) explica como cada coisa funciona e como é testada (em inglês).

## Experimente em um minuto

Node 22.5 ou mais recente. Nada para instalar, nenhuma chave de API.

```
git clone https://github.com/asteme/asteme.git
cd REPO
npm run demo
```

A demo reproduz duas semanas com um usuário diante de um modelo roteirizado e vai contando o que a memória faz. `npm test` roda todos os testes do mesmo jeito. Para ver o painel, abra `client/preview/preview.html` no navegador.

## Como usar

### Como memória para qualquer agente (MCP)

```
ASTEME_DB=./memory.sqlite \
ASTEME_LLM_URL=https://your-endpoint/v1 ASTEME_LLM_KEY=... ASTEME_LLM_MODEL=... \
node standalone/mcp.mjs
```

Um servidor MCP via stdio. O agente chama `asteme_recall` com cada mensagem antes de responder e `asteme_observe` com a resposta depois.

### Como biblioteca

```js
import { openBrain } from "./standalone/brain.mjs";

const brain = openBrain({ path: "memory.sqlite", infer, embed });
const { note } = await brain.recall({ session: "s1", message });   // antes de responder
brain.observe({ session: "s1", reply });                           // depois de responder
await brain.rest();                                                // quando não há nada a fazer
```

### Como plugin do DeepSeek Harness

`plugin/` é o adaptador e `client/` é o painel de configurações. É a forma em que mais foi usada.

## O painel

- **Review**: aquilo de que ela não tem certeza, e o que a última resposta usou e por quê. Um clique diz se uma lembrança foi acertada, ficou fora de lugar ou está errada, e é com esse clique que ela aprende.
- **Memory**: tudo o que ela sabe. Qualquer item pode ser aberto para mostrar em que se apoia.
- **Activity**: o que ela fez enquanto você estava fora, e por que nada acontece quando nada acontece.
- **Charter**: seu propósito e seus valores. Quem escreve é você; nada do que ela aprende os altera.

O painel está disponível em inglês, japonês e chinês.

## Para onde isto vai

Não achamos que memória seja um registro em que se pesquisa. É lembrar o que aconteceu, mudar de ideia conforme o desfecho e nunca apagar: algumas coisas apenas ficam mais difíceis de lembrar. Cada lembrança é uma estrela, e a situação em que você está é o que as liga numa figura.

O que buscamos é um assistente que, depois de tempo suficiente com uma pessoa, seja alguém em particular para ela. O Asteme ainda não chegou lá. Hoje é a primeira volta desse ciclo, em uma única máquina, com mais coisas projetadas do que comprovadas. O [registro de alterações](CHANGELOG.md) e o [`DESIGN.md`](DESIGN.md) dizem com clareza o que é o quê.

## Seus dados

- Tudo fica em um arquivo SQLite na sua máquina. Não há telemetria. A rede só é usada para os serviços de modelo que você configurar e, uma única vez, para baixar o modelo local de embeddings.
- **Exportar e importar** uma cópia completa, com as conversas. Importar acrescenta o que falta e nunca sobrescreve.
- **Um diário**: um arquivo Markdown por mês com o que foi dito, o que ela tirou disso e como foi.
- **Cópias automáticas** uma vez por dia. Só cópias antigas são descartadas, nunca o que ela lembra.
- **Esquecer é de verdade**: esquecer uma lembrança junto com as mensagens de origem remove tudo de todas as tabelas, e uma importação não traz de volta.

## Licença

Not yet published. All rights reserved for now: see [LICENSE](LICENSE).









