"""
Geocodifica os locais de votação de Campinas usando Nominatim (OpenStreetMap).
Gera coordenadas lat/lng para cada seção eleitoral.

Saída:
  data/geo/locais_votacao.csv
  data/geo/secoes_geo.geojson
"""

import json
import time
import pandas as pd
import geopandas as gpd
from pathlib import Path
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError
from shapely.geometry import Point
from tqdm import tqdm

ROOT = Path(__file__).parent.parent
CONFIG = json.loads((ROOT / "data" / "config.json").read_text())

RAW_LOCAIS = ROOT / "data" / "raw" / "locais_votacao"
GEO_DIR = ROOT / "data" / "geo"
GEO_DIR.mkdir(parents=True, exist_ok=True)

CACHE_FILE = Path(__file__).parent / ".cache" / "geocode_cache.json"
CACHE_FILE.parent.mkdir(exist_ok=True)

MUNICIPIO_COD = CONFIG["codigo_municipio_tse"]
DELAY_ENTRE_REQUESTS = 1.1  # Nominatim: max 1 req/s


def carregar_cache() -> dict:
    if CACHE_FILE.exists():
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    return {}


def salvar_cache(cache: dict) -> None:
    CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


def geocodificar_endereco(geocoder: Nominatim, endereco: str, cache: dict) -> tuple[float, float] | tuple[None, None]:
    if endereco in cache:
        return cache[endereco]["lat"], cache[endereco]["lng"]

    try:
        time.sleep(DELAY_ENTRE_REQUESTS)
        resultado = geocoder.geocode(endereco, timeout=10)
        if resultado:
            cache[endereco] = {"lat": resultado.latitude, "lng": resultado.longitude}
            return resultado.latitude, resultado.longitude
    except (GeocoderTimedOut, GeocoderServiceError) as e:
        print(f"  Erro geocodificação '{endereco}': {e}")

    cache[endereco] = {"lat": None, "lng": None}
    return None, None


def carregar_locais_tse() -> pd.DataFrame:
    csvs = []
    for ano in [2024, 2022]:
        pasta = RAW_LOCAIS / str(ano)
        if pasta.exists():
            for f in pasta.glob("*.csv"):
                csvs.append(f)

    if not csvs:
        print("Dados de locais de votação não encontrados. Execute 01_download_tse.py")
        return pd.DataFrame()

    frames = []
    for csv in csvs:
        try:
            df = pd.read_csv(csv, sep=";", encoding="latin-1", dtype=str, low_memory=False)
            # Filtrar Campinas
            col_mun = next((c for c in df.columns if "CD_MUNICIPIO" in c or "NR_MUNICIPIO" in c), None)
            if col_mun:
                df = df[df[col_mun].str.strip() == MUNICIPIO_COD]
            frames.append(df)
        except Exception as e:
            print(f"  Erro ao ler {csv.name}: {e}")

    if not frames:
        return pd.DataFrame()

    return pd.concat(frames, ignore_index=True)


def montar_endereco(row: pd.Series) -> str:
    partes = []

    for col in ["DS_LOCAL_VOTACAO", "NM_LOGRADOURO", "DS_ENDERECO"]:
        if col in row and pd.notna(row[col]) and str(row[col]).strip():
            partes.append(str(row[col]).strip())
            break

    for col in ["NR_LOGRADOURO", "DS_NUMERO"]:
        if col in row and pd.notna(row[col]) and str(row[col]).strip() not in ["", "S/N", "SN"]:
            partes.append(str(row[col]).strip())
            break

    partes.append("Campinas, São Paulo, Brasil")
    return ", ".join(partes)


def main():
    print("=== Geocodificando locais de votação ===\n")

    df = carregar_locais_tse()
    if df.empty:
        print("Nenhum dado de local de votação encontrado.")
        return

    cache = carregar_cache()
    geocoder = Nominatim(user_agent="dashboard-eleitoral-campinas-sp")

    # Deduplicar locais (vários seções no mesmo local)
    colunas_local = [c for c in ["NR_ZONA", "NR_SECAO", "DS_LOCAL_VOTACAO", "DS_ENDERECO",
                                  "NM_LOGRADOURO", "NR_LOGRADOURO"] if c in df.columns]
    df_locais = df[colunas_local].drop_duplicates()

    print(f"Total de locais únicos: {len(df_locais)}")

    lats, lngs = [], []
    enderecos = []

    for _, row in tqdm(df_locais.iterrows(), total=len(df_locais), desc="Geocodificando"):
        endereco = montar_endereco(row)
        enderecos.append(endereco)
        lat, lng = geocodificar_endereco(geocoder, endereco, cache)
        lats.append(lat)
        lngs.append(lng)

    salvar_cache(cache)

    df_locais = df_locais.copy()
    df_locais["endereco_geocode"] = enderecos
    df_locais["lat"] = lats
    df_locais["lng"] = lngs

    out_csv = GEO_DIR / "locais_votacao.csv"
    df_locais.to_csv(out_csv, index=False, encoding="utf-8")
    print(f"\nLocais salvos: {out_csv.name}")

    # GeoJSON das seções com coordenadas
    df_geo = df_locais[df_locais["lat"].notna() & df_locais["lng"].notna()].copy()
    if df_geo.empty:
        print("Nenhuma coordenada obtida.")
        return

    gdf = gpd.GeoDataFrame(
        df_geo,
        geometry=[Point(row["lng"], row["lat"]) for _, row in df_geo.iterrows()],
        crs="EPSG:4326"
    )

    out_geojson = GEO_DIR / "secoes_geo.geojson"
    gdf.to_file(out_geojson, driver="GeoJSON")
    print(f"GeoJSON salvo: {out_geojson.name} ({len(gdf)} pontos)")

    geocodificados = df_locais["lat"].notna().sum()
    print(f"\nTaxa de geocodificação: {geocodificados}/{len(df_locais)} ({geocodificados/len(df_locais)*100:.1f}%)")


if __name__ == "__main__":
    main()
