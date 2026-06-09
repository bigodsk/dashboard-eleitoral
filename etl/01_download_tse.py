"""
Download e filtragem inline dos dados do TSE para Campinas-SP.

O arquivo de SP tem ~500 MB. Este script baixa para um arquivo temporário,
lê o CSV interno em chunks e salva apenas as linhas de Campinas (~5 MB).
O zip temporário é apagado logo após a extração.

Saída:
  data/raw/campinas/votacao_secao_{ano}.csv
  data/raw/campinas/perfil_eleitorado_{ano}.csv
"""

import json
import os
import tempfile
import zipfile
import pandas as pd
import requests
from pathlib import Path
from tqdm import tqdm

ROOT = Path(__file__).parent.parent
CONFIG = json.loads((ROOT / "data" / "config.json").read_text())

OUT_DIR = ROOT / "data" / "raw" / "campinas"
OUT_DIR.mkdir(parents=True, exist_ok=True)

UF = CONFIG["uf"].upper()
ANOS = CONFIG["anos_disponiveis"]
MUNICIPIO_COD = CONFIG["codigo_municipio_tse"]
BASE = "https://cdn.tse.jus.br/estatistica/sead/odsele"

CHUNK = 50_000

FONTES = {
    "votacao_secao": {
        ano: [f"{BASE}/votacao_secao/votacao_secao_{ano}_{UF}.zip"]
        for ano in ANOS
    },
    "perfil_eleitorado": {
        ano: [
            f"{BASE}/perfil_eleitorado/perfil_eleitorado_{ano}.zip",
            f"{BASE}/perfil_eleitorado_{ano}/perfil_eleitorado_{ano}_BR.zip",
        ]
        for ano in ANOS
    },
}


def baixar_para_temp(url: str) -> str | None:
    """Baixa URL para arquivo temporário; retorna o caminho ou None se 404."""
    try:
        r = requests.get(url, stream=True, timeout=120)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        total = int(r.headers.get("content-length", 0))
        suffix = Path(url).suffix or ".zip"
        fd, tmp_path = tempfile.mkstemp(suffix=suffix)
        with os.fdopen(fd, "wb") as f, tqdm(
            total=total, unit="B", unit_scale=True,
            desc=f"  {Path(url).name}", leave=False
        ) as bar:
            for chunk in r.iter_content(chunk_size=65_536):
                f.write(chunk)
                bar.update(len(chunk))
        return tmp_path
    except Exception as e:
        print(f"  Erro ao baixar {url}: {e}")
        return None


def detectar_col_municipio(colunas: list) -> tuple[str, str]:
    """Retorna (nome_coluna, tipo) onde tipo é 'codigo' ou 'nome'."""
    for c in colunas:
        if "CD_MUNICIPIO" in c or "NR_MUNICIPIO" in c:
            return c, "codigo"
    for c in colunas:
        if "NM_MUNICIPIO" in c or "NM_UE" in c:
            return c, "nome"
    return None, None


def filtrar_campinas(chunk: pd.DataFrame) -> pd.DataFrame:
    col, tipo = detectar_col_municipio(list(chunk.columns))
    if col is None:
        return chunk  # sem coluna de município: mantém tudo
    if tipo == "codigo":
        return chunk[chunk[col].str.strip() == MUNICIPIO_COD]
    return chunk[chunk[col].str.upper().str.contains("CAMPINAS", na=False)]


def extrair_e_filtrar_zip(zip_path: str, out_csv: Path) -> bool:
    """Abre o zip, lê cada CSV em chunks, filtra Campinas, salva."""
    frames = []
    try:
        with zipfile.ZipFile(zip_path) as zf:
            csvs_no_zip = [n for n in zf.namelist() if n.lower().endswith(".csv")]
            if not csvs_no_zip:
                print("  Nenhum CSV dentro do zip.")
                return False

            for nome in csvs_no_zip:
                print(f"  Filtrando: {nome}")
                with zf.open(nome) as f:
                    for enc in ["latin-1", "iso-8859-1", "utf-8"]:
                        try:
                            reader = pd.read_csv(
                                f, sep=";", encoding=enc,
                                dtype=str, low_memory=False,
                                chunksize=CHUNK,
                            )
                            for chunk in reader:
                                campinas = filtrar_campinas(chunk)
                                if not campinas.empty:
                                    frames.append(campinas)
                            break
                        except UnicodeDecodeError:
                            f.seek(0)
                            continue
                        except Exception as e:
                            print(f"  Erro ao ler {nome}: {e}")
                            break
    except zipfile.BadZipFile as e:
        print(f"  Zip corrompido: {e}")
        return False

    if not frames:
        print("  Nenhum dado de Campinas encontrado neste arquivo.")
        return False

    df = pd.concat(frames, ignore_index=True)
    df.to_csv(out_csv, index=False, encoding="utf-8")
    print(f"  Salvo: {out_csv.name} ({len(df):,} linhas de Campinas)")
    return True


def processar_fonte(categoria: str, anos_candidatos: dict) -> None:
    print(f"\n=== {categoria} ===")

    for ano, candidatos in anos_candidatos.items():
        out_csv = OUT_DIR / f"{categoria}_{ano}.csv"

        if out_csv.exists():
            print(f"  [{ano}] Já existe: {out_csv.name} — pulando.")
            continue

        print(f"\n  [{ano}]")
        tmp_path = None

        for url in candidatos:
            print(f"  Baixando: {url}")
            tmp_path = baixar_para_temp(url)
            if tmp_path:
                print(f"  Download OK. Extraindo e filtrando...")
                ok = extrair_e_filtrar_zip(tmp_path, out_csv)
                os.unlink(tmp_path)
                tmp_path = None
                if ok:
                    break
                # Se filtrou mas não achou Campinas, tenta próximo candidato
            else:
                print(f"  404 ou erro, próximo candidato...")

        if not out_csv.exists():
            print(f"  [{ano}] FALHOU: nenhum candidato funcionou.")


def main():
    print("Pipeline: download → filtrar Campinas → salvar CSV pequeno\n")
    print(f"Município: Campinas (código {MUNICIPIO_COD})\n")

    for categoria, anos in FONTES.items():
        processar_fonte(categoria, anos)

    print(f"\nConcluído. Arquivos filtrados em: {OUT_DIR}")
    print("Execute agora: python etl/02_processar_resultados.py")


if __name__ == "__main__":
    main()
