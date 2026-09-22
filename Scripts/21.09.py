from qgis.core import QgsMapLayerStyle, QgsProject
from qgis.utils import iface

# Camada com o estilo modelo
NOME_CAMADA_ORIGEM = "Valinhos - Pedreira 3"

# Localiza a camada no projeto
camadas_encontradas = QgsProject.instance().mapLayersByName(NOME_CAMADA_ORIGEM)

if not camadas_encontradas:
    print(f"Erro: Camada '{NOME_CAMADA_ORIGEM}' não foi encontrada no projeto. Verifique o nome exato no painel.")
else:
    modelo = camadas_encontradas[0]
    
    # Captura a simbologia, transparência, contornos e rótulos
    estilo = QgsMapLayerStyle()
    estilo.readFromLayer(modelo)

    # Identifica as camadas selecionadas pelo usuário no painel de camadas
    camadas_selecionadas = iface.layerTreeView().selectedLayers()
    
    contagem = 0
    for camada in camadas_selecionadas:
        if camada != modelo:
            estilo.writeToLayer(camada)
            camada.triggerRepaint()
            contagem += 1

    print(f"Concluído! O estilo de '{NOME_CAMADA_ORIGEM}' foi aplicado em {contagem} camada(s).")