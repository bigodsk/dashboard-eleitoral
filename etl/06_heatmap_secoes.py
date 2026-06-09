"""
Gera dados de mapa de calor por local de votação (urna).

Cruza votacao_secao (votos por seção × candidato) com as coordenadas
geocodificadas de secoes_geo.geojson para produzir pontos GeoJSON com
intensidade de voto por candidato.

Saída:
  data/geo/locais_votos_{ano}.geojson  — um ponto por local de votação, com
      total_votos, votos_campo, votos_50888, votos_50019 como propriedades
  data/resultados/candidatos_local_{ano}.csv  — todos os candidatos com
      >MIN_VOTOS votos num local qualquer (para filtro dinâmico no frontend)
"""

import json
import pandas as pd
import numpy as np
from pathlib import Path

ROOT = Path(__file__).parent.parent
CONFIG = json.loads((ROOT / "data" / "config.json").read_text())

RAW_DIR  = ROOT / "data" / "raw" / "campinas"
GEO_DIR  = ROOT / "data" / "geo"
OUT_DIR  = ROOT / "data" / "resultados"
GEO_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

ANOS           = CONFIG["anos_disponiveis"]
ANOS_MUNICIPAL = set(CONFIG.get("anos_municipal", [2020, 2024]))
CAMPO          = [p.upper() for p in CONFIG["campo_progressista"]]
MUNICIPIO_COD  = CONFIG["codigo_municipio_tse"]
# Candidatos de referência por ano: {"ano_str": {"nr_candidato": "chave_geojson"}}
CANDS_REF_POR_ANO = {
    int(k): {nr: f"votos_{apelido}" for nr, apelido in v.items()}
    for k, v in CONFIG.get("candidatos_referencia", {}).items()
}

MIN_VOTOS = 30   # mínimo de votos num local para incluir no CSV dinâmico


def cargo_do_ano(ano: int) -> str:
    return "VEREADOR" if ano in ANOS_MUNICIPAL else "DEPUTADO ESTADUAL"


def carregar_coordenadas() -> pd.DataFrame:
    """Retorna DataFrame com nr_zona, nr_secao, nr_local, lat, lng."""
    gj_path = GEO_DIR / "secoes_geo.geojson"
    if not gj_path.exists():
        raise FileNotFoundError("secoes_geo.geojson não encontrado. Execute 03_geocodificar_secoes.py")

    with open(gj_path) as f:
        gj = json.load(f)

    rows = []
    for feat in gj["features"]:
        p = feat["properties"]
        lng_lat = feat["geometry"]["coordinates"]
        rows.append({
            "nr_zona":  str(p.get("NR_ZONA", "")).zfill(4),
            "nr_secao": str(p.get("NR_SECAO", "")).zfill(4),
            "nr_local": str(p.get("NR_LOCAL_VOTACAO", "")),
            "lat": p.get("lat") or lng_lat[1],
            "lng": p.get("lng") or lng_lat[0],
        })

    return pd.DataFrame(rows)


