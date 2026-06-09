"""
Processa os resultados eleitorais brutos do TSE para Campinas.
Usa leitura em chunks para lidar com os arquivos grandes do TSE-SP.

Saída:
  data/resultados/resultados_ze_{ano}.csv
  data/resultados/resultados_secoes_{ano}.csv
  data/resultados/serie_historica_campo.csv
"""

import json
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).parent.parent
CONFIG = json.loads((ROOT / "data" / "config.json").read_text())

RAW_DIR = ROOT / "data" / "raw" / "votacao_secao"
OUT_DIR = ROOT / "data" / "resultados"
OUT_DIR.mkdir(parents=True, exist_ok=True)

MUNICIPIO_COD = CONFIG["codigo_municipio_tse"]
CAMPO = [p.upper() for p in CONFIG["campo_progressista"]]
ANOS = CONFIG["anos_disponiveis"]

CHUNK_SIZE = 50_000  # linhas por chunk — equilibra velocidade e memória

RENAME = {
    "NR_ZONA": "zona",
    "NR_SECAO": "secao",
    "NM_PARTIDO": "partido",
    "DS_CARGO_PERGUNTA": "cargo",
    "DS_CARGO": "cargo",
    "QT_VOTOS_NOMINAIS": "votos_nominais",
    "QT_VOTOS_BRANCOS": "votos_brancos",
    "QT_VOTOS_NULOS": "votos_nulos",
    "QT_APTOS": "eleitores_aptos",
    "QT_COMPARECIMENTO": "comparecimento",
    "QT_ABSTENCOES": "abstencoes",
}


def detectar_encoding(path: Path) -> str:
    for enc in ["latin-1", "iso-8859-1", "utf-8"]:
        try:
            with open(path, encoding=enc) as f:
                f.read(4096)
            return enc
        except UnicodeDecodeError:
            continue
    return "latin-1"


def detectar_col_municipio(header: list[str]) -> str | None:
    for c in header:
        if "CD_MUNICIPIO" in c or "NR_MUNICIPIO" in c:
            return c
    for c in header:
        if "NM_MUNICIPIO" in c:
            return c
    return None


def ler_campinas_chunks(csv_path: Path) -> pd.DataFrame:
    enc = detectar_encoding(csv_path)
    tamanho_mb = csv_path.stat().st_size / 1_048_576

    # Lê primeira linha para detectar coluna de município
    header_df = pd.read_csv(csv_path, sep=";", encoding=enc, nrows=0, dtype=str)
    col_mun = detectar_col_municipio(list(header_df.columns))

    chunks_campinas = []
    total_linhas = 0

    print(f"  Lendo {csv_path.name} ({tamanho_mb:.0f} MB) em chunks...")

    reader = pd.read_csv(
        csv_path, sep=";", encoding=enc,
        dtype=str, low_memory=False,
        chunksize=CHUNK_SIZE,
    )

    for chunk in reader:
        total_linhas += len(chunk)

        if col_mun:
            if "CD_MUNICIPIO" in col_mun or "NR_MUNICIPIO" in col_mun:
                mask = chunk[col_mun].str.strip() == MUNICIPIO_COD
            else:
                mask = chunk[col_mun].str.upper().str.contains("CAMPINAS", na=False)
            campinas = chunk[mask]
        else:
            campinas = chunk

        if not campinas.empty:
            chunks_campinas.append(campinas)

        # Progresso a cada 500k linhas
        if total_linhas % 500_000 < CHUNK_SIZE:
            print(f"    {total_linhas:,} linhas lidas, {sum(len(c) for c in chunks_campinas):,} de Campinas")

    print(f"  Total: {total_linhas:,} linhas → {sum(len(c) for c in chunks_campinas):,} de Campinas")

    if not chunks_campinas:
        return pd.DataFrame()
    return pd.concat(chunks_campinas, ignore_index=True)


