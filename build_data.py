"""
Geoportal - Da Serra Ambiental
Automated Data Build Script (build_data.py)

This script scans 'Limites de Projetos' and 'Outros Limites' directories,
validates all GeoJSON files, and outputs a bundled 'geojson_data.js' file
for GitHub Pages deployment.
"""

import json
import glob
import os

def build_dataset():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    projetos_dir = os.path.join(base_dir, 'Limites de Projetos')
    outros_dir = os.path.join(base_dir, 'Outros Limites')

    geoportal_data = {
        'projetos': {},
        'outros': {}
    }

    # Process Limites de Projetos
    if os.path.exists(projetos_dir):
        for filepath in sorted(glob.glob(os.path.join(projetos_dir, '*.geojson'))):
            key = os.path.splitext(os.path.basename(filepath))[0]
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    geoportal_data['projetos'][key] = json.load(f)
                print(f"[OK] Projeto carregado: {key}")
            except Exception as e:
                print(f"[ERRO] Falha ao carregar {key}: {e}")

    # Process Outros Limites
    if os.path.exists(outros_dir):
        for filepath in sorted(glob.glob(os.path.join(outros_dir, '*.geojson'))):
            key = os.path.splitext(os.path.basename(filepath))[0]
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    geoportal_data['outros'][key] = json.load(f)
                print(f"[OK] Outro Limite carregado: {key}")
            except Exception as e:
                print(f"[ERRO] Falha ao carregar {key}: {e}")

    # Write output JS file
    out_path = os.path.join(base_dir, 'geojson_data.js')
    with open(out_path, 'w', encoding='utf-8') as jsf:
        jsf.write('window.GEOPORTAL_DATA = ' + json.dumps(geoportal_data, ensure_ascii=False) + ';')

    print(f"\n[SUCESSO] geojson_data.js gerado com sucesso!")
    print(f"Total Projetos: {len(geoportal_data['projetos'])} | Total Outros Limites: {len(geoportal_data['outros'])}")

if __name__ == '__main__':
    build_dataset()
