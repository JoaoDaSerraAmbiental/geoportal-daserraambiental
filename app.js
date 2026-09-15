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

    let activeBaseMapKey = 'google-satellite';

    // ----------------------------------------------------------------------
    // 2. Color Palette for Projects
    // ----------------------------------------------------------------------
    const projectColors = [
        '#27ae60', '#e74c3c', '#2980b9', '#8e44ad', '#f39c12',
        '#16a085', '#d35400', '#c0392b', '#7f8c8d', '#2c3e50',
        '#00b894', '#6c5ce7', '#fdcb6e', '#e84393', '#00cec9',
        '#ff7675', '#a29bfe', '#55efc4'
    ];

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
        if (key.startsWith('projeto_')) {
            const num = key.replace('projeto_', '');
            return `Projeto ${num}`;
        }
        return key.replace(/_/g, ' ');
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

    // Load Limites de Projetos (Ordenados alfabeticamente)
    const sortedProjectKeys = Object.keys(geoData.projetos).sort((a, b) => {
        return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
    });

    sortedProjectKeys.forEach((key, index) => {
        const data = geoData.projetos[key];
        const color = projectColors[index % projectColors.length];
        const projName = formatProjectName(key);
        const featureCount = data.features ? data.features.length : 0;
        const calculatedAreaHa = calculateGeoJsonArea(data);

        // Build Leaflet GeoJSON layer
        const geoLayer = L.geoJSON(data, {
            style: {
                color: color,
                weight: 2.5,
                opacity: 0.95,
                fillColor: color,
                fillOpacity: 0.45
            },
            onEachFeature: (feature, layer) => {
                // Interactive hover style
                layer.on({
                    mouseover: (e) => {
                        const l = e.target;
                        l.setStyle({ weight: 4, fillOpacity: 0.7 });
                        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                            l.bringToFront();
                        }
                    },
                    mouseout: (e) => {
                        geoLayer.resetStyle(e.target);
                    }
                });

                // Attach Popup
                layer.bindPopup(() => createPopupContent(feature.properties, projName, color));
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

        // Add to map by default
        geoLayer.addTo(map);

        // Save reference
        projectLayers[key] = {
            key: key,
            name: projName,
            color: color,
            data: data,
            layer: geoLayer,
            featureCount: featureCount,
            areaHa: calculatedAreaHa,
            visible: true,
            opacity: 0.45
        };
    });

    // Load Outros Limites (Municípios SP & UGRHIs)
    const outrosKeys = Object.keys(geoData.outros);
    outrosKeys.forEach((key) => {
        const data = geoData.outros[key];
        let layerName = key;
        let color = '#475569';
        let subtitle = 'Camada de Limite';

        if (key === 'municipios_SP') {
            layerName = 'Municípios de São Paulo (IBGE)';
            color = '#475569';
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

        const geoLayer = L.geoJSON(data, {
            style: {
                color: color,
                weight: key === 'limites_ughris' ? 1.8 : 1,
                opacity: 0.8,
                fillColor: color,
                fillOpacity: 0.08
            },
            onEachFeature: (feature, layer) => {
                layer.on({
                    mouseover: (e) => {
                        e.target.setStyle({ weight: 3, color: '#0f172a', fillOpacity: 0.25 });
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
                            <div class="popup-title" style="color: #0891b2;">Região Hidrográfica</div>
                            <div class="popup-row"><span class="popup-label">Nome:</span> <span class="popup-value">${props.rhi_nm}</span></div>
                            <div class="popup-row"><span class="popup-label">Sigla:</span> <span class="popup-value">${props.rhi_sg || '-'}</span></div>
                            <div class="popup-row"><span class="popup-label">Área:</span> <span class="popup-value">${props.rhi_ar_km2 ? Number(props.rhi_ar_km2).toLocaleString('pt-BR', {maximumFractionDigits:0}) + ' km²' : '-'}</span></div>
                        </div>
                    `);
                } else if (props.NM_MUN) {
                    layer.bindPopup(`<strong>Município: ${props.NM_MUN}</strong><br>Área: ${props.AREA_KM2 || '-'} km²`);
                }
            }
        });

        geoLayer.addTo(map);

        outrosLayers[key] = {
            key: key,
            name: layerName,
            color: color,
            subtitle: subtitle,
            data: data,
            layer: geoLayer,
            visible: true,
            opacity: 0.08
        };
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
    
    // Render Project Layer List Items
    const projetosListContainer = document.getElementById('projetos-layer-list');
    projetosListContainer.innerHTML = '';

    sortedProjectKeys.forEach((key) => {
        const item = projectLayers[key];
        
        const layerEl = document.createElement('div');
        layerEl.className = 'layer-item';
        layerEl.dataset.key = key;
        layerEl.dataset.name = item.name.toLowerCase();

        layerEl.innerHTML = `
            <div class="layer-main-row">
                <div class="layer-left">
                    <input type="checkbox" class="custom-checkbox layer-toggle" data-key="${key}" checked>
                    <div class="color-badge" style="background-color: ${item.color};"></div>
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
                <span class="opacity-label">Opacidade:</span>
                <input type="range" class="opacity-slider" data-key="${key}" min="0" max="100" value="45">
            </div>
        `;

        projetosListContainer.appendChild(layerEl);
    });

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
                    <input type="checkbox" class="custom-checkbox outros-toggle" data-key="${key}" checked>
                    <div class="color-badge" style="background-color: ${item.color};"></div>
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

    function updateFooterStats() {
        const visibleCount = Object.values(projectLayers).filter(p => p.visible).length;
        document.getElementById('visible-projects-count').textContent = visibleCount;

        let totalHa = 0;
        Object.values(projectLayers).forEach(p => {
            if (p.visible && p.areaHa) {
                totalHa += parseFloat(p.areaHa);
            }
        });
        document.getElementById('total-area-display').textContent = totalHa > 0 ? `${totalHa.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha` : '0.00 ha';
    }

    // ----------------------------------------------------------------------
    // 5. UI Event Listeners
    // ----------------------------------------------------------------------

    // Base Map Switcher
    document.querySelectorAll('.basemap-card').forEach(card => {
        card.addEventListener('click', () => {
            const key = card.dataset.basemap;
            if (key === activeBaseMapKey) return;

            document.querySelectorAll('.basemap-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');

            map.removeLayer(baseTileLayers[activeBaseMapKey]);
            baseTileLayers[key].addTo(map);
            activeBaseMapKey = key;
        });
    });

    // Accordion Sections Collapse / Expand
    document.querySelectorAll('.accordion-header').forEach(header => {
        header.addEventListener('click', () => {
            const section = header.closest('.accordion-section');
            section.classList.toggle('active');
        });
    });

    // Project Checkbox Toggle
    projetosListContainer.addEventListener('change', (e) => {
        if (e.target.classList.contains('layer-toggle')) {
            const key = e.target.dataset.key;
            const isChecked = e.target.checked;
            const item = projectLayers[key];

            if (item) {
                item.visible = isChecked;
                if (isChecked) {
                    map.addLayer(item.layer);
                } else {
                    map.removeLayer(item.layer);
                }
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

    // Zoom to Project Layer Button Click
    projetosListContainer.addEventListener('click', (e) => {
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

    // Opacity Slider Input
    projetosListContainer.addEventListener('input', (e) => {
        if (e.target.classList.contains('opacity-slider')) {
            const key = e.target.dataset.key;
            const val = parseFloat(e.target.value) / 100;
            const item = projectLayers[key];

            if (item && item.layer) {
                item.opacity = val;
                item.layer.setStyle({ fillOpacity: val });
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
            }
        });
        document.querySelectorAll('#projetos-layer-list .layer-toggle').forEach(chk => chk.checked = true);
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
        document.querySelectorAll('#projetos-layer-list .layer-toggle').forEach(chk => chk.checked = false);
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

    // Jump to UGRHI (Bacia Hidrográfica)
    const ugrhiSelectEl = document.getElementById('ugrhi-select');
    if (ugrhiSelectEl) {
        ugrhiSelectEl.addEventListener('change', (e) => {
            const ugrhiName = e.target.value;
            if (!ugrhiName) return;

            const ugrhiItem = outrosLayers['limites_ughris'];
            if (ugrhiItem && ugrhiItem.layer) {
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
        });
    }

    // Jump to Municipality
    muniSelect.addEventListener('change', (e) => {
        const muniName = e.target.value;
        if (!muniName) return;

        const outrosItem = outrosLayers['municipios_SP'];
        if (outrosItem && outrosItem.layer) {
            let found = false;
            outrosItem.layer.eachLayer(l => {
                if (l.feature && l.feature.properties && l.feature.properties.NM_MUN === muniName) {
                    const bounds = l.getBounds();
                    if (bounds.isValid()) {
                        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
                        l.openPopup();
                        found = true;
                    }
                }
            });
        }
    });

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
    document.getElementById('btn-recenter').addEventListener('click', () => {
        if (allProjectBounds.isValid()) {
            map.fitBounds(allProjectBounds, { padding: [40, 40] });
        }
    });

    document.getElementById('btn-fullscreen').addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    });

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
});
