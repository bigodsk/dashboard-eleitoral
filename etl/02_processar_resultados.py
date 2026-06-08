"""
Processa os resultados eleitorais brutos do TSE para Campinas.
Filtra por município, agrega por zona eleitoral e seção,
calcula métricas do campo progressista.

Saída:
  data/resultados/resultados_ze_{ano}.csv
  data/resultados/resultados_secoes_{ano}.csv
  data/resultados/serie_historica_campo.csv
"""

import json
import pandas as pd
from pathlib import Path
from tqdm import tqdm

ROOT = Path(__file__).parent.parent
CONFIG = json.loads((ROOT / "data" / "config.json").read_text())

RAW_DIR = ROOT / "data" / "raw" / "votacao_secao"
OUT_DIR = ROOT / "data" / "resultados"
OUT_DIR.mkdir(parents=True, exist_ok=True)

MUNICIPIO_COD = CONFIG["codigo_municipio_tse"]
CAMPO = CONFIG["campo_progressista"]
ANOS = CONFIG["anos_disponiveis"]

CARGO_DEP_ESTADUAL = "Deputado Estadual"
CARGO_DEP_FEDERAL = "Deputado Federal"
CARGO_VEREADOR = "Vereador"

COLUNAS_RESULTADO = {
    "NR_ZONA": "zona",
    "NR_SECAO": "secao",
    "NM_PARTIDO": "partido",
    "DS_CARGO": "cargo",
    "QT_VOTOS_NOMINAIS": "votos_nominais",
    "QT_VOTOS_BRANCOS": "votos_brancos",
    "QT_VOTOS_NULOS": "votos_nulos",
    "QT_APTOS": "eleitores_aptos",
    "QT_COMPARECIMENTO": "comparecimento",
    "QT_ABSTENCOES": "abstencoes",
}


def carregar_csv_tse(path: Path) -> pd.DataFrame:
    encodings = ["latin-1", "iso-8859-1", "utf-8"]
    for enc in encodings:
        try:
            df = pd.read_csv(path, sep=";", encoding=enc, dtype=str, low_memory=False)
            return df
        except Exception:
            continue
    raise ValueError(f"Não foi possível ler: {path}")


def filtrar_municipio(df: pd.DataFrame, cod: str) -> pd.DataFrame:
    col = next((c for c in df.columns if "CD_MUNICIPIO" in c or "NR_MUNICIPIO" in c), None)
    if col:
        return df[df[col].str.strip() == str(cod)].copy()
    nm_col = next((c for c in df.columns if "NM_MUNICIPIO" in c), None)
    if nm_col:
        return df[df[nm_col].str.upper().str.contains("CAMPINAS")].copy()
    return df


