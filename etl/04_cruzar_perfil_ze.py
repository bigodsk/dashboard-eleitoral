"""
Cruza dados de perfil do eleitorado (TSE) com as zonas eleitorais de Campinas.
Agrega por zona: distribuição de sexo, faixa etária, escolaridade.

Saída:
  data/perfil/perfil_ze.csv
  data/perfil/perfil_campinas_geral.csv
"""

import json
import pandas as pd
from pathlib import Path
from tqdm import tqdm

ROOT = Path(__file__).parent.parent
CONFIG = json.loads((ROOT / "data" / "config.json").read_text())

RAW_PERFIL = ROOT / "data" / "raw" / "perfil_eleitorado"
OUT_DIR = ROOT / "data" / "perfil"
OUT_DIR.mkdir(parents=True, exist_ok=True)

MUNICIPIO_COD = CONFIG["codigo_municipio_tse"]
ANO_PERFIL = 2024  # Usar o mais recente disponível


def carregar_csv_tse(path: Path) -> pd.DataFrame:
    for enc in ["latin-1", "iso-8859-1", "utf-8"]:
        try:
            return pd.read_csv(path, sep=";", encoding=enc, dtype=str, low_memory=False)
        except Exception:
            continue
    raise ValueError(f"Não leu: {path}")


def filtrar_municipio(df: pd.DataFrame) -> pd.DataFrame:
    col = next((c for c in df.columns if "CD_MUNICIPIO" in c or "SG_MUNICIPIO" in c), None)
    if col and col.startswith("CD"):
        return df[df[col].str.strip() == MUNICIPIO_COD].copy()
    nm = next((c for c in df.columns if "NM_MUNICIPIO" in c), None)
    if nm:
        return df[df[nm].str.upper().str.contains("CAMPINAS", na=False)].copy()
    return df


def processar_perfil(ano: int) -> pd.DataFrame | None:
    pasta = RAW_PERFIL / str(ano)
    if not pasta.exists():
        print(f"[{ano}] Dados de perfil não encontrados.")
        return None

    csvs = list(pasta.glob("*.csv")) or list(pasta.glob("**/*.csv"))

    frames = []
    for csv in tqdm(csvs, desc=f"[{ano}] Perfil"):
        df = carregar_csv_tse(csv)
        df = filtrar_municipio(df)
        if not df.empty:
            frames.append(df)

    if not frames:
        print(f"[{ano}] Sem dados de perfil para Campinas.")
        return None

    return pd.concat(frames, ignore_index=True)


def agregar_por_zona(df: pd.DataFrame) -> pd.DataFrame:
    col_zona = next((c for c in df.columns if "NR_ZONA" in c or "CD_ZONA" in c), None)
    col_sexo = next((c for c in df.columns if "DS_GENERO" in c or "DS_SEXO" in c), None)
    col_idade = next((c for c in df.columns if "DS_FAIXA_ETARIA" in c), None)
    col_escolaridade = next((c for c in df.columns if "DS_GRAU_ESCOLARIDADE" in c), None)
    col_qt = next((c for c in df.columns if "QT_ELEITORES" in c), None)

    if not col_zona or not col_qt:
        print("Colunas necessárias não encontradas.")
        return pd.DataFrame()

    df[col_qt] = pd.to_numeric(df[col_qt], errors="coerce").fillna(0).astype(int)

    registros = []

    for zona, grupo in df.groupby(col_zona):
        total = grupo[col_qt].sum()

        rec = {"zona": str(zona).zfill(4), "total_eleitores": total}

        if col_sexo:
            for sexo, g in grupo.groupby(col_sexo):
                chave = "pct_" + sexo.lower().replace(" ", "_").replace("ã", "a").replace("ç", "c")
                rec[chave] = round(g[col_qt].sum() / total * 100, 1) if total else 0

        if col_idade:
            jovens_faixas = ["16 a 17", "18 a 20", "21 a 24", "25 a 29", "30 a 34"]
            jovens = grupo[grupo[col_idade].str.contains("|".join(jovens_faixas), na=False)][col_qt].sum()
            rec["pct_jovens_16_34"] = round(jovens / total * 100, 1) if total else 0

            for faixa, g in grupo.groupby(col_idade):
                chave = "pct_" + faixa.lower().replace(" ", "_").replace("a", "a").replace("anos", "a")
                rec[f"faixa_{chave}"] = round(g[col_qt].sum() / total * 100, 1) if total else 0

        if col_escolaridade:
            for esc, g in grupo.groupby(col_escolaridade):
                chave = esc.lower().replace(" ", "_")[:30]
                rec[f"esc_{chave}"] = round(g[col_qt].sum() / total * 100, 1) if total else 0

        registros.append(rec)

    return pd.DataFrame(registros)


def main():
    print("=== Cruzando perfil do eleitorado por ZE ===\n")

    df = processar_perfil(ANO_PERFIL)
    if df is None:
        print("Nenhum dado disponível.")
        return

    df_ze = agregar_por_zona(df)
    if df_ze.empty:
        print("Agregação por ZE falhou.")
        return

    out = OUT_DIR / "perfil_ze.csv"
    df_ze.to_csv(out, index=False, encoding="utf-8")
    print(f"Perfil por ZE salvo: {out.name} ({len(df_ze)} zonas)")

    # Perfil geral de Campinas (agregado)
    col_qt = next((c for c in df.columns if "QT_ELEITORES" in c), None)
    if col_qt:
        df[col_qt] = pd.to_numeric(df[col_qt], errors="coerce").fillna(0)
        total_geral = df[col_qt].sum()

        resumo = {"municipio": "Campinas", "total_eleitores": int(total_geral), "ano": ANO_PERFIL}

        col_sexo = next((c for c in df.columns if "DS_GENERO" in c or "DS_SEXO" in c), None)
        if col_sexo:
            for sexo, g in df.groupby(col_sexo):
                chave = "pct_" + sexo.lower().replace(" ", "_")[:20]
                resumo[chave] = round(g[col_qt].sum() / total_geral * 100, 1) if total_geral else 0

        col_idade = next((c for c in df.columns if "DS_FAIXA_ETARIA" in c), None)
        if col_idade:
            jovens_faixas = ["16 a 17", "18 a 20", "21 a 24", "25 a 29", "30 a 34"]
            jovens = df[df[col_idade].str.contains("|".join(jovens_faixas), na=False)][col_qt].sum()
            resumo["pct_jovens_16_34"] = round(jovens / total_geral * 100, 1) if total_geral else 0

        out_geral = OUT_DIR / "perfil_campinas_geral.csv"
        pd.DataFrame([resumo]).to_csv(out_geral, index=False, encoding="utf-8")
        print(f"Perfil geral salvo: {out_geral.name}")

    print("\nCruzamento concluído.")


if __name__ == "__main__":
    main()
