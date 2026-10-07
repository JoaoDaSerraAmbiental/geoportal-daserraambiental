"""
Geoportal - Da Serra Ambiental
Automated Data Build Script (build_data.py)

This script recursively scans 'Limites de Projetos' (supporting sub-category folders
like Restauração, Floresta Pronta/Limites de Propriedades, Área da Propriedade, and Quadros de Área)
and 'Outros Limites' directories, links Quadros de Área tables to their matching properties,
validates all GeoJSON files, and outputs a bundled 'geojson_data.js' file for WebGIS deployment.
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
        if "mata" in norm or "nativa" in norm or "vegetac" in norm:
            return "floresta_mata_nativa"
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

    qa_data_map = {}

    # 1. Pre-scan all 'Quadros de Área' files in Limites de Projetos
    if os.path.exists(projetos_dir):
        for root, dirs, files in os.walk(projetos_dir, followlinks=True):
            if 'quadro' in normalize_text(root):
                for gfile in files:
                    if gfile.lower().endswith('.geojson'):
                        qname = os.path.splitext(gfile)[0]
                        clean_name = qname.replace('QA ', '').replace('qa ', '').strip()
                        filepath = os.path.join(root, gfile)
                        try:
                            with open(filepath, 'r', encoding='utf-8') as f:
                                qdata = json.load(f)
                            rows = [feat.get('properties', {}) for feat in qdata.get('features', []) if feat.get('properties')]
                            if rows:
                                qa_data_map[normalize_text(clean_name)] = rows
                                print(f"[QA LINKED] Quadro de Área -> {clean_name} ({len(rows)} linhas)")
                        except Exception as e:
                            print(f"[ERRO QA] Falha ao carregar {gfile}: {e}")

    # 2. Process Limites de Projetos (ignoring 'Quadros de Área' folder for spatial layers)
    if os.path.exists(projetos_dir):
        for root, dirs, files in os.walk(projetos_dir, followlinks=True):
            if 'quadro' in normalize_text(root):
                continue  # Skip QA folder from being added as spatial project layers

            geojsons = [f for f in files if f.lower().endswith('.geojson')]
            if geojsons:
                rel_path = os.path.relpath(root, projetos_dir)
                cat_key = get_category_key(rel_path)

                for gfile in sorted(geojsons):
                    raw_key = os.path.splitext(gfile)[0]
                    key = f"{cat_key}__{raw_key}"
                    filepath = os.path.join(root, gfile)
                    try:
                        with open(filepath, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                        if isinstance(data, dict):
                            data['categoria'] = cat_key
                            
                            # Attach matching Quadro de Área data if present
                            norm_raw = normalize_text(raw_key)
                            matched_qa = qa_data_map.get(norm_raw)
                            if matched_qa:
                                data['quadro_area'] = matched_qa
                                for feat in data.get('features', []):
                                    if 'properties' not in feat or feat['properties'] is None:
                                        feat['properties'] = {}
                                    feat['properties']['_quadro_area'] = matched_qa

                        geoportal_data['projetos'][key] = data
                        has_qa_str = f" [COM QUADRO DE ÁREAS ({len(data['quadro_area'])} temas)]" if 'quadro_area' in data else ""
                        print(f"[OK] Projeto [{cat_key}] -> {key}{has_qa_str}")
                    except Exception as e:
                        print(f"[ERRO] Falha ao carregar {gfile} em {root}: {e}")

    # 3. Process Outros Limites
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

    # Update cache-buster timestamp in index.html so browsers instantly fetch the latest geojson_data.js
    html_path = os.path.join(base_dir, 'index.html')
    if os.path.exists(html_path):
        try:
            import re
            import time
            timestamp = int(time.time())
            with open(html_path, 'r', encoding='utf-8') as hf:
                html_content = hf.read()
            new_html = re.sub(r'geojson_data\.js(\?v=[^\s"\'\>]+)?', f'geojson_data.js?v={timestamp}', html_content)
            if new_html != html_content:
                with open(html_path, 'w', encoding='utf-8') as hf:
                    hf.write(new_html)
                print(f"[CACHE-BUSTER] index.html atualizado com v={timestamp}")
        except Exception as e:
            print(f"[AVISO] Falha ao atualizar cache-buster em index.html: {e}")

    total_proj = len(geoportal_data['projetos'])
    qa_count = sum(1 for p in geoportal_data['projetos'].values() if 'quadro_area' in p)
    print(f"\n[SUCESSO] geojson_data.js gerado com sucesso!")
    print(f"Total Projetos: {total_proj} ({qa_count} com Quadro de Áreas) | Total Outros Limites: {len(geoportal_data['outros'])}")

if __name__ == '__main__':
    build_dataset()
