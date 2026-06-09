"""
Download e filtragem inline dos dados do TSE para Campinas-SP.

Fontes:
- votacao_partido_munzona: votos por partido por zona (arquivo principal)
- votacao_secao: usado só para geocodificação dos locais de votação
- perfil_eleitorado: perfil demográfico do eleitorado por zona

Cada zip é baixado, o CSV do SP é extraído, filtrado para Campinas
e salvo pequeno em data/raw/campinas/. O zip é descartado.
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

# Mapeamento: nome_saida → lista de candidatos de URL (tenta em ordem)
# {ano} e {UF} são substituídos em tempo de execução
FONTES = {
    # Principal: votos agregados por partido e zona — tem SG_PARTIDO, NM_PARTIDO
    "votacao_partido_munzona": {
        ano: [f"{BASE}/votacao_partido_munzona/votacao_partido_munzona_{ano}.zip"]
        for ano in ANOS
    },
    # Geocodificação: endereços dos locais de votação
    "votacao_secao": {
        ano: [f"{BASE}/votacao_secao/votacao_secao_{ano}_{UF}.zip"]
        for ano in ANOS
    },
    # Perfil demográfico do eleitorado
    "perfil_eleitorado": {
        ano: [
            f"{BASE}/perfil_eleitorado/perfil_eleitorado_{ano}.zip",
            f"{BASE}/perfil_eleitorado_{ano}/perfil_eleitorado_{ano}_BR.zip",
        ]
        for ano in ANOS
    },
}

# Arquivos que já foram baixados na sessão anterior — pular se existirem
SKIP_SE_EXISTIR = True


def baixar_para_temp(url: str) -> str | None:
    try:
        r = requests.get(url, stream=True, timeout=180)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        total = int(r.headers.get("content-length", 0))
        fd, tmp = tempfile.mkstemp(suffix=".zip")
        with os.fdopen(fd, "wb") as f, tqdm(
            total=total, unit="B", unit_scale=True,
            desc=f"  {Path(url).name}", leave=False
        ) as bar:
            for chunk in r.iter_content(65_536):
                f.write(chunk)
                bar.update(len(chunk))
        return tmp
    except Exception as e:
        print(f"  Erro: {e}")
        return None


def filtrar_campinas(chunk: pd.DataFrame) -> pd.DataFrame:
    for col in chunk.columns:
        if "CD_MUNICIPIO" in col or "NR_MUNICIPIO" in col:
            return chunk[chunk[col].str.strip() == MUNICIPIO_COD]
    for col in chunk.columns:
        if "NM_MUNICIPIO" in col:
            return chunk[chunk[col].str.upper().str.contains("CAMPINAS", na=False)]
    return chunk


def extrair_filtrar_salvar(zip_path: str, out_csv: Path, categoria: str) -> bool:
    frames = []
    try:
        with zipfile.ZipFile(zip_path) as zf:
            # Preferir CSV do SP quando existir dentro do zip
            todos_csvs = [n for n in zf.namelist() if n.lower().endswith(".csv")]
            sp_csvs = [n for n in todos_csvs if f"_{UF}." in n or f"_{UF.lower()}." in n]
            csvs = sp_csvs if sp_csvs else todos_csvs

            if not csvs:
                print("  Nenhum CSV no zip.")
                return False

            for nome in csvs:
                print(f"  Filtrando: {nome}")
                with zf.open(nome) as f:
                    for enc in ["latin-1", "utf-8", "iso-8859-1"]:
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
        print(f"  Zip inválido: {e}")
        return False

    if not frames:
        print("  Nenhuma linha de Campinas encontrada.")
        return False

    df = pd.concat(frames, ignore_index=True)
    df.to_csv(out_csv, index=False, encoding="utf-8")
    print(f"  Salvo: {out_csv.name} ({len(df):,} linhas)")
    return True


def processar_fonte(categoria: str, anos_candidatos: dict) -> None:
    print(f"\n=== {categoria} ===")
    for ano, candidatos in anos_candidatos.items():
        out_csv = OUT_DIR / f"{categoria}_{ano}.csv"

        if SKIP_SE_EXISTIR and out_csv.exists():
            print(f"  [{ano}] Já existe ({out_csv.stat().st_size // 1024} KB) — pulando.")
            continue

        print(f"\n  [{ano}]")
        for url in candidatos:
            print(f"  Baixando: {url}")
            tmp = baixar_para_temp(url)
            if tmp is None:
                print("  404 ou erro, próximo candidato...")
                continue
            ok = extrair_filtrar_salvar(tmp, out_csv, categoria)
            os.unlink(tmp)
            if ok:
                break
        else:
            print(f"  [{ano}] FALHOU: nenhum candidato funcionou.")


def main():
    print(f"Município: Campinas (TSE {MUNICIPIO_COD}) — UF: {UF}\n")
    print("Cada zip é baixado, filtrado e descartado. Apenas dados de Campinas são salvos.\n")

    for categoria, anos in FONTES.items():
        processar_fonte(categoria, anos)

    print(f"\nConcluído. Arquivos em: {OUT_DIR}")
    print("Próximo passo: python etl/02_processar_resultados.py")


if __name__ == "__main__":
    main()
