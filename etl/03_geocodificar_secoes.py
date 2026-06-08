"""
Geocodifica os locais de votação de Campinas usando Nominatim (OpenStreetMap).
Extrai endereços diretamente dos arquivos votacao_secao (já baixados).

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

RAW_VOTACAO = ROOT / "data" / "raw" / "votacao_secao"
GEO_DIR = ROOT / "data" / "geo"
GEO_DIR.mkdir(parents=True, exist_ok=True)

CACHE_FILE = Path(__file__).parent / ".cache" / "geocode_cache.json"
CACHE_FILE.parent.mkdir(exist_ok=True)

MUNICIPIO_COD = CONFIG["codigo_municipio_tse"]
DELAY = 1.1  # Nominatim: máx 1 req/s


def carregar_cache() -> dict:
    if CACHE_FILE.exists():
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    return {}


def salvar_cache(cache: dict) -> None:
    CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


def geocodificar(geocoder: Nominatim, endereco: str, cache: dict) -> tuple:
    if endereco in cache:
        return cache[endereco]["lat"], cache[endereco]["lng"]

    try:
        time.sleep(DELAY)
        res = geocoder.geocode(endereco, timeout=15)
        if res:
            cache[endereco] = {"lat": res.latitude, "lng": res.longitude}
            return res.latitude, res.longitude
    except (GeocoderTimedOut, GeocoderServiceError) as e:
        print(f"  Timeout/erro: {e}")

    cache[endereco] = {"lat": None, "lng": None}
    return None, None


def ler_csv_tse(path: Path) -> pd.DataFrame:
    for enc in ["latin-1", "iso-8859-1", "utf-8"]:
        try:
            return pd.read_csv(path, sep=";", encoding=enc, dtype=str, low_memory=False)
        except Exception:
            continue
    return pd.DataFrame()


def filtrar_campinas(df: pd.DataFrame) -> pd.DataFrame:
    col = next((c for c in df.columns if "CD_MUNICIPIO" in c or "NR_MUNICIPIO" in c), None)
    if col:
        return df[df[col].str.strip() == MUNICIPIO_COD].copy()
    nm = next((c for c in df.columns if "NM_MUNICIPIO" in c), None)
    if nm:
        return df[df[nm].str.upper().str.contains("CAMPINAS", na=False)].copy()
    return df


def extrair_locais_de_votacao_secao() -> pd.DataFrame:
    """
    Extrai endereços dos locais de votação a partir dos arquivos votacao_secao.
    Esses arquivos contêm DS_LOCAL_VOTACAO, NR_LOCAL_VOTACAO e endereço nas colunas.
    Usa o ano mais recente disponível.
    """
    for ano in [2024, 2022, 2020, 2018]:
        pasta = RAW_VOTACAO / str(ano)
        if not pasta.exists():
            continue

        csvs = list(pasta.glob("*.csv")) or list(pasta.glob("**/*.csv"))
        frames = []
        for csv in csvs:
            df = ler_csv_tse(csv)
            if df.empty:
                continue
            df = filtrar_campinas(df)
            if not df.empty:
                frames.append(df)

        if not frames:
            continue

        df = pd.concat(frames, ignore_index=True)

        # Colunas de localização que o TSE inclui nos arquivos de votação
        colunas_local = [c for c in [
            "NR_ZONA", "NR_SECAO", "NR_LOCAL_VOTACAO",
            "DS_LOCAL_VOTACAO",       # nome do local (escola, ginásio, etc.)
            "DS_ENDERECO",            # endereço completo (alguns anos)
            "NM_LOGRADOURO",          # logradouro (alguns anos)
            "NR_LOGRADOURO",          # número
            "NM_BAIRRO",              # bairro
            "DS_MUNICIPIO", "NM_UE",  # município
            "NR_CEP",                 # CEP
        ] if c in df.columns]

        if "NR_ZONA" not in colunas_local or "NR_SECAO" not in colunas_local:
            continue

        df_locais = df[colunas_local].drop_duplicates(
            subset=["NR_ZONA", "NR_SECAO"]
        ).reset_index(drop=True)

        print(f"  Locais extraídos de votacao_secao/{ano}: {len(df_locais)} seções únicas")
        return df_locais

    return pd.DataFrame()


def montar_endereco(row: pd.Series) -> str:
    partes = []

    # Nome do local (escola, ginásio...)
    for col in ["DS_LOCAL_VOTACAO"]:
        if col in row.index and pd.notna(row[col]) and str(row[col]).strip():
            partes.append(str(row[col]).strip().title())
            break

    # Logradouro + número
    logradouro = ""
    for col in ["DS_ENDERECO", "NM_LOGRADOURO"]:
        if col in row.index and pd.notna(row[col]) and str(row[col]).strip():
            logradouro = str(row[col]).strip()
            break

    numero = ""
    if "NR_LOGRADOURO" in row.index and pd.notna(row["NR_LOGRADOURO"]):
        nr = str(row["NR_LOGRADOURO"]).strip()
        if nr not in ("", "S/N", "SN", "0"):
            numero = nr

    if logradouro:
        partes.append(f"{logradouro}, {numero}".strip(", "))

    # CEP se disponível
    if "NR_CEP" in row.index and pd.notna(row["NR_CEP"]):
        cep = str(row["NR_CEP"]).strip()
        if len(cep) >= 8:
            partes.append(cep)

    partes.append("Campinas, SP, Brasil")
    return ", ".join(p for p in partes if p)


def main():
    print("=== Geocodificando locais de votação ===\n")
    print("Fonte: colunas de endereço dos arquivos votacao_secao\n")

    df = extrair_locais_de_votacao_secao()
    if df.empty:
        print("ERRO: Nenhum dado de localização encontrado.")
        print("Verifique se votacao_secao foi baixado corretamente.")
        return

    cache = carregar_cache()
    geocoder = Nominatim(user_agent="dashboard-eleitoral-campinas-sp-v2")

    print(f"\nGecodificando {len(df)} seções...")

    lats, lngs, enderecos_usados = [], [], []

    for _, row in tqdm(df.iterrows(), total=len(df), desc="Nominatim"):
        endereco = montar_endereco(row)
        enderecos_usados.append(endereco)
        lat, lng = geocodificar(geocoder, endereco, cache)
        lats.append(lat)
        lngs.append(lng)

        # Salva cache a cada 50 requisições para não perder progresso
        if len(lats) % 50 == 0:
            salvar_cache(cache)

    salvar_cache(cache)

    df = df.copy()
    df["endereco_geocode"] = enderecos_usados
    df["lat"] = lats
    df["lng"] = lngs

    out_csv = GEO_DIR / "locais_votacao.csv"
    df.to_csv(out_csv, index=False, encoding="utf-8")
    print(f"\nLocais salvos: {out_csv.name}")

    df_geo = df[df["lat"].notna() & df["lng"].notna()].copy()
    if df_geo.empty:
        print("Nenhuma coordenada obtida. Verifique o log acima.")
        return

    gdf = gpd.GeoDataFrame(
        df_geo,
        geometry=[Point(r["lng"], r["lat"]) for _, r in df_geo.iterrows()],
        crs="EPSG:4326",
    )

    out_geojson = GEO_DIR / "secoes_geo.geojson"
    gdf.to_file(out_geojson, driver="GeoJSON")
    print(f"GeoJSON salvo: {out_geojson.name} ({len(gdf)} pontos)")

    n = df["lat"].notna().sum()
    print(f"\nTaxa de geocodificação: {n}/{len(df)} ({n/len(df)*100:.1f}%)")


if __name__ == "__main__":
    main()
