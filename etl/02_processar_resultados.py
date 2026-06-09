"""
Processa os resultados eleitorais do TSE para Campinas.
Fonte: votacao_partido_munzona (votos agregados por partido e zona).

Saída:
  data/resultados/resultados_ze_{ano}.csv
  data/resultados/resultados_secoes_{ano}.csv  (se disponível)
  data/resultados/serie_historica_campo.csv
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
CAMPO = [p.upper() for p in CONFIG["campo_progressista"]]
ANOS = CONFIG["anos_disponiveis"]
ANOS_MUNICIPAL = set(CONFIG.get("anos_municipal", [2020, 2024]))

# Mapeamento: eleições municipais → VEREADOR; estaduais → DEPUTADO ESTADUAL
def cargo_do_ano(ano: int) -> str:
    return "VEREADOR" if ano in ANOS_MUNICIPAL else "DEPUTADO ESTADUAL"

COL_VOTOS_NOM = "QT_VOTOS_NOMINAIS_VALIDOS"
COL_PARTIDO = "SG_PARTIDO"
COL_ZONA = "NR_ZONA"
COL_CARGO = "DS_CARGO"


def carregar_partido_munzona(ano: int) -> pd.DataFrame | None:
    path = RAW_DIR / f"votacao_partido_munzona_{ano}.csv"
    if not path.exists():
        print(f"  [{ano}] votacao_partido_munzona não encontrado. Execute 01_download_tse.py")
        return None

    df = pd.read_csv(path, dtype=str, low_memory=False)

    # Garantir código de município correto
    col_mun = next((c for c in df.columns if "CD_MUNICIPIO" in c), None)
    if col_mun:
        df = df[df[col_mun].str.strip() == MUNICIPIO_COD].copy()
    else:
        col_nm = next((c for c in df.columns if "NM_MUNICIPIO" in c), None)
        if col_nm:
            df = df[df[col_nm].str.upper().str.contains("CAMPINAS", na=False)].copy()

    if df.empty:
        print(f"  [{ano}] Nenhum dado de Campinas no arquivo. Verifique o código {MUNICIPIO_COD}.")
        return None

    # Filtrar cargo correto para o ano (turno 1)
    cargo_alvo = cargo_do_ano(ano)
    if COL_CARGO in df.columns:
        df = df[df[COL_CARGO].str.upper().str.contains(cargo_alvo, na=False)].copy()

    col_turno = next((c for c in df.columns if "NR_TURNO" in c), None)
    if col_turno:
        df = df[df[col_turno].astype(str) == "1"].copy()

    if df.empty:
        print(f"  [{ano}] Nenhuma linha para {cargo_alvo}.")
        return None

    # Converter votos para numérico
    if COL_VOTOS_NOM in df.columns:
        df[COL_VOTOS_NOM] = pd.to_numeric(df[COL_VOTOS_NOM], errors="coerce").fillna(0).astype(int)
    else:
        print(f"  [{ano}] Coluna {COL_VOTOS_NOM} não encontrada. Colunas disponíveis: {df.columns.tolist()}")
        return None

    if COL_PARTIDO in df.columns:
        df[COL_PARTIDO] = df[COL_PARTIDO].str.strip().str.upper()
        df["campo"] = df[COL_PARTIDO].isin(CAMPO)
    else:
        print(f"  [{ano}] Coluna {COL_PARTIDO} não encontrada.")
        return None

    if COL_ZONA not in df.columns:
        print(f"  [{ano}] Coluna {COL_ZONA} não encontrada.")
        return None

    df[COL_ZONA] = df[COL_ZONA].str.strip().str.zfill(4)
    return df


def processar_ano(ano: int) -> None:
    print(f"\n--- {ano} ---")
    df = carregar_partido_munzona(ano)
    if df is None:
        return

    print(f"  {len(df)} linhas (partido × zona) para Campinas")

    # ── Votos do campo por zona
    campo_por_zona = (
        df[df["campo"]]
        .groupby(COL_ZONA)[COL_VOTOS_NOM]
        .sum()
        .rename("votos_campo")
    )

    # ── Total de votos por zona
    total_por_zona = (
        df.groupby(COL_ZONA)[COL_VOTOS_NOM]
        .sum()
        .rename("votos_total")
    )

    agg_ze = pd.concat([campo_por_zona, total_por_zona], axis=1).reset_index()
    agg_ze.columns = ["zona", "votos_campo", "votos_total"]
    agg_ze["campo_pct"] = (
        agg_ze["votos_campo"] / agg_ze["votos_total"].replace(0, pd.NA) * 100
    ).round(2)
    agg_ze["ano"] = ano

    # Tentar adicionar eleitores_aptos a partir de perfil_eleitorado
    perfil_path = RAW_DIR / f"perfil_eleitorado_{ano}.csv"
    if perfil_path.exists():
        try:
            df_perfil = pd.read_csv(perfil_path, dtype=str, low_memory=False)
            col_mun_p = next((c for c in df_perfil.columns if "CD_MUNICIPIO" in c), None)
            if col_mun_p:
                df_perfil = df_perfil[df_perfil[col_mun_p].str.strip() == MUNICIPIO_COD]
            col_zona_p = next((c for c in df_perfil.columns if "NR_ZONA" in c or "CD_ZONA" in c), None)
            col_qt_p = next((c for c in df_perfil.columns if "QT_ELEITORES" in c), None)
            if col_zona_p and col_qt_p:
                df_perfil[col_qt_p] = pd.to_numeric(df_perfil[col_qt_p], errors="coerce").fillna(0)
                eleit_zona = df_perfil.groupby(col_zona_p)[col_qt_p].sum().rename("eleitores_aptos")
                eleit_zona.index = eleit_zona.index.str.strip().str.zfill(4)
                agg_ze = agg_ze.join(eleit_zona, on="zona")
        except Exception as e:
            print(f"  Aviso: não foi possível cruzar com perfil — {e}")

    if "eleitores_aptos" not in agg_ze.columns:
        agg_ze["eleitores_aptos"] = pd.NA
    if "abstencao_pct" not in agg_ze.columns:
        agg_ze["abstencao_pct"] = pd.NA

    out = OUT_DIR / f"resultados_ze_{ano}.csv"
    agg_ze.to_csv(out, index=False, encoding="utf-8")
    print(f"  ZEs salvas: {out.name} ({len(agg_ze)} zonas)")
    print(f"  Campo total: {agg_ze['votos_campo'].sum():,} votos / {agg_ze['votos_total'].sum():,} total")

    # Detalhamento por partido (para gráfico empilhado no Módulo 5)
    part_zona = (
        df.groupby([COL_ZONA, COL_PARTIDO])[COL_VOTOS_NOM]
        .sum()
        .reset_index()
    )
    part_zona.columns = ["zona", "partido", "votos"]
    part_zona["ano"] = ano
    out_part = OUT_DIR / f"votos_partido_ze_{ano}.csv"
    part_zona.to_csv(out_part, index=False, encoding="utf-8")
    print(f"  Partidos por ZE: {out_part.name}")


def gerar_serie_historica() -> None:
    frames = []
    for ano in ANOS:
        f = OUT_DIR / f"resultados_ze_{ano}.csv"
        if f.exists():
            frames.append(pd.read_csv(f))

    if not frames:
        return

    df = pd.concat(frames, ignore_index=True)
    serie = (
        df.groupby("ano", as_index=False)
        .agg(votos_campo=("votos_campo", "sum"), votos_total=("votos_total", "sum"))
    )
    serie["campo_pct"] = (serie["votos_campo"] / serie["votos_total"].replace(0, pd.NA) * 100).round(2)

    out = OUT_DIR / "serie_historica_campo.csv"
    serie.to_csv(out, index=False, encoding="utf-8")
    print(f"\n  Série histórica: {out.name}")


def main():
    print("=== Processando resultados eleitorais ===")
    print(f"Fonte: votacao_partido_munzona | Campinas ({MUNICIPIO_COD})\n")

    for ano in ANOS:
        processar_ano(ano)

    print("\n=== Série histórica ===")
    gerar_serie_historica()
    print("\nConcluído. Próximo: python etl/03_geocodificar_secoes.py")


if __name__ == "__main__":
    main()
