"""
Download dos dados eleitorais do TSE para Campinas-SP.
Fonte: https://dadosabertos.tse.jus.br

Baixa resultados por seção eleitoral e perfil do eleitorado
para os anos configurados em data/config.json.
"""

import json
import requests
import zipfile
from pathlib import Path
from tqdm import tqdm

ROOT = Path(__file__).parent.parent
CONFIG = json.loads((ROOT / "data" / "config.json").read_text())

RAW_DIR = ROOT / "data" / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)

UF = CONFIG["uf"].upper()
ANOS = CONFIG["anos_disponiveis"]

BASE = "https://cdn.tse.jus.br/estatistica/sead/odsele"

# Cada entrada é uma lista de candidatos de URL tentados em ordem.
# O TSE muda nomes ocasionalmente; a função tenta todos antes de desistir.
ARQUIVOS = {
    "votacao_secao": {
        ano: [
            f"{BASE}/votacao_secao/votacao_secao_{ano}_{UF}.zip",
        ]
        for ano in ANOS
    },
    "perfil_eleitorado": {
        ano: [
            f"{BASE}/perfil_eleitorado/perfil_eleitorado_{ano}.zip",
            f"{BASE}/perfil_eleitorado_{ano}/perfil_eleitorado_{ano}_BR.zip",
            f"{BASE}/perfil_eleitor_secao/perfil_eleitor_secao_{ano}.zip",
        ]
        for ano in ANOS
    },
    # locais_votacao: endereços extraídos diretamente de votacao_secao
    # (arquivo separado não disponível no CDN do TSE)
}


def tentar_download(candidatos: list[str], destino: Path) -> bool:
    if destino.exists():
        print(f"  Já existe: {destino.name}")
        return True

    for url in candidatos:
        print(f"  Tentando: {url}")
        try:
            r = requests.get(url, stream=True, timeout=120)
            if r.status_code == 404:
                print(f"  404, próximo candidato...")
                continue
            r.raise_for_status()
            total = int(r.headers.get("content-length", 0))
            with open(destino, "wb") as f, tqdm(
                total=total, unit="B", unit_scale=True, desc=destino.name
            ) as bar:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
                    bar.update(len(chunk))
            print(f"  OK: {url}")
            return True
        except Exception as e:
            print(f"  ERRO: {e}")
            if destino.exists():
                destino.unlink()

    print(f"  FALHOU: nenhum candidato funcionou para {destino.name}")
    return False


def extrair_zip(zip_path: Path, destino: Path) -> None:
    print(f"  Extraindo: {zip_path.name}")
    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(destino)


def main():
    for categoria, anos_candidatos in ARQUIVOS.items():
        print(f"\n=== {categoria} ===")
        destino_cat = RAW_DIR / categoria
        destino_cat.mkdir(exist_ok=True)

        for ano, candidatos in anos_candidatos.items():
            zip_path = destino_cat / f"{categoria}_{ano}.zip"
            pasta_extraida = destino_cat / str(ano)

            if pasta_extraida.exists():
                print(f"  [{ano}] Já extraído, pulando.")
                continue

            ok = tentar_download(candidatos, zip_path)
            if ok:
                pasta_extraida.mkdir(exist_ok=True)
                extrair_zip(zip_path, pasta_extraida)
                zip_path.unlink()
                print(f"  [{ano}] Extraído.")

    print("\nDownload concluído. Dados em data/raw/")


if __name__ == "__main__":
    main()
