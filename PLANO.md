# Plano de Desenvolvimento — Dashboard Eleitoral

## Status Geral: Em andamento

---

## Checklist de Módulos

### Infraestrutura
- [x] Repositório clonado e configurado
- [x] CONTEXTO.md criado
- [x] PLANO.md criado
- [ ] Estrutura de diretórios criada
- [ ] .gitignore configurado
- [ ] README.md escrito
- [ ] GitHub Actions deploy configurado

### ETL
- [ ] `etl/requirements.txt` com dependências
- [ ] `01_download_tse.py` — download dados TSE Campinas
- [ ] `02_processar_resultados.py` — limpeza e agregação por ZE/seção
- [ ] `03_geocodificar_secoes.py` — lat/lng via Nominatim
- [ ] `04_cruzar_perfil_ze.py` — perfil demográfico por ZE
- [ ] `05_calcular_scores.py` — scores de priorização
- [ ] Dados processados em `data/` commitados

### Frontend Base
- [ ] `index.html` com estrutura, navbar e imports
- [ ] `css/main.css` com variáveis, reset e componentes base
- [ ] `js/utils.js` com helpers de formatação e carregamento de dados
- [ ] `js/app.js` com roteamento entre módulos
- [ ] `data/config.json` com configurações do campo progressista

### Módulo 1 — Visão Geral
- [ ] 4 cards de métricas
- [ ] Mapa coroplético por ZE (Leaflet)
- [ ] Ranking top 5 ZEs
- [ ] Filtros de eleição e partido
- [ ] Disclaimer no rodapé

### Módulo 2 — Análise por ZE
- [ ] Mapa com seções individuais
- [ ] Painel lateral com dados da ZE
- [ ] Gráfico histórico da ZE
- [ ] Perfil demográfico da ZE
- [ ] Classificação automática com texto
- [ ] Navegação entre ZEs

### Módulo 3 — Priorização Estratégica
- [ ] Tabela ranqueada com scores
- [ ] Sliders de ajuste de pesos
- [ ] Mapa colorido pelo score
- [ ] Fórmula visível ao usuário
- [ ] Filtros por classificação

### Módulo 4 — Perfil do Eleitor
- [ ] Pirâmide etária campo vs geral
- [ ] Distribuição por sexo
- [ ] Distribuição por escolaridade
- [ ] Comparativo Campinas vs SP
- [ ] Filtro por partido

### Módulo 5 — Evolução Temporal
- [ ] Gráfico de linha % campo 2018→2024
- [ ] Mapa de variação entre eleições
- [ ] Barras empilhadas por partido
- [ ] Destaque crescimento/queda por ZE
- [ ] Filtro por tipo de eleição

### Deploy
- [ ] `deploy.yml` GitHub Actions configurado
- [ ] GitHub Pages habilitado no repositório
- [ ] URL de acesso documentada no README

---

## Decisões Tomadas

| Data | Decisão | Racional |
|------|---------|----------|
| 2026-06-08 | Stack 100% estática (HTML/CSS/JS + Python ETL) | Custo zero, sem dependências de servidor, adequado para o volume de dados |
| 2026-06-08 | Nominatim para geocodificação | Gratuito, sem limite de requisições para volume eleitoral |
| 2026-06-08 | Leaflet.js + Chart.js | Leves, sem dependência de API key, bem documentados |
| 2026-06-08 | CSVs pré-processados como storage | Suficiente para volume e permite versionamento no Git |

---

## Problemas Encontrados e Soluções

_Registrar aqui conforme surgem durante o desenvolvimento._

---

## Próximos Passos

1. Criar estrutura de diretórios do projeto
2. Configurar `.gitignore` e atualizar `README.md`
3. Escrever `etl/requirements.txt` e scripts ETL
4. Executar ETL para baixar e processar dados do TSE
5. Construir frontend base com tema visual PSOL
6. Implementar Módulo 1 (Visão Geral)

---

## Log de Mudanças

### 2026-06-08
- Repositório clonado de https://github.com/bigodsk/dashboard-eleitoral.git
- Criados CONTEXTO.md e PLANO.md com especificação completa do projeto
- Iniciado desenvolvimento conforme ordem recomendada no Prompt Mestre