def processar_ano(ano: int) -> None:
    pasta = RAW_DIR / str(ano)
    if not pasta.exists():
        print(f"[{ano}] Dados brutos não encontrados em {pasta}. Execute 01_download_tse.py")
        return

    csvs = list(pasta.glob("*.csv"))
    if not csvs:
        csvs = list(pasta.glob("**/*.csv"))

    if not csvs:
        print(f"[{ano}] Nenhum CSV encontrado.")
        return

    frames = []
    for csv in tqdm(csvs, desc=f"[{ano}] Carregando CSVs"):
        df = carregar_csv_tse(csv)
        df = filtrar_municipio(df, MUNICIPIO_COD)
        if not df.empty:
            frames.append(df)

    if not frames:
        print(f"[{ano}] Nenhum dado para Campinas ({MUNICIPIO_COD}).")
        return

    df = pd.concat(frames, ignore_index=True)

    colunas_presentes = {k: v for k, v in COLUNAS_RESULTADO.items() if k in df.columns}
    df = df.rename(columns=colunas_presentes)

    cols_num = ["votos_nominais", "votos_brancos", "votos_nulos",
                "eleitores_aptos", "comparecimento", "abstencoes"]
    for c in cols_num:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0).astype(int)

    if "partido" in df.columns:
        df["partido"] = df["partido"].str.strip().str.upper()
        df["campo"] = df["partido"].isin([p.upper() for p in CAMPO])

    df["ano"] = ano

    if "cargo" in df.columns:
        df_dep = df[df["cargo"].str.upper().str.contains("DEPUTADO ESTADUAL", na=False)]
    else:
        df_dep = df

    # Agregação por zona eleitoral
    if "zona" in df_dep.columns:
        agg_ze = df_dep.groupby("zona").agg(
            eleitores_aptos=("eleitores_aptos", "first"),
            comparecimento=("comparecimento", "first"),
            abstencoes=("abstencoes", "first"),
            votos_campo=("votos_nominais", lambda x: x[df_dep.loc[x.index, "campo"]].sum() if "campo" in df_dep.columns else 0),
            votos_total=("votos_nominais", "sum"),
        ).reset_index()

        agg_ze["abstencao_pct"] = (
            agg_ze["abstencoes"] / agg_ze["eleitores_aptos"].replace(0, pd.NA) * 100
        ).round(2)
        agg_ze["campo_pct"] = (
            agg_ze["votos_campo"] / agg_ze["votos_total"].replace(0, pd.NA) * 100
        ).round(2)
        agg_ze["ano"] = ano

        out = OUT_DIR / f"resultados_ze_{ano}.csv"
        agg_ze.to_csv(out, index=False, encoding="utf-8")
        print(f"[{ano}] ZEs salvas: {out.name} ({len(agg_ze)} zonas)")

        # Agregação por seção
        if "secao" in df_dep.columns:
            agg_sec = df_dep.groupby(["zona", "secao"]).agg(
                eleitores_aptos=("eleitores_aptos", "first"),
                votos_campo=("votos_nominais", lambda x: x[df_dep.loc[x.index, "campo"]].sum() if "campo" in df_dep.columns else 0),
                votos_total=("votos_nominais", "sum"),
            ).reset_index()
            agg_sec["campo_pct"] = (
                agg_sec["votos_campo"] / agg_sec["votos_total"].replace(0, pd.NA) * 100
            ).round(2)
            agg_sec["ano"] = ano

            out_sec = OUT_DIR / f"resultados_secoes_{ano}.csv"
            agg_sec.to_csv(out_sec, index=False, encoding="utf-8")
            print(f"[{ano}] Seções salvas: {out_sec.name} ({len(agg_sec)} seções)")


def gerar_serie_historica() -> None:
    frames = []
    for ano in ANOS:
        f = OUT_DIR / f"resultados_ze_{ano}.csv"
        if f.exists():
            df = pd.read_csv(f)
            frames.append(df)

    if not frames:
        print("Nenhum dado de ZE encontrado para gerar série histórica.")
        return

    df_hist = pd.concat(frames, ignore_index=True)

    serie = df_hist.groupby("ano").agg(
        votos_campo=("votos_campo", "sum"),
        votos_total=("votos_total", "sum"),
        eleitores_aptos=("eleitores_aptos", "sum"),
        abstencoes=("abstencoes", "sum"),
    ).reset_index()
    serie["campo_pct"] = (serie["votos_campo"] / serie["votos_total"].replace(0, pd.NA) * 100).round(2)
    serie["abstencao_pct"] = (serie["abstencoes"] / serie["eleitores_aptos"].replace(0, pd.NA) * 100).round(2)

    out = OUT_DIR / "serie_historica_campo.csv"
    serie.to_csv(out, index=False, encoding="utf-8")
    print(f"Série histórica salva: {out.name}")


def main():
    print("=== Processando resultados eleitorais ===\n")
    for ano in ANOS:
        processar_ano(ano)

    print("\n=== Gerando série histórica ===")
    gerar_serie_historica()
    print("\nProcessamento concluído.")


if __name__ == "__main__":
    main()
