"""
Geocodifica os locais de votação de Campinas usando Nominatim (OpenStreetMap).
Lê endereços direto de data/raw/campinas/votacao_secao_{ano}.csv.

Saída:
  data/geo/locais_votacao.csv       — tabela de locais com lat/lng
  data/geo/secoes_geo.geojson       — GeoJSON: um ponto por seção eleitoral
"""

import json
import time
import pandas as pd
from pathlib import Path
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError
from tqdm import tqdm

ROOT     = Path(__file__).parent.parent
RAW_DIR  = ROOT / "data" / "raw" / "campinas"
GEO_DIR  = ROOT / "data" / "geo"
GEO_DIR.mkdir(parents=True, exist_ok=True)

CACHE_FILE = Path(__file__).parent / ".cache" / "geocode_cache.json"
CACHE_FILE.parent.mkdir(exist_ok=True)

# Coordenada fallback = centro de Campinas
FALLBACK_LAT = -22.9064
FALLBACK_LNG = -47.0616
DELAY = 1.2  # Nominatim: máx 1 req/s


def carregar_cache() -> dict:
    if CACHE_FILE.exists():
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    return {}


def salvar_cache(cache: dict) -> None:
    CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


def geocodificar_um(geocoder: Nominatim, query: str, cache: dict) -> tuple[float, float, bool]:
    """Retorna (lat, lng, geocodificado_individualmente)."""
    if query in cache:
        cached = cache[query]
        if cached["lat"] is not None:
            return cached["lat"], cached["lng"], True
        return FALLBACK_LAT, FALLBACK_LNG, False

    time.sleep(DELAY)
    try:
        res = geocoder.geocode(query, timeout=20, country_codes="br")
        if res:
            # Aceita só se não for resultado muito genérico (nível cidade/estado)
            addr = (res.raw.get("display_name") or "").lower()
            if res.latitude and not (abs(res.latitude - FALLBACK_LAT) < 0.001
                                     and abs(res.longitude - FALLBACK_LNG) < 0.001):
                cache[query] = {"lat": res.latitude, "lng": res.longitude, "display": addr[:120]}
                return res.latitude, res.longitude, True
    except (GeocoderTimedOut, GeocoderServiceError) as e:
        print(f"    Erro: {e}")

    cache[query] = {"lat": None, "lng": None}
    return FALLBACK_LAT, FALLBACK_LNG, False


def montar_queries(nm_local: str, endereco: str) -> list[str]:
    """
    Retorna lista de queries do mais específico para o menos específico.
    Nominatim: tentar primeiro o endereço completo, depois só o logradouro.
    """
    queries = []
    end = endereco.strip().rstrip(",")

    # Substitui "S/N" por vazio (sem número é mais fácil de geocodar)
    end_sem_sn = end.replace(", S/N", "").replace(",S/N", "").replace(" S/N", "").strip()

    if end_sem_sn:
        queries.append(f"{end_sem_sn}, Campinas, SP")
    if end and end != end_sem_sn:
        queries.append(f"{end}, Campinas, SP")
    if nm_local:
        queries.append(f"{nm_local.strip()}, Campinas, SP")

    return queries


def extrair_locais(ano_preferido=2022) -> pd.DataFrame:
    """Extrai tabela de locais únicos com endereços."""
    for ano in [ano_preferido, 2024, 2022, 2020, 2018]:
        path = RAW_DIR / f"votacao_secao_{ano}.csv"
        if not path.exists():
            continue

        df = pd.read_csv(path, dtype=str, low_memory=False,
                         usecols=lambda c: c in [
                             "NR_ZONA", "NR_SECAO", "NR_LOCAL_VOTACAO",
                             "NM_LOCAL_VOTACAO", "DS_LOCAL_VOTACAO_ENDERECO",
                             "NM_UE",
                         ])

        locais = (
            df[["NR_ZONA", "NR_SECAO", "NR_LOCAL_VOTACAO",
                "NM_LOCAL_VOTACAO", "DS_LOCAL_VOTACAO_ENDERECO",
                "NM_UE"]]
            .drop_duplicates(subset=["NR_LOCAL_VOTACAO"])
            .reset_index(drop=True)
        )
        print(f"  Locais únicos em votacao_secao_{ano}: {len(locais)}")
        return locais

    return pd.DataFrame()


