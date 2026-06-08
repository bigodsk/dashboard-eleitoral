# Contexto do Projeto — Dashboard de Inteligência Eleitoral

## Objetivo

Dashboard de inteligência eleitoral para uso interno de grupo político ligado ao PSOL em Campinas-SP.
Orienta a estratégia de uma candidatura a deputada estadual com base em dados eleitorais do TSE.

**Princípio central:** menos exploração, mais conclusão. O sistema analisa; o coordenador decide.

**Usuário final:** coordenadores de campanha sem perfil técnico. Cada tela responde uma pergunta estratégica clara.

---

## Decisões de Arquitetura (não rediscutir)

- **Zero custo de infra:** arquivos estáticos no GitHub Pages, sem servidor, sem banco de dados, sem APIs pagas.
- **ETL em Python, frontend estático:** todo processamento pesado ocorre nos scripts Python. O browser só lê dados pré-processados.
- **Sem autenticação:** acesso aberto via URL, uso interno por confiança.
- **Sem backend:** dados pré-computados em CSV/GeoJSON. Nenhum cálculo complexo no JS.
- **Limite por arquivo de dado:** máximo 2MB por arquivo carregado no browser.
- **Offline-first:** funciona após o primeiro carregamento.

---

## Stack Técnica

| Camada | Tecnologia |
|--------|-----------|
| ETL | Python 3.11+, pandas, geopandas, requests |
| Geocodificação | Nominatim (OpenStreetMap, gratuito) |
| Frontend — Mapas | Leaflet.js |
| Frontend — Gráficos | Chart.js |
| Frontend — Interação | Vanilla JS (sem framework) |
| Estilo | CSS custom, Inter (Google Fonts) |
| Deploy | GitHub Pages via GitHub Actions |

---

## Fontes de Dados

### TSE
- URL: https://dadosabertos.tse.jus.br
- Resultados por seção eleitoral: eleições 2018, 2020, 2022, 2024
- Perfil do eleitorado: por zona eleitoral (sexo, faixa etária, escolaridade, estado civil)
- Formato: CSV compactado por estado/ano
- Código do município Campinas no TSE: **61965**

### IBGE (Fase 2 apenas)
- Malhas geográficas e dados do Censo 2022
- Setores censitários com renda e perfil demográfico

### Geocodificação
- Endereços dos locais de votação fornecidos pelo TSE
- Converter para lat/lng com Nominatim (gratuito, sem chave de API)

---

## Campo Progressista — Configuração

Definido em `data/config.json`:

```json
{
  "campo_progressista": ["PSOL", "PT", "REDE", "PCdoB", "UP", "PSTU"],
  "partido_foco": "PSOL",
  "municipio_foco": "Campinas",
  "codigo_municipio_tse": "61965",
  "anos_disponiveis": [2018, 2020, 2022, 2024]
}
```

---

## Fórmula do Score de Priorização (Módulo 3)

```
score = (eleitores_potenciais * 0.30)
      + (crescimento_campo * 0.30)
      + (taxa_abstencao * 0.20)
      + (pct_jovens_18_34 * 0.20)
```

Todos os componentes normalizados de 0 a 100 antes da aplicação dos pesos.

**Classificação:**
- Score ≥ 75: **Consolidar** — base sólida, manter e aprofundar
- Score 55–74: **Crescer** — potencial real, vale investimento
- Score < 55: **Prospectar** — exploração de longo prazo

---

## Paleta de Cores (CSS)

```css
--psol-roxo-escuro:  #4C1D95;
--psol-roxo:         #7C3AED;
--psol-roxo-medio:   #A78BFA;
--psol-roxo-claro:   #EDE9FE;
--psol-amarelo:      #FACC15;
--psol-amarelo-esc:  #713F12;
--consolidar:        #14532D;
--consolidar-bg:     #DCFCE7;
--crescer:           #1D4ED8;
--crescer-bg:        #DBEAFE;
--prospectar:        #92400E;
--prospectar-bg:     #FEF3C7;
--fundo:             #F8F7FF;
--texto:             #1C1B2E;
--texto-secundario:  #6B7280;
--borda:             #E5E0F5;
```

---

## Disclaimer Obrigatório

> "Os cruzamentos entre resultado eleitoral e perfil demográfico são correlações por território (zona/seção eleitoral), não vínculos individuais. O TSE não divulga para quem cada eleitor votou. Use como orientação estratégica."

Aparece em todos os módulos com dados de perfil.

---

## Escopo da Fase 1

**Dentro:**
- 5 módulos do dashboard (Visão Geral, ZE, Priorização, Perfil, Evolução)
- ETL completo com dados TSE 2018–2024 para Campinas
- Geocodificação das seções via Nominatim
- Deploy no GitHub Pages

**Fora (Fase 2+):**
- Cruzamento com setores censitários IBGE
- Módulo de candidatas de referência
- Autenticação ou área restrita
- Backend, API, banco de dados
- Deploy em servidor pago
- Dados em tempo real
- Expansão para outros municípios

---

## Convenções de Código

- Nomes de arquivos: `snake_case.py`, `kebab-case.css`, `camelCase.js`
- Variáveis JS: camelCase
- Colunas nos CSVs: snake_case
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, `data:`, `docs:`, `style:`, `refactor:`)
- Nenhuma dependência externa paga
