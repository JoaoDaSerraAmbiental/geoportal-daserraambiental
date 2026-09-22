import csv
import os
import re
import unicodedata
from difflib import SequenceMatcher
from qgis.core import QgsProject, QgsVariantUtils
from qgis.utils import iface

# 1. Caminho do seu CSV
caminho_csv = r"C:\Users\JoãoVitor\Downloads\Restauração_Projetos.csv"

# 2. Nome exato da coluna no CSV que contém o nome do projeto
COLUNA_IDENTIFICADOR = "Nome do Projeto"

# Função para padronizar e limpar os textos
def normalizar(texto):
    if not texto:
        return ""
    texto = str(texto)
    # Remove a duplicação comum de KMZ (ex: "Nome do Projeto — Nome")
    if " — " in texto:
        texto = texto.split(" — ")[0]
    # Substitui underline e hífen por espaço
    texto = texto.replace("_", " ").replace("-", " ")
    # Remove acentos
    texto = unicodedata.normalize('NFKD', texto).encode('ASCII', 'ignore').decode('ASCII')
    # Remove pontuações excedentes
    texto = re.sub(r'[^a-zA-Z0-9 ]', '', texto)
    return re.sub(r'\s+', ' ', texto).strip().lower()

def calcular_similaridade(a, b):
    return SequenceMatcher(None, a, b).ratio()

# 3. Leitura e indexação do CSV
linhas_planilha = []
with open(caminho_csv, mode="r", encoding="utf-8-sig") as f:
    amostra = f.read(2048)
    f.seek(0)
    delimitador = ";" if ";" in amostra else ","
    leitor = csv.DictReader(f, delimiter=delimitador)
    
    cabecalhos = [c.strip() for c in (leitor.fieldnames or [])]
    coluna_real = next((c for c in cabecalhos if normalizar(c) == normalizar(COLUNA_IDENTIFICADOR)), None)
    
    if not coluna_real:
        raise ValueError(f"Coluna '{COLUNA_IDENTIFICADOR}' não foi encontrada no CSV. Cabeçalhos disponíveis: {cabecalhos}")

    for linha in leitor:
        nome_original = linha.get(coluna_real, "").strip()
        if nome_original:
            linhas_planilha.append({
                "original": nome_original,
                "normalizado": normalizar(nome_original),
                "dados": linha
            })

# 4. Processamento das camadas selecionadas
camadas_selecionadas = iface.layerTreeView().selectedLayers()

if not camadas_selecionadas:
    print("Atenção: Nenhuma camada foi selecionada no painel. Selecione as camadas e execute novamente.")
else:
    print(f"Iniciando cruzamento inteligente para {len(camadas_selecionadas)} camadas...")
    atualizadas = 0

    for camada in camadas_selecionadas:
        nome_camada_norm = normalizar(camada.name())
        melhor_match = None
        melhor_score = 0.0

        # Busca direta, por inclusão ou por proximidade
        for item in linhas_planilha:
            nome_csv_norm = item["normalizado"]
            
            if nome_camada_norm == nome_csv_norm:
                melhor_match = item
                melhor_score = 1.0
                break
            
            if nome_camada_norm in nome_csv_norm or nome_csv_norm in nome_camada_norm:
                score = 0.88
            else:
                score = calcular_similaridade(nome_camada_norm, nome_csv_norm)
            
            if score > melhor_score:
                melhor_score = score
                melhor_match = item

        # Limiar de confiança (68% de similaridade)
        if melhor_match and melhor_score >= 0.68:
            dados = melhor_match["dados"]
            campos = camada.fields()
            
            camada.startEditing()
            for feature in camada.getFeatures():
                for campo in campos:
                    nome_campo = campo.name()
                    
                    # Procura coluna correspondente na planilha ignorando maiúsculas e acentos
                    chave_csv = next((k for k in dados.keys() if normalizar(k) == normalizar(nome_campo)), None)
                    
                    if chave_csv:
                        valor = dados[chave_csv].strip()
                        if valor != "":
                            # Tratamento para campos numéricos que vierem com vírgula do Excel
                            if campo.isNumeric() and "," in valor:
                                valor = valor.replace(".", "").replace(",", ".")
                            
                            feature[nome_campo] = valor
                            camada.updateFeature(feature)
            
            camada.commitChanges()
            atualizadas += 1
            porcentagem = int(melhor_score * 100)
            print(f"[OK {porcentagem}%] '{camada.name()}'  -->  '{melhor_match['original']}'")
        else:
            tentativa = melhor_match['original'] if melhor_match else 'nenhuma'
            print(f"[NÃO ENCONTRADO] '{camada.name()}' (melhor tentativa: '{tentativa}' com {int(melhor_score*100)}%)")

    print(f"\nFinalizado! {atualizadas} de {len(camadas_selecionadas)} camadas foram preenchidas com sucesso.")