def main():
    print("=== Geocodificando locais de votação de Campinas ===\n")

    locais = extrair_locais()
    if locais.empty:
        print("ERRO: Nenhum arquivo votacao_secao encontrado em data/raw/campinas/")
        return

    cache = carregar_cache()
    # Limpa cache de resultados inválidos (coordenada genérica da cidade)
    invalidos = [k for k, v in cache.items()
                 if v.get("lat") and abs(v["lat"] - (-22.9056391)) < 0.0001]
    for k in invalidos:
        del cache[k]
    if invalidos:
        print(f"  Cache: {len(invalidos)} entradas genéricas removidas\n")

    geocoder = Nominatim(user_agent="dashboard-eleitoral-campinas-psol-v3")

    lats, lngs, geocodes_ok = [], [], []

    print(f"Geocodificando {len(locais)} locais via Nominatim...")
    for _, row in tqdm(locais.iterrows(), total=len(locais)):
        nm   = str(row.get("NM_LOCAL_VOTACAO", "") or "").strip()
        end  = str(row.get("DS_LOCAL_VOTACAO_ENDERECO", "") or "").strip()

        queries = montar_queries(nm, end)

        lat, lng, ok = FALLBACK_LAT, FALLBACK_LNG, False
        for q in queries:
            lat, lng, ok = geocodificar_um(geocoder, q, cache)
            if ok:
                break

        lats.append(lat)
        lngs.append(lng)
        geocodes_ok.append(ok)

        if len(lats) % 20 == 0:
            salvar_cache(cache)

    salvar_cache(cache)

    locais = locais.copy()
    locais["lat"] = lats
    locais["lng"] = lngs
    locais["geocode_ok"] = geocodes_ok

    n_ok = sum(geocodes_ok)
    print(f"\nGeocods com sucesso: {n_ok}/{len(locais)} ({n_ok/len(locais)*100:.0f}%)")

    # Salva CSV de locais
    out_csv = GEO_DIR / "locais_votacao.csv"
    locais.to_csv(out_csv, index=False, encoding="utf-8")
    print(f"CSV: {out_csv.name}")

    # ── GeoJSON de seções: repete coordenada do local para cada seção ──
    # Recarrega todas as seções de todos os anos para o GeoJSON final
    secoes_frames = []
    for ano in [2018, 2020, 2022, 2024]:
        p = RAW_DIR / f"votacao_secao_{ano}.csv"
        if not p.exists():
            continue
        df = pd.read_csv(p, dtype=str, low_memory=False,
                         usecols=lambda c: c in ["NR_ZONA", "NR_SECAO", "NR_LOCAL_VOTACAO", "NM_UE"])
        secoes_frames.append(df.drop_duplicates(subset=["NR_ZONA", "NR_SECAO"]))

    if not secoes_frames:
        print("Sem dados de seções para o GeoJSON.")
        return

    todas_secoes = pd.concat(secoes_frames, ignore_index=True).drop_duplicates(
        subset=["NR_ZONA", "NR_SECAO"]
    )

    # Junta coordenadas via NR_LOCAL_VOTACAO
    coord_map = locais.set_index("NR_LOCAL_VOTACAO")[["lat", "lng", "geocode_ok"]].to_dict("index")

    features = []
    for _, row in todas_secoes.iterrows():
        nr_local = str(row.get("NR_LOCAL_VOTACAO", ""))
        coords = coord_map.get(nr_local, {})
        lat = coords.get("lat", FALLBACK_LAT)
        lng = coords.get("lng", FALLBACK_LNG)

        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lng, lat]},
            "properties": {
                "NR_ZONA":          str(row.get("NR_ZONA", "")).zfill(4),
                "NR_SECAO":         str(row.get("NR_SECAO", "")).zfill(4),
                "NR_LOCAL_VOTACAO": nr_local,
                "NM_UE":            str(row.get("NM_UE", "")),
                "geocode_ok":       coords.get("geocode_ok", False),
                "lat":              lat,
                "lng":              lng,
            },
        })

    geojson = {"type": "FeatureCollection", "features": features}
    out_gj = GEO_DIR / "secoes_geo.geojson"
    with open(out_gj, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, separators=(",", ":"))

    n_indiv = sum(1 for feat in features if feat["properties"]["geocode_ok"])
    print(f"GeoJSON: {out_gj.name} ({len(features)} seções, {n_indiv} com coord individual)")


if __name__ == "__main__":
    main()