def processar_ano(ano: int, coords: pd.DataFrame) -> None:
    path = RAW_DIR / f"votacao_secao_{ano}.csv"
    if not path.exists():
        print(f"  [{ano}] votacao_secao não encontrado.")
        return

    print(f"\n--- {ano} (cargo: {cargo_do_ano(ano)}) ---")

    # Carrega só as colunas necessárias
    cols_necessarias = ["NR_ZONA", "NR_SECAO", "NR_LOCAL_VOTACAO",
                        "NR_VOTAVEL", "NM_VOTAVEL", "QT_VOTOS"]
    df = pd.read_csv(path, dtype=str, low_memory=False,
                     usecols=lambda c: c in cols_necessarias)

    df["NR_ZONA"]  = df["NR_ZONA"].astype(str).str.zfill(4)
    df["NR_SECAO"] = df["NR_SECAO"].astype(str).str.zfill(4)
    df["NR_VOTAVEL"] = df["NR_VOTAVEL"].astype(str).str.strip()
    df["QT_VOTOS"] = pd.to_numeric(df["QT_VOTOS"], errors="coerce").fillna(0).astype(int)

    # ── Detectar partido por NR_VOTAVEL a partir de votacao_candidato_munzona
    partido_map = {}
    cand_path = RAW_DIR / f"votacao_candidato_munzona_{ano}.csv"
    if cand_path.exists():
        dc = pd.read_csv(cand_path, dtype=str, low_memory=False,
                         usecols=lambda c: any(x in c for x in ["NR_VOTAVEL", "NR_CANDIDATO", "SG_PARTIDO", "DS_CARGO"]))
        col_nr = next((c for c in dc.columns if "NR_VOTAVEL" in c or "NR_CANDIDATO" in c), None)
        col_pt = next((c for c in dc.columns if "SG_PARTIDO" in c), None)
        if col_nr and col_pt:
            partido_map = dict(zip(dc[col_nr].astype(str).str.strip(),
                                   dc[col_pt].astype(str).str.strip().str.upper()))

    df["sg_partido"] = df["NR_VOTAVEL"].map(partido_map).fillna("")
    df["is_campo"]   = df["sg_partido"].isin(CAMPO)

    # ── Agrupar por local (agrupa as seções do mesmo prédio)
    # Coordenadas: um local pode ter várias seções → pega primeira lat/lng geocodificada
    local_coords = (
        coords.merge(
            df[["NR_ZONA", "NR_SECAO", "NR_LOCAL_VOTACAO"]].drop_duplicates(),
            left_on=["nr_zona", "nr_secao"],
            right_on=["NR_ZONA", "NR_SECAO"],
            how="inner",
        )
        [["NR_LOCAL_VOTACAO", "nr_zona", "lat", "lng"]]
        .drop_duplicates("NR_LOCAL_VOTACAO")
        .rename(columns={"NR_LOCAL_VOTACAO": "nr_local"})
    )

    # Total de votos nominais por local
    total_local = (
        df.groupby("NR_LOCAL_VOTACAO")["QT_VOTOS"]
        .sum()
        .rename("total_votos")
        .reset_index()
        .rename(columns={"NR_LOCAL_VOTACAO": "nr_local"})
    )

    # Votos do campo por local
    campo_local = (
        df[df["is_campo"]]
        .groupby("NR_LOCAL_VOTACAO")["QT_VOTOS"]
        .sum()
        .rename("votos_campo")
        .reset_index()
        .rename(columns={"NR_LOCAL_VOTACAO": "nr_local"})
    )

    # Votos dos candidatos de referência por local (configurados por ano)
    cands_ref_ano = CANDS_REF_POR_ANO.get(ano, {})
    ref_dfs = {}
    for nr, col in cands_ref_ano.items():
        sub = df[df["NR_VOTAVEL"] == nr].groupby("NR_LOCAL_VOTACAO")["QT_VOTOS"].sum()
        if sub.sum() > 0:
            ref_dfs[col] = sub.rename(col).reset_index().rename(
                columns={"NR_LOCAL_VOTACAO": "nr_local"})

    # Junta tudo
    base = local_coords.merge(total_local, on="nr_local", how="left")
    base = base.merge(campo_local, on="nr_local", how="left")
    for col, rdf in ref_dfs.items():
        base = base.merge(rdf, on="nr_local", how="left")

    for col in ["total_votos", "votos_campo"] + list(ref_dfs.keys()):
        if col in base.columns:
            base[col] = base[col].fillna(0).astype(int)

    # Filtra locais sem coordenadas válidas (geocode genérico da cidade)
    CITY_LAT, CITY_LNG = -22.9056391, -47.059564
    mask_valido = ~((base["lat"] == CITY_LAT) & (base["lng"] == CITY_LNG))
    n_invalidos = (~mask_valido).sum()
    if n_invalidos:
        print(f"  {n_invalidos} locais sem geocodificação individual — mantidos com coordenada da cidade")

    base["ano"] = ano

    # ── GeoJSON
    features = []
    for _, row in base.iterrows():
        props = {
            "nr_local":    row["nr_local"],
            "nr_zona":     row["nr_zona"],
            "ano":         ano,
            "total_votos": int(row["total_votos"]),
            "votos_campo": int(row.get("votos_campo", 0)),
        }
        for col in ref_dfs:
            props[col] = int(row.get(col, 0))

        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [row["lng"], row["lat"]]},
            "properties": props,
        })

    geojson = {"type": "FeatureCollection", "features": features}
    out_gj = GEO_DIR / f"locais_votos_{ano}.geojson"
    with open(out_gj, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, separators=(",", ":"))
    size_kb = out_gj.stat().st_size // 1024
    print(f"  GeoJSON: {out_gj.name} ({len(features)} locais, {size_kb} KB)")

    # ── CSV dinâmico: todos os candidatos com ≥ MIN_VOTOS num local
    cand_local = (
        df.groupby(["NR_LOCAL_VOTACAO", "NR_VOTAVEL", "NM_VOTAVEL"])["QT_VOTOS"]
        .sum()
        .reset_index()
        .rename(columns={"NR_LOCAL_VOTACAO": "nr_local", "NR_VOTAVEL": "nr_candidato",
                         "NM_VOTAVEL": "nm_candidato", "QT_VOTOS": "votos"})
    )
    cand_local = cand_local[cand_local["votos"] >= MIN_VOTOS].copy()
    cand_local["sg_partido"] = cand_local["nr_candidato"].map(partido_map).fillna("")
    cand_local["ano"] = ano

    # Adiciona coordenadas
    cand_local = cand_local.merge(
        base[["nr_local", "lat", "lng"]],
        on="nr_local", how="left"
    )

    out_csv = OUT_DIR / f"candidatos_local_{ano}.csv"
    cand_local.to_csv(out_csv, index=False, encoding="utf-8")
    n_cands = cand_local["nr_candidato"].nunique()
    print(f"  CSV dinâmico: {out_csv.name} ({len(cand_local)} linhas, {n_cands} candidatos)")

    # Referências
    nomes_ref = CONFIG.get("candidatos_nomes", {})
    for nr, col in cands_ref_ano.items():
        apelido = col.replace("votos_", "")
        nome = nomes_ref.get(apelido, nr)
        sub = cand_local[cand_local["nr_candidato"] == nr]
        if not sub.empty:
            print(f"  >> {nome} ({nr}): {sub['votos'].sum():,} votos em {len(sub)} locais")
        else:
            print(f"  >> {nome} ({nr}): sem dados em {ano}")


def main():
    print("=== Gerando dados de mapa de calor por local de votação ===\n")

    print("Carregando coordenadas geocodificadas...")
    try:
        coords = carregar_coordenadas()
        print(f"  {len(coords)} seções com coordenadas\n")
    except FileNotFoundError as e:
        print(f"  ERRO: {e}")
        return

    for ano in ANOS:
        processar_ano(ano, coords)

    print("\nConcluído.")
    print("Arquivos prontos para o mapa de calor no frontend.")


if __name__ == "__main__":
    main()