def processar_ano(ano: int) -> None:
    pasta = RAW_DIR / str(ano)
    if not pasta.exists():
        print(f"[{ano}] Pasta não encontrada. Execute 01_download_tse.py")
        return

    csvs = list(pasta.glob("*.csv")) or list(pasta.glob("**/*.csv"))
    if not csvs:
        print(f"[{ano}] Nenhum CSV encontrado.")
        return

    frames = []
    for csv in csvs:
        df = ler_campinas_chunks(csv)
        if not df.empty:
            frames.append(df)

    if not frames:
        print(f"[{ano}] Nenhum dado para Campinas (código {MUNICIPIO_COD}).")
        return

    df = pd.concat(frames, ignore_index=True)

    # Renomear colunas — preserva primeiro match (DS_CARGO tem precedência sobre DS_CARGO_PERGUNTA)
    rename_map = {}
    for orig, dest in RENAME.items():
        if orig in df.columns and dest not in rename_map.values():
            rename_map[orig] = dest
    df = df.rename(columns=rename_map)

    # Converter numéricos
    for col in ["votos_nominais", "votos_brancos", "votos_nulos",
                "eleitores_aptos", "comparecimento", "abstencoes"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).astype(int)

    if "partido" in df.columns:
        df["partido"] = df["partido"].str.strip().str.upper()
        df["campo"] = df["partido"].isin(CAMPO)

    df["ano"] = ano

    # Filtrar deputado estadual
    if "cargo" in df.columns:
        df_dep = df[df["cargo"].str.upper().str.contains("DEPUTADO ESTADUAL", na=False)].copy()
        if df_dep.empty:
            print(f"[{ano}] Aviso: nenhuma linha com cargo 'Deputado Estadual'. Usando todos os cargos.")
            df_dep = df
    else:
        df_dep = df

    if "zona" not in df_dep.columns:
        print(f"[{ano}] Coluna 'zona' não encontrada. Verifique o CSV.")
        return

    # ── Agregar por Zona Eleitoral ──
    def soma_campo(grp):
        if "campo" in df_dep.columns:
            return grp.loc[df_dep.loc[grp.index, "campo"], "votos_nominais"].sum()
        return 0

    agg_ze = (
        df_dep
        .groupby("zona", as_index=False)
        .agg(
            eleitores_aptos=("eleitores_aptos", "first"),
            comparecimento=("comparecimento", "first"),
            abstencoes=("abstencoes", "first"),
            votos_total=("votos_nominais", "sum"),
        )
    )

    # votos do campo por zona
    campo_por_zona = (
        df_dep[df_dep["campo"]]
        .groupby("zona")["votos_nominais"]
        .sum()
        .rename("votos_campo")
        .reset_index()
    ) if "campo" in df_dep.columns else pd.DataFrame(columns=["zona", "votos_campo"])

    agg_ze = agg_ze.merge(campo_por_zona, on="zona", how="left")
    agg_ze["votos_campo"] = agg_ze["votos_campo"].fillna(0).astype(int)

    agg_ze["abstencao_pct"] = (
        agg_ze["abstencoes"] / agg_ze["eleitores_aptos"].replace(0, pd.NA) * 100
    ).round(2)
    agg_ze["campo_pct"] = (
        agg_ze["votos_campo"] / agg_ze["votos_total"].replace(0, pd.NA) * 100
    ).round(2)
    agg_ze["ano"] = ano

    out_ze = OUT_DIR / f"resultados_ze_{ano}.csv"
    agg_ze.to_csv(out_ze, index=False, encoding="utf-8")
    print(f"[{ano}] ZEs: {out_ze.name} ({len(agg_ze)} zonas)")

    # ── Agregar por Seção ──
    if "secao" in df_dep.columns:
        agg_sec = (
            df_dep
            .groupby(["zona", "secao"], as_index=False)
            .agg(
                eleitores_aptos=("eleitores_aptos", "first"),
                votos_total=("votos_nominais", "sum"),
            )
        )

        campo_por_secao = (
            df_dep[df_dep["campo"]]
            .groupby(["zona", "secao"])["votos_nominais"]
            .sum()
            .rename("votos_campo")
            .reset_index()
        ) if "campo" in df_dep.columns else pd.DataFrame(columns=["zona", "secao", "votos_campo"])

        agg_sec = agg_sec.merge(campo_por_secao, on=["zona", "secao"], how="left")
        agg_sec["votos_campo"] = agg_sec["votos_campo"].fillna(0).astype(int)
        agg_sec["campo_pct"] = (
            agg_sec["votos_campo"] / agg_sec["votos_total"].replace(0, pd.NA) * 100
        ).round(2)
        agg_sec["ano"] = ano

        out_sec = OUT_DIR / f"resultados_secoes_{ano}.csv"
        agg_sec.to_csv(out_sec, index=False, encoding="utf-8")
        print(f"[{ano}] Seções: {out_sec.name} ({len(agg_sec)} seções)")


def gerar_serie_historica() -> None:
    frames = []
    for ano in ANOS:
        f = OUT_DIR / f"resultados_ze_{ano}.csv"
        if f.exists():
            frames.append(pd.read_csv(f))

    if not frames:
        print("Nenhum dado de ZE para série histórica.")
        return

    df = pd.concat(frames, ignore_index=True)
    serie = (
        df.groupby("ano", as_index=False)
        .agg(
            votos_campo=("votos_campo", "sum"),
            votos_total=("votos_total", "sum"),
            eleitores_aptos=("eleitores_aptos", "sum"),
            abstencoes=("abstencoes", "sum"),
        )
    )
    serie["campo_pct"] = (serie["votos_campo"] / serie["votos_total"].replace(0, pd.NA) * 100).round(2)
    serie["abstencao_pct"] = (serie["abstencoes"] / serie["eleitores_aptos"].replace(0, pd.NA) * 100).round(2)

    out = OUT_DIR / "serie_historica_campo.csv"
    serie.to_csv(out, index=False, encoding="utf-8")
    print(f"Série histórica: {out.name}")


def main():
    print("=== Processando resultados eleitorais ===\n")
    for ano in ANOS:
        print(f"\n--- {ano} ---")
        processar_ano(ano)

    print("\n=== Série histórica ===")
    gerar_serie_historica()
    print("\nConcluído.")


if __name__ == "__main__":
    main()
