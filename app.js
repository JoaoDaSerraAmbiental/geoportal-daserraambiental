/**
 * Geoportal - Da Serra Ambiental
 * Main WebGIS Application Script (app.js)
 */

document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------------------------
    // 1. Base Map Tile Providers (Google Satellite & Google Maps)
    // ----------------------------------------------------------------------
    const baseTileLayers = {
        'google-satellite': L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
            maxZoom: 20,
            subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
            attribution: '&copy; Google Satellite'
        }),
        'google-maps': L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
            maxZoom: 20,
            subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
            attribution: '&copy; Google Maps'
        }),
        'google-hybrid': L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
            maxZoom: 20,
            subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
            attribution: '&copy; Google Hybrid'
        }),
        'osm': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors'
        })
    };

    // Initialize Map instance
    const map = L.map('map', {
        center: [-23.18, -46.55], // São Paulo state default view
        zoom: 9,
        layers: [baseTileLayers['google-satellite']], // Default to Google Satellite as requested
        zoomControl: false
    });

    // Add custom zoom control in top-right
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);

    // Custom Map Panes to strictly control Z-Index layer ordering:
    // muniPane (375) < outrosPane (380) < propriedadePane (390) < projetosPane (410)
    map.createPane('muniPane');
    map.getPane('muniPane').style.zIndex = 375;
    map.getPane('muniPane').style.pointerEvents = 'none';

    map.createPane('outrosPane');
    map.getPane('outrosPane').style.zIndex = 380;
    map.getPane('outrosPane').style.pointerEvents = 'auto';

    map.createPane('propriedadePane');
    map.getPane('propriedadePane').style.zIndex = 390;
    map.getPane('propriedadePane').style.pointerEvents = 'auto';

    map.createPane('projetosPane');
    map.getPane('projetosPane').style.zIndex = 410;
    map.getPane('projetosPane').style.pointerEvents = 'auto';

    let activeBaseMapKey = 'google-satellite';
    let currentWaybackLayer = null;
    let isHistoricalActive = false;

    // ----------------------------------------------------------------------
    // 2. Color Palettes por Categoria de Projeto
    // ----------------------------------------------------------------------

    // Verdes claros — Restauração
    const restauracaoColors = [
        '#52c97a', '#4ade80', '#6fcf97', '#57cc99', '#34d399',
        '#74c69d', '#80ed99', '#86efac', '#52b788', '#95d5b2',
        '#a8e6cf', '#3ecf78', '#48bb78', '#22c55e', '#5eead4',
        '#6ee7b7', '#a7f3d0'
    ];

    // Verdes escuros — Floresta Pronta
    const florestaColors = [
        '#166534', '#15803d', '#1b4332', '#145a27', '#2d6a4f',
        '#0d4a20', '#1a6b2e', '#204430', '#1f5c35', '#145c2e',
        '#40916c', '#1a5436', '#1e4d2b', '#224d3d', '#0f4a22',
        '#1a4731', '#1a5e36'
    ];

    // Mapa de categorias — todos os projetos atuais são Restauração.
    // Para mover um projeto para Floresta Pronta, altere o valor abaixo.
    // Exemplo: projectCategory['nome_do_projeto'] = 'floresta_pronta';
    const projectCategory = {};  // preenchido abaixo após sortedProjectKeys

    // Data maps
    const projectLayers = {};
    const outrosLayers = {};
    let allProjectBounds = L.latLngBounds();

    // ----------------------------------------------------------------------
    // 3. Load & Process Spatial Data
    // ----------------------------------------------------------------------
    const geoData = window.GEOPORTAL_DATA || { projetos: {}, outros: {} };

    // Format project names for display
    function formatProjectName(key) {
        let clean = key.replace(/^(restauracao|floresta_pronta|area_propriedade)__/, '');
        if (clean.startsWith('projeto_')) {
            const num = clean.replace('projeto_', '');
            return `Projeto ${num}`;
        }
        return clean.replace(/_/g, ' ');
    }

    // Helper: Calculate polygon area in Hectares
    function calculateGeoJsonArea(geoJsonData) {
        try {
            if (window.turf && geoJsonData) {
                const areaSqMeters = turf.area(geoJsonData);
                return (areaSqMeters / 10000).toFixed(2); // square meters to hectares
            }
        } catch (e) {
            console.warn('Area calculation error:', e);
        }
        return null;
    }

    // Load Limites de Projetos (Ordenados alfabeticamente pelo nome exibido)
    const sortedProjectKeys = Object.keys(geoData.projetos).sort((a, b) => {
        const nameA = formatProjectName(a);
        const nameB = formatProjectName(b);
        return nameA.localeCompare(nameB, 'pt-BR', { numeric: true, sensitivity: 'base' });
    });

    // Categoria lida automaticamente do campo injetado pelo build_data.ps1
    // (campo "categoria" dentro de cada FeatureCollection) ou pelo prefixo da chave
    sortedProjectKeys.forEach(key => {
        let cat = geoData.projetos[key].categoria;
        if (!cat) {
            if (key.startsWith('area_propriedade__')) cat = 'area_propriedade';
            else if (key.startsWith('floresta_pronta__')) cat = 'floresta_pronta';
            else cat = 'restauracao';
        }
        projectCategory[key] = cat;
    });

    // Cor fixa por categoria
    const categoryColor = {
        restauracao:      '#29ff1e',  // verde claro
        floresta_pronta:  '#01a300',  // verde escuro
        area_propriedade: '#dc2626'   // vermelho
    };

    // Controle dinâmico: alternar cores por Status do Projeto
    let colorByStatusEnabled = false;

    function getFeatureStatus(feature) {
        if (!feature || !feature.properties) return '';
        const props = feature.properties;
        for (const k of Object.keys(props)) {
            const normKey = k.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (normKey.includes('status') || normKey.includes('situacao')) {
                const val = props[k];
                if (val) return String(val).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            }
        }
        return '';
    }

    function getFeatureColor(feature, defaultColor) {
        if (!colorByStatusEnabled) return defaultColor;
        const status = getFeatureStatus(feature);
        if (status === 'ativo') {
            return '#f97316'; // Laranja
        } else if (status.includes('finaliz')) {
            return '#2563eb'; // Azul
        }
        return defaultColor;
    }

    function getFeatureStyle(feature, defaultColor, opacity = 0.45, category = '') {
        const isPropriedade = category === 'area_propriedade';
        const c = isPropriedade ? defaultColor : getFeatureColor(feature, defaultColor);
        return {
            color: c,
            weight: isPropriedade ? 1.2 : 2.5,
            opacity: 0.95,
            fillColor: isPropriedade ? 'transparent' : c,
            fillOpacity: isPropriedade ? 0 : opacity
        };
    }

    sortedProjectKeys.forEach((key) => {
        const data = geoData.projetos[key];
        const cat  = projectCategory[key] || 'restauracao';
        const color = categoryColor[cat];

        const projName = formatProjectName(key);
        const featureCount = data.features ? data.features.length : 0;
        const calculatedAreaHa = calculateGeoJsonArea(data);

        // Build Leaflet GeoJSON layer
        const geoLayer = L.geoJSON(data, {
            pane: cat === 'area_propriedade' ? 'propriedadePane' : 'projetosPane',
            style: (feature) => getFeatureStyle(feature, color, 0.45, cat),
            onEachFeature: (feature, layer) => {
                // Interactive hover style
                layer.on({
                    mouseover: (e) => {
                        const l = e.target;
                        if (cat === 'area_propriedade') {
                            l.setStyle({ weight: 2.4, color: '#b91c1c', fillOpacity: 0 });
                        } else {
                            l.setStyle({ weight: 4, fillOpacity: 0.7 });
                            if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                                l.bringToFront();
                            }
                        }
                    },
                    mouseout: (e) => {
                        const l = e.target;
                        const currentOpacity = (projectLayers[key] && projectLayers[key].opacity !== undefined) ? projectLayers[key].opacity : 0.45;
                        l.setStyle(getFeatureStyle(l.feature || feature, color, currentOpacity, cat));
                    }
                });

                // Attach Popup
                layer.bindPopup(() => createPopupContent(feature.properties, projName, getFeatureColor(feature, color)));
            }
        });

        // Expand overall project bounds
        try {
            const bounds = geoLayer.getBounds();
            if (bounds.isValid()) {
                allProjectBounds.extend(bounds);
            }
        } catch (err) {
            console.warn('Invalid bounds for project:', key);
        }

        // Add to map by default (all layers active on load)
        geoLayer.addTo(map);

        // Save reference
        projectLayers[key] = {
            key: key,
            name: projName,
            color: color,
            categoria: cat,
            data: data,
            layer: geoLayer,
            featureCount: featureCount,
            areaHa: calculatedAreaHa,
            visible: true,
            opacity: cat === 'area_propriedade' ? 0 : 0.45
        };
    });

    // Helper function to verify if current map zoom/scale allows municipality info balloon
    // Allowed range: height/scale from 3km down to 300m (Zoom 12 to 15)
    function isMuniZoomAllowed() {
        const z = map.getZoom();
        return z >= 11.5 && z <= 15.5;
    }

    // Load Outros Limites (Municípios SP & UGRHIs)
    const outrosKeys = Object.keys(geoData.outros);
    outrosKeys.forEach((key) => {
        const data = geoData.outros[key];
        let layerName = key;
        let color = '#475569';
        let subtitle = 'Camada de Limite';

        if (key === 'municipios_SP') {
            layerName = 'Municípios de São Paulo (IBGE)';
            color = '#475569'; // Cinza escuro discreto para evitar poluição visual
            subtitle = '645 Municípios';
        } else if (key === 'limites_ughris') {
            layerName = 'UGRHIs (Bacias Hidrográficas SP)';
            color = '#0284c7';
            subtitle = '22 Bacias Hidrográficas';
        } else if (key === 'regioes_hidrograficas_ana') {
            layerName = 'Regiões Hidrográficas (ANA)';
            color = '#0891b2';
            subtitle = 'Regiões Hidrográficas Nacionais';
        }

        const isMuni = (key === 'municipios_SP');

        const geoLayer = L.geoJSON(data, {
            pane: isMuni ? 'muniPane' : 'outrosPane',
            style: {
                color: color,
                weight: isMuni ? 1 : (key === 'limites_ughris' ? 1.8 : 1),
                opacity: isMuni ? 0.75 : 0.8,
                fillColor: color,
                fillOpacity: isMuni ? 0.005 : 0.08
            },
            onEachFeature: (feature, layer) => {
                layer.on({
                    mouseover: (e) => {
                        if (isMuni) {
                            if (isMuniZoomAllowed()) {
                                e.target.setStyle({ weight: 2.2, color: '#38bdf8', fillOpacity: 0.12 });
                            }
                        } else {
                            e.target.setStyle({ weight: 3, color: '#0f172a', fillOpacity: 0.25 });
                        }
                    },
                    mouseout: (e) => {
                        geoLayer.resetStyle(e.target);
                    }
                });
                const props = feature.properties || {};
                if (key === 'limites_ughris' && props.Nome) {
                    layer.bindPopup(`<strong>UGRHI ${props.Codigo || ''}: ${props.Nome}</strong>`);
                } else if (key === 'regioes_hidrograficas_ana' && props.rhi_nm) {
                    layer.bindPopup(`
                        <div class="popup-container">
                            <div class="popup-title">Região Hidrográfica</div>
                            <div class="popup-row"><span class="popup-label">Nome:</span> <span class="popup-value">${props.rhi_nm}</span></div>
                            <div class="popup-row"><span class="popup-label">Sigla:</span> <span class="popup-value">${props.rhi_sg || '-'}</span></div>
                            <div class="popup-row"><span class="popup-label">Área:</span> <span class="popup-value">${props.rhi_ar_km2 ? Number(props.rhi_ar_km2).toLocaleString('pt-BR', {maximumFractionDigits:0}) + ' km²' : '-'}</span></div>
                        </div>
                    `);
                } else if (isMuni && props.NM_MUN) {
                    const muniInfo = (window.MUNICIPIOS_BACIAS && window.MUNICIPIOS_BACIAS[props.NM_MUN]) || {};
                    const areaVal = props.AREA_KM2 || muniInfo.area_km2;
                    const areaKm = areaVal ? Number(areaVal).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + ' km²' : '-';
                    const areaHa = areaVal ? Number(areaVal * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' ha' : '-';
                    const ugrhiDesc = muniInfo.ugrhi_str || 'UGRHI 05 - Piracicaba/Capivari/Jundiaí';
                    const regiaoDesc = muniInfo.regiao_ana || 'Paraná';

                    const tooltipHtml = `
                        <div class="muni-hover-card">
                            <div class="muni-hover-header">
                                <i class="fa-solid fa-landmark"></i>
                                <span>${props.NM_MUN}</span>
                            </div>
                            <div class="muni-hover-body">
                                <div class="muni-hover-row">
                                    <span class="muni-hover-label"><i class="fa-solid fa-chart-area"></i> Área Territorial:</span>
                                    <strong class="muni-hover-val">${areaKm} <span class="muni-hover-sub">(${areaHa})</span></strong>
                                </div>
                                <div class="muni-hover-row">
                                    <span class="muni-hover-label"><i class="fa-solid fa-water"></i> Bacia Hidrográfica (UGRHI):</span>
                                    <strong class="muni-hover-val bacia-highlight">${ugrhiDesc}</strong>
                                </div>
                                <div class="muni-hover-row">
                                    <span class="muni-hover-label"><i class="fa-solid fa-globe"></i> Região Hidrográfica:</span>
                                    <strong class="muni-hover-val">${regiaoDesc}</strong>
                                </div>
                            </div>
                        </div>
                    `;

                    layer.bindTooltip(tooltipHtml, {
                        sticky: true,
                        direction: 'top',
                        offset: [0, -10],
                        className: 'muni-custom-tooltip'
                    });

                    // Guard openTooltip so it ONLY opens when zoom is between 3km and 100m
                    const origOpenTooltip = layer.openTooltip;
                    layer.openTooltip = function() {
                        if (!isMuniZoomAllowed()) return this;
                        return origOpenTooltip.apply(this, arguments);
                    };

                    layer.bindPopup(`<strong>Município: ${props.NM_MUN}</strong><br>Área: ${areaKm} (${areaHa})<br>Bacia (UGRHI): ${ugrhiDesc}<br>Região Hidrográfica: ${regiaoDesc}`);

                    // Guard openPopup so it ONLY opens when zoom is between 3km and 100m
                    const origOpenPopup = layer.openPopup;
                    layer.openPopup = function() {
                        if (!isMuniZoomAllowed()) return this;
                        return origOpenPopup.apply(this, arguments);
                    };
                }
            }
        });

        const isDefaultVisible = (key === 'municipios_SP');

        // Only municipios_SP is active on initial load
        if (isDefaultVisible) {
            geoLayer.addTo(map);
        }

        outrosLayers[key] = {
            key: key,
            name: layerName,
            color: color,
            subtitle: subtitle,
            data: data,
            layer: geoLayer,
            visible: isDefaultVisible,
            opacity: 0.08
        };
    });

    // Control pointer-events on muniPane so clicks/drags pass through cleanly when zoom is outside allowed range
    function updateMuniPointerEvents() {
        const pane = map.getPane('muniPane');
        if (pane) {
            pane.style.pointerEvents = isMuniZoomAllowed() ? 'auto' : 'none';
        }
    }
    updateMuniPointerEvents();

    // Close municipality tooltips/popups and reset highlight when zooming outside allowed scale
    map.on('zoomend', () => {
        updateMuniPointerEvents();
        if (!isMuniZoomAllowed()) {
            map.closeTooltip();
            map.closePopup();
            if (outrosLayers['municipios_SP'] && outrosLayers['municipios_SP'].layer) {
                outrosLayers['municipios_SP'].layer.eachLayer((l) => {
                    outrosLayers['municipios_SP'].layer.resetStyle(l);
                });
            }
        }
    });

    // Update Badges Counters
    const projetosBadge = document.getElementById('projetos-count');
    if (projetosBadge) projetosBadge.textContent = sortedProjectKeys.length;

    const outrosBadge = document.getElementById('outros-count');
    if (outrosBadge) outrosBadge.textContent = outrosKeys.length;

    // Initial zoom to fit all project boundaries
    if (allProjectBounds.isValid()) {
        map.fitBounds(allProjectBounds, { padding: [40, 40] });
    }

    // ----------------------------------------------------------------------
    // 4. Render Left Sidebar Interface (Interface no canto esquerdo)
    // ----------------------------------------------------------------------
    
    // (projectCategory já definido e preenchido na seção 2/3 acima)

    // Render Project Layer List Items by Category
    const restauracaoContainer  = document.getElementById('restauracao-layer-list');
    const florestaContainer     = document.getElementById('floresta-layer-list');
    const propriedadeContainer  = document.getElementById('propriedade-layer-list');
    restauracaoContainer.innerHTML  = '';
    florestaContainer.innerHTML     = '';
    propriedadeContainer.innerHTML  = '';

    function buildLayerItem(key, item) {
        const layerEl = document.createElement('div');
        layerEl.className = 'layer-item';
        layerEl.dataset.key = key;
        layerEl.dataset.name = item.name.toLowerCase();

        const isPropriedade = (item.categoria === 'area_propriedade');
        const badgeStyle = isPropriedade
            ? `background-color: transparent; border: 2.5px solid ${item.color}; box-sizing: border-box;`
            : `background-color: ${item.color};`;

        layerEl.innerHTML = `
            <div class="layer-main-row">
                <div class="layer-left">
                    <input type="checkbox" class="custom-checkbox layer-toggle" data-key="${key}" ${item.visible ? 'checked' : ''}>
                    <div class="color-badge" style="${badgeStyle}"></div>
                    <div>
                        <div class="layer-name" title="${item.name}">${item.name}</div>
                        <div class="layer-subtitle">${item.featureCount} ${item.featureCount === 1 ? 'polígono' : 'polígonos'} ${item.areaHa ? '• ' + item.areaHa + ' ha' : ''}</div>
                    </div>
                </div>
                <div class="layer-actions">
                    <button class="btn-icon btn-zoom-layer" data-key="${key}" title="Aproximar zoom neste projeto">
                        <i class="fa-solid fa-crosshairs"></i>
                    </button>
                    <button class="btn-icon btn-expand-layer" data-key="${key}" title="Ajustar opacidade">
                        <i class="fa-solid fa-sliders"></i>
                    </button>
                </div>
            </div>
            <div class="layer-extra-controls">
                <span class="opacity-label">${isPropriedade ? 'Contorno:' : 'Opacidade:'}</span>
                <input type="range" class="opacity-slider" data-key="${key}" min="0" max="100" value="${isPropriedade ? 95 : 45}">
            </div>
        `;
        return layerEl;
    }

    const emptyMsg = '<div style="padding: 10px 12px; font-size: 0.78rem; color: var(--text-muted); font-style: italic;">Nenhuma camada adicionada ainda.</div>';

    let restauracaoCount  = 0;
    let florestaCount     = 0;
    let propriedadeCount  = 0;

    sortedProjectKeys.forEach((key) => {
        const item = projectLayers[key];
        const cat  = projectCategory[key] || 'restauracao';
        const el   = buildLayerItem(key, item);

        if (cat === 'floresta_pronta') {
            florestaContainer.appendChild(el);
            florestaCount++;
        } else if (cat === 'area_propriedade') {
            propriedadeContainer.appendChild(el);
            propriedadeCount++;
        } else {
            restauracaoContainer.appendChild(el);
            restauracaoCount++;
        }
    });

    // Atualizar badges de contagem
    document.getElementById('restauracao-count').textContent  = restauracaoCount;
    document.getElementById('floresta-count').textContent     = florestaCount;
    document.getElementById('propriedade-count').textContent  = propriedadeCount;

    // Mensagem se categoria vazia
    if (florestaCount    === 0) florestaContainer.innerHTML    = emptyMsg;
    if (propriedadeCount === 0) propriedadeContainer.innerHTML = emptyMsg;


    // Render Outros Limites Layer List Items
    const outrosListContainer = document.getElementById('outros-layer-list');
    outrosListContainer.innerHTML = '';

    outrosKeys.forEach((key) => {
        const item = outrosLayers[key];
        
        const layerEl = document.createElement('div');
        layerEl.className = 'layer-item';
        layerEl.dataset.key = key;

        layerEl.innerHTML = `
            <div class="layer-main-row">
                <div class="layer-left">
                    <input type="checkbox" class="custom-checkbox outros-toggle" data-key="${key}" ${item.visible ? 'checked' : ''}>
                    <div class="color-badge" style="background-color: ${item.color}; ${item.color.toLowerCase() === '#ffffff' ? 'border: 1.5px solid #94a3b8;' : ''}"></div>
                    <div>
                        <div class="layer-name" title="${item.name}">${item.name}</div>
                        <div class="layer-subtitle">${item.subtitle}</div>
                    </div>
                </div>
                <div class="layer-actions">
                    <button class="btn-icon btn-zoom-outros" data-key="${key}" title="Aproximar zoom">
                        <i class="fa-solid fa-crosshairs"></i>
                    </button>
                </div>
            </div>
        `;

        outrosListContainer.appendChild(layerEl);
    });

    // Populate ANA Regiões Hidrográficas Dropdown Selector
    const anaSelect = document.getElementById('ana-select');
    if (anaSelect && outrosLayers['regioes_hidrograficas_ana'] && outrosLayers['regioes_hidrograficas_ana'].data) {
        const features = outrosLayers['regioes_hidrograficas_ana'].data.features || [];
        const sortedAna = features
            .filter(f => f.properties && f.properties.rhi_nm)
            .sort((a, b) => (a.properties.rhi_nm || '').localeCompare(b.properties.rhi_nm || '', 'pt-BR'));

        sortedAna.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.properties.rhi_nm;
            opt.textContent = `RH ${f.properties.rhi_nm}`;
            anaSelect.appendChild(opt);
        });
    }

    // Populate UGRHI Dropdown Selector
    const ugrhiSelect = document.getElementById('ugrhi-select');
    if (ugrhiSelect && outrosLayers['limites_ughris'] && outrosLayers['limites_ughris'].data) {
        const features = outrosLayers['limites_ughris'].data.features || [];
        const sortedUgrhis = features
            .filter(f => f.properties && f.properties.Nome)
            .sort((a, b) => (a.properties.Codigo || 0) - (b.properties.Codigo || 0));

        sortedUgrhis.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.properties.Nome;
            opt.textContent = `UGRHI ${f.properties.Codigo || ''} - ${f.properties.Nome}`;
            ugrhiSelect.appendChild(opt);
        });
    }

    // Populate Municipality Dropdown Selector
    const muniSelect = document.getElementById('muni-select');
    if (muniSelect && outrosLayers['municipios_SP'] && outrosLayers['municipios_SP'].data) {
        const features = outrosLayers['municipios_SP'].data.features || [];
        const sortedMunis = features
            .map(f => f.properties.NM_MUN)
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, 'pt-BR'));

        sortedMunis.forEach(muni => {
            const opt = document.createElement('option');
            opt.value = muni;
            opt.textContent = muni;
            muniSelect.appendChild(opt);
        });
    }

    // Update Footer Summary Statistics
    updateFooterStats();
    updateAllCategoryButtons();

    function updateFooterStats() {
        let restauracaoHa = 0;
        let florestaHa = 0;

        Object.values(projectLayers).forEach(p => {
            if (p.visible && p.areaHa) {
                const area = parseFloat(p.areaHa);
                if (!isNaN(area)) {
                    if (p.categoria === 'restauracao') {
                        restauracaoHa += area;
                    } else if (p.categoria === 'floresta_pronta') {
                        florestaHa += area;
                    }
                }
            }
        });

        const fmt = (val) => val > 0
            ? `${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha`
            : '0,00 ha';

        const restEl = document.getElementById('restauracao-area-display');
        if (restEl) restEl.textContent = fmt(restauracaoHa);

        const florEl = document.getElementById('floresta-area-display');
        if (florEl) florEl.textContent = fmt(florestaHa);
    }

    // ----------------------------------------------------------------------
    // 5. UI Event Listeners
    // ----------------------------------------------------------------------

    // Base Map Switcher
    document.querySelectorAll('.basemap-card').forEach(card => {
        card.addEventListener('click', () => {
            const key = card.dataset.basemap;
            if (key === activeBaseMapKey && !isHistoricalActive) return;

            if (isHistoricalActive && currentWaybackLayer && map.hasLayer(currentWaybackLayer)) {
                map.removeLayer(currentWaybackLayer);
                isHistoricalActive = false;
                const timelineBadge = document.getElementById('timeline-active-badge');
                const timelineTitle = document.getElementById('timeline-active-title');
                const timelineSubtitle = document.getElementById('timeline-active-subtitle');
                const timelineRange = document.getElementById('timeline-range');
                const btnToggleTimeline = document.getElementById('btn-toggle-timeline');
                const timelinePanel = document.getElementById('timeline-floating-panel');
                if (timelineBadge) timelineBadge.textContent = '2026';
                if (timelineTitle) timelineTitle.textContent = 'Google Satélite (Atual)';
                if (timelineSubtitle) timelineSubtitle.textContent = 'Imagens de satélite mais recentes';
                if (timelineRange) timelineRange.value = 12;
                if (timelinePanel && timelinePanel.classList.contains('hidden') && btnToggleTimeline) {
                    btnToggleTimeline.classList.remove('active');
                }
            }

            document.querySelectorAll('.basemap-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');

            if (baseTileLayers[activeBaseMapKey] && map.hasLayer(baseTileLayers[activeBaseMapKey])) {
                map.removeLayer(baseTileLayers[activeBaseMapKey]);
            }
            baseTileLayers[key].addTo(map);
            activeBaseMapKey = key;
        });
    });

    // Accordion Sections Collapse / Expand
    document.querySelectorAll('.accordion-header').forEach(header => {
        header.addEventListener('click', (e) => {
            if (e.target.closest('.btn-cat-toggle') || e.target.closest('button')) return;
            const section = header.closest('.accordion-section');
            if (section) section.classList.toggle('active');
        });
    });

    // Alternar todas as camadas de uma categoria (botão no cabeçalho do acordeão)
    function toggleCategory(cat) {
        const catKeys = Object.keys(projectLayers).filter(key => {
            const item = projectLayers[key];
            const itemCat = item.categoria || projectCategory[key] || 'restauracao';
            return itemCat === cat;
        });

        if (catKeys.length === 0) return;

        // Se todas estiverem ativas, desativa; senão, ativa todas
        const allActive = catKeys.every(k => projectLayers[k].visible);
        const targetState = !allActive;

        catKeys.forEach(key => {
            const item = projectLayers[key];
            item.visible = targetState;
            if (targetState) {
                if (!map.hasLayer(item.layer)) {
                    map.addLayer(item.layer);
                    if (item.categoria === 'area_propriedade') {
                        item.layer.bringToBack();
                    }
                }
            } else {
                if (map.hasLayer(item.layer)) {
                    map.removeLayer(item.layer);
                }
            }
        });

        // Atualizar checkboxes DOM correspondentes
        let containerId = '';
        if (cat === 'restauracao') containerId = 'restauracao-layer-list';
        else if (cat === 'floresta_pronta') containerId = 'floresta-layer-list';
        else if (cat === 'area_propriedade') containerId = 'propriedade-layer-list';

        if (containerId) {
            const container = document.getElementById(containerId);
            if (container) {
                container.querySelectorAll('.layer-toggle').forEach(chk => {
                    chk.checked = targetState;
                });
            }
        }

        updateCategoryButtonState(cat);
        updateFooterStats();
    }

    function updateCategoryButtonState(cat) {
        const catKeys = Object.keys(projectLayers).filter(key => {
            const item = projectLayers[key];
            const itemCat = item.categoria || projectCategory[key] || 'restauracao';
            return itemCat === cat;
        });

        const btn = document.querySelector(`.btn-cat-toggle[data-category="${cat}"]`);
        if (!btn || catKeys.length === 0) return;

        const allActive = catKeys.every(k => projectLayers[k].visible);
        btn.classList.toggle('active', allActive);
        btn.title = allActive
            ? 'Desativar todas as camadas deste bloco'
            : 'Ativar todas as camadas deste bloco';
    }

    function updateAllCategoryButtons() {
        ['restauracao', 'floresta_pronta', 'area_propriedade'].forEach(cat => updateCategoryButtonState(cat));
    }

    // Interceptar clique nos botões de alternar categoria na fase de captura (capture phase)
    // Isso garante que e.stopPropagation() e e.stopImmediatePropagation() impeçam qualquer clique
    // de alcançar o cabeçalho do acordeão ou acionar abertura/fechamento de abas.
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-cat-toggle');
        if (btn) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            const cat = btn.dataset.category;
            if (cat) {
                toggleCategory(cat);
            }
        }
    }, true);

    // Project Checkbox Toggle (delegado no sidebar-body para cobrir ambas categorias)
    document.querySelector('.sidebar-body').addEventListener('change', (e) => {
        if (e.target.classList.contains('layer-toggle')) {
            const key = e.target.dataset.key;
            const isChecked = e.target.checked;
            const item = projectLayers[key];

            if (item) {
                item.visible = isChecked;
                if (isChecked) {
                    map.addLayer(item.layer);
                    if (item.categoria === 'area_propriedade') {
                        item.layer.bringToBack();
                    }
                } else {
                    map.removeLayer(item.layer);
                }
                updateAllCategoryButtons();
                updateFooterStats();
            }
        }
    });

    // Outros Checkbox Toggle
    outrosListContainer.addEventListener('change', (e) => {
        if (e.target.classList.contains('outros-toggle')) {
            const key = e.target.dataset.key;
            const isChecked = e.target.checked;
            const item = outrosLayers[key];

            if (item) {
                item.visible = isChecked;
                if (isChecked) {
                    map.addLayer(item.layer);
                } else {
                    map.removeLayer(item.layer);
                }
            }
        }
    });

    // Zoom / Expand buttons (delegado no sidebar-body para cobrir ambas categorias)
    document.querySelector('.sidebar-body').addEventListener('click', (e) => {
        const zoomBtn = e.target.closest('.btn-zoom-layer');
        if (zoomBtn) {
            const key = zoomBtn.dataset.key;
            const item = projectLayers[key];
            if (item && item.layer) {
                const bounds = item.layer.getBounds();
                if (bounds.isValid()) {
                    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
                }
            }
        }

        const expandBtn = e.target.closest('.btn-expand-layer');
        if (expandBtn) {
            const layerItem = expandBtn.closest('.layer-item');
            layerItem.classList.toggle('expanded');
        }
    });

    // Zoom to Outros Layer Button Click
    outrosListContainer.addEventListener('click', (e) => {
        const zoomBtn = e.target.closest('.btn-zoom-outros');
        if (zoomBtn) {
            const key = zoomBtn.dataset.key;
            const item = outrosLayers[key];
            if (item && item.layer) {
                const bounds = item.layer.getBounds();
                if (bounds.isValid()) {
                    map.fitBounds(bounds, { padding: [30, 30] });
                }
            }
        }
    });

    // Opacity Slider Input (delegado no sidebar-body)
    document.querySelector('.sidebar-body').addEventListener('input', (e) => {
        if (e.target.classList.contains('opacity-slider')) {
            const key = e.target.dataset.key;
            const val = parseFloat(e.target.value) / 100;
            const item = projectLayers[key];

            if (item && item.layer) {
                item.opacity = val;
                if (item.categoria === 'area_propriedade') {
                    item.layer.setStyle({ opacity: Math.max(0.1, val), fillOpacity: 0 });
                } else {
                    item.layer.setStyle({ fillOpacity: val });
                }
            }
        }
    });



    // Global Toolbar Buttons: Select All / Deselect All / Fit Bounds
    document.getElementById('btn-select-all').addEventListener('click', () => {
        Object.keys(projectLayers).forEach(key => {
            const item = projectLayers[key];
            item.visible = true;
            if (!map.hasLayer(item.layer)) {
                map.addLayer(item.layer);
                if (item.categoria === 'area_propriedade') {
                    item.layer.bringToBack();
                }
            }
        });
        document.querySelectorAll('.layer-toggle').forEach(chk => chk.checked = true);
        updateAllCategoryButtons();
        updateFooterStats();
    });

    document.getElementById('btn-deselect-all').addEventListener('click', () => {
        Object.keys(projectLayers).forEach(key => {
            const item = projectLayers[key];
            item.visible = false;
            if (map.hasLayer(item.layer)) {
                map.removeLayer(item.layer);
            }
        });
        document.querySelectorAll('.layer-toggle').forEach(chk => chk.checked = false);
        updateAllCategoryButtons();
        updateFooterStats();
    });

    document.getElementById('btn-fit-bounds').addEventListener('click', () => {
        const activeBounds = L.latLngBounds();
        Object.values(projectLayers).forEach(p => {
            if (p.visible && p.layer) {
                const b = p.layer.getBounds();
                if (b.isValid()) activeBounds.extend(b);
            }
        });
        if (activeBounds.isValid()) {
            map.fitBounds(activeBounds, { padding: [40, 40] });
        }
    });

    // Botão de alternância: Cor por Status do Projeto
    const btnToggleStatus = document.getElementById('btn-toggle-status');
    if (btnToggleStatus) {
        btnToggleStatus.addEventListener('click', () => {
            colorByStatusEnabled = !colorByStatusEnabled;
            btnToggleStatus.classList.toggle('active', colorByStatusEnabled);

            btnToggleStatus.title = colorByStatusEnabled
                ? 'Clique para voltar às cores normais das categorias'
                : 'Colorir camadas por Status do Projeto (Laranja = Ativo, Azul = Em finalização/Finalizado)';

            updateAllProjectLayerStyles();
        });
    }

    function updateAllProjectLayerStyles() {
        Object.keys(projectLayers).forEach(key => {
            const item = projectLayers[key];
            if (item && item.layer) {
                const cat = item.categoria || projectCategory[key] || 'restauracao';
                const currentOpacity = (item.opacity !== undefined) ? item.opacity : (cat === 'area_propriedade' ? 0 : 0.45);
                item.layer.setStyle((feat) => getFeatureStyle(feat, item.color, currentOpacity, cat));
            }
        });
    }

    // Jump to Região Hidrográfica (ANA)
    const anaSelectEl = document.getElementById('ana-select');
    if (anaSelectEl) {
        anaSelectEl.addEventListener('change', (e) => {
            const rhiName = e.target.value;
            if (!rhiName) return;

            const anaItem = outrosLayers['regioes_hidrograficas_ana'];
            if (anaItem) {
                if (!anaItem.visible && !map.hasLayer(anaItem.layer)) {
                    map.addLayer(anaItem.layer);
                    anaItem.visible = true;
                    const chk = document.querySelector(`.outros-toggle[data-key="regioes_hidrograficas_ana"]`);
                    if (chk) chk.checked = true;
                }
                if (anaItem.layer) {
                    anaItem.layer.eachLayer(l => {
                        if (l.feature && l.feature.properties && l.feature.properties.rhi_nm === rhiName) {
                            const bounds = l.getBounds();
                            if (bounds.isValid()) {
                                map.fitBounds(bounds, { padding: [40, 40] });
                                l.openPopup();
                            }
                        }
                    });
                }
            }
        });
    }

    // Jump to UGRHI (Bacia Hidrográfica)
    const ugrhiSelectEl = document.getElementById('ugrhi-select');
    if (ugrhiSelectEl) {
        ugrhiSelectEl.addEventListener('change', (e) => {
            const ugrhiName = e.target.value;
            if (!ugrhiName) return;

            const ugrhiItem = outrosLayers['limites_ughris'];
            if (ugrhiItem) {
                if (!ugrhiItem.visible && !map.hasLayer(ugrhiItem.layer)) {
                    map.addLayer(ugrhiItem.layer);
                    ugrhiItem.visible = true;
                    const chk = document.querySelector(`.outros-toggle[data-key="limites_ughris"]`);
                    if (chk) chk.checked = true;
                }
                if (ugrhiItem.layer) {
                    ugrhiItem.layer.eachLayer(l => {
                        if (l.feature && l.feature.properties && l.feature.properties.Nome === ugrhiName) {
                            const bounds = l.getBounds();
                            if (bounds.isValid()) {
                                map.fitBounds(bounds, { padding: [40, 40] });
                                l.openPopup();
                            }
                        }
                    });
                }
            }
        });
    }

    // Jump to Municipality
    if (muniSelect) {
        muniSelect.addEventListener('change', (e) => {
            const muniName = e.target.value;
            if (!muniName) return;

            const outrosItem = outrosLayers['municipios_SP'];
            if (outrosItem) {
                if (!outrosItem.visible && !map.hasLayer(outrosItem.layer)) {
                    map.addLayer(outrosItem.layer);
                    outrosItem.visible = true;
                    const chk = document.querySelector(`.outros-toggle[data-key="municipios_SP"]`);
                    if (chk) chk.checked = true;
                }
                if (outrosItem.layer) {
                    outrosItem.layer.eachLayer(l => {
                        if (l.feature && l.feature.properties && l.feature.properties.NM_MUN === muniName) {
                            const bounds = l.getBounds();
                            if (bounds.isValid()) {
                                map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
                                l.openPopup();
                            }
                        }
                    });
                }
            }
        });
    }

    // Toggle Sidebar Open / Collapse
    const sidebar = document.getElementById('sidebar');
    const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
    const sidebarOpenBtn = document.getElementById('sidebar-open-btn');

    toggleSidebarBtn.addEventListener('click', () => {
        sidebar.classList.add('collapsed');
        sidebarOpenBtn.classList.remove('hidden');
        setTimeout(() => map.invalidateSize(), 250);
    });

    sidebarOpenBtn.addEventListener('click', () => {
        sidebar.classList.remove('collapsed');
        sidebarOpenBtn.classList.add('hidden');
        setTimeout(() => map.invalidateSize(), 250);
    });

    // Floating Map Tools: Recenter & Fullscreen
    const btnRecenter = document.getElementById('btn-recenter');
    if (btnRecenter) {
        btnRecenter.addEventListener('click', () => {
            if (allProjectBounds.isValid()) {
                map.fitBounds(allProjectBounds, { padding: [40, 40] });
            }
        });
    }

    const btnFullscreen = document.getElementById('btn-fullscreen');
    if (btnFullscreen) {
        btnFullscreen.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen();
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
        });
    }

    // Map Mousemove Status (Coordinates & Altitude)
    const statusLat = document.getElementById('status-lat');
    const statusLng = document.getElementById('status-lng');
    const statusAlt = document.getElementById('status-alt');
    const statusZoom = document.getElementById('status-zoom');

    let elevationCache = {};
    let elevationTimer = null;

    function fetchElevation(lat, lng) {
        const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
        if (elevationCache[key] !== undefined) {
            if (statusAlt) statusAlt.textContent = `${elevationCache[key]} m`;
            return;
        }

        if (elevationTimer) clearTimeout(elevationTimer);
        elevationTimer = setTimeout(() => {
            fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}`)
                .then(r => r.json())
                .then(d => {
                    if (d && d.elevation && d.elevation.length > 0) {
                        const ele = Math.round(d.elevation[0]);
                        elevationCache[key] = ele;
                        if (statusAlt) statusAlt.textContent = `${ele} m`;
                    }
                })
                .catch(() => {
                    if (statusAlt) statusAlt.textContent = '-- m';
                });
        }, 200);
    }

    map.on('mousemove', (e) => {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        if (statusLat) statusLat.textContent = lat.toFixed(5);
        if (statusLng) statusLng.textContent = lng.toFixed(5);
        fetchElevation(lat, lng);
    });

    map.on('zoomend', () => {
        if (statusZoom) statusZoom.textContent = map.getZoom();
    });

    function formatAttributeKey(key) {
        if (!key) return '';
        // Normaliza caracteres corrompidos comuns de codificação (ex: ÂÁrea -> Área, ?rea -> Área)
        return key
            .replace(/Â/g, '')
            .replace(/Ã/g, 'Á')
            .replace(/\?rea/gi, 'Área')
            .replace(/^rea\b/gi, 'Área')
            .trim();
    }

    function formatAttributeValue(val) {
        if (val === null || val === undefined || val === '') {
            return '<span style="color: #94a3b8;">-</span>';
        }
        if (typeof val === 'number') {
            return val.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
        }
        return String(val);
    }

    function createPopupContent(props, projName, color) {
        let content = `<div class="popup-container project-popup">`;
        content += `<div class="popup-title" style="color: ${color}; border-left: 4px solid ${color}; padding-left: 8px;">${projName}</div>`;
        content += `<div class="popup-subtitle-info"><i class="fa-solid fa-table"></i> Tabela de Atributos</div>`;

        content += `<table class="popup-attribute-table"><tbody>`;
        const entries = Object.entries(props || {});
        if (entries.length === 0) {
            content += `<tr><td colspan="2" style="text-align: center; color: #94a3b8; padding: 8px;">Sem atributos cadastrados</td></tr>`;
        } else {
            for (const [key, val] of entries) {
                content += `
                    <tr>
                        <th>${formatAttributeKey(key)}</th>
                        <td>${formatAttributeValue(val)}</td>
                    </tr>
                `;
            }
        }
        content += `</tbody></table>`;
        content += `</div>`;
        return content;
    }

    // ----------------------------------------------------------------------
    // 6. Imagens Históricas de Satélite e Ortofotos (2007 - 2026)
    // ----------------------------------------------------------------------
    const historicalSources = [
        {
            type: 'wms',
            year: '2007',
            date: '2007-06-01',
            label: '2007 - Ortofoto CDHU Bragantina',
            title: 'Ortofoto Aerofotogramétrica (2007 - CDHU)',
            subtitle: 'Aerolevantamento oficial CDHU (Região Bragantina / Joanópolis)',
            wmsLayer: 'datageoimg:ORTOFOTOS_CDHU_BRAGANTINA_2007',
            wmsUrl: 'https://datageo.ambiente.sp.gov.br/geoimage/datageoimg/ows',
            attribution: '&copy; CDHU / DataGEO (2007)'
        },
        {
            type: 'wms',
            year: '2010',
            date: '2010-08-01',
            label: '2010 - Ortofoto EMPLASA Estado SP',
            title: 'Ortofoto Aerofotogramétrica (2010 - EMPLASA)',
            subtitle: 'Aerolevantamento oficial do Estado de São Paulo',
            wmsLayer: 'datageoimg:ORTOFOTOS_EMPLASA_2010',
            wmsUrl: 'https://datageo.ambiente.sp.gov.br/geoimage/datageoimg/ows',
            attribution: '&copy; EMPLASA / DataGEO (2010)'
        },
        {
            type: 'wayback',
            year: '2011',
            date: '2011-09-27',
            label: '2011 - Satélite WorldView-2 (27/09/2011)',
            title: 'Satélite DigitalGlobe WorldView-2 (27/09/2011 - 50cm)',
            subtitle: 'Sobrevoo de satélite de altíssima resolução DigitalGlobe',
            releaseNum: '10',
            attribution: '&copy; DigitalGlobe WorldView-2 / Esri'
        },
        { type: 'wayback', year: '2014', date: '2014-12-30', label: '2014 - Satélite (30/12/2014)', releaseNum: '5844', title: 'Imagens de Satélite (30/12/2014)', subtitle: 'Snapshot Histórico Esri Wayback (2014)' },
        { type: 'wayback', year: '2015', date: '2015-12-16', label: '2015 - Satélite (16/12/2015)', releaseNum: '28163', title: 'Imagens de Satélite (16/12/2015)', subtitle: 'Snapshot Histórico Esri Wayback (2015)' },
        { type: 'wayback', year: '2016', date: '2016-12-20', label: '2016 - Satélite (20/12/2016)', releaseNum: '18966', title: 'Imagens de Satélite (20/12/2016)', subtitle: 'Snapshot Histórico Esri Wayback (2016)' },
        { type: 'wayback', year: '2017', date: '2017-11-16', label: '2017 - Satélite (16/11/2017)', releaseNum: '25521', title: 'Imagens de Satélite (16/11/2017)', subtitle: 'Snapshot Histórico Esri Wayback (2017)' },
        { type: 'wayback', year: '2018', date: '2018-12-14', label: '2018 - Satélite (14/12/2018)', releaseNum: '23448', title: 'Imagens de Satélite (14/12/2018)', subtitle: 'Snapshot Histórico Esri Wayback (2018)' },
        { type: 'wayback', year: '2019', date: '2019-12-12', label: '2019 - Satélite (12/12/2019)', releaseNum: '4756', title: 'Imagens de Satélite (12/12/2019)', subtitle: 'Snapshot Histórico Esri Wayback (2019)' },
        { type: 'wayback', year: '2020', date: '2020-12-16', label: '2020 - Satélite (16/12/2020)', releaseNum: '29260', title: 'Imagens de Satélite (16/12/2020)', subtitle: 'Snapshot Histórico Esri Wayback (2020)' },
        { type: 'wayback', year: '2021', date: '2021-12-21', label: '2021 - Satélite (21/12/2021)', releaseNum: '26120', title: 'Imagens de Satélite (21/12/2021)', subtitle: 'Snapshot Histórico Esri Wayback (2021)' },
        { type: 'wayback', year: '2022', date: '2022-12-14', label: '2022 - Satélite (14/12/2022)', releaseNum: '45134', title: 'Imagens de Satélite (14/12/2022)', subtitle: 'Snapshot Histórico Esri Wayback (2022)' },
        { type: 'wayback', year: '2023', date: '2023-12-07', label: '2023 - Satélite (07/12/2023)', releaseNum: '56102', title: 'Imagens de Satélite (07/12/2023)', subtitle: 'Snapshot Histórico Esri Wayback (2023)' },
        { type: 'wayback', year: '2024', date: '2024-12-12', label: '2024 - Satélite (12/12/2024)', releaseNum: '16453', title: 'Imagens de Satélite (12/12/2024)', subtitle: 'Snapshot Histórico Esri Wayback (2024)' },
        { type: 'wayback', year: '2025', date: '2025-12-18', label: '2025 - Satélite (18/12/2025)', releaseNum: '13192', title: 'Imagens de Satélite (18/12/2025)', subtitle: 'Snapshot Histórico Esri Wayback (2025)' },
        { type: 'wayback', year: '2026', date: '2026-08-05', label: '2026 - Satélite (05/08/2026)', releaseNum: '26334', title: 'Imagens de Satélite (05/08/2026)', subtitle: 'Snapshot Histórico Esri Wayback (2026)' }
    ];

    const btnToggleTimeline   = document.getElementById('btn-toggle-timeline');
    const timelinePanel       = document.getElementById('timeline-floating-panel');
    const timelineCloseBtn    = document.getElementById('timeline-close-btn');
    const timelineRange       = document.getElementById('timeline-range');
    const timelineSelect      = document.getElementById('timeline-select');
    const timelineBadge       = document.getElementById('timeline-active-badge');
    const timelineTitle       = document.getElementById('timeline-active-title');
    const timelineSubtitle    = document.getElementById('timeline-active-subtitle');
    const btnResetTimeline    = document.getElementById('btn-reset-timeline');

    // Populate timeline select dropdown
    function populateTimelineSelect() {
        if (!timelineSelect) return;
        timelineSelect.innerHTML = '';

        historicalSources.forEach((src, idx) => {
            const opt = document.createElement('option');
            opt.value = idx;
            opt.textContent = src.label;
            timelineSelect.appendChild(opt);
        });

        // Add option for Atual
        const optAtual = document.createElement('option');
        optAtual.value = historicalSources.length;
        optAtual.textContent = '2026 - Google Satélite (Atual)';
        timelineSelect.appendChild(optAtual);
        timelineSelect.value = historicalSources.length;
    }

    populateTimelineSelect();

    function setHistoricalLayer(item) {
        if (currentWaybackLayer && map.hasLayer(currentWaybackLayer)) {
            map.removeLayer(currentWaybackLayer);
        }

        if (item.type === 'wms') {
            currentWaybackLayer = L.tileLayer.wms(item.wmsUrl, {
                layers: item.wmsLayer,
                format: 'image/jpeg',
                transparent: false,
                version: '1.1.1',
                maxZoom: 20,
                attribution: item.attribution
            });
        } else {
            const tileUrl = `https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/${item.releaseNum}/{z}/{y}/{x}`;
            currentWaybackLayer = L.tileLayer(tileUrl, {
                maxZoom: 20,
                maxNativeZoom: 18,
                attribution: item.attribution || `&copy; Esri World Imagery Wayback (${item.label})`
            });
        }

        // Remove active base tile layer
        if (baseTileLayers[activeBaseMapKey] && map.hasLayer(baseTileLayers[activeBaseMapKey])) {
            map.removeLayer(baseTileLayers[activeBaseMapKey]);
        }

        currentWaybackLayer.addTo(map);
        isHistoricalActive = true;

        // Deselect base map cards visual state
        document.querySelectorAll('.basemap-card').forEach(c => c.classList.remove('active'));

        // Update UI displays
        if (timelineBadge) timelineBadge.textContent = item.year;
        if (timelineTitle) timelineTitle.textContent = item.title;
        if (timelineSubtitle) timelineSubtitle.textContent = item.subtitle;
        if (btnToggleTimeline) btnToggleTimeline.classList.add('active');
    }

    function resetToDefaultSatellite() {
        if (currentWaybackLayer && map.hasLayer(currentWaybackLayer)) {
            map.removeLayer(currentWaybackLayer);
        }
        isHistoricalActive = false;

        // Restore Google Satellite
        if (baseTileLayers[activeBaseMapKey]) {
            baseTileLayers[activeBaseMapKey].addTo(map);
        }

        // Restore basemap card active state
        document.querySelectorAll('.basemap-card').forEach(card => {
            if (card.dataset.basemap === activeBaseMapKey) {
                card.classList.add('active');
            } else {
                card.classList.remove('active');
            }
        });

        if (timelineBadge) timelineBadge.textContent = '2026';
        if (timelineTitle) timelineTitle.textContent = 'Google Satélite (Atual)';
        if (timelineSubtitle) timelineSubtitle.textContent = 'Imagens de satélite mais recentes';
        if (timelineRange) timelineRange.value = historicalSources.length;
        if (timelineSelect) timelineSelect.value = historicalSources.length;
        if (btnToggleTimeline && (!timelinePanel || timelinePanel.classList.contains('hidden'))) {
            btnToggleTimeline.classList.remove('active');
        }
    }

    // Event Listeners for Timeline
    if (btnToggleTimeline) {
        btnToggleTimeline.addEventListener('click', () => {
            if (timelinePanel) {
                const isHidden = timelinePanel.classList.toggle('hidden');
                btnToggleTimeline.classList.toggle('active', !isHidden || isHistoricalActive);
            }
        });
    }

    if (timelineCloseBtn) {
        timelineCloseBtn.addEventListener('click', () => {
            if (timelinePanel) timelinePanel.classList.add('hidden');
            if (btnToggleTimeline && !isHistoricalActive) {
                btnToggleTimeline.classList.remove('active');
            }
        });
    }

    if (timelineRange) {
        timelineRange.addEventListener('input', (e) => {
            const idx = parseInt(e.target.value, 10);
            if (idx >= historicalSources.length) {
                resetToDefaultSatellite();
                if (timelineSelect) timelineSelect.value = historicalSources.length;
            } else {
                const item = historicalSources[idx];
                if (item) {
                    setHistoricalLayer(item);
                    if (timelineSelect) timelineSelect.value = idx;
                }
            }
        });
    }

    if (timelineSelect) {
        timelineSelect.addEventListener('change', (e) => {
            const idx = parseInt(e.target.value, 10);
            if (idx >= historicalSources.length) {
                resetToDefaultSatellite();
            } else {
                const item = historicalSources[idx];
                if (item) setHistoricalLayer(item);
            }
            if (timelineRange) timelineRange.value = idx;
        });
    }

    if (btnResetTimeline) {
        btnResetTimeline.addEventListener('click', () => {
            resetToDefaultSatellite();
            if (timelineRange) timelineRange.value = historicalSources.length;
            if (timelineSelect) timelineSelect.value = historicalSources.length;
        });
    }
});
