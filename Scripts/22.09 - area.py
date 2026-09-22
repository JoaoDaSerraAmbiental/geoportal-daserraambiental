import csv
import os
import re
import unicodedata
from difflib import SequenceMatcher
from qgis.core import QgsDistanceArea, QgsProject, QgsCoordinateReferenceSystem
from qgis.utils import iface

# 1. Caminho do seu CSV
caminho_csv = r"C:\Users\JoãoVitor\Downloads\Restauração_Projetos.csv"

# 2. Configura ferramenta de medição geodésica de área (elipsoide WGS84)
medidor = QgsDistanceArea()
medidor.setSourceCrs(QgsCoordinateReferenceSystem("EPSG:4326"), QgsProject.instance().transformContext())
medidor.setEllipsoid("WGS84")

def normalizar(texto):
    if not texto:
        return ""
    texto = str(texto)
    if " — " in texto:
        texto = texto.split(" — ")[0]
    texto = texto.replace("_", " ").replace("-", " ")
    texto = unicodedata.normalize('NFKD', texto).encode('ASCII', 'ignore').decode('ASCII')
    texto = re.sub(r'[^a-zA-Z0-9 ]', '', texto)
    return re.sub(r'\s+', ' ', texto).strip().lower()

def calcular_score(nome_camada, linha_dict):
    """Procura o nome da camada em várias colunas da linha da planilha"""
    nome_norm = normalizar(nome_camada)
    melhor = 0.0
    
    # Testa principalmente contra 'Nome do Projeto' e 'Propriedade'
    for col, val in linha_dict.items():
        val_norm = normalizar(val)
        if not val_norm or len(val_norm) < 3:
            continue
            
        if nome_norm == val_norm:
            return 1.0
        if nome_norm in val_norm or val_norm in nome_norm:
            score = 0.85
        else:
            score = SequenceMatcher(None, nome_norm, val_norm).ratio()
            
        if score > melhor:
            melhor = score
    return melhor

# 3. Leitura dos dados do CSV
linhas_planilha = []
with open(caminho_csv, mode="r", encoding="utf-8-sig") as f:
    delimitador = ";" if ";" in f.readline() else ","
    f.seek(0)
    leitor = csv.DictReader(f, delimiter=delimitador)
    cabecalhos = [c.strip() for c in (leitor.fieldnames or [])]
    
    for linha in leitor:
        linhas_planilha.append({k.strip(): v.strip() for k, v in linha.items() if k})

# 4. Processamento das camadas
camadas = iface.layerTreeView().selectedLayers()
if not camadas:
    print("Atenção: Selecione as camadas no painel do QGIS antes de executar.")
else:
    print(f"--- PROCESSANDO {len(camadas)} CAMADAS ---")
    atualizadas_csv = 0
    pendentes = []

    for camada in camadas:
        campos = camada.fields()
        nome_camada = camada.name()
        
        # Encontra o melhor registro na planilha
        melhor_match = None
        maior_score = 0.0
        for linha in linhas_planilha:
            score = calcular_score(nome_camada, linha)
            if score > maior_score:
                maior_score = score
                melhor_match = linha

        camada.startEditing()
        
        # Identifica o campo de Área na camada
        campo_area_nome = next((f.name() for f in campos if "area" in normalizar(f.name()) or "area ha" in normalizar(f.name())), None)

        # Atualiza os dados de cada feição (polígono)
        for feat in camada.getFeatures():
            # A) RECÁLCULO GEODÉSICO DA ÁREA EM HECTARES
            if campo_area_nome and feat.geometry():
                area_m2 = medidor.measureArea(feat.geometry())
                area_ha = round(area_m2 / 10000.0, 3)  # 3 casas decimais
                feat[campo_area_nome] = area_ha

            # B) PREENCHIMENTO DOS DADOS DA PLANILHA (Limiar flexibilizado para 55%)
            if melhor_match and maior_score >= 0.55:
                for campo in campos:
                    fn = campo.name()
                    if fn == campo_area_nome:
                        continue  # Não sobrescreve a área calculada pela geometria
                        
                    # Procura coluna correspondente na planilha
                    col_csv = next((k for k in melhor_match.keys() if normalizar(k) == normalizar(fn)), None)
                    if col_csv and melhor_match[col_csv] != "":
                        val = melhor_match[col_csv]
                        if campo.isNumeric() and "," in val:
                            val = val.replace(".", "").replace(",", ".")
                        feat[fn] = val

            camada.updateFeature(feat)

        camada.commitChanges()

        if melhor_match and maior_score >= 0.55:
            atualizadas_csv += 1
            ref_nome = melhor_match.get("Nome do Projeto") or melhor_match.get("Propriedade") or list(melhor_match.values())[0]
            print(f"[OK {int(maior_score*100)}%] '{nome_camada}'  -->  '{ref_nome}'")
        else:
            sugestao = list(melhor_match.values())[0] if melhor_match else 'Nenhuma'
            pendentes.append((nome_camada, sugestao, int(maior_score*100)))

    print(f"\n================ RESUMO ================")
    print(f"✔ Área recalculada em hectares para 100% das {len(camadas)} camadas.")
    print(f"✔ Atributos da planilha vinculados em: {atualizadas_csv} camadas.")
    
    if pendentes:
        print(f"\n⚠️ {len(pendentes)} camadas ainda pendentes de correspondência:")
        for nome_c, sug, sc in pendentes:
            print(f"  • '{nome_c}' (sugestão mais próxima: '{sug}' com {sc}%)")