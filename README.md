# Dashboard de Inteligência Eleitoral — Campinas

Dashboard interativo para análise estratégica de dados eleitorais do TSE em Campinas-SP.
Desenvolvido para orientar coordenação de campanha com base em evidências territoriais.

---

## O que é

Ferramenta de inteligência eleitoral que cruza resultados por seção eleitoral, perfil do eleitorado e dados geográficos para responder perguntas práticas de campanha:

- Onde o campo progressista tem mais força?
- Em quais zonas eleitorais vale investir?
- Qual o perfil do eleitor que já vota no campo?
- O campo está crescendo ou perdendo terreno?

Os dados vêm exclusivamente de fontes públicas do TSE e são processados localmente antes de serem publicados.

---

## Módulos

| Módulo | Pergunta que responde |
|--------|----------------------|
| Visão Geral | Como está o campo progressista em Campinas? |
| Análise por ZE | Vale investir nessa zona? O que a caracteriza? |
| Priorização Estratégica | Onde devo focar energia? |
| Perfil do Eleitor | Quem já vota no campo? Com quem devo falar? |
| Evolução Temporal | O campo está crescendo? Onde avançamos ou perdemos? |

---

## Stack técnica

- **ETL:** Python (pandas, geopandas, geopy)
- **Mapas:** Leaflet.js com tiles Carto Dark
- **Gráficos:** Chart.js
- **Frontend:** HTML + CSS + Vanilla JS (sem framework)
- **Hospedagem:** GitHub Pages (custo zero)
- **Geocodificação:** Nominatim / OpenStreetMap (sem API key)

---

## Fontes de dados

- **TSE — Tribunal Superior Eleitoral:** resultados por seção eleitoral (2018, 2020, 2022, 2024) e perfil do eleitorado por zona
  - URL: https://dadosabertos.tse.jus.br
- **OpenStreetMap / Nominatim:** geocodificação dos locais de votação

---

## Como rodar o ETL localmente

### Pré-requisitos

- Python 3.11+
- Git

### Instalação

```bash
git clone https://github.com/bigodsk/dashboard-eleitoral.git
cd dashboard-eleitoral

python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/Mac:
source .venv/bin/activate

pip install -r etl/requirements.txt
```

### Executar o pipeline

```bash
# 1. Baixa dados brutos do TSE (~500MB, pode demorar)
python etl/01_download_tse.py

# 2. Processa resultados e filtra Campinas
python etl/02_processar_resultados.py

# 3. Geocodifica locais de votacao (lento: ~1 req/s no Nominatim)
python etl/03_geocodificar_secoes.py

# 4. Cruza perfil do eleitorado por zona
python etl/04_cruzar_perfil_ze.py

# 5. Calcula scores de priorizacao
python etl/05_calcular_scores.py
```

Os dados processados ficam em `data/` e sao os unicos arquivos commitados (os brutos ficam em `data/raw/`, ignorados pelo git).

### Visualizar localmente

Qualquer servidor HTTP estatico funciona:

```bash
python -m http.server 8000
# Abrir: http://localhost:8000
```

---

## Atualizar os dados

Para atualizar com dados de uma nova eleicao:

1. Adicione o novo ano em `data/config.json` -> `anos_disponiveis`
2. Execute o pipeline ETL do inicio
3. Commit dos novos CSVs em `data/`
4. Push para o repositorio — o GitHub Actions faz o deploy automaticamente

---

## Aviso sobre os dados

Os cruzamentos entre resultado eleitoral e perfil demografico sao correlacoes por territorio (zona/secao eleitoral), nao vinculos individuais. O TSE nao divulga para quem cada eleitor votou. Use como orientacao estrategica, nao como dado individual.
