"""
Calcula scores de priorização estratégica por zona eleitoral.
Combina desempenho eleitoral, crescimento, abstenção e perfil jovem.

Fórmula (pesos configuráveis em data/config.json):
  score = (eleitores_potenciais * 0.30)
        + (crescimento_campo    * 0.30)
        + (taxa_abstencao       * 0.20)
        + (pct_jovens_18_34     * 0.20)

Saída:
  data/resultados/scores_ze.csv
  data/geo/zonas_scores.geojson
"""

import json
import numpy as np
import pandas as pd
import geopandas as gpd
from pathlib import Path

ROOT = Path(__file__).parent.parent
CONFIG = json.loads((ROOT / "data" / "config.json").read_text())

RES_DIR = ROOT / "data" / "resultados"
PERFIL_DIR = ROOT / "data" / "perfil"
GEO_DIR = ROOT / "data" / "geo"
GEO_DIR.mkdir(parents=True, exist_ok=True)

PESOS = CONFIG["score_pesos"]
THRESH = CONFIG["classificacao_thresholds"]
ANOS = CONFIG["anos_disponiveis"]


def normalizar_0_100(series: pd.Series) -> pd.Series:
    mn, mx = series.min(), series.max()
    if mx == mn:
        return pd.Series([50.0] * len(series), index=series.index)
    return ((series - mn) / (mx - mn) * 100).round(2)


def calcular_crescimento(df_hist: pd.DataFrame) -> pd.Series:
    anos_disp = sorted(df_hist["ano"].unique())
    if len(anos_disp) < 2:
        return pd.Series(dtype=float)

    ano_ini, ano_fim = anos_disp[0], anos_disp[-1]
    df_ini = df_hist[df_hist["ano"] == ano_ini].set_index("zona")["campo_pct"]
    df_fim = df_hist[df_hist["ano"] == ano_fim].set_index("zona")["campo_pct"]

    crescimento = (df_fim - df_ini).fillna(0)
    return crescimento


def carregar_historico() -> pd.DataFrame:
    frames = []
    for ano in ANOS:
        f = RES_DIR / f"resultados_ze_{ano}.csv"
        if f.exists():
            df = pd.read_csv(f)
            df["ano"] = ano
            frames.append(df)
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


def classificar(score: float) -> str:
    if score >= THRESH["consolidar"]:
        return "Consolidar"
    elif score >= THRESH["crescer"]:
        return "Crescer"
    return "Prospectar"


def classificar_texto(row: pd.Series) -> str:
    cls = row["classificacao"]
    if cls == "Consolidar":
        return f"Base sólida com {row['campo_pct_ultimo']:.1f}% do campo. Manter e aprofundar."
    elif cls == "Crescer":
        return f"Potencial real de crescimento. Campo avançou {row['crescimento']:.1f}pp desde 2018."
    else:
        return f"Zona com menor penetração do campo ({row['campo_pct_ultimo']:.1f}%). Exploração de longo prazo."


def main():
    print("=== Calculando scores de priorização ===\n")

    df_hist = carregar_historico()
    if df_hist.empty:
        print("Sem dados históricos. Execute 02_processar_resultados.py")
        return

    # Usar dados mais recentes para cada ZE
    ano_max = df_hist["ano"].max()
    df_atual = df_hist[df_hist["ano"] == ano_max].copy()
    df_atual["zona"] = df_atual["zona"].astype(str).str.zfill(4)

    # Crescimento histórico
    df_hist["zona"] = df_hist["zona"].astype(str).str.zfill(4)
    crescimento = calcular_crescimento(df_hist)

    df_atual = df_atual.set_index("zona")
    df_atual["crescimento"] = crescimento.reindex(df_atual.index).fillna(0)
    df_atual["campo_pct_ultimo"] = df_atual["campo_pct"]

    # Perfil do eleitorado
    perfil_path = PERFIL_DIR / "perfil_ze.csv"
    if perfil_path.exists():
        df_perfil = pd.read_csv(perfil_path)
        df_perfil["zona"] = df_perfil["zona"].astype(str).str.zfill(4)
        df_perfil = df_perfil.set_index("zona")

        # Eleitores do perfil (se não vieram dos resultados)
        if "eleitores_aptos" not in df_atual.columns or df_atual["eleitores_aptos"].isna().all():
            if "total_eleitores" in df_perfil.columns:
                df_atual["eleitores_aptos"] = df_perfil["total_eleitores"].reindex(df_atual.index)

        col_jovens = next((c for c in df_perfil.columns if "jovens" in c or "16_34" in c), None)
        if col_jovens:
            media_jovens = df_perfil[col_jovens].mean()
            df_atual["pct_jovens"] = df_perfil[col_jovens].reindex(df_atual.index).fillna(media_jovens)
        else:
            df_atual["pct_jovens"] = 20.0
    else:
        print("Perfil não encontrado, usando valor padrão para jovens.")
        df_atual["pct_jovens"] = 20.0

    # Componentes normalizados — NaN vira 50 (neutro) para não contaminar o score
    df_atual["n_eleitores"] = normalizar_0_100(pd.to_numeric(df_atual.get("eleitores_aptos", 0), errors="coerce").fillna(0))
    df_atual["n_crescimento"] = normalizar_0_100(df_atual["crescimento"].fillna(0))
    abst = pd.to_numeric(df_atual.get("abstencao_pct"), errors="coerce") if "abstencao_pct" in df_atual.columns else pd.Series(dtype=float)
    df_atual["n_abstencao"] = normalizar_0_100(abst.fillna(abst.mean())) if not abst.isna().all() else pd.Series(50.0, index=df_atual.index)
    df_atual["n_jovens"] = normalizar_0_100(df_atual["pct_jovens"].fillna(20.0))

    # Score final
    df_atual["score"] = (
        df_atual["n_eleitores"]  * PESOS["eleitores_potenciais"] +
        df_atual["n_crescimento"] * PESOS["crescimento_campo"] +
        df_atual["n_abstencao"]  * PESOS["taxa_abstencao"] +
        df_atual["n_jovens"]     * PESOS["pct_jovens_18_34"]
    ).round(1)

    df_atual["classificacao"] = df_atual["score"].apply(classificar)
    df_atual["justificativa"] = df_atual.apply(classificar_texto, axis=1)
    df_atual = df_atual.reset_index()

    df_final = df_atual[[
        "zona", "eleitores_aptos", "campo_pct_ultimo", "crescimento",
        "abstencao_pct", "pct_jovens", "score", "classificacao", "justificativa"
    ]].sort_values("score", ascending=False)

    out = RES_DIR / "scores_ze.csv"
    df_final.to_csv(out, index=False, encoding="utf-8")
    print(f"Scores salvos: {out.name} ({len(df_final)} zonas)")

    for cls in ["Consolidar", "Crescer", "Prospectar"]:
        n = (df_final["classificacao"] == cls).sum()
        print(f"  {cls}: {n} zonas")

    # GeoJSON com scores (se tivermos geometria das ZEs)
    # Por enquanto gera CSV anotado; GeoJSON completo quando tivermos shapefile das ZEs
    print("\nScores calculados com sucesso.")


if __name__ == "__main__":
    main()
