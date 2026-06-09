"""
Processa votos nominais por candidato e zona eleitoral para Campinas.
Fonte: votacao_candidato_munzona (candidatos de todos os cargos).

Saída:
  data/resultados/candidatos_campinas_{ano}.csv   — todos os candidatos, total geral
  data/resultados/votos_nominais_ze_{ano}.csv     — votos por candidato × zona
"""

import json
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).parent.parent
CONFIG = json.loads((ROOT / "data" / "config.json").read_text())

RAW_DIR = ROOT / "data" / "raw" / "campinas"
OUT_DIR = ROOT / "data" / "resultados"
OUT_DIR.mkdir(parents=True, exist_ok=True)

MUNICIPIO_COD = CONFIG["codigo_municipio_tse"]
ANOS = CONFIG["anos_disponiveis"]
ANOS_MUNICIPAL = set(CONFIG.get("anos_municipal", [2020, 2024]))

COL_NR   = "NR_VOTAVEL"
COL_NM   = "NM_VOTAVEL"
COL_ZONA = "NR_ZONA"
COL_VOTOS = "QT_VOTOS_NOMINAIS_VALIDOS"
COL_CARGO = "DS_CARGO"
COL_PART  = "SG_PARTIDO"


def cargo_do_ano(ano: int) -> str:
    return "VEREADOR" if ano in ANOS_MUNICIPAL else "DEPUTADO ESTADUAL"


def processar_ano(ano: int) -> None:
    path = RAW_DIR / f"votacao_candidato_munzona_{ano}.csv"
    if not path.exists():
        print(f"  [{ano}] Arquivo não encontrado. Execute 01_download_tse.py")
        return

    print(f"\n--- {ano} ---")
    df = pd.read_csv(path, dtype=str, low_memory=False)

    # Garante municípíio correto
    col_mun = next((c for c in df.columns if "CD_MUNICIPIO" in c), None)
    if col_mun:
        df = df[df[col_mun].str.strip() == MUNICIPIO_COD].copy()

    if df.empty:
        print(f"  [{ano}] Nenhum dado de Campinas.")
        return

    # Verifica colunas necessárias
    colunas_alt = {
        "NR_VOTAVEL": ["NR_VOTAVEL", "NR_CANDIDATO"],
        "NM_VOTAVEL": ["NM_VOTAVEL", "NM_CANDIDATO"],
        "QT_VOTOS_NOMINAIS_VALIDOS": ["QT_VOTOS_NOMINAIS_VALIDOS", "QT_VOTOS_NOMINAIS", "QT_VOTOS"],
    }
    mapa = {}
    for alvo, alternativas in colunas_alt.items():
        col = next((c for c in alternativas if c in df.columns), None)
        if col:
            mapa[alvo] = col
        else:
            print(f"  [{ano}] Coluna {alvo} não encontrada. Disponíveis: {df.columns.tolist()}")
            return

    df = df.rename(columns={v: k for k, v in mapa.items() if v != k})

    # Filtrar apenas turno 1 e cargo principal do ano
    col_turno = next((c for c in df.columns if "NR_TURNO" in c), None)
    if col_turno:
        df = df[df[col_turno].astype(str) == "1"].copy()

    cargo_alvo = cargo_do_ano(ano)
    if COL_CARGO in df.columns:
        df = df[df[COL_CARGO].str.upper().str.contains(cargo_alvo, na=False)].copy()

    if df.empty:
        print(f"  [{ano}] Nenhuma linha para {cargo_alvo} após filtros.")
        return

    # Converter votos
    df[COL_VOTOS] = pd.to_numeric(df[COL_VOTOS], errors="coerce").fillna(0).astype(int)
    df[COL_ZONA]  = df[COL_ZONA].astype(str).str.strip().str.zfill(4)
    df[COL_NR]    = df[COL_NR].astype(str).str.strip()
    df[COL_NM]    = df[COL_NM].astype(str).str.strip()

    part_col = COL_PART if COL_PART in df.columns else None
    cargo_col = COL_CARGO if COL_CARGO in df.columns else None

    # ── votos_nominais_ze: candidato × zona
    grp_cols = [COL_ZONA, COL_NR, COL_NM]
    if part_col:  grp_cols.append(part_col)
    if cargo_col: grp_cols.append(cargo_col)

    ze = (
        df.groupby(grp_cols, as_index=False)[COL_VOTOS]
        .sum()
        .rename(columns={COL_ZONA: "zona", COL_NR: "nr_candidato",
                         COL_NM: "nm_candidato", COL_PART: "sg_partido",
                         COL_CARGO: "ds_cargo", COL_VOTOS: "votos"})
    )
    ze["ano"] = ano

    out_ze = OUT_DIR / f"votos_nominais_ze_{ano}.csv"
    ze.to_csv(out_ze, index=False, encoding="utf-8")
    print(f"  votos_nominais_ze: {out_ze.name} ({len(ze)} linhas, {ze['nr_candidato'].nunique()} candidatos)")

    # ── candidatos_campinas: resumo geral por candidato
    grp_cand = [COL_NR, COL_NM]
    if part_col:  grp_cand.append(part_col)
    if cargo_col: grp_cand.append(cargo_col)

    resumo = (
        df.groupby(grp_cand, as_index=False)
        .agg(total_votos=(COL_VOTOS, "sum"), zonas_com_voto=(COL_ZONA, "nunique"))
        .rename(columns={COL_NR: "nr_candidato", COL_NM: "nm_candidato",
                         COL_PART: "sg_partido", COL_CARGO: "ds_cargo"})
        .sort_values("total_votos", ascending=False)
    )
    resumo["ano"] = ano

    out_resumo = OUT_DIR / f"candidatos_campinas_{ano}.csv"
    resumo.to_csv(out_resumo, index=False, encoding="utf-8")
    print(f"  candidatos_campinas: {out_resumo.name} ({len(resumo)} candidatos)")

    # Mostra candidatos-referência
    refs = {"50888": "Ediane Maria", "50019": "Thamy do Mandela"}
    for nr, nome in refs.items():
        row = resumo[resumo["nr_candidato"] == nr]
        if not row.empty:
            r = row.iloc[0]
            print(f"  → {nome} ({nr}): {r['total_votos']:,} votos em {int(r['zonas_com_voto'])} zonas")
        else:
            print(f"  → {nome} ({nr}): não encontrado em {ano}")


def main():
    print("=== Processando votos nominais por candidato ===")
    print(f"Município: Campinas ({MUNICIPIO_COD})\n")

    for ano in ANOS:
        processar_ano(ano)

    print("\nConcluído. Próximo: python etl/06_heatmap_secoes.py")


if __name__ == "__main__":
    main()
