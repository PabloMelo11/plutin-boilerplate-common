### logs

- padronizar se os logs vao ter camelCase, ou snake_case ...
- remover logs desnecessarios ao iniciar a aplicacao
- nao conseguimos adicionar mais informacoes na raiz do log?
- testar errors
- verificar se logs de erro deveriam ser no fastify ou no controllerBase

---

### traces

- verificar TEMPO
  - nao esta gerando os traces
  - os traces precisam estar relacionados com os logs

---

### metrics

[ ] verificar metricas
-> adicionar metricas de erros http (4XX 5XX)
-> outras metricas mais usadas no mercado

[ ] montar graficos de p50, p95, p99
-> do que o mercado mais utiliza (http_time_response...)

---

### alerts

[ ] como criar alertas atraves de metricas
-> Grafana OnCall

---

### random

[ ] como fazer o shotdown do servico corretamente
-> se tiver algo executando no event loop, a maquina deve esperar a execucao?!
[ ] colocar na lib tudo que foi desenvolvido
[ ] conseguir utilizar o decorator @Span()
-> controller
-> use case
-> repositorio

---

- voce é especialista senior:

- nodejs
- fastify
- observabilidade
- monitoramento
- grafana
- loki (logs)
- tempo (tracer)
- prometheus (metrics)
- devops
- docker

Precisamos construir uma stack do observabilidade e monitoramento com Grafana + Loki + Tempo + Prometheus. Para isso precisamos

- criar arquivos de configuração do otel -> devemos colocar os arquivos na pasta infra, raiz do projeto
- modificar o docker compose -> na raiz do projeto
- criar logger seguindo a interface ILogger (igual da classe DiscordLogger) com pino
- os logs do Loki devem estar relacionados com os traces e spans
- todo log deve ter uma estrutura padronizada
- devemos conseguir informar uma mensagem e um data para o log
  - info, warn, debug, fatal, error
- ao usar a classe de logger com o pino, toda vez que a gente adiciona um log na aplicação, ele deve aparecer no Loki
- criar arquivo para inicialização do otel
  - devemos instrumentar o node, fastify, http, log, metrics e etc...
- Inicializar o otel no arquivo main
- A classe de logger vai ser usada via injeção de dependência via arquivo common do container
- Caso necessário, devemos implementar o log na classe do FastifyAdapter
- Garantir que as versões de instrumentação sao as mais recentes estável
- Devemos seguir os padrões do mercado para configurar toda nossa stack de observabilidade e monitoramento
  - W3C Trace Context
  - inicialmente com head-based e baseline baixo (0.1–1%);

Nesse momento vamos focar somente nos Logs! Nao precisamos nos preocupar em criar toda stack para os traces e metrics.

Obs: Muitos problemas acontecem dos logs nao aparecer no loki ou mostrar esse de plugin ao tentar selecionar uma label no loki e etc. Todos esses problemas devemos ser capazes de resolver e prevenir.
