"""
Download dos dados eleitorais do TSE para Campinas-SP.
Fonte: https://dadosabertos.tse.jus.br

Baixa resultados por seção eleitoral e perfil do eleitorado
para os anos configurados em data/config.json.
"""

import os
import json
import requests
import zipfile
from pathlib import Path
from tqdm import tqdm

ROOT = Path(__file__).parent.parent
CONFIG = json.loads((ROOT / "data" / "config.json").read_text())

RAW_DIR = ROOT / "data" / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)

UF = CONFIG["uf"].lower()
ANOS = CONFIG["anos_disponiveis"]

BASE_URL = "https://cdn.tse.jus.br/estatistica/sead/odsele"

ARQUIVOS = {
    # Resultados por seção (deputado estadual e federal)
    "votacao_secao": {
        2018: f"votacao_secao/votacao_secao_2018_{UF.upper()}.zip",
        2020: f"votacao_secao/votacao_secao_2020_{UF.upper()}.zip",
        2022: f"votacao_secao/votacao_secao_2022_{UF.upper()}.zip",
        2024: f"votacao_secao/votacao_secao_2024_{UF.upper()}.zip",
    },
    # Perfil do eleitorado por zona
    "perfil_eleitorado": {
        2018: "perfil_eleitor_secao/perfil_eleitor_secao_2018.zip",
        2020: "perfil_eleitor_secao/perfil_eleitor_secao_2020.zip",
        2022: "perfil_eleitor_secao/perfil_eleitor_secao_2022.zip",
        2024: "perfil_eleitor_secao/perfil_eleitor_secao_2024.zip",
    },
    # Locais de votação (para geocodificação)
    "locais_votacao": {
        2022: "local_votacao/local_votacao_2022.zip",
        2024: "local_votacao/local_votacao_2024.zip",
    },
}


def download_arquivo(url: str, destino: Path) -> bool:
    if destino.exists():
        print(f"  Já existe: {destino.name}")
        return True

    print(f"  Baixando: {url}")
    try:
        r = requests.get(url, stream=True, timeout=120)
        r.raise_for_status()
        total = int(r.headers.get("content-length", 0))

        with open(destino, "wb") as f, tqdm(
            total=total, unit="B", unit_scale=True, desc=destino.name
        ) as bar:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
                bar.update(len(chunk))
        return True
    except Exception as e:
        print(f"  ERRO ao baixar {url}: {e}")
        if destino.exists():
            destino.unlink()
        return False


def extrair_zip(zip_path: Path, destino: Path) -> None:
    print(f"  Extraindo: {zip_path.name}")
    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(destino)


def main():
    for categoria, anos_urls in ARQUIVOS.items():
        print(f"\n=== {categoria} ===")
        destino_cat = RAW_DIR / categoria
        destino_cat.mkdir(exist_ok=True)

        for ano, caminho_url in anos_urls.items():
            url = f"{BASE_URL}/{caminho_url}"
            zip_path = destino_cat / f"{categoria}_{ano}.zip"
            pasta_extraida = destino_cat / str(ano)

            if pasta_extraida.exists():
                print(f"  [{ano}] Já extraído, pulando.")
                continue

            ok = download_arquivo(url, zip_path)
            if ok:
                pasta_extraida.mkdir(exist_ok=True)
                extrair_zip(zip_path, pasta_extraida)
                zip_path.unlink()
                print(f"  [{ano}] OK")

    print("\nDownload concluído. Dados em data/raw/")


if __name__ == "__main__":
    main()
