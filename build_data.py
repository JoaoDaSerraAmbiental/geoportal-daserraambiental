"""
Geoportal - Da Serra Ambiental
Automated Data Build Script (build_data.py)

This script scans 'Limites de Projetos' (supporting sub-category folders)
and 'Outros Limites' directories, validates all GeoJSON files, and outputs
a bundled 'geojson_data.js' file for WebGIS deployment.
"""

import json
import glob
import os
import unicodedata

def normalize_text(text):
    if not text:
        return ""
    nfkd = unicodedata.normalize('NFD', text)
    return "".join([c for c in nfkd if not unicodedata.combining(c)]).lower().strip()

def get_category_key(folder_name):
    norm = normalize_text(folder_name)
    if "floresta" in norm:
        return "floresta_pronta"
    elif "propriedad" in norm or "area" in norm:
        return "area_propriedade"
    else:
        return "restauracao"

def build_dataset():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    projetos_dir = os.path.join(base_dir, 'Limites de Projetos')
    outros_dir = os.path.join(base_dir, 'Outros Limites')

    geoportal_data = {
        'projetos': {},
        'outros': {}
    }

    # Process Limites de Projetos (supporting subfolder categories)
    if os.path.exists(projetos_dir):
        for root, dirs, files in os.walk(projetos_dir):
            geojsons = [f for f in files if f.lower().endswith('.geojson')]
            if geojsons:
                rel_path = os.path.relpath(root, projetos_dir)
                folder_name = os.path.basename(root) if rel_path != '.' else 'Restauração'
                cat_key = get_category_key(folder_name)

                for gfile in sorted(geojsons):
                    raw_key = os.path.splitext(gfile)[0]
                    # Format key with category prefix
                    key = f"{cat_key}__{raw_key}"
                    filepath = os.path.join(root, gfile)
                    try:
                        with open(filepath, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                            if isinstance(data, dict):
                                data['categoria'] = cat_key
                            geoportal_data['projetos'][key] = data
                        print(f"[OK] Projeto [{cat_key}] -> {key}")
                    except Exception as e:
                        print(f"[ERRO] Falha ao carregar {gfile} em {folder_name}: {e}")

    # Process Outros Limites
    if os.path.exists(outros_dir):
        for filepath in sorted(glob.glob(os.path.join(outros_dir, '*.geojson'))):
            key = os.path.splitext(os.path.basename(filepath))[0]
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    geoportal_data['outros'][key] = json.load(f)
                print(f"[OK] Outro Limite -> {key}")
            except Exception as e:
                print(f"[ERRO] Falha ao carregar {key}: {e}")

    # Write output JS file
    out_path = os.path.join(base_dir, 'geojson_data.js')
    with open(out_path, 'w', encoding='utf-8') as jsf:
        jsf.write('window.GEOPORTAL_DATA = ' + json.dumps(geoportal_data, ensure_ascii=False) + ';')

    total_proj = len(geoportal_data['projetos'])
    print(f"\n[SUCESSO] geojson_data.js gerado com sucesso!")
    print(f"Total Projetos: {total_proj} | Total Outros Limites: {len(geoportal_data['outros'])}")

if __name__ == '__main__':
    build_dataset()
