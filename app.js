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
    window.map = map;

    // Add custom zoom control in top-right
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);

    // Custom Map Panes to strictly control Z-Index layer ordering:
    // outrosPane (370) < muniPane (375) < vegetacaoPane (385) < propriedadePane (390) < projetosPane (410)
    map.createPane('outrosPane');
    map.getPane('outrosPane').style.zIndex = 370;
    map.getPane('outrosPane').style.pointerEvents = 'auto';

    map.createPane('muniPane');
    map.getPane('muniPane').style.zIndex = 375;
    map.getPane('muniPane').style.pointerEvents = 'none';

    map.createPane('vegetacaoPane');
    map.getPane('vegetacaoPane').style.zIndex = 385;
    map.getPane('vegetacaoPane').style.pointerEvents = 'none';

    map.createPane('propriedadePane');
    map.getPane('propriedadePane').style.zIndex = 390;
    map.getPane('propriedadePane').style.pointerEvents = 'auto';

    map.createPane('averbadaPane');
    map.getPane('averbadaPane').style.zIndex = 395;
    map.getPane('averbadaPane').style.pointerEvents = 'auto';

    map.createPane('projetosPane');
    map.getPane('projetosPane').style.zIndex = 410;
    map.getPane('projetosPane').style.pointerEvents = 'auto';

    map.createPane('measurePane');
    map.getPane('measurePane').style.zIndex = 600;
    map.getPane('measurePane').style.pointerEvents = 'none';

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
    window.outrosLayers = outrosLayers;
    window.projectLayers = projectLayers;
    let allProjectBounds = L.latLngBounds();

    // ----------------------------------------------------------------------
    // 3. Load & Process Spatial Data
    // ----------------------------------------------------------------------
    const geoData = window.GEOPORTAL_DATA || { projetos: {}, outros: {} };

    // ----------------------------------------------------------------------
    // Dicionário de Nomes de Projetos Padronizados (Acentuação e Pontuação)
    // ----------------------------------------------------------------------
    const PROJECT_DISPLAY_NAMES = {
        // Área da Propriedade
        "area_propriedade__Aguas do Pontal": "Águas do Pontal",
        "area_propriedade__Bragança Pta. PCJ": "Bragança Paulista - PCJ",
        "area_propriedade__Fazenda Carmellina": "Fazenda Carmelina",
        "area_propriedade__Fazenda Modelo": "Fazenda Modelo",
        "area_propriedade__Fazenda Vale das Flores": "Fazenda Vale das Flores",
        "area_propriedade__Manancial": "Manancial",
        "area_propriedade__PE Rio do Peixe": "P.E. Rio do Peixe",
        "area_propriedade__Rancho Katende": "Rancho Katendê",
        "area_propriedade__Recanto SoLe": "Recanto SoLê",
        "area_propriedade__REDS 2 - 10028": "REDS 2 (10028)",
        "area_propriedade__REDS 2 - 23042": "REDS 2 (23042)",
        "area_propriedade__Reserva AMME": "Reserva AMME",
        "area_propriedade__Reserva Mantiqueira": "Reserva Mantiqueira",
        "area_propriedade__Reserva Muriqui": "Reserva Muriqui",
        "area_propriedade__Sitio Bella Luna": "Sítio Bella Luna",
        "area_propriedade__Sítio das Siriemas": "Sítio das Siriemas",
        "area_propriedade__Sitio Sao Joao": "Sítio São João",
        "area_propriedade__Sítio São Jorge": "Sítio São Jorge",

        // Banco de Áreas - Floresta Pronta
        "floresta_pronta__Faz. Aguas do Cedro": "Faz. Águas do Cedro",
        "floresta_pronta__Faz. Bela Vista": "Faz. Bela Vista",
        "floresta_pronta__Faz. Guaiuvira": "Faz. Guaiuvira",
        "floresta_pronta__Faz. Laranjal": "Faz. Laranjal",
        "floresta_pronta__Faz. Novo Horizonte": "Faz. Novo Horizonte",
        "floresta_pronta__Faz. Rio Grande": "Faz. Rio Grande",
        "floresta_pronta__Sao Joao das Montanhas": "Faz. São João das Montanhas",
        "floresta_pronta__Faz. Sao Pedro": "Faz. São Pedro",
        "floresta_pronta__Montanhas do Japi": "Montanhas do Japi",
        "floresta_pronta__Recanto do Saua": "Recanto do Sauá",
        "floresta_pronta__Sitio Alvorada": "Sítio Alvorada",
        "floresta_pronta__Sitio Ernane": "Sítio Ernane",
        "floresta_pronta__Sítio José Eduardo": "Sítio José Eduardo",
        "floresta_pronta__Sitio Marilia": "Sítio Marília",
        "floresta_pronta__Sitio Sao Benedito": "Sítio São Benedito",
        "floresta_pronta__REDS3": "REDS 3",
        "floresta_pronta__REDS 4": "REDS 4",
        "floresta_mata_nativa__Faz. Aguas do Cedro": "Faz. Águas do Cedro",
        "floresta_mata_nativa__Faz. Bela Vista": "Faz. Bela Vista",
        "floresta_mata_nativa__Faz. Guaiuvira": "Faz. Guaiuvira",
        "floresta_mata_nativa__Faz. Laranjal": "Faz. Laranjal",
        "floresta_mata_nativa__Faz. Novo Horizonte": "Faz. Novo Horizonte",
        "floresta_mata_nativa__Faz. Rio Grande": "Faz. Rio Grande",
        "floresta_mata_nativa__Faz. Sao Joao das Montanhas": "Faz. São João das Montanhas",
        "floresta_mata_nativa__Faz. Sao Pedro": "Faz. São Pedro",
        "floresta_mata_nativa__Montanhas do Japi": "Montanhas do Japi",
        "floresta_mata_nativa__Recanto do Saua": "Recanto do Sauá",
        "floresta_mata_nativa__Sitio Alvorada": "Sítio Alvorada",
        "floresta_mata_nativa__Sitio Ernane": "Sítio Ernane",
        "floresta_mata_nativa__Sítio José Eduardo": "Sítio José Eduardo",
        "floresta_mata_nativa__Sitio Marilia": "Sítio Marília",
        "floresta_mata_nativa__Sitio Sao Benedito": "Sítio São Benedito",
        "floresta_mata_nativa__REDS3": "REDS 3",
        "floresta_mata_nativa__REDS3 - Áreas Averbadas": "REDS 3 - Áreas Averbadas",

        // Restauração
        "restauracao__Acacio_ind_2015": "Acácio - Ind. (2015)",
        "restauracao__Aguas_do_Pontal": "Águas do Pontal",
        "restauracao__Airton - WWF - 2014": "Airton - WWF (2014)",
        "restauracao__Alto Tiete I (1753)": "Alto Tietê I (1753)",
        "restauracao__Alto Tiete I (1755)": "Alto Tietê I (1755)",
        "restauracao__Ambev Jacarei - 2018": "Ambev Jacareí (2018)",
        "restauracao__Ambev Jaguariuna - 2019 - Leucenas": "Ambev Jaguariúna - Leucenas (2019)",
        "restauracao__Ambev Jaguariuna - 2022": "Ambev Jaguariúna (2022)",
        "restauracao__Antonio de Campos - Salesopolis - Licitação Pref. 2016": "Antônio de Campos - Salesópolis - Licitação Pref. (2016)",
        "restauracao__APP alojamento Da Serra - Voluntário": "APP Alojamento Da Serra (Voluntário)",
        "restauracao__Bar da Loira - Salesopolis - Licitação Pref. 2016": "Bar da Loira - Salesópolis - Licitação Pref. (2016)",
        "restauracao__Batata - Salesopolis - Licitação Pref. 2016": "Batata - Salesópolis - Licitação Pref. (2016)",
        "restauracao__Batazza - SABESP 2º Licitação": "Batazza - SABESP (2ª Licitação)",
        "restauracao__Benedito - Salesopolis - Licitação Pref. 2016": "Benedito - Salesópolis - Licitação Pref. (2016)",
        "restauracao__Bipolar_Atibaia - 2013": "Bipolar - Atibaia (2013)",
        "restauracao__Bosque da Memória Da Serra": "Bosque da Memória - Da Serra",
        "restauracao__Boy - TNC - Salesópolis 2015": "Boy - TNC - Salesópolis (2015)",
        "restauracao__Braganca Pta PCJ": "Bragança Paulista - PCJ",
        "restauracao__Cantareira I (4068)": "Cantareira I (4068)",
        "restauracao__Cantareira I (4069)": "Cantareira I (4069)",
        "restauracao__Cantinho do Bile - SABESP 2º Licitação": "Cantinho do Bile - SABESP (2ª Licitação)",
        "restauracao__Castelinho - SABESP 2º Licitação": "Castelinho - SABESP (2ª Licitação)",
        "restauracao__Cond. Palmas do Paiol - 2016 - Joanópolis VF": "Cond. Palmas do Paiol - Joanópolis VF (2016)",
        "restauracao__Condominio Arco Iris - Atibaia - 2013": "Condomínio Arco-Íris - Atibaia (2013)",
        "restauracao__Crippa Pinhalzinho - 2015": "Crippa - Pinhalzinho (2015)",
        "restauracao__Cummins TNC - Joa": "Cummins - TNC - Joanópolis",
        "restauracao__Curitibanos - SABESP 2º Licitação": "Curitibanos - SABESP (2ª Licitação)",
        "restauracao__Eldorado - Joanópolis - 2020": "Eldorado - Joanópolis (2020)",
        "restauracao__Fabrica de Blocos - Piracaia - 2012": "Fábrica de Blocos - Piracaia (2012)",
        "restauracao__Fabrica_colchões Atibaia 2016": "Fábrica de Colchões - Atibaia (2016)",
        "restauracao__Faja - SP Perus - 2022": "FAJA - Perus - SP (2022)",
        "restauracao__Faja Rodeio 1": "FAJA - Rodeio 1",
        "restauracao__Faja Rodeio 2": "FAJA - Rodeio 2",
        "restauracao__Fase_I_Fazenda Porto_Feliz - SOS - Limeira": "Fase I - Fazenda Porto Feliz - SOS - Limeira",
        "restauracao__Fase_I_IZ - SOS - Nova Odessa_corrigido": "Fase I - IZ - SOS - Nova Odessa",
        "restauracao__Fase_II_IZ - SOS - Nova Odessa": "Fase II - IZ - SOS - Nova Odessa",
        "restauracao__Faz_Boa_Esperanca - SOS - São Pedro": "Fazenda Boa Esperança - SOS - São Pedro",
        "restauracao__Fazenda Carmelina (1879)": "Fazenda Carmelina (1879)",
        "restauracao__Fazenda Carmelina (1880)": "Fazenda Carmelina (1880)",
        "restauracao__Fazenda Carmelina (1881)": "Fazenda Carmelina (1881)",
        "restauracao__Fazenda Modelo": "Fazenda Modelo",
        "restauracao__Fazenda Vale das Flores": "Fazenda Vale das Flores",
        "restauracao__Ford - Tatui - TGI": "Ford - Tatuí - TGI",
        "restauracao__Gato Preto - Cajamar - FAJA - Recuperação Ambiental": "Gato Preto - Cajamar - FAJA",
        "restauracao__Gato Preto Fase II - Cajamar - FAJA - Recuperação Ambiental": "Gato Preto (Fase II) - Cajamar - FAJA",
        "restauracao__Geraldo - SABESP 2º Licitação": "Geraldo - SABESP (2ª Licitação)",
        "restauracao__Iniciativa Verde_DaSerra": "Iniciativa Verde - Da Serra",
        "restauracao__Itesp Franco da Rocha Faja  - Zizo": "ITESP - Franco da Rocha - FAJA - Zizo (Área 1)",
        "restauracao__Itesp Franco da Rocha Faja - Zizo": "ITESP - Franco da Rocha - FAJA - Zizo (Área 2)",
        "restauracao__Izaura - Salesopolis - Licitação Pref. 2016": "Izaura - Salesópolis - Licitação Pref. (2016)",
        "restauracao__Kalil - Atibaia - Rodominas": "Kalil - Atibaia - Rodominas",
        "restauracao__Licitação CODASP DAEE - 2015": "Licitação CODASP / DAEE (2015)",
        "restauracao__Lot. Nova Oliveira - Extrema - Geoville": "Lot. Nova Oliveira - Extrema - Geoville",
        "restauracao__Lua Nova - SABESP 2º Licitação": "Lua Nova - SABESP (2ª Licitação)",
        "restauracao__Manancial Cantareira I": "Manancial Cantareira I",
        "restauracao__Manancial Cantareira II (231)": "Manancial Cantareira II (231)",
        "restauracao__Manancial Cantareira II (232)": "Manancial Cantareira II (232)",
        "restauracao__Manancial Cantareira II (233)": "Manancial Cantareira II (233)",
        "restauracao__Marco Gouveia - WWF - 2014": "Marco Gouveia - WWF (2014)",
        "restauracao__Mario - Salesopolis - Licitação Pref. 2016": "Mário - Salesópolis - Licitação Pref. (2016)",
        "restauracao__Morada do Gigante 1 - 2015": "Morada do Gigante 1 (2015)",
        "restauracao__Nancy - Atibaia": "Nancy - Atibaia",
        "restauracao__Orlando - WWF - 2014": "Orlando - WWF (2014)",
        "restauracao__Padre - Campinas - SOS 2018": "Padre - Campinas - SOS (2018)",
        "restauracao__Paulo Alves - Salesopolis - Licitação Pref. 2016": "Paulo Alves - Salesópolis - Licitação Pref. (2016)",
        "restauracao__Paulo- TNC - Salesópolis 2020": "Paulo - TNC - Salesópolis (2020)",
        "restauracao__Pepisco - 2018 - SP": "Pepsico - SP (2018)",
        "restauracao__Piracaia - Lot. Mantiqueira 2015": "Piracaia - Lot. Mantiqueira (2015)",
        "restauracao__Pontal SOS - 2019 - Piracaia": "Pontal SOS - Piracaia (2019)",
        "restauracao__Rancho Katende": "Rancho Katendê",
        "restauracao__Recanto Sole": "Recanto Solê",
        "restauracao__Reserva AMME": "Reserva AMME",
        "restauracao__Reserva Mantiqueira": "Reserva Mantiqueira",
        "restauracao__Reserva Muriqui (2108)": "Reserva Muriqui (2108)",
        "restauracao__Reserva Muriqui (2110)": "Reserva Muriqui (2110)",
        "restauracao__Rio do Peixe": "P.E. Rio do Peixe",
        "restauracao__Romeu - TNC - Salesópolis 2020_": "Romeu - TNC - Salesópolis (2020)",
        "restauracao__Santa Maria - Joa - Área maior 2 ha": "Santa Maria - Joanópolis (Área > 2 ha)",
        "restauracao__Santa Maria - Joa - Serraria 2014_2015": "Santa Maria - Joanópolis - Serraria (2014-2015)",
        "restauracao__SAnta Maria das Pitangueiras - Geoville - Santa Branca": "Santa Maria das Pitangueiras - Geoville - Santa Branca",
        "restauracao__São Francisco - SABESP 2º Licitação": "São Francisco - SABESP (2ª Licitação)",
        "restauracao__Setuo Hishi - SABESP 2º Licitação": "Setuo Hishi - SABESP (2ª Licitação)",
        "restauracao__Sitio Bella Luna": "Sítio Bella Luna",
        "restauracao__Sitio Sao Joao (4553)": "Sítio São João (4553)",
        "restauracao__Sitio Sao Joao (5666)": "Sítio São João (5666)",
        "restauracao__Valinhos - Pedreira 1": "Valinhos - Pedreira 1",
        "restauracao__Valinhos - Pedreira 2": "Valinhos - Pedreira 2",
        "restauracao__Valinhos - Pedreira 3": "Valinhos - Pedreira 3",
        "restauracao__veolia_guarulhos adensamento_": "Veolia - Guarulhos (Adensamento)",
        "restauracao__veolia_guarulhos plantio total_": "Veolia - Guarulhos (Plantio Total)",
        "restauracao__Viação Atibaia - Atibaia - 2019": "Viação Atibaia - Atibaia (2019)",
        "restauracao__Visconde - SABESP 2º Licitação": "Visconde - SABESP (2ª Licitação)",
        "restauracao__Zaida - 1º plantio pré DA SERRA": "Zaida - 1º Plantio pré-DA SERRA",
        "restauracao__Zaida - 2º plantio": "Zaida - 2º Plantio",
        "restauracao__Zaraplast 2024 ": "Zaraplast (2024)",
        "restauracao__Zé Toto - Nazaré - 2017 - Recuperação Ambiental": "Zé Toto - Nazaré - Recuperação Ambiental (2017)"
    };

    // Índice normalizado para busca resiliente (ignora acentos, espaços e caracteres especiais)
    function normalizeLookupKey(str) {
        if (!str) return '';
        return String(str)
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]/g, "");
    }

    const PROJECT_DISPLAY_NAMES_NORM = {};
    for (const [k, v] of Object.entries(PROJECT_DISPLAY_NAMES)) {
        PROJECT_DISPLAY_NAMES_NORM[normalizeLookupKey(k)] = v;
        const cleanK = k.replace(/^(restauracao|floresta_pronta|floresta_mata_nativa|area_propriedade)__/, '');
        PROJECT_DISPLAY_NAMES_NORM[normalizeLookupKey(cleanK)] = v;
    }

    // Regras automáticas para formatação elegante com acentuação e pontuação
    function formatProjectDisplayName(str) {
        if (!str) return '';
        let s = String(str).trim();

        // Substitui sublinhados por espaços e remove espaços extras
        s = s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

        // Ajuste de licitações: 2º Licitação / 2o licitacao -> 2ª Licitação
        s = s.replace(/(\d+)[ºoªa]?\s*licita[çc][ãa]o/gi, '$1ª Licitação');
        s = s.replace(/SABESP\s*(\d+ª\s*Licitação)/gi, 'SABESP ($1)');

        // Acentuação de palavras frequentes em projetos, municípios e propriedades
        const wordReplacements = [
            [/\bAguas\b/gi, 'Águas'],
            [/\bSitio\b/gi, 'Sítio'],
            [/\bSao Joao\b/gi, 'São João'],
            [/\bSao Pedro\b/gi, 'São Pedro'],
            [/\bSao Paulo\b/gi, 'São Paulo'],
            [/\bSao Francisco\b/gi, 'São Francisco'],
            [/\bSalesopolis\b/gi, 'Salesópolis'],
            [/\bNazare\b/gi, 'Nazaré'],
            [/\bJaguariuna\b/gi, 'Jaguariúna'],
            [/\bJacarei\b/gi, 'Jacareí'],
            [/\bTatui\b/gi, 'Tatuí'],
            [/\bJoanopolis\b/gi, 'Joanópolis'],
            [/\bBraganca\b/gi, 'Bragança'],
            [/\bEsperanca\b/gi, 'Esperança'],
            [/\bFabrica\b/gi, 'Fábrica'],
            [/\bColchoes\b/gi, 'Colchões'],
            [/\bCondominio\b/gi, 'Condomínio'],
            [/\bArco Iris\b/gi, 'Arco-Íris'],
            [/\bTiete\b/gi, 'Tietê'],
            [/\bKatende\b/gi, 'Katendê'],
            [/\bSole\b/gi, 'Solê'],
            [/\bQuinhao\b/gi, 'Quinhão'],
            [/\bDagua\b/gi, "D'Água"],
            [/\bAntonio\b/gi, 'Antônio'],
            [/\bMario\b/gi, 'Mário'],
            [/\bAcacio\b/gi, 'Acácio'],
            [/\bArea\b/gi, 'Área'],
            [/\bLicitacao\b/gi, 'Licitação'],
            [/\bRestauracao\b/gi, 'Restauração'],
            [/\bRecuperacao\b/gi, 'Recuperação'],
            [/\bEcologica\b/gi, 'Ecológica'],
            [/\bAmbiental\b/gi, 'Ambiental'],
            [/\bMemoria\b/gi, 'Memória'],
            [/\bViacao\b/gi, 'Viação'],
            [/\bJoa\b/gi, 'Joanópolis'],
            [/\bPta\b/gi, 'Paulista'],
            [/\bSaua\b/gi, 'Sauá'],
            [/\bMarilia\b/gi, 'Marília']
        ];

        for (const [rgx, rep] of wordReplacements) {
            s = s.replace(rgx, rep);
        }

        // Padronização de siglas em maiúsculas
        const acronyms = ['SABESP', 'WWF', 'SOS', 'TNC', 'CDHU', 'DAEE', 'ITESP', 'FAJA', 'PCJ', 'PE', 'APP', 'IZ'];
        acronyms.forEach(acro => {
            const re = new RegExp(`\\b${acro}\\b`, 'gi');
            s = s.replace(re, acro);
        });

        // Casos específicos de pontuação
        s = s.replace(/\bPE Rio do Peixe\b/g, 'P.E. Rio do Peixe');
        s = s.replace(/\s*-\s*(\d{4})$/, ' ($1)');

        return s;
    }

    // Format project names for display
    function formatProjectName(key) {
        if (!key) return '';

        // 1. Busca direta na tabela exata
        if (PROJECT_DISPLAY_NAMES[key]) return PROJECT_DISPLAY_NAMES[key];

        const clean = key.replace(/^(restauracao|floresta_pronta|floresta_mata_nativa|area_propriedade)__/, '').trim();
        if (PROJECT_DISPLAY_NAMES[clean]) return PROJECT_DISPLAY_NAMES[clean];

        // 2. Busca pela chave normalizada (independe de acentuação, espaços e símbolos)
        const normKey = normalizeLookupKey(key);
        if (PROJECT_DISPLAY_NAMES_NORM[normKey]) return PROJECT_DISPLAY_NAMES_NORM[normKey];

        const normClean = normalizeLookupKey(clean);
        if (PROJECT_DISPLAY_NAMES_NORM[normClean]) return PROJECT_DISPLAY_NAMES_NORM[normClean];

        // 3. Padrão 'projeto_X'
        if (clean.startsWith('projeto_')) {
            const num = clean.replace('projeto_', '');
            return `Projeto ${num}`;
        }

        // 4. Fallback inteligente
        return formatProjectDisplayName(clean);
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
            else if (key.startsWith('floresta_mata_nativa__')) cat = 'floresta_mata_nativa';
            else if (key.startsWith('floresta_pronta__')) cat = 'floresta_pronta';
            else cat = 'restauracao';
        }
        projectCategory[key] = cat;
    });

    // Cor fixa por categoria
    const categoryColor = {
        restauracao:           '#29ff1e',  // verde claro
        floresta_pronta:       '#dc2626',  // vermelho (limites da propriedade em floresta pronta)
        floresta_mata_nativa:  '#15803d',  // verde mata nativa / florestal
        area_propriedade:      '#dc2626'   // vermelho
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
        if (status.includes('ativ') || status.includes('andamento') || status.includes('plantio') || status.includes('manutenc')) {
            return '#f97316'; // Laranja (Em atividade)
        } else if (status.includes('finaliz') || status.includes('conclu')) {
            return '#2563eb'; // Azul (Finalizado)
        }
        return defaultColor;
    }

    const SARE_COLOR_PALETTE = [
        '#f59e0b', // Âmbar
        '#3b82f6', // Azul Royal
        '#ec4899', // Rosa Forte
        '#8b5cf6', // Violeta
        '#06b6d4', // Ciano
        '#f97316', // Laranja
        '#eab308', // Amarelo Ouro
        '#14b8a6', // Turquesa
        '#a855f7', // Roxo
        '#fb7185', // Coral
        '#0ea5e9', // Azul Céu
        '#d97706', // Ocre
        '#6366f1', // Índigo
        '#84cc16', // Lima
        '#e11d48', // Carmesim
        '#2dd4bf'  // Água-marinha
    ];

    function isAverbadaLayer(k, data) {
        const normK = String(k || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (normK.includes('averbad') || normK.includes('sare') || normK.includes('gleba') || normK.includes('compensac')) {
            return true;
        }
        if (data && Array.isArray(data.features) && data.features.length > 0) {
            const firstProps = data.features[0].properties || {};
            if (firstProps.Processo || firstProps.processo || firstProps.SARE || firstProps.sare) {
                return true;
            }
        }
        return false;
    }

    function extractSareFeatureInfo(feature, idx, fallbackName) {
        const props = (feature && feature.properties) ? feature.properties : {};
        const itemCode = props.Item || props.item || props.ITEM || props.SARE || props.sare || props.Gleba || props.gleba || '';
        const processo = props.Processo || props.processo || props.PROCESSO || props.Proprietario || props.proprietario || props.Interessado || props.interessado || props.Nome || props.nome || props.NOME || '';
        const tipo = props.Tipo || props.tipo || props.TIPO || props.Modalidade || props.modalidade || '';

        let label = '';
        if (itemCode && processo) {
            label = `${itemCode} • ${processo}`;
        } else if (processo) {
            label = String(processo);
        } else if (itemCode) {
            label = String(itemCode);
        } else {
            label = `${idx + 1}`;
        }

        let rawArea = props.Area_Calc ?? props.area_calc ?? props.Area_Decl ?? props.area_decl ?? props['Área (ha)'] ?? props['Area (ha)'] ?? props.area_ha ?? props.AREA_HA ?? props.Area ?? props.area;
        let areaNum = null;
        if (rawArea !== undefined && rawArea !== null && rawArea !== '') {
            areaNum = typeof rawArea === 'number' ? rawArea : parseFloat(String(rawArea).replace(',', '.'));
        }
        if (areaNum === null || isNaN(areaNum)) {
            const calc = calculateGeoJsonArea(feature);
            if (calc) areaNum = parseFloat(calc);
        }

        const areaFormatted = (areaNum !== null && !isNaN(areaNum))
            ? `${areaNum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha`
            : '';

        let subtitle = areaFormatted;
        if (tipo) {
            subtitle = subtitle ? `${subtitle} • ${tipo}` : String(tipo);
        }
        if (!subtitle) subtitle = 'Área interna do projeto';

        return {
            label,
            subtitle,
            areaHa: (areaNum !== null && !isNaN(areaNum)) ? areaNum.toFixed(2) : null
        };
    }

    function getFeatureStyle(feature, defaultColor, opacity = 0.45, category = '', isAverbada = false) {
        const isPropriedade = (category === 'area_propriedade' || category === 'floresta_pronta');
        const c = isAverbada
            ? ((feature && feature._sareColor) ? feature._sareColor : defaultColor)
            : (isPropriedade ? defaultColor : getFeatureColor(feature, defaultColor));

        if (isPropriedade) {
            return {
                color: c,
                weight: category === 'area_propriedade' ? 1.2 : 2.2,
                opacity: 0.95,
                fillColor: 'transparent',
                fillOpacity: 0
            };
        }
        if (isAverbada) {
            return {
                color: '#78350f',
                weight: 1.6,
                opacity: 0.95,
                dashArray: '5, 3',
                fillColor: c,
                fillOpacity: opacity !== undefined ? opacity : 0.58
            };
        }
        if (category === 'floresta_mata_nativa') {
            return {
                color: c,
                weight: 1.0,
                opacity: 0.9,
                fillColor: c,
                fillOpacity: opacity !== undefined ? opacity : 0.55
            };
        }
        return {
            color: c,
            weight: 2.5,
            opacity: 0.95,
            fillColor: c,
            fillOpacity: opacity
        };
    }

    sortedProjectKeys.forEach((key) => {
        const data = geoData.projetos[key];
        const cat  = projectCategory[key] || 'restauracao';
        const isAverbada = isAverbadaLayer(key, data);
        const color = isAverbada ? '#f59e0b' : (categoryColor[cat] || '#15803d');

        const projName = formatProjectName(key);
        const featureCount = data.features ? data.features.length : 0;
        const calculatedAreaHa = calculateGeoJsonArea(data);

        const isPropriedade = (cat === 'area_propriedade' || cat === 'floresta_pronta');
        const isMataNativa = (cat === 'floresta_mata_nativa');

        if (isAverbada && data && Array.isArray(data.features)) {
            data.features.forEach((feat, idx) => {
                feat._sareIndex = idx;
                feat._sareColor = SARE_COLOR_PALETTE[idx % SARE_COLOR_PALETTE.length];
            });
        }

        let paneName = 'projetosPane';
        if (isPropriedade) paneName = 'propriedadePane';
        else if (isAverbada) paneName = 'averbadaPane';
        else if (isMataNativa) paneName = 'vegetacaoPane';

        const featureItems = [];
        let featCounter = 0;

        const geoLayerOptions = {
            pane: paneName,
            interactive: true,
            style: (feature) => getFeatureStyle(feature, color, isPropriedade ? 0 : (isAverbada ? 0.58 : (isMataNativa ? 0.55 : 0.45)), cat, isAverbada)
        };

        geoLayerOptions.onEachFeature = (feature, layer) => {
            const idx = (feature && feature._sareIndex !== undefined) ? feature._sareIndex : featCounter++;
            const featColor = (isAverbada && feature && feature._sareColor) ? feature._sareColor : color;

            if (isAverbada) {
                const info = extractSareFeatureInfo(feature, idx, projName);
                featureItems.push({
                    idx: idx,
                    feature: feature,
                    layer: layer,
                    visible: true,
                    color: featColor,
                    label: info.label,
                    subtitle: info.subtitle,
                    areaHa: info.areaHa
                });
            }

            // Interactive hover style
            layer.on({
                mouseover: (e) => {
                    if (window.MeasureTool && window.MeasureTool.isActive && !window.MeasureTool.isFinished) return;
                    const l = e.target;
                    if (isPropriedade) {
                        l.setStyle({ weight: 3.2, fillOpacity: 0 });
                    } else if (isAverbada) {
                        l.setStyle({ weight: 2.8, color: '#ffffff', fillOpacity: 0.78 });
                    } else if (isMataNativa) {
                        l.setStyle({ weight: 1.8, fillOpacity: 0.75 });
                    } else {
                        l.setStyle({ weight: 4, fillOpacity: 0.7 });
                        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                            l.bringToFront();
                        }
                    }
                },
                mouseout: (e) => {
                    if (window.MeasureTool && window.MeasureTool.isActive && !window.MeasureTool.isFinished) return;
                    const l = e.target;
                    const currentOpacity = (projectLayers[key] && projectLayers[key].opacity !== undefined) ? projectLayers[key].opacity : (isAverbada ? 0.58 : (isMataNativa ? 0.55 : 0.45));
                    l.setStyle(getFeatureStyle(l.feature || feature, color, currentOpacity, cat, isAverbada));
                },
                click: (e) => {
                    if (window.MeasureTool && window.MeasureTool.isActive && !window.MeasureTool.isFinished) {
                        L.DomEvent.stopPropagation(e);
                        window.MeasureTool.handleMapClick(e.latlng);
                    }
                }
            });

            // Attach Popup (busca Quadro de Áreas diretamente ou da propriedade vinculada)
            layer.bindPopup(() => {
                const qa = data.quadro_area || (feature.properties ? feature.properties._quadro_area : null) || resolveQuadroAreaForProject(key);
                return createPopupContent(feature.properties, projName, isAverbada ? featColor : getFeatureColor(feature, color), qa);
            });
        };

        // Build Leaflet GeoJSON layer
        const geoLayer = L.geoJSON(data, geoLayerOptions);

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
            isAverbada: isAverbada,
            featureItems: featureItems,
            boundaryVisible: true,
            data: data,
            layer: geoLayer,
            featureCount: featureCount,
            areaHa: calculatedAreaHa,
            visible: true,
            opacity: isPropriedade ? 0 : (isAverbada ? 0.58 : (isMataNativa ? 0.55 : 0.45))
        };
    });

    function normalizeFlorestaMatchName(s) {
        return String(s || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/^(floresta_pronta|floresta_mata_nativa)__/, '')
            .replace(/^faz\.\s*/, '')
            .replace(/^fazenda\s*/, '')
            .replace(/^sitio\s*/, '')
            .replace(/([a-z])\s+(\d)/g, '$1$2')
            .trim();
    }

    // Helper to resolve Quadro de Áreas for Banco de Áreas
    function resolveQuadroAreaForProject(k) {
        if (!k) return null;
        if (geoData.projetos[k] && geoData.projetos[k].quadro_area) {
            return geoData.projetos[k].quadro_area;
        }
        const targetNorm = normalizeFlorestaMatchName(k);
        for (const [pk, d] of Object.entries(geoData.projetos)) {
            if (pk.startsWith('floresta_pronta__') && d.quadro_area) {
                const pNorm = normalizeFlorestaMatchName(pk);
                if (pNorm === targetNorm || targetNorm.startsWith(pNorm + ' ') || targetNorm.startsWith(pNorm + '-')) {
                    return d.quadro_area;
                }
            }
        }
        return null;
    }

    // Function to find all matching Floresta Mata Nativa keys (including sub-layers like Áreas Averbadas / SAREs)
    function findMatchingFlorestaMataKeys(propKey) {
        const rawName = propKey.replace(/^floresta_pronta__/, '').trim();
        const targetNorm = normalizeFlorestaMatchName(rawName);
        const matches = [];

        const candidate = `floresta_mata_nativa__${rawName}`;
        if (projectLayers[candidate]) matches.push(candidate);

        for (const k of Object.keys(projectLayers)) {
            if (k.startsWith('floresta_mata_nativa__') && !matches.includes(k)) {
                const kNorm = normalizeFlorestaMatchName(k);
                if (kNorm === targetNorm || kNorm.startsWith(targetNorm + ' ') || kNorm.startsWith(targetNorm + '-')) {
                    matches.push(k);
                }
            }
        }
        return matches;
    }

    // Link Floresta Pronta (Limites de Propriedades) and Floresta Mata Nativa (Vegetação + Áreas Averbadas / SAREs)
    Object.keys(projectLayers).forEach((key) => {
        if (key.startsWith('floresta_pronta__')) {
            const propItem = projectLayers[key];
            const mataKeys = findMatchingFlorestaMataKeys(key);
            if (mataKeys.length > 0) {
                propItem.linkedKeys = mataKeys;
                propItem.linkedKey = mataKeys[0];
                mataKeys.forEach(mKey => {
                    if (projectLayers[mKey]) {
                        projectLayers[mKey].linkedKey = key;
                    }
                });
            } else {
                propItem.linkedKeys = [];
            }
        }
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
            layerName = 'Municípios';
            color = '#475569'; // Cinza escuro discreto para evitar poluição visual
            subtitle = 'Limites Municipais';
        } else if (key === 'limites_ughris') {
            layerName = 'UGRHIs (Bacias Hidrográficas SP)';
            color = '#0284c7';
            subtitle = '22 Bacias Hidrográficas';
        } else if (key === 'regioes_hidrograficas_ana') {
            layerName = 'Regiões Hidrográficas (ANA)';
            color = '#0891b2';
            subtitle = 'Macro-bacias (SP)';
        }

        const isMuni = (key === 'municipios_SP');
        const isUgrhi = (key === 'limites_ughris');
        const isAna = (key === 'regioes_hidrograficas_ana');

        const geoLayer = L.geoJSON(data, {
            pane: isMuni ? 'muniPane' : 'outrosPane',
            style: {
                color: color,
                weight: isMuni ? 1 : (isUgrhi ? 1.8 : 2.2),
                dashArray: isAna ? '6, 6' : null,
                opacity: isMuni ? 0.75 : 0.85,
                fill: isMuni,
                fillColor: color,
                fillOpacity: isMuni ? 0.005 : 0
            },
            onEachFeature: (feature, layer) => {
                layer.on({
                    mouseover: (e) => {
                        if (window.MeasureTool && window.MeasureTool.isActive && !window.MeasureTool.isFinished) return;
                        if (isMuni) {
                            if (isMuniZoomAllowed()) {
                                e.target.setStyle({ weight: 2.2, color: '#38bdf8', fillOpacity: 0.12 });
                            }
                        } else if (isUgrhi) {
                            e.target.setStyle({ weight: 2.6, color: '#0369a1' });
                        } else if (isAna) {
                            e.target.setStyle({ weight: 3.0, color: '#0e7490' });
                        }
                    },
                    mouseout: (e) => {
                        if (window.MeasureTool && window.MeasureTool.isActive && !window.MeasureTool.isFinished) return;
                        geoLayer.resetStyle(e.target);
                    },
                    click: (e) => {
                        if (window.MeasureTool && window.MeasureTool.isActive && !window.MeasureTool.isFinished) {
                            L.DomEvent.stopPropagation(e);
                            window.MeasureTool.handleMapClick(e.latlng);
                        }
                    }
                });
                const props = feature.properties || {};
                if (isUgrhi && props.Nome) {
                    layer.bindTooltip(`UGRHI ${props.Codigo || ''}: ${props.Nome}`, {
                        sticky: false,
                        direction: 'auto',
                        className: 'muni-custom-tooltip'
                    });
                    layer.bindPopup(`<strong>UGRHI ${props.Codigo || ''}: ${props.Nome}</strong>`);
                } else if (isAna && props.rhi_nm) {
                    layer.bindTooltip(`RH ${props.rhi_nm} (${props.rhi_sg || ''})`, {
                        sticky: false,
                        direction: 'auto',
                        className: 'muni-custom-tooltip'
                    });
                    layer.bindPopup(`
                        <div class="popup-container">
                            <div class="popup-title">Região Hidrográfica (ANA)</div>
                            <div class="popup-row"><span class="popup-label">Nome:</span> <span class="popup-value">${props.rhi_nm}</span></div>
                            <div class="popup-row"><span class="popup-label">Sigla:</span> <span class="popup-value">${props.rhi_sg || '-'}</span></div>
                            <div class="popup-row"><span class="popup-label">Âmbito:</span> <span class="popup-value">Estado de São Paulo</span></div>
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

    // Global Synchronizer: Ensures all custom pane renderers (outrosPane, measurePane, etc.)
    // and standard overlay renderers remain 100% geographically pinned and never desynchronize
    // during fast zooming, view transitions, or window/container resizing.
    function syncAllRenderers() {
        if (!map) return;
        try {
            if (map._renderer && typeof map._renderer._reset === 'function') {
                map._renderer._reset();
            }
            if (map._paneRenderers) {
                for (const p in map._paneRenderers) {
                    const r = map._paneRenderers[p];
                    if (r && typeof r._reset === 'function') {
                        r._reset();
                    }
                }
            }
            if (window.MeasureTool && window.MeasureTool.isActive) {
                if (window.MeasureTool.mainPolyline && typeof window.MeasureTool.mainPolyline.redraw === 'function') {
                    window.MeasureTool.mainPolyline.redraw();
                }
                if (window.MeasureTool.mainPolygon && typeof window.MeasureTool.mainPolygon.redraw === 'function') {
                    window.MeasureTool.mainPolygon.redraw();
                }
            }
        } catch (e) {
            console.warn('Renderer sync notice:', e);
        }
    }
    window.syncAllRenderers = syncAllRenderers;

    // Attach synchronizer to view changes and animation ends
    map.on('zoomend moveend resize', () => {
        syncAllRenderers();
        requestAnimationFrame(() => syncAllRenderers());
    });

    // Auto-track map container resizing (sidebar toggle, viewport resize)
    const mapContainer = document.getElementById('map');
    if (mapContainer && window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
            map.invalidateSize({ pan: false });
            syncAllRenderers();
        });
        ro.observe(mapContainer);
    }

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
    const restauracaoContainer   = document.getElementById('restauracao-layer-list');
    const florestaContainer      = document.getElementById('floresta-layer-list');
    const propriedadeContainer   = document.getElementById('propriedade-layer-list');

    if (restauracaoContainer) restauracaoContainer.innerHTML  = '';
    if (florestaContainer) florestaContainer.innerHTML     = '';
    if (propriedadeContainer) propriedadeContainer.innerHTML  = '';

    function buildLayerItem(key, item) {
        const layerEl = document.createElement('div');
        layerEl.className = 'layer-item';
        layerEl.dataset.key = key;
        layerEl.dataset.name = item.name.toLowerCase();

        const isFlorestaPronta = (item.categoria === 'floresta_pronta');
        const isPropriedade = (item.categoria === 'area_propriedade');

        let badgeStyle = `background-color: ${item.color};`;
        if (isPropriedade) {
            badgeStyle = `background-color: transparent; border: 2.5px solid ${item.color}; box-sizing: border-box;`;
        } else if (isFlorestaPronta) {
            // Incorporado: Vegetação (verde) + Limite de Propriedade (borda vermelha)
            badgeStyle = `background-color: #15803d; border: 2.2px solid #dc2626; box-sizing: border-box;`;
        }

        const defaultSliderVal = isPropriedade ? 95 : (isFlorestaPronta ? 55 : 45);

        // Subtítulo com a área (e resumo de SAREs/áreas internas se houver) + Sub-aba de Floresta Pronta
        let areaVal = item.areaHa;
        let averbadaSubtitleHtml = '';
        let sublayersPanelHtml = '';

        if (isFlorestaPronta) {
            const linkedKeys = item.linkedKeys || (item.linkedKey ? [item.linkedKey] : []);
            const baseMataKeys = linkedKeys.filter(lk => projectLayers[lk] && !projectLayers[lk].isAverbada);
            const averbadaKeys = linkedKeys.filter(lk => projectLayers[lk] && projectLayers[lk].isAverbada);

            const primaryMataKey = baseMataKeys[0] || null;
            const linked = primaryMataKey ? projectLayers[primaryMataKey] : null;
            if (linked && linked.areaHa) {
                areaVal = linked.areaHa;
            }

            const allSares = [];
            let totalAvHaNum = 0;
            averbadaKeys.forEach(avKey => {
                const avItem = projectLayers[avKey];
                if (avItem) {
                    if (avItem.areaHa) {
                        const parsed = parseFloat(avItem.areaHa);
                        if (!isNaN(parsed)) totalAvHaNum += parsed;
                    }
                    if (Array.isArray(avItem.featureItems)) {
                        avItem.featureItems.forEach(fItem => {
                            allSares.push({ ...fItem, avKey: avKey });
                        });
                    }
                }
            });

            if (allSares.length > 0) {
                const avHaStr = totalAvHaNum > 0
                    ? totalAvHaNum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : '';
                const glebaWord = allSares.length === 1 ? 'Gleba' : 'Glebas';
                averbadaSubtitleHtml = ` <span style="color: #1d4ed8; font-weight: 600;" title="Clique na seta ao lado para abrir e controlar as ${allSares.length} ${glebaWord.toLowerCase()} individualmente">• ${allSares.length} ${glebaWord}${avHaStr ? ` (${avHaStr} ha)` : ''}</span>`;
            }

            const propAreaStr = item.areaHa
                ? `${parseFloat(item.areaHa).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha • Perímetro`
                : 'Perímetro da propriedade';

            const mataRowsHtml = baseMataKeys.map(mKey => {
                const mItem = projectLayers[mKey];
                if (!mItem) return '';
                const mAreaStr = mItem.areaHa
                    ? `${parseFloat(mItem.areaHa).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha • Cobertura florestal`
                    : 'Cobertura florestal';
                return `
                    <div class="sublayer-row">
                        <div class="sublayer-row-left">
                            <input type="checkbox" class="sublayer-checkbox sublayer-toggle-mata" data-prop-key="${key}" data-mata-key="${mKey}" ${mItem.visible ? 'checked' : ''}>
                            <div class="sublayer-badge" style="background-color: #15803d; border: 1px solid #14532d;"></div>
                            <div class="sublayer-info">
                                <div class="sublayer-title" title="Vegetação Nativa (${item.name})">Vegetação Nativa</div>
                                <div class="sublayer-meta">${mAreaStr}</div>
                            </div>
                        </div>
                        <button type="button" class="btn-icon btn-sublayer-zoom" data-zoom-type="mata" data-prop-key="${key}" data-mata-key="${mKey}" title="Aproximar zoom na vegetação nativa">
                            <i class="fa-solid fa-crosshairs"></i>
                        </button>
                    </div>
                `;
            }).join('');

            let saresBlockHtml = '';
            if (allSares.length > 0) {
                const sareItemsHtml = allSares.map((s) => `
                    <div class="sublayer-row">
                        <div class="sublayer-row-left">
                            <input type="checkbox" class="sublayer-checkbox sublayer-toggle-sare" data-prop-key="${key}" data-av-key="${s.avKey}" data-sare-idx="${s.idx}" ${s.visible ? 'checked' : ''}>
                            <div class="sublayer-badge" style="background-color: ${s.color}; border: 1px dashed #78350f;"></div>
                            <div class="sublayer-info">
                                <div class="sublayer-title" title="${s.label}">${s.label}</div>
                                <div class="sublayer-meta" title="${s.subtitle}">${s.subtitle}</div>
                            </div>
                        </div>
                        <button type="button" class="btn-icon btn-sublayer-zoom" data-zoom-type="sare" data-prop-key="${key}" data-av-key="${s.avKey}" data-sare-idx="${s.idx}" title="Aproximar zoom e ver detalhes desta gleba">
                            <i class="fa-solid fa-crosshairs"></i>
                        </button>
                    </div>
                `).join('');

                saresBlockHtml = `
                    <div class="sublayer-group-header">
                        <div class="sublayer-group-left">
                            <input type="checkbox" class="sublayer-checkbox sublayer-toggle-all-sares" data-prop-key="${key}" checked title="Ativar / desativar todas as áreas deste projeto">
                            <span>Áreas do Projeto</span>
                        </div>
                        <span class="sublayer-group-badge">${allSares.length}</span>
                    </div>
                    <div class="floresta-sare-list">
                        ${sareItemsHtml}
                    </div>
                `;
            } else {
                saresBlockHtml = `
                    <div class="sublayer-group-header" style="background: #f1f5f9; border-color: #e2e8f0;">
                        <div class="sublayer-group-left" style="color: #64748b;">
                            <i class="fa-solid fa-layer-group" style="font-size: 0.7rem;"></i>
                            <span>Áreas do Projeto</span>
                        </div>
                        <span class="sublayer-group-badge" style="background: #94a3b8;">0</span>
                    </div>
                    <div class="sublayer-empty">Nenhuma área interna cadastrada neste projeto</div>
                `;
            }

            sublayersPanelHtml = `
                <div class="floresta-sublayers-panel">
                    <div class="sublayer-section-label">
                        <span>Estrutura do Projeto</span>
                    </div>
                    <div class="sublayer-row">
                        <div class="sublayer-row-left">
                            <input type="checkbox" class="sublayer-checkbox sublayer-toggle-prop" data-prop-key="${key}" ${item.boundaryVisible !== false ? 'checked' : ''}>
                            <div class="sublayer-badge" style="background-color: transparent; border: 2px solid #dc2626;"></div>
                            <div class="sublayer-info">
                                <div class="sublayer-title" title="Limite do Projeto (${item.name})">Limite do Projeto</div>
                                <div class="sublayer-meta">${propAreaStr}</div>
                            </div>
                        </div>
                        <button type="button" class="btn-icon btn-sublayer-zoom" data-zoom-type="prop" data-prop-key="${key}" title="Aproximar zoom no limite do projeto">
                            <i class="fa-solid fa-crosshairs"></i>
                        </button>
                    </div>
                    ${mataRowsHtml}
                    ${saresBlockHtml}
                </div>
            `;
        }

        layerEl.innerHTML = `
            <div class="layer-main-row">
                <div class="layer-left">
                    <input type="checkbox" class="custom-checkbox layer-toggle" data-key="${key}" ${item.visible ? 'checked' : ''}>
                    <div class="color-badge" style="${badgeStyle}"></div>
                    <div style="min-width: 0; flex: 1;">
                        <div class="layer-name" title="${item.name}">${item.name}</div>
                        ${areaVal ? `<div class="layer-subtitle">${areaVal} ha${averbadaSubtitleHtml}</div>` : ''}
                    </div>
                </div>
                <div class="layer-actions">
                    <button type="button" class="btn-icon btn-zoom-layer" data-key="${key}" title="Aproximar zoom nesta propriedade">
                        <i class="fa-solid fa-crosshairs"></i>
                    </button>
                    <button type="button" class="btn-icon btn-expand-layer" data-key="${key}" title="Ajustar opacidade">
                        <i class="fa-solid fa-sliders"></i>
                    </button>
                    ${isFlorestaPronta ? `
                    <button type="button" class="btn-icon btn-toggle-sublayers" data-key="${key}" title="Abrir lista de áreas deste projeto">
                        <i class="fa-solid fa-chevron-down"></i>
                    </button>
                    ` : ''}
                </div>
            </div>
            <div class="layer-extra-controls">
                <span class="opacity-label">${isPropriedade ? 'Contorno:' : 'Opacidade:'}</span>
                <input type="range" class="opacity-slider" data-key="${key}" min="0" max="100" value="${defaultSliderVal}">
            </div>
            ${sublayersPanelHtml}
        `;
        return layerEl;
    }

    const emptyMsg = '<div style="padding: 10px 12px; font-size: 0.78rem; color: var(--text-muted); font-style: italic;">Nenhuma camada adicionada ainda.</div>';

    let restauracaoCount   = 0;
    let florestaCount      = 0;
    let propriedadeCount   = 0;

    sortedProjectKeys.forEach((key) => {
        const item = projectLayers[key];
        const cat  = projectCategory[key] || 'restauracao';

        // Camadas de floresta_mata_nativa ficam incorporadas diretamente na camada floresta_pronta correspondente
        if (cat === 'floresta_mata_nativa') {
            return;
        }

        const el   = buildLayerItem(key, item);

        if (cat === 'floresta_pronta') {
            if (florestaContainer) florestaContainer.appendChild(el);
            florestaCount++;
        } else if (cat === 'area_propriedade') {
            if (propriedadeContainer) propriedadeContainer.appendChild(el);
            propriedadeCount++;
        } else {
            if (restauracaoContainer) restauracaoContainer.appendChild(el);
            restauracaoCount++;
        }
    });

    // Atualizar badges de contagem
    const restBadge = document.getElementById('restauracao-count');
    if (restBadge) restBadge.textContent = restauracaoCount;

    const florBadge = document.getElementById('floresta-count');
    if (florBadge) florBadge.textContent = florestaCount;

    const propBadge = document.getElementById('propriedade-count');
    if (propBadge) propBadge.textContent = propriedadeCount;

    // Mensagem se categoria vazia
    if (florestaCount    === 0 && florestaContainer)    florestaContainer.innerHTML    = emptyMsg;
    if (propriedadeCount === 0 && propriedadeContainer) propriedadeContainer.innerHTML = emptyMsg;


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

    // Update Footer Summary Statistics
    updateFooterStats();
    updateAllCategoryButtons();

    function updateFooterStats() {
        let restauracaoHa = 0;
        let florestaHa = 0;
        const processedFlorestaProps = new Set();

        Object.values(projectLayers).forEach(p => {
            if (p.visible) {
                if (p.categoria === 'restauracao') {
                    if (p.areaHa) {
                        const area = parseFloat(p.areaHa);
                        if (!isNaN(area)) restauracaoHa += area;
                    }
                } else if (p.categoria === 'floresta_pronta' || p.categoria === 'floresta_mata_nativa') {
                    if (p.isAverbada) return;
                    const cleanName = p.key.replace(/^(floresta_pronta|floresta_mata_nativa)__/, '').trim();
                    if (!processedFlorestaProps.has(cleanName)) {
                        processedFlorestaProps.add(cleanName);

                        // Busca o quadro_area vinculado à propriedade
                        const propKey = `floresta_pronta__${cleanName}`;
                        const propLayer = projectLayers[propKey] || p;
                        const qa = (propLayer.data && propLayer.data.quadro_area) || propLayer.quadro_area;

                        if (qa && Array.isArray(qa)) {
                            const dispRow = qa.find(row => {
                                const tema = String(row.Tema || row.tema || row.TEMA || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                                return tema.includes('disponivel');
                            });
                            const excRow = qa.find(row => {
                                const tema = String(row.Tema || row.tema || row.TEMA || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                                return tema.includes('excedente') || tema.includes('remanescente');
                            });
                            const targetRow = dispRow || excRow;
                            if (targetRow) {
                                const val = targetRow['Área (ha)'] || targetRow['area (ha)'] || targetRow['Area (ha)'] || targetRow['Área'] || targetRow['area'] || 0;
                                const numVal = typeof val === 'number' ? val : (parseFloat(String(val).replace(',', '.')) || 0);
                                if (!isNaN(numVal)) florestaHa += numVal;
                            }
                        }
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

    // Base Map Floating Panel Minimize / Expand
    const basemapFloatingHeader = document.getElementById('basemap-floating-header');
    const basemapFloatingPanel = document.getElementById('basemap-floating-right');
    if (basemapFloatingHeader && basemapFloatingPanel) {
        basemapFloatingHeader.addEventListener('click', () => {
            basemapFloatingPanel.classList.toggle('minimized');
        });
    }

    // Accordion Sections Collapse / Expand
    document.querySelectorAll('.accordion-header, .sub-accordion-header').forEach(header => {
        header.addEventListener('click', (e) => {
            if (e.target.closest('.btn-cat-toggle') || e.target.closest('button')) return;
            const section = header.closest('.accordion-section, .sub-accordion-section');
            if (section) section.classList.toggle('active');
        });
    });

    // Helpers para sincronizar estado completo de projetos Floresta Pronta (Limite + Vegetação + SAREs individuais)
    function setFlorestaPropertyAllState(propKey, targetState) {
        const propItem = projectLayers[propKey];
        if (!propItem) return;

        propItem.visible = targetState;
        propItem.boundaryVisible = targetState;
        if (targetState) {
            if (!map.hasLayer(propItem.layer)) map.addLayer(propItem.layer);
        } else {
            if (map.hasLayer(propItem.layer)) map.removeLayer(propItem.layer);
        }

        const linkedKeys = propItem.linkedKeys || (propItem.linkedKey ? [propItem.linkedKey] : []);
        linkedKeys.forEach(lk => {
            const linked = projectLayers[lk];
            if (!linked) return;
            linked.visible = targetState;
            if (linked.isAverbada && Array.isArray(linked.featureItems)) {
                linked.featureItems.forEach(fItem => {
                    fItem.visible = targetState;
                    if (targetState) {
                        if (!linked.layer.hasLayer(fItem.layer)) linked.layer.addLayer(fItem.layer);
                    } else {
                        if (linked.layer.hasLayer(fItem.layer)) linked.layer.removeLayer(fItem.layer);
                    }
                });
            }
            if (targetState) {
                if (!map.hasLayer(linked.layer)) map.addLayer(linked.layer);
            } else {
                if (map.hasLayer(linked.layer)) map.removeLayer(linked.layer);
            }
        });

        const cardEl = document.querySelector(`.layer-item[data-key="${CSS.escape(propKey)}"]`);
        if (cardEl) {
            const mainChk = cardEl.querySelector('.layer-toggle');
            if (mainChk) {
                mainChk.checked = targetState;
                mainChk.indeterminate = false;
            }
            cardEl.querySelectorAll('.sublayer-checkbox').forEach(chk => {
                chk.checked = targetState;
                chk.indeterminate = false;
            });
        }
    }

    function syncFlorestaPropertyParentState(propKey) {
        const propItem = projectLayers[propKey];
        if (!propItem) return;

        const linkedKeys = propItem.linkedKeys || (propItem.linkedKey ? [propItem.linkedKey] : []);
        const baseMataItems = linkedKeys.map(lk => projectLayers[lk]).filter(x => x && !x.isAverbada);
        const avItems = linkedKeys.map(lk => projectLayers[lk]).filter(x => x && x.isAverbada);

        const allSareStates = [];
        avItems.forEach(av => {
            if (Array.isArray(av.featureItems)) {
                const anyAvVisible = av.featureItems.some(f => f.visible);
                av.visible = anyAvVisible;
                if (anyAvVisible) {
                    if (!map.hasLayer(av.layer)) map.addLayer(av.layer);
                } else {
                    if (map.hasLayer(av.layer)) map.removeLayer(av.layer);
                }
                av.featureItems.forEach(f => allSareStates.push(Boolean(f.visible)));
            }
        });

        const allStates = [
            Boolean(propItem.boundaryVisible !== false),
            ...baseMataItems.map(m => Boolean(m.visible)),
            ...allSareStates
        ];

        const anyVisible = allStates.some(Boolean);
        const allVisible = allStates.length > 0 && allStates.every(Boolean);
        propItem.visible = anyVisible;

        const cardEl = document.querySelector(`.layer-item[data-key="${CSS.escape(propKey)}"]`);
        if (cardEl) {
            const mainChk = cardEl.querySelector('.layer-toggle');
            if (mainChk) {
                mainChk.checked = anyVisible;
                mainChk.indeterminate = anyVisible && !allVisible;
            }
            const sareGroupChk = cardEl.querySelector('.sublayer-toggle-all-sares');
            if (sareGroupChk && allSareStates.length > 0) {
                const anySare = allSareStates.some(Boolean);
                const allSare = allSareStates.every(Boolean);
                sareGroupChk.checked = anySare;
                sareGroupChk.indeterminate = anySare && !allSare;
            }
        }
    }

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
            if (cat === 'floresta_pronta') {
                setFlorestaPropertyAllState(key, targetState);
                return;
            }
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

        if (containerId && cat !== 'floresta_pronta') {
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

    // Project & Sublayer Checkbox Toggle (delegado no sidebar-body)
    document.querySelector('.sidebar-body').addEventListener('change', (e) => {
        const target = e.target;

        // 1. Master toggle do projeto
        if (target.classList.contains('layer-toggle')) {
            const key = target.dataset.key;
            const isChecked = target.checked;
            const item = projectLayers[key];

            if (item) {
                if (item.categoria === 'floresta_pronta') {
                    setFlorestaPropertyAllState(key, isChecked);
                } else {
                    item.visible = isChecked;
                    if (isChecked) {
                        map.addLayer(item.layer);
                        if (item.categoria === 'area_propriedade') {
                            item.layer.bringToBack();
                        }
                    } else {
                        map.removeLayer(item.layer);
                    }
                }

                updateAllCategoryButtons();
                updateFooterStats();
            }
            return;
        }

        // 2. Sub-aba: Limite do Projeto (borda vermelha)
        if (target.classList.contains('sublayer-toggle-prop')) {
            const propKey = target.dataset.propKey;
            const isChecked = target.checked;
            const propItem = projectLayers[propKey];
            if (propItem) {
                propItem.boundaryVisible = isChecked;
                if (isChecked) {
                    if (!map.hasLayer(propItem.layer)) map.addLayer(propItem.layer);
                } else {
                    if (map.hasLayer(propItem.layer)) map.removeLayer(propItem.layer);
                }
                syncFlorestaPropertyParentState(propKey);
                updateAllCategoryButtons();
                updateFooterStats();
            }
            return;
        }

        // 3. Sub-aba: Vegetação Nativa
        if (target.classList.contains('sublayer-toggle-mata')) {
            const propKey = target.dataset.propKey;
            const mataKey = target.dataset.mataKey;
            const isChecked = target.checked;
            const mataItem = projectLayers[mataKey];
            if (mataItem) {
                mataItem.visible = isChecked;
                if (isChecked) {
                    if (!map.hasLayer(mataItem.layer)) map.addLayer(mataItem.layer);
                } else {
                    if (map.hasLayer(mataItem.layer)) map.removeLayer(mataItem.layer);
                }
                syncFlorestaPropertyParentState(propKey);
                updateAllCategoryButtons();
                updateFooterStats();
            }
            return;
        }

        // 4. Sub-aba: Ativar/Desativar todos os SAREs do projeto
        if (target.classList.contains('sublayer-toggle-all-sares')) {
            const propKey = target.dataset.propKey;
            const isChecked = target.checked;
            const propItem = projectLayers[propKey];
            if (propItem) {
                const linkedKeys = propItem.linkedKeys || (propItem.linkedKey ? [propItem.linkedKey] : []);
                linkedKeys.forEach(lk => {
                    const avItem = projectLayers[lk];
                    if (avItem && avItem.isAverbada && Array.isArray(avItem.featureItems)) {
                        avItem.featureItems.forEach(fItem => {
                            fItem.visible = isChecked;
                            if (isChecked) {
                                if (!avItem.layer.hasLayer(fItem.layer)) avItem.layer.addLayer(fItem.layer);
                            } else {
                                if (avItem.layer.hasLayer(fItem.layer)) avItem.layer.removeLayer(fItem.layer);
                            }
                        });
                    }
                });
                const cardEl = target.closest('.layer-item');
                if (cardEl) {
                    cardEl.querySelectorAll('.sublayer-toggle-sare').forEach(chk => {
                        chk.checked = isChecked;
                    });
                }
                syncFlorestaPropertyParentState(propKey);
                updateAllCategoryButtons();
                updateFooterStats();
            }
            return;
        }

        // 5. Sub-aba: SARE individual
        if (target.classList.contains('sublayer-toggle-sare')) {
            const propKey = target.dataset.propKey;
            const avKey = target.dataset.avKey;
            const sareIdx = parseInt(target.dataset.sareIdx, 10);
            const isChecked = target.checked;
            const avItem = projectLayers[avKey];
            if (avItem && Array.isArray(avItem.featureItems)) {
                const fItem = avItem.featureItems.find(f => f.idx === sareIdx);
                if (fItem) {
                    fItem.visible = isChecked;
                    if (isChecked) {
                        if (!avItem.layer.hasLayer(fItem.layer)) avItem.layer.addLayer(fItem.layer);
                    } else {
                        if (avItem.layer.hasLayer(fItem.layer)) avItem.layer.removeLayer(fItem.layer);
                    }
                }
                syncFlorestaPropertyParentState(propKey);
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

    // Zoom / Expand / Sublayers buttons (delegado no sidebar-body)
    document.querySelector('.sidebar-body').addEventListener('click', (e) => {
        const zoomBtn = e.target.closest('.btn-zoom-layer');
        if (zoomBtn) {
            const key = zoomBtn.dataset.key;
            const item = projectLayers[key];
            if (item && item.layer) {
                let bounds = item.layer.getBounds();
                const linkedKeys = item.linkedKeys || (item.linkedKey ? [item.linkedKey] : []);
                linkedKeys.forEach(lk => {
                    if (projectLayers[lk] && projectLayers[lk].layer) {
                        const b2 = projectLayers[lk].layer.getBounds();
                        if (b2.isValid()) {
                            bounds = bounds.isValid() ? bounds.extend(b2) : b2;
                        }
                    }
                });
                if (bounds.isValid()) {
                    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
                }
            }
            return;
        }

        const expandBtn = e.target.closest('.btn-expand-layer');
        if (expandBtn) {
            const layerItem = expandBtn.closest('.layer-item');
            layerItem.classList.toggle('expanded');
            return;
        }

        const sublayersBtn = e.target.closest('.btn-toggle-sublayers');
        if (sublayersBtn) {
            const layerItem = sublayersBtn.closest('.layer-item');
            if (layerItem) {
                layerItem.classList.toggle('sublayers-open');
            }
            return;
        }

        const subZoomBtn = e.target.closest('.btn-sublayer-zoom');
        if (subZoomBtn) {
            const zoomType = subZoomBtn.dataset.zoomType;
            const propKey = subZoomBtn.dataset.propKey;
            const cardEl = subZoomBtn.closest('.layer-item');

            if (zoomType === 'prop') {
                const propItem = projectLayers[propKey];
                if (propItem && propItem.layer) {
                    if (propItem.boundaryVisible === false) {
                        propItem.boundaryVisible = true;
                        if (!map.hasLayer(propItem.layer)) map.addLayer(propItem.layer);
                        if (cardEl) {
                            const chk = cardEl.querySelector('.sublayer-toggle-prop');
                            if (chk) chk.checked = true;
                        }
                        syncFlorestaPropertyParentState(propKey);
                        updateAllCategoryButtons();
                    }
                    const b = propItem.layer.getBounds();
                    if (b.isValid()) map.fitBounds(b, { padding: [50, 50], maxZoom: 16 });
                }
            } else if (zoomType === 'mata') {
                const mataKey = subZoomBtn.dataset.mataKey;
                const mataItem = projectLayers[mataKey];
                if (mataItem && mataItem.layer) {
                    if (!mataItem.visible) {
                        mataItem.visible = true;
                        if (!map.hasLayer(mataItem.layer)) map.addLayer(mataItem.layer);
                        if (cardEl) {
                            const chk = cardEl.querySelector(`.sublayer-toggle-mata[data-mata-key="${CSS.escape(mataKey)}"]`);
                            if (chk) chk.checked = true;
                        }
                        syncFlorestaPropertyParentState(propKey);
                        updateAllCategoryButtons();
                    }
                    const b = mataItem.layer.getBounds();
                    if (b.isValid()) map.fitBounds(b, { padding: [50, 50], maxZoom: 16 });
                }
            } else if (zoomType === 'sare') {
                const avKey = subZoomBtn.dataset.avKey;
                const sareIdx = parseInt(subZoomBtn.dataset.sareIdx, 10);
                const avItem = projectLayers[avKey];
                if (avItem && Array.isArray(avItem.featureItems)) {
                    const fItem = avItem.featureItems.find(f => f.idx === sareIdx);
                    if (fItem && fItem.layer) {
                        if (!fItem.visible) {
                            fItem.visible = true;
                            if (!avItem.layer.hasLayer(fItem.layer)) avItem.layer.addLayer(fItem.layer);
                            if (cardEl) {
                                const chk = cardEl.querySelector(`.sublayer-toggle-sare[data-av-key="${CSS.escape(avKey)}"][data-sare-idx="${sareIdx}"]`);
                                if (chk) chk.checked = true;
                            }
                            syncFlorestaPropertyParentState(propKey);
                            updateAllCategoryButtons();
                        }
                        if (!map.hasLayer(avItem.layer)) map.addLayer(avItem.layer);
                        const b = fItem.layer.getBounds();
                        if (b.isValid()) {
                            map.fitBounds(b, { padding: [60, 60], maxZoom: 17 });
                            setTimeout(() => {
                                if (fItem.layer.openPopup) fItem.layer.openPopup();
                            }, 280);
                        }
                    }
                }
            }
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

    // ======================================================================
    // Seletor e Pesquisa de Municípios (Painel Outros Limites)
    // ======================================================================
    function jumpToMunicipalityByName(muniName) {
        if (!muniName) return;
        const cleanTarget = muniName.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const outrosItem = outrosLayers['municipios_SP'];
        if (!outrosItem) return;

        // Ativa a camada se estiver desmarcada
        if (!outrosItem.visible && !map.hasLayer(outrosItem.layer)) {
            map.addLayer(outrosItem.layer);
            outrosItem.visible = true;
            const chk = document.querySelector(`.outros-toggle[data-key="municipios_SP"]`);
            if (chk) chk.checked = true;
        }

        let found = false;
        if (outrosItem.layer) {
            outrosItem.layer.eachLayer(l => {
                if (found) return;
                const nm = l.feature && l.feature.properties && l.feature.properties.NM_MUN;
                if (!nm) return;
                const cleanNm = String(nm).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                if (cleanNm === cleanTarget) {
                    found = true;
                    const bounds = l.getBounds();
                    if (bounds.isValid()) {
                        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13.5 });
                        // Destaca a borda temporariamente
                        l.setStyle({ weight: 3.2, color: '#0284c7', fillOpacity: 0.18 });
                        setTimeout(() => {
                            if (outrosItem.layer) outrosItem.layer.resetStyle(l);
                        }, 3500);
                        setTimeout(() => {
                            if (l.openPopup) {
                                l.openPopup();
                            } else if (l.openTooltip) {
                                l.openTooltip();
                            }
                        }, 300);
                    }
                }
            });
        }
    }

    function initOutrosMunicipalitySelector() {
        const muniSelect = document.getElementById('muni-select');

        const outrosItem = outrosLayers['municipios_SP'];
        if (!outrosItem || !outrosItem.data || !outrosItem.data.features) return;

        const features = outrosItem.data.features;
        const sortedMunis = features
            .map(f => f.properties && f.properties.NM_MUN)
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, 'pt-BR'));

        if (muniSelect) {
            muniSelect.innerHTML = '<option value="">-- Selecione um município --</option>';
            sortedMunis.forEach(muni => {
                const opt = document.createElement('option');
                opt.value = muni;
                opt.textContent = muni;
                muniSelect.appendChild(opt);
            });
            muniSelect.addEventListener('change', (e) => {
                const val = e.target.value;
                if (val) {
                    jumpToMunicipalityByName(val);
                }
            });
        }

    }

    initOutrosMunicipalitySelector();

    // Opacity Slider Input (delegado no sidebar-body)
    document.querySelector('.sidebar-body').addEventListener('input', (e) => {
        if (e.target.classList.contains('opacity-slider')) {
            const key = e.target.dataset.key;
            const val = parseFloat(e.target.value) / 100;
            const item = projectLayers[key];

            if (item && item.layer) {
                item.opacity = val;

                // Se houver camadas vinculadas (ex: vegetação e áreas averbadas de Banco de Áreas)
                const linkedKeys = item.linkedKeys || (item.linkedKey ? [item.linkedKey] : []);
                linkedKeys.forEach(lk => {
                    const linked = projectLayers[lk];
                    if (linked) {
                        linked.opacity = val;
                        if (linked.layer) {
                            linked.layer.setStyle({ fillOpacity: val });
                        }
                    }
                });

                if (item.categoria === 'area_propriedade') {
                    item.layer.setStyle({ opacity: Math.max(0.1, val), fillOpacity: 0 });
                } else if (item.categoria === 'floresta_pronta') {
                    item.layer.setStyle({ opacity: Math.max(0.2, val) });
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
            if (item.categoria === 'floresta_pronta') {
                setFlorestaPropertyAllState(key, true);
                return;
            }
            if (item.categoria === 'floresta_mata_nativa') return;
            item.visible = true;
            if (!map.hasLayer(item.layer)) {
                map.addLayer(item.layer);
                if (item.categoria === 'area_propriedade') {
                    item.layer.bringToBack();
                }
            }
        });
        document.querySelectorAll('.layer-toggle').forEach(chk => {
            chk.checked = true;
            chk.indeterminate = false;
        });
        updateAllCategoryButtons();
        updateFooterStats();
    });

    document.getElementById('btn-deselect-all').addEventListener('click', () => {
        Object.keys(projectLayers).forEach(key => {
            const item = projectLayers[key];
            if (item.categoria === 'floresta_pronta') {
                setFlorestaPropertyAllState(key, false);
                return;
            }
            if (item.categoria === 'floresta_mata_nativa') return;
            item.visible = false;
            if (map.hasLayer(item.layer)) {
                map.removeLayer(item.layer);
            }
        });
        document.querySelectorAll('.layer-toggle').forEach(chk => {
            chk.checked = false;
            chk.indeterminate = false;
        });
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

    // ----------------------------------------------------------------------
    // Botão de alternância: Situação dos Projetos (Ativos x Finalizados)
    // ----------------------------------------------------------------------
    const btnToggleStatus = document.getElementById('btn-toggle-status');
    const statusSummaryBox = document.getElementById('status-summary-box');
    const btnCloseStatusSummary = document.getElementById('btn-close-status-summary');

    if (btnToggleStatus) {
        btnToggleStatus.addEventListener('click', () => {
            colorByStatusEnabled = !colorByStatusEnabled;
            btnToggleStatus.classList.toggle('active', colorByStatusEnabled);

            btnToggleStatus.title = colorByStatusEnabled
                ? 'Clique para voltar às cores normais das categorias'
                : 'Colorir camadas por Situação do Projeto (Laranja = Em atividade, Azul = Finalizado)';

            if (statusSummaryBox) {
                if (colorByStatusEnabled) {
                    statusSummaryBox.classList.remove('hidden');
                    updateProjectStatusCounts();
                } else {
                    statusSummaryBox.classList.add('hidden');
                }
            }

            updateAllProjectLayerStyles();
        });
    }

    if (btnCloseStatusSummary && btnToggleStatus) {
        btnCloseStatusSummary.addEventListener('click', (e) => {
            e.stopPropagation();
            if (colorByStatusEnabled) {
                btnToggleStatus.click();
            }
        });
    }

    function updateProjectStatusCounts() {
        let countAtivo = 0;
        let countFinalizado = 0;

        Object.keys(projectLayers).forEach(key => {
            const item = projectLayers[key];
            if (!item || !item.data || !item.data.features || item.data.features.length === 0) return;
            if (item.categoria === 'area_propriedade') return;

            let statusCategory = null;
            for (const feat of item.data.features) {
                const s = getFeatureStatus(feat);
                if (s.includes('finaliz') || s.includes('conclu')) {
                    statusCategory = 'finalizado';
                    break;
                } else if (s.includes('ativ') || s.includes('andamento') || s.includes('plantio') || s.includes('manutenc')) {
                    statusCategory = 'ativo';
                    break;
                }
            }

            if (statusCategory === 'finalizado') {
                countFinalizado++;
            } else if (statusCategory === 'ativo') {
                countAtivo++;
            }
        });

        const elAtivo = document.getElementById('count-status-ativo');
        const elFinalizado = document.getElementById('count-status-finalizado');
        const elFooter = document.getElementById('status-summary-footer');
        if (elAtivo) elAtivo.textContent = countAtivo;
        if (elFinalizado) elFinalizado.textContent = countFinalizado;
        if (elFooter) {
            const total = countAtivo + countFinalizado;
            elFooter.textContent = `Total: ${total} projetos monitorados`;
        }
    }

    function updateAllProjectLayerStyles() {
        Object.keys(projectLayers).forEach(key => {
            const item = projectLayers[key];
            if (!item) return;
            const cat = item.categoria || projectCategory[key] || 'restauracao';
            const isPropriedade = (cat === 'area_propriedade' || cat === 'floresta_pronta');

            if (item.layer) {
                const currentOpacity = (item.opacity !== undefined) ? item.opacity : (isPropriedade ? 0 : 0.45);
                item.layer.setStyle((feat) => getFeatureStyle(feat, item.color, currentOpacity, cat, Boolean(item.isAverbada)));
            }

            // Atualiza também o badge de cor na lista da barra lateral (apenas para Restauração)
            const layerEl = document.querySelector(`.layer-item[data-key="${key}"]`);
            if (layerEl && !isPropriedade) {
                const badgeEl = layerEl.querySelector('.color-badge');
                if (badgeEl) {
                    if (colorByStatusEnabled && item.data && item.data.features && item.data.features.length > 0) {
                        const firstFeat = item.data.features[0];
                        badgeEl.style.backgroundColor = getFeatureColor(firstFeat, item.color);
                    } else {
                        badgeEl.style.backgroundColor = item.color;
                    }
                }
            }

            // Atualiza também as cores dos marcadores na aba de Municípios
            const muniProjEl = document.querySelector(`.muni-proj-item[data-key="${key}"]`);
            if (muniProjEl && !isPropriedade) {
                const muniDot = muniProjEl.querySelector('.muni-proj-dot');
                if (muniDot && item.data && item.data.features && item.data.features.length > 0) {
                    muniDot.style.backgroundColor = getFeatureColor(item.data.features[0], item.color);
                }
            }
        });
    }

    // ======================================================================
    // 6. Aba Municípios: Mapeamento Canônico, Indexação e Interatividade
    // ======================================================================
    const MUNICIPALITY_CANONICAL = {
        'joanopolis': 'Joanópolis',
        'joanópolis': 'Joanópolis',
        'salesopolis': 'Salesópolis',
        'salesópolis': 'Salesópolis',
        'alesópolis': 'Salesópolis',
        'piracaia': 'Piracaia',
        'atibaia': 'Atibaia',
        'bragança paulista': 'Bragança Paulista',
        'braganca paulista': 'Bragança Paulista',
        'cajamar': 'Cajamar',
        'valinhos': 'Valinhos',
        'guarulhos': 'Guarulhos',
        'paraibuna': 'Paraibuna',
        'são josé dos campos': 'São José dos Campos',
        'sao jose dos campos': 'São José dos Campos',
        'são francisco xavier': 'São José dos Campos',
        'sao francisco xavier': 'São José dos Campos',
        'nova odessa': 'Nova Odessa',
        'jaguariúna': 'Jaguariúna',
        'jaguariuna': 'Jaguariúna',
        'franco da rocha': 'Franco da Rocha',
        'são paulo': 'São Paulo',
        'sao paulo': 'São Paulo',
        'euclides da cunha': 'Euclides da Cunha Paulista',
        'euclides da cunha paulista': 'Euclides da Cunha Paulista',
        'jacareí': 'Jacareí',
        'jacarei': 'Jacareí',
        'cabreúva': 'Cabreúva',
        'cabreuva': 'Cabreúva',
        'são pedro': 'São Pedro',
        'sao pedro': 'São Pedro',
        'pedra bela': 'Pedra Bela',
        'limeira': 'Limeira',
        'ouro verde': 'Ouro Verde',
        'extrema': 'Extrema',
        'pinhalzinho': 'Pinhalzinho',
        'tatuí': 'Tatuí',
        'tatui': 'Tatuí',
        'campinas': 'Campinas',
        'nazaré paulista': 'Nazaré Paulista',
        'nazare paulista': 'Nazaré Paulista',
        'pompeia': 'Pompéia',
        'pompéia': 'Pompéia',
        'mogi das cruzes': 'Mogi das Cruzes',
        'jundiaí': 'Jundiaí',
        'jundiai': 'Jundiaí',
        'monteiro lobato': 'Monteiro Lobato',
        'são lourenço da serra': 'São Lourenço da Serra',
        'sao lourenco da serra': 'São Lourenço da Serra',
        'santa isabel': 'Santa Isabel',
        'guararema': 'Guararema'
    };

    function normalizeMuniName(str) {
        if (!str) return '';
        const clean = String(str).trim();
        const lower = clean.toLowerCase();
        if (MUNICIPALITY_CANONICAL[lower]) return MUNICIPALITY_CANONICAL[lower];
        const noDiacritics = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (MUNICIPALITY_CANONICAL[noDiacritics]) return MUNICIPALITY_CANONICAL[noDiacritics];
        return clean;
    }

    function extractProjectMunicipality(item) {
        if (!item || !item.data) return null;
        const features = item.data.features || [];
        if (features.length === 0) return null;

        // 1. Procurar nas propriedades da feature
        for (const feat of features) {
            const props = feat.properties || {};
            for (const k of Object.keys(props)) {
                const normKey = k.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                if (normKey === 'municipio' || normKey === 'municipio_' || normKey === 'cidade') {
                    const val = props[k];
                    if (val) {
                        const m = normalizeMuniName(val);
                        if (m) return m;
                    }
                }
            }
        }

        // 2. Fallback espacial: Interseção com municípios via Turf
        try {
            if (window.turf && geoData.outros && geoData.outros['municipios_SP']) {
                const muniCollection = geoData.outros['municipios_SP'];
                const firstFeat = features[0];

                // Ponto de teste: preferir pointOnFeature para garantir que esteja no polígono
                let point = null;
                try {
                    point = turf.pointOnFeature(firstFeat);
                } catch (e) {
                    point = turf.centroid(firstFeat);
                }

                if (point && muniCollection.features) {
                    for (const muniFeat of muniCollection.features) {
                        if (turf.booleanPointInPolygon(point, muniFeat)) {
                            const m = muniFeat.properties && muniFeat.properties.NM_MUN;
                            if (m) return normalizeMuniName(m);
                        }
                    }
                }

                // Fallback secundário usando centroid
                const centroidPoint = turf.centroid(firstFeat);
                if (centroidPoint && muniCollection.features) {
                    for (const muniFeat of muniCollection.features) {
                        if (turf.booleanPointInPolygon(centroidPoint, muniFeat)) {
                            const m = muniFeat.properties && muniFeat.properties.NM_MUN;
                            if (m) return normalizeMuniName(m);
                        }
                    }
                }

                // Fallback terciário: primeiro vértice da geometria
                if (firstFeat.geometry && firstFeat.geometry.coordinates) {
                    let c = firstFeat.geometry.coordinates;
                    while (Array.isArray(c) && Array.isArray(c[0])) {
                        c = c[0];
                    }
                    if (Array.isArray(c) && c.length >= 2 && typeof c[0] === 'number') {
                        const pt = turf.point([c[0], c[1]]);
                        for (const muniFeat of muniCollection.features) {
                            if (turf.booleanPointInPolygon(pt, muniFeat)) {
                                const m = muniFeat.properties && muniFeat.properties.NM_MUN;
                                if (m) return normalizeMuniName(m);
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('Erro no fallback espacial do município para', item.key, e);
        }

        return null;
    }

    let municipalityProjectsIndex = {};

    function buildMunicipalityProjectsIndex() {
        const index = {};

        // Obter os limites geométricos e UGRHI de cada município
        const muniBoundsMap = {};
        const muniUgrhiMap = {};
        if (outrosLayers['municipios_SP'] && outrosLayers['municipios_SP'].layer) {
            outrosLayers['municipios_SP'].layer.eachLayer(l => {
                if (l.feature && l.feature.properties && l.feature.properties.NM_MUN) {
                    const nm = normalizeMuniName(l.feature.properties.NM_MUN);
                    muniBoundsMap[nm] = l.getBounds();
                    const info = (window.MUNICIPIOS_BACIAS && window.MUNICIPIOS_BACIAS[nm]) || {};
                    if (info.ugrhi_str) {
                        muniUgrhiMap[nm] = info.ugrhi_str.split('-')[0].trim();
                    }
                }
            });
        }

        Object.keys(projectLayers).forEach(key => {
            const item = projectLayers[key];
            // Na aba de municípios, exibir apenas projetos reais (Restauração e Floresta Pronta - Matas Nativas).
            // Limites de propriedade e subcamadas averbadas não são duplicados como projetos separados.
            if (!item || item.categoria === 'area_propriedade' || item.categoria === 'floresta_pronta' || item.isAverbada) return;

            const muni = extractProjectMunicipality(item);
            if (!muni) return;

            if (!index[muni]) {
                index[muni] = {
                    name: muni,
                    count: 0,
                    totalAreaHa: 0,
                    ugrhi: muniUgrhiMap[muni] || 'SP',
                    bounds: muniBoundsMap[muni] || L.latLngBounds(),
                    projectBounds: L.latLngBounds(),
                    projects: []
                };
            }

            index[muni].count++;
            const areaNum = parseFloat(item.areaHa) || 0;
            index[muni].totalAreaHa += areaNum;

            if (item.layer && typeof item.layer.getBounds === 'function') {
                const b = item.layer.getBounds();
                if (b.isValid()) {
                    index[muni].projectBounds.extend(b);
                }
            }

            // Status da feature
            let status = 'outro';
            let statusDesc = item.categoria === 'floresta_mata_nativa' ? 'Floresta Pronta' : 'Em atividade';
            if (item.data && item.data.features && item.data.features.length > 0) {
                const s = getFeatureStatus(item.data.features[0]);
                if (s.includes('finaliz') || s.includes('conclu')) {
                    status = 'finalizado';
                    statusDesc = 'Finalizado';
                } else if (s.includes('ativ') || s.includes('andamento') || s.includes('plantio') || s.includes('manutenc')) {
                    status = 'ativo';
                    statusDesc = 'Em atividade';
                }
            }

            index[muni].projects.push({
                key: key,
                name: item.name,
                categoria: item.categoria,
                areaHa: item.areaHa,
                status: status,
                statusDesc: statusDesc,
                color: item.color
            });
        });

        // Ordenar os projetos dentro de cada município alfabeticamente
        Object.keys(index).forEach(muni => {
            index[muni].projects.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' }));
        });

        municipalityProjectsIndex = index;
        return index;
    }

    function zoomToMunicipality(muniName) {
        const data = municipalityProjectsIndex[muniName];
        if (!data) return;

        if (data.bounds && typeof data.bounds.isValid === 'function' && data.bounds.isValid()) {
            map.fitBounds(data.bounds, { padding: [40, 40], maxZoom: 14 });
        } else if (data.projectBounds && typeof data.projectBounds.isValid === 'function' && data.projectBounds.isValid()) {
            map.fitBounds(data.projectBounds, { padding: [50, 50], maxZoom: 15 });
        }

        // Destaca temporariamente a borda do município se a camada estiver ativa
        const outrosItem = outrosLayers['municipios_SP'];
        if (outrosItem && outrosItem.layer) {
            outrosItem.layer.eachLayer(l => {
                if (l.feature && l.feature.properties && normalizeMuniName(l.feature.properties.NM_MUN) === muniName) {
                    l.setStyle({ weight: 3, color: '#0284c7', fillOpacity: 0.16 });
                    setTimeout(() => {
                        if (outrosItem.layer) outrosItem.layer.resetStyle(l);
                    }, 3000);
                }
            });
        }
    }

    function focusProjectOnMap(key) {
        const item = projectLayers[key];
        if (!item || !item.layer) return;

        // Se a camada estiver desmarcada, ativá-la (e também a propriedade vinculada / subcamadas)
        if (!item.visible) {
            item.layer.addTo(map);
            item.visible = true;
            const chk = document.querySelector(`.layer-toggle[data-key="${key}"]`);
            if (chk) chk.checked = true;

            if (item.linkedKey && projectLayers[item.linkedKey]) {
                const parentProp = projectLayers[item.linkedKey];
                parentProp.visible = true;
                if (!map.hasLayer(parentProp.layer)) parentProp.layer.addTo(map);
                const pChk = document.querySelector(`.layer-toggle[data-key="${item.linkedKey}"]`);
                if (pChk) pChk.checked = true;
                const siblingKeys = parentProp.linkedKeys || [];
                siblingKeys.forEach(sk => {
                    if (projectLayers[sk]) {
                        projectLayers[sk].visible = true;
                        if (!map.hasLayer(projectLayers[sk].layer)) projectLayers[sk].layer.addTo(map);
                    }
                });
            }

            updateAllCategoryButtons();
            updateFooterStats();
        }

        // Zoom suave para os limites do projeto
        try {
            const bounds = item.layer.getBounds();
            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
            }
        } catch (e) {
            console.warn('Erro ao ajustar limites do projeto', key, e);
        }

        // Abre popup do primeiro elemento
        item.layer.eachLayer(l => {
            if (l.openPopup) {
                l.openPopup();
                return;
            }
        });
    }

    function renderMunicipalityCards() {
        const container = document.getElementById('muni-cards-container');
        if (!container) return;

        const index = buildMunicipalityProjectsIndex();
        const sortedMunis = Object.keys(index).sort((a, b) => {
            if (index[b].count !== index[a].count) {
                return index[b].count - index[a].count;
            }
            return a.localeCompare(b, 'pt-BR');
        });

        const totalMunis = sortedMunis.length;
        let totalProjects = 0;
        sortedMunis.forEach(m => totalProjects += index[m].count);

        // Atualizar contadores no cabeçalho e rodapé
        const tabBadge = document.getElementById('tab-badge-munis');
        if (tabBadge) tabBadge.textContent = totalMunis;

        const muniCountDisplay = document.getElementById('muni-count-display');
        if (muniCountDisplay) muniCountDisplay.textContent = totalMunis;

        const muniProjCountDisplay = document.getElementById('muni-projects-count-display');
        if (muniProjCountDisplay) muniProjCountDisplay.textContent = totalProjects;

        const summaryText = document.getElementById('muni-summary-text');
        if (summaryText) {
            summaryText.innerHTML = `<strong>${totalMunis} municípios</strong> com <strong>${totalProjects} projetos</strong>`;
        }

        container.innerHTML = '';

        if (totalMunis === 0) {
            container.innerHTML = `
                <div class="muni-empty-state">
                    <i class="fa-solid fa-map-location-dot"></i>
                    <span>Nenhum município com projetos encontrado.</span>
                </div>
            `;
            return;
        }

        sortedMunis.forEach(muniName => {
            const data = index[muniName];
            const card = document.createElement('div');
            card.className = 'muni-card';
            card.dataset.muni = muniName;

            const countText = data.count === 1 ? '1 projeto' : `${data.count} projetos`;
            const areaText = data.totalAreaHa > 0 ? ` • ${data.totalAreaHa.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} ha` : '';

            card.innerHTML = `
                <div class="muni-card-header" title="Clique para expandir/recolher os projetos de ${muniName}">
                    <div class="muni-card-left">
                        <div class="muni-pin-icon">
                            <i class="fa-solid fa-location-dot"></i>
                        </div>
                        <div class="muni-info">
                            <span class="muni-name">${muniName}</span>
                            <span class="muni-sub-info">${data.ugrhi}${areaText}</span>
                        </div>
                    </div>
                    <div class="muni-card-actions">
                        <span class="muni-count-badge" title="${countText} em ${muniName}">${data.count}</span>
                        <button type="button" class="btn-zoom-muni" title="Aproximar ${muniName} no mapa" data-muni="${muniName}">
                            <i class="fa-solid fa-location-crosshairs"></i>
                        </button>
                        <i class="fa-solid fa-chevron-down muni-chevron"></i>
                    </div>
                </div>
                <div class="muni-card-projects">
                    ${data.projects.map(p => {
                        const catTag = (p.categoria === 'floresta_pronta' || p.categoria === 'floresta_mata_nativa')
                            ? `<span class="muni-proj-tag tag-floresta">Floresta Pronta</span>`
                            : `<span class="muni-proj-tag tag-restauracao">Restauração</span>`;
                        const areaBadge = p.areaHa ? `<span class="muni-proj-area">${p.areaHa} ha</span>` : '';
                        const pItem = projectLayers[p.key];
                        let statusColor = p.color;
                        if (colorByStatusEnabled && pItem && pItem.data && pItem.data.features && pItem.data.features.length > 0) {
                            statusColor = getFeatureColor(pItem.data.features[0], p.color);
                        } else {
                            statusColor = p.status === 'ativo' ? '#f97316' : (p.status === 'finalizado' ? '#2563eb' : p.color);
                        }
                        return `
                            <div class="muni-proj-item" data-key="${p.key}" title="Ver ${p.name} no mapa (${p.statusDesc})">
                                <div class="muni-proj-left">
                                    <span class="muni-proj-dot" style="background-color: ${statusColor};" title="${p.statusDesc}"></span>
                                    <span class="muni-proj-name">${p.name}</span>
                                </div>
                                <div class="muni-proj-right">
                                    ${catTag}
                                    ${areaBadge}
                                    <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.65rem; color: var(--text-muted); opacity: 0.7;"></i>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;

            // Expandir / recolher card ao clicar no cabeçalho
            const header = card.querySelector('.muni-card-header');
            header.addEventListener('click', (e) => {
                if (e.target.closest('.btn-zoom-muni')) return;
                card.classList.toggle('expanded');
            });

            // Botão zoom no município
            const btnZoom = card.querySelector('.btn-zoom-muni');
            btnZoom.addEventListener('click', (e) => {
                e.stopPropagation();
                zoomToMunicipality(muniName);
            });

            // Clique nos itens de projetos
            const projItems = card.querySelectorAll('.muni-proj-item');
            projItems.forEach(itemEl => {
                itemEl.addEventListener('click', () => {
                    const key = itemEl.dataset.key;
                    focusProjectOnMap(key);
                });
            });

            container.appendChild(card);
        });
    }

    // Inicializa a aba de municípios
    renderMunicipalityCards();

    // Controle de Abas da Barra Lateral (Camadas vs Municípios)
    const tabBtnCamadas = document.getElementById('tab-btn-camadas');
    const tabBtnMunicipios = document.getElementById('tab-btn-municipios');
    const paneCamadas = document.getElementById('pane-camadas');
    const paneMunicipios = document.getElementById('pane-municipios');

    function switchSidebarTab(tabName) {
        if (tabName === 'municipios') {
            if (tabBtnCamadas) tabBtnCamadas.classList.remove('active');
            if (tabBtnMunicipios) tabBtnMunicipios.classList.add('active');
            if (paneCamadas) {
                paneCamadas.style.display = 'none';
                paneCamadas.classList.remove('active');
            }
            if (paneMunicipios) {
                paneMunicipios.style.display = 'flex';
                paneMunicipios.classList.add('active');
            }
        } else {
            if (tabBtnMunicipios) tabBtnMunicipios.classList.remove('active');
            if (tabBtnCamadas) tabBtnCamadas.classList.add('active');
            if (paneMunicipios) {
                paneMunicipios.style.display = 'none';
                paneMunicipios.classList.remove('active');
            }
            if (paneCamadas) {
                paneCamadas.style.display = 'flex';
                paneCamadas.classList.add('active');
            }
        }
    }

    if (tabBtnCamadas && tabBtnMunicipios) {
        tabBtnCamadas.addEventListener('click', () => switchSidebarTab('camadas'));
        tabBtnMunicipios.addEventListener('click', () => switchSidebarTab('municipios'));
    }

    // Busca e Filtro em tempo real na aba Municípios
    const muniSearchInput = document.getElementById('muni-search-input');
    const btnClearMuniSearch = document.getElementById('btn-clear-muni-search');
    const btnMuniExpandAll = document.getElementById('btn-muni-expand-all');
    let allMunisExpanded = false;

    if (muniSearchInput) {
        muniSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (btnClearMuniSearch) {
                btnClearMuniSearch.classList.toggle('hidden', query.length === 0);
            }

            const cards = document.querySelectorAll('#muni-cards-container .muni-card');
            let visibleCount = 0;

            cards.forEach(card => {
                const muniName = card.dataset.muni || '';
                const normMuni = muniName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

                const matchesMuni = normMuni.includes(query);
                let matchesProj = false;

                const projItems = card.querySelectorAll('.muni-proj-item');
                projItems.forEach(pi => {
                    const pName = (pi.querySelector('.muni-proj-name')?.textContent || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    if (query && pName.includes(query)) {
                        matchesProj = true;
                        pi.style.display = 'flex';
                        pi.style.backgroundColor = '#fef08a';
                    } else {
                        pi.style.backgroundColor = '';
                        pi.style.display = (query.length > 0 && !matchesMuni) ? 'none' : 'flex';
                    }
                });

                if (matchesMuni || matchesProj) {
                    card.style.display = '';
                    visibleCount++;
                    if (query.length > 0) {
                        card.classList.add('expanded');
                    } else if (!allMunisExpanded) {
                        card.classList.remove('expanded');
                    }
                } else {
                    card.style.display = 'none';
                }
            });

            const summaryText = document.getElementById('muni-summary-text');
            if (summaryText) {
                if (query.length > 0) {
                    summaryText.innerHTML = `Mostrando <strong>${visibleCount}</strong> de <strong>${cards.length} municípios</strong>`;
                } else {
                    const index = municipalityProjectsIndex;
                    const totalM = Object.keys(index).length;
                    let totalP = 0;
                    Object.keys(index).forEach(m => totalP += index[m].count);
                    summaryText.innerHTML = `<strong>${totalM} municípios</strong> com <strong>${totalP} projetos</strong>`;
                }
            }
        });
    }

    if (btnClearMuniSearch && muniSearchInput) {
        btnClearMuniSearch.addEventListener('click', () => {
            muniSearchInput.value = '';
            muniSearchInput.dispatchEvent(new Event('input'));
            muniSearchInput.focus();
        });
    }

    if (btnMuniExpandAll) {
        btnMuniExpandAll.addEventListener('click', () => {
            allMunisExpanded = !allMunisExpanded;
            const cards = document.querySelectorAll('#muni-cards-container .muni-card');
            cards.forEach(c => c.classList.toggle('expanded', allMunisExpanded));
            const icon = document.getElementById('icon-muni-expand-all');
            if (icon) {
                icon.className = allMunisExpanded ? 'fa-solid fa-angles-up' : 'fa-solid fa-angles-down';
            }
            btnMuniExpandAll.title = allMunisExpanded ? 'Recolher todos os municípios' : 'Expandir todos os municípios';
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
        let clean = key
            .replace(/Â/g, '')
            .replace(/Ã/g, 'Á')
            .replace(/\?rea/gi, 'Área')
            .replace(/^rea\b/gi, 'Área')
            .trim();

        // Mapeamento padronizado de chaves de atributos com acentuação e pontuação corretas
        const keyMap = {
            'nome do projeto': 'Nome do Projeto',
            'propriedade': 'Propriedade',
            'tipo': 'Tipo',
            'ano de implantacao': 'Ano de Implantação',
            'ano de implantação': 'Ano de Implantação',
            'metodologia de restauracao': 'Metodologia de Restauração',
            'metodologia de restauração': 'Metodologia de Restauração',
            'monitoramento': 'Monitoramento',
            'municipio': 'Município',
            'município': 'Município',
            'ugrhi': 'UGRHI',
            'ughri': 'UGRHI',
            'regiao hidrografica': 'Região Hidrográfica',
            'região hidrográfica': 'Região Hidrográfica',
            'status do projeto': 'Situação do Projeto',
            'status': 'Situação do Projeto',
            'situacao': 'Situação do Projeto',
            'situação': 'Situação do Projeto',
            'fotos do projeto': 'Fotos do Projeto',
            'area (ha)': 'Área (ha)',
            'área (ha)': 'Área (ha)',
            'area': 'Área (ha)',
            'área': 'Área (ha)',
            'area disponivel': 'Área Disponível',
            'área disponível': 'Área Disponível',
            'vegetacao excedente': 'Vegetação Excedente',
            'vegetação excedente': 'Vegetação Excedente',
            'vegetacao remanescente': 'Vegetação Remanescente',
            'vegetação remanescente': 'Vegetação Remanescente',
            'imovel': 'Imóvel',
            'imóvel': 'Imóvel',
            'item': 'Item / Gleba',
            'processo': 'Processo CETESB',
            'area_decl': 'Área Declarada (ha)',
            'perim_decl': 'Perímetro Declarado (m)',
            'area_calc': 'Área Calculada (ha)',
            'soma (ha)': 'Soma Averbada (ha)'
        };

        const normK = clean.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        if (keyMap[normK]) return keyMap[normK];
        if (keyMap[clean.toLowerCase()]) return keyMap[clean.toLowerCase()];
        return clean;
    }

    function formatAttributeValue(val, key = '', projName = '') {
        if (val === null || val === undefined || val === '') {
            return '<span style="color: #94a3b8;">-</span>';
        }
        const normK = (key || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (typeof val === 'number') {
            if (normK === 'area_calc' || normK === 'area_decl' || normK.includes('soma') || normK === 'area' || normK === 'area (ha)') {
                return `${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha`;
            }
            if (normK === 'perim_decl') {
                return `${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
            }
            return val.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
        }
        let str = String(val).trim();

        if (normK.includes('nome')) {
            return projName || formatProjectDisplayName(str);
        }
        if (normK.includes('propriedade')) {
            return formatProjectDisplayName(str);
        }

        // Correção de topônimos e termos frequentes sem acento
        str = str
            .replace(/\bSalesopolis\b/gi, 'Salesópolis')
            .replace(/\bNazare Paulista\b/gi, 'Nazaré Paulista')
            .replace(/\bNazare\b/gi, 'Nazaré')
            .replace(/\bJaguariuna\b/gi, 'Jaguariúna')
            .replace(/\bJacarei\b/gi, 'Jacareí')
            .replace(/\bTatui\b/gi, 'Tatuí')
            .replace(/\bSao Pedro\b/gi, 'São Pedro')
            .replace(/\bSao Paulo\b/gi, 'São Paulo')
            .replace(/\bSao Francisco Xavier\b/gi, 'São Francisco Xavier')
            .replace(/\bJoanopolis\b/gi, 'Joanópolis')
            .replace(/\bBraganca Paulista\b/gi, 'Bragança Paulista')
            .replace(/\bRestauracao\b/gi, 'Restauração')
            .replace(/\bRecuperacao\b/gi, 'Recuperação')
            .replace(/\bEcologica\b/gi, 'Ecológica')
            .replace(/(\d+)[ºoªa]?\s*licita[çc][ãa]o/gi, '$1ª Licitação');

        return str;
    }

    function createPopupContent(props, projName, color, quadroArea = null) {
        let content = `<div class="popup-container project-popup">`;
        content += `<div class="popup-title" style="color: ${color}; border-left: 4px solid ${color}; padding-left: 8px;">${projName}</div>`;

        // Check for attached Quadro de Áreas
        const qaData = quadroArea || (props ? props._quadro_area : null);
        const isAverbadaFeat = Boolean(props && (props.Processo || props.processo || String(props.Tipo || '').toLowerCase().includes('compensa')));

        // Se for uma gleba averbada (ex: REDS3 - Áreas Averbadas), exibe os dados do processo/averbação em destaque
        if (isAverbadaFeat) {
            const entries = Object.entries(props || {}).filter(([k]) => k !== '_quadro_area');
            if (entries.length > 0) {
                content += `<div class="popup-subtitle-info" style="margin-top: 10px; color: #b45309; font-weight: 700; display: flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-file-shield" style="color: #d97706;"></i> Dados da Área Averbada
                </div>`;
                content += `<table class="popup-attribute-table"><tbody>`;
                for (const [key, val] of entries) {
                    content += `
                        <tr>
                            <th>${formatAttributeKey(key)}</th>
                            <td>${formatAttributeValue(val, key, projName)}</td>
                        </tr>
                    `;
                }
                content += `</tbody></table>`;
            }
        }

        if (qaData && Array.isArray(qaData) && qaData.length > 0) {
            content += `<div class="popup-subtitle-info" style="margin-top: 10px; color: var(--primary-color); font-weight: 700; display: flex; align-items: center; gap: 6px;">
                <i class="fa-solid fa-chart-pie" style="color: var(--primary-color);"></i> Quadro de Áreas (Uso do Solo)
            </div>`;
            content += `<table class="popup-qa-table">
                <thead>
                    <tr>
                        <th style="text-align: left;">Tema / Classe</th>
                        <th style="text-align: right;">Área (ha)</th>
                        <th style="text-align: right;">%</th>
                    </tr>
                </thead>
                <tbody>`;

            // Detecta se já existe linha de Área Disponível e obtém o valor da Vegetação Excedente / Remanescente base
            let excedenteAreaHa = null;
            let hasDisponivelRow = false;

            qaData.forEach(row => {
                const tema = String(row['Tema'] || row['tema'] || row['TEMA'] || '');
                const normTema = tema.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                if (normTema.includes('disponivel')) {
                    hasDisponivelRow = true;
                }
                if (normTema.includes('excedente') || normTema.includes('remanescente')) {
                    const rawVal = row['Área (ha)'] || row['area (ha)'] || row['Area (ha)'] || row['Área'] || row['area'] || 0;
                    const parsed = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal).replace(',', '.'));
                    if (!isNaN(parsed)) {
                        excedenteAreaHa = parsed;
                    }
                }
            });

            qaData.forEach(row => {
                const tema = row['Tema'] || row['tema'] || row['TEMA'] || '-';
                const area = row['Área (ha)'] || row['area (ha)'] || row['Area (ha)'] || row['Área'] || 0;
                const perc = row['%'] || row['porcentagem'] || row['Porcentagem'] || 0;

                const normTema = tema.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                const isTotal = normTema.includes('propriedade') || normTema.includes('limite');
                const isDisponivel = normTema.includes('disponivel');

                const areaNum = typeof area === 'number' ? area : (parseFloat(String(area).replace(',', '.')) || 0);
                let percNum = typeof perc === 'number' ? perc : (parseFloat(String(perc).replace(',', '.')) || 0);

                if (isDisponivel && excedenteAreaHa && excedenteAreaHa > 0) {
                    percNum = (areaNum / excedenteAreaHa) * 100;
                }

                content += `
                    <tr class="${isTotal ? 'qa-row-total' : (isDisponivel ? 'qa-row-disponivel' : '')}">
                        <td><strong>${isDisponivel ? '<i class="fa-solid fa-circle-check" style="margin-right: 5px; color: #16a34a; font-size: 0.72rem;"></i>' : ''}${formatAttributeKey(tema)}</strong></td>
                        <td style="text-align: right; font-weight: 600;">${areaNum.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ha</td>
                        <td style="text-align: right; font-weight: 600;" ${isDisponivel ? 'title="% calculada sobre a Vegetação Excedente / Remanescente"' : ''}>${percNum.toLocaleString('pt-BR', {minimumFractionDigits: 1, maximumFractionDigits: 2})}%${isDisponivel ? '*' : ''}</td>
                    </tr>
                `;
            });

            // Se ainda não houver linha de Área Disponível e houver excedente, adiciona dinamicamente
            let hasDisponivelNote = hasDisponivelRow;
            if (!hasDisponivelRow && excedenteAreaHa !== null) {
                let areaDisp = excedenteAreaHa;
                if (props) {
                    const custom = props.area_disponivel ?? props['Área Disponível'] ?? props['area_disponivel_ha'] ?? props['Area Disponivel'];
                    if (custom !== undefined && custom !== null) {
                        const parsedCustom = typeof custom === 'number' ? custom : parseFloat(String(custom).replace(',', '.'));
                        if (!isNaN(parsedCustom)) {
                            areaDisp = parsedCustom;
                        }
                    }
                }

                const percDisp = excedenteAreaHa > 0 ? (areaDisp / excedenteAreaHa) * 100 : 100.0;
                hasDisponivelNote = true;

                content += `
                    <tr class="qa-row-disponivel">
                        <td><strong style="color: #15803d;"><i class="fa-solid fa-circle-check" style="margin-right: 5px; color: #16a34a; font-size: 0.72rem;"></i>Área Disponível</strong></td>
                        <td style="text-align: right; font-weight: 700; color: #15803d;">${areaDisp.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ha</td>
                        <td style="text-align: right; font-weight: 700; color: #15803d;" title="% em relação à Vegetação Excedente / Remanescente">${percDisp.toLocaleString('pt-BR', {minimumFractionDigits: 1, maximumFractionDigits: 2})}%*</td>
                    </tr>
                `;
            }

            content += `</tbody></table>`;

            if (hasDisponivelNote) {
                content += `<div style="font-size: 0.68rem; color: #166534; margin-top: -3px; margin-bottom: 8px; text-align: right; font-style: italic;">* % calculada com base na Vegetação Excedente / Remanescente</div>`;
            }
        }

        // Tabela de atributos convencionais (exibida apenas quando NÃO houver Quadro de Áreas)
        if (!qaData && !isAverbadaFeat) {
            const entries = Object.entries(props || {}).filter(([k]) => k !== '_quadro_area');
            if (entries.length > 0) {
                content += `<div class="popup-subtitle-info" style="margin-top: 10px;"><i class="fa-solid fa-table"></i> Tabela de Atributos</div>`;
                content += `<table class="popup-attribute-table"><tbody>`;
                for (const [key, val] of entries) {
                    content += `
                        <tr>
                            <th>${formatAttributeKey(key)}</th>
                            <td>${formatAttributeValue(val, key, projName)}</td>
                        </tr>
                    `;
                }
                content += `</tbody></table>`;
            } else {
                content += `<div class="popup-subtitle-info"><i class="fa-solid fa-table"></i> Tabela de Atributos</div>`;
                content += `<table class="popup-attribute-table"><tbody><tr><td colspan="2" style="text-align: center; color: #94a3b8; padding: 8px;">Sem atributos cadastrados</td></tr></tbody></table>`;
            }
        }

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

    function resetToDefaultSatellite(updateSlider = true) {
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
        if (updateSlider && timelineRange) timelineRange.value = historicalSources.length;
        if (timelineSelect) timelineSelect.value = historicalSources.length;
        if (btnToggleTimeline && (!timelinePanel || timelinePanel.classList.contains('hidden'))) {
            btnToggleTimeline.classList.remove('active');
        }
    }

    // Evita interferência de eventos do mapa Leaflet sobre o painel flutuante da Linha do Tempo
    if (timelinePanel) {
        L.DomEvent.disableClickPropagation(timelinePanel);
        L.DomEvent.disableScrollPropagation(timelinePanel);

        // Previne que cliques, toques ou arrastos dentro do painel cheguem ao Leaflet
        ['mousedown', 'pointerdown', 'touchstart', 'dblclick', 'contextmenu'].forEach(evt => {
            timelinePanel.addEventListener(evt, (e) => e.stopPropagation());
        });
    }

    // Suporte a arraste suave (drag) no controle deslizante da linha do tempo
    let timelineDebounceTimer = null;

    function applyTimelineStep(idx, isImmediate = false) {
        // Feedback visual instantâneo nos textos, badge e dropdown
        if (idx >= historicalSources.length) {
            if (timelineBadge) timelineBadge.textContent = '2026';
            if (timelineTitle) timelineTitle.textContent = 'Google Satélite (Atual)';
            if (timelineSubtitle) timelineSubtitle.textContent = 'Imagens de satélite mais recentes';
            if (timelineSelect) timelineSelect.value = historicalSources.length;
        } else {
            const item = historicalSources[idx];
            if (item) {
                if (timelineBadge) timelineBadge.textContent = item.year;
                if (timelineTitle) timelineTitle.textContent = item.title;
                if (timelineSubtitle) timelineSubtitle.textContent = item.subtitle;
                if (timelineSelect) timelineSelect.value = idx;
            }
        }

        if (timelineDebounceTimer) {
            clearTimeout(timelineDebounceTimer);
            timelineDebounceTimer = null;
        }

        const executeLayerChange = () => {
            if (idx >= historicalSources.length) {
                resetToDefaultSatellite(false);
            } else {
                const item = historicalSources[idx];
                if (item) setHistoricalLayer(item);
            }
        };

        if (isImmediate) {
            executeLayerChange();
        } else {
            timelineDebounceTimer = setTimeout(executeLayerChange, 70);
        }
    }

    // Event Listeners for Timeline
    if (btnToggleTimeline) {
        btnToggleTimeline.addEventListener('click', () => {
            if (window.MeasureTool && window.MeasureTool.isActive) {
                window.MeasureTool.stop();
            }
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
        // Intercepta todos os eventos de ponteiro/mouse para que o Leaflet não cancele o arraste nativo
        ['mousedown', 'mousemove', 'mouseup', 'pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'touchend'].forEach(evt => {
            timelineRange.addEventListener(evt, (e) => {
                e.stopPropagation();
            });
        });

        // Desabilita temporariamente o arrasto do mapa enquanto o usuário arrasta o slider
        const disableMapDrag = () => {
            if (map && map.dragging && map.dragging.enabled()) {
                map.dragging.disable();
            }
        };

        const restoreMapDrag = () => {
            if (map && map.dragging && !map.dragging.enabled()) {
                map.dragging.enable();
            }
        };

        timelineRange.addEventListener('mousedown', disableMapDrag);
        timelineRange.addEventListener('pointerdown', disableMapDrag);
        timelineRange.addEventListener('touchstart', disableMapDrag, { passive: true });

        window.addEventListener('mouseup', restoreMapDrag);
        window.addEventListener('pointerup', restoreMapDrag);
        window.addEventListener('touchend', restoreMapDrag);

        // Evento input: dispara continuamente durante o arrasto do botão deslizante
        timelineRange.addEventListener('input', (e) => {
            const idx = parseInt(e.target.value, 10);
            applyTimelineStep(idx, false);
        });

        // Evento change: dispara ao soltar o botão deslizante
        timelineRange.addEventListener('change', (e) => {
            const idx = parseInt(e.target.value, 10);
            applyTimelineStep(idx, true);
        });
    }

    if (timelineSelect) {
        timelineSelect.addEventListener('change', (e) => {
            const idx = parseInt(e.target.value, 10);
            if (timelineRange) timelineRange.value = idx;
            applyTimelineStep(idx, true);
        });
    }

    // Clique interativo nas marcações de ano abaixo da régua
    document.querySelectorAll('.timeline-marks span').forEach(span => {
        span.addEventListener('click', (e) => {
            e.stopPropagation();
            const txt = span.textContent.trim();
            const yearMap = {
                '2007': 0,
                '2010': 1,
                '2014': 3,
                '2017': 6,
                '2020': 9,
                '2023': 12,
                '2026': 15,
                'Atual': 16
            };
            if (yearMap[txt] !== undefined) {
                const targetIdx = yearMap[txt];
                if (timelineRange) timelineRange.value = targetIdx;
                applyTimelineStep(targetIdx, true);
            }
        });
    });

    if (btnResetTimeline) {
        btnResetTimeline.addEventListener('click', () => {
            resetToDefaultSatellite(true);
        });
    }

    // ==========================================================================
    // Interactive Distance Measurement Ruler Tool (Ferramenta de Metrificação)
    // ==========================================================================
    const MeasureTool = {
        isActive: false,
        isFinished: false,
        mode: 'distance', // 'distance' | 'area'
        points: [],
        totalDistance: 0,
        totalAreaSqM: 0,
        mainPolyline: null,
        mainPolygon: null,
        rubberbandPolyline: null,
        rubberbandPolygon: null,
        cursorMarker: null,
        vertexMarkers: [],
        segmentMarkers: [],
        areaCenterMarker: null,
        lastClickTime: 0,

        init() {
            // Ensure measurePane exists
            if (!map.getPane('measurePane')) {
                map.createPane('measurePane');
                map.getPane('measurePane').style.zIndex = 600;
                map.getPane('measurePane').style.pointerEvents = 'none';
            }

            const btnMeasure = document.getElementById('btn-measure');
            const btnMeasureArea = document.getElementById('btn-measure-area');
            const tabDistance = document.getElementById('tab-measure-distance');
            const tabArea = document.getElementById('tab-measure-area');
            const btnClose = document.getElementById('btn-measure-close');
            const btnUndo = document.getElementById('btn-measure-undo');
            const btnClear = document.getElementById('btn-measure-clear');
            const btnFinish = document.getElementById('btn-measure-finish');
            const panel = document.getElementById('measure-floating-panel');

            // Prevent map clicks when interacting with floating panel
            if (panel) {
                L.DomEvent.disableClickPropagation(panel);
                L.DomEvent.disableScrollPropagation(panel);
                ['mousedown', 'mousemove', 'mouseup', 'dblclick', 'contextmenu', 'pointerdown'].forEach(evt => {
                    panel.addEventListener(evt, (e) => e.stopPropagation());
                });
                panel.addEventListener('mouseenter', () => {
                    if (this.isActive && !this.isFinished) {
                        this.clearRubberband();
                    }
                });
            }

            // Botão flutuante: Distância
            if (btnMeasure) {
                btnMeasure.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.isActive && this.mode === 'distance') {
                        this.stop();
                    } else {
                        this.start('distance');
                    }
                });
            }

            // Botão flutuante: Área
            if (btnMeasureArea) {
                btnMeasureArea.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.isActive && this.mode === 'area') {
                        this.stop();
                    } else {
                        this.start('area');
                    }
                });
            }

            // Abas de alternância de modo dentro do HUD
            if (tabDistance) {
                tabDistance.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.setMode('distance');
                });
            }
            if (tabArea) {
                tabArea.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.setMode('area');
                });
            }

            if (btnClose) {
                btnClose.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.stop();
                });
            }

            const btnMin = document.getElementById('btn-measure-min');
            const measureHeader = document.getElementById('measure-header');
            if (btnMin && panel) {
                btnMin.addEventListener('click', (e) => {
                    e.stopPropagation();
                    panel.classList.toggle('minimized');
                });
            }
            if (measureHeader && panel) {
                measureHeader.addEventListener('click', (e) => {
                    if (e.target.closest('#btn-measure-close') || e.target.closest('#btn-measure-min')) return;
                    panel.classList.toggle('minimized');
                });
            }

            if (btnUndo) {
                btnUndo.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.undo();
                });
            }

            if (btnClear) {
                btnClear.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.clear();
                });
            }

            if (btnFinish) {
                btnFinish.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.finish();
                });
            }

            // Map level event listeners
            map.on('click', (e) => {
                if (this.isActive && !this.isFinished) {
                    this.handleMapClick(e.latlng);
                }
            });

            map.on('dblclick', (e) => {
                if (this.isActive && !this.isFinished) {
                    L.DomEvent.stopPropagation(e);
                    const minPoints = (this.mode === 'area') ? 3 : 2;
                    if (this.points.length >= minPoints) {
                        this.finish();
                    }
                }
            });

            map.on('mousemove', (e) => {
                if (this.isActive && !this.isFinished) {
                    this.handleMouseMove(e.latlng);
                }
            });

            map.getContainer().addEventListener('mouseleave', () => {
                if (this.isActive && !this.isFinished) {
                    this.clearRubberband();
                }
            });

            // Prevent popups when measuring
            map.on('popupopen', (e) => {
                if (this.isActive && !this.isFinished) {
                    map.closePopup(e.popup);
                }
            });

            // Keyboard navigation
            document.addEventListener('keydown', (e) => {
                if (!this.isActive) return;

                if (e.key === 'Escape') {
                    this.stop();
                } else if (e.key === 'Enter') {
                    const minPoints = (this.mode === 'area') ? 3 : 2;
                    if (this.points.length >= minPoints && !this.isFinished) {
                        this.finish();
                    }
                } else if (e.key === 'Backspace' || (e.key === 'z' && (e.ctrlKey || e.metaKey))) {
                    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                        e.preventDefault();
                        this.undo();
                    }
                }
            });
        },

        start(mode = 'distance') {
            this.isActive = true;
            this.mode = mode;
            this.isFinished = false;
            this.points = [];
            this.totalDistance = 0;
            this.totalAreaSqM = 0;

            map.doubleClickZoom.disable();
            map.getContainer().classList.add('measure-active');

            const panel = document.getElementById('measure-floating-panel');
            if (panel) {
                panel.classList.remove('hidden');
                panel.classList.remove('minimized');
            }

            // Close timeline panel if open
            const timelinePanel = document.getElementById('timeline-floating-panel');
            const btnToggleTimeline = document.getElementById('btn-toggle-timeline');
            if (timelinePanel && !timelinePanel.classList.contains('hidden')) {
                timelinePanel.classList.add('hidden');
                if (btnToggleTimeline && !isHistoricalActive) {
                    btnToggleTimeline.classList.remove('active');
                }
            }

            this.updateModeUI();
            this.updateUI();
        },

        setMode(newMode) {
            if (this.mode === newMode && this.isActive) return;
            this.mode = newMode;
            this.clear();
            this.updateModeUI();
            this.updateUI();
        },

        updateModeUI() {
            const btnMeasure = document.getElementById('btn-measure');
            const btnMeasureArea = document.getElementById('btn-measure-area');
            const tabDistance = document.getElementById('tab-measure-distance');
            const tabArea = document.getElementById('tab-measure-area');
            const iconEl = document.getElementById('measure-header-icon');
            const titleEl = document.getElementById('measure-header-text');
            const labelEl = document.getElementById('measure-result-label');

            if (btnMeasure) btnMeasure.classList.toggle('active', this.isActive && this.mode === 'distance');
            if (btnMeasureArea) btnMeasureArea.classList.toggle('active', this.isActive && this.mode === 'area');
            if (tabDistance) tabDistance.classList.toggle('active', this.mode === 'distance');
            if (tabArea) tabArea.classList.toggle('active', this.mode === 'area');

            if (iconEl) {
                iconEl.className = (this.mode === 'area')
                    ? 'fa-solid fa-draw-polygon'
                    : 'fa-solid fa-ruler-combined';
            }
            if (titleEl) {
                titleEl.textContent = (this.mode === 'area') ? 'Área' : 'Régua';
            }
            if (labelEl) {
                labelEl.textContent = (this.mode === 'area') ? 'Área do Polígono' : 'Distância Total';
            }
        },

        stop() {
            this.isActive = false;
            this.clear();

            if (this.mainPolyline) {
                map.removeLayer(this.mainPolyline);
                this.mainPolyline = null;
            }
            if (this.mainPolygon) {
                map.removeLayer(this.mainPolygon);
                this.mainPolygon = null;
            }
            if (this.areaCenterMarker) {
                map.removeLayer(this.areaCenterMarker);
                this.areaCenterMarker = null;
            }
            this.clearRubberband();

            map.doubleClickZoom.enable();
            map.getContainer().classList.remove('measure-active');

            const panel = document.getElementById('measure-floating-panel');
            const btnMeasure = document.getElementById('btn-measure');
            const btnMeasureArea = document.getElementById('btn-measure-area');
            if (panel) {
                panel.classList.add('hidden');
                panel.classList.remove('minimized');
            }
            if (btnMeasure) btnMeasure.classList.remove('active');
            if (btnMeasureArea) btnMeasureArea.classList.remove('active');
        },

        clear() {
            this.points = [];
            this.totalDistance = 0;
            this.totalAreaSqM = 0;
            this.isFinished = false;

            this.vertexMarkers.forEach(m => map.removeLayer(m));
            this.vertexMarkers = [];

            this.segmentMarkers.forEach(m => map.removeLayer(m));
            this.segmentMarkers = [];

            if (this.mainPolyline) {
                map.removeLayer(this.mainPolyline);
                this.mainPolyline = null;
            }
            if (this.mainPolygon) {
                map.removeLayer(this.mainPolygon);
                this.mainPolygon = null;
            }
            if (this.areaCenterMarker) {
                map.removeLayer(this.areaCenterMarker);
                this.areaCenterMarker = null;
            }

            this.clearRubberband();
            this.updateUI();

            if (this.isActive) {
                map.doubleClickZoom.disable();
                map.getContainer().classList.add('measure-active');
            }
        },

        finish() {
            if (!this.isActive || this.isFinished) return;
            const minPoints = (this.mode === 'area') ? 3 : 2;
            if (this.points.length < minPoints) return;

            // Deduplicate accidental consecutive double click points
            if (this.points.length > minPoints) {
                const last = this.points[this.points.length - 1];
                const prev = this.points[this.points.length - 2];
                if (last.distanceTo(prev) < 0.6) {
                    this.points.pop();
                    const lastMarker = this.vertexMarkers.pop();
                    if (lastMarker) map.removeLayer(lastMarker);
                    const lastSeg = this.segmentMarkers.pop();
                    if (lastSeg) map.removeLayer(lastSeg);
                }
            }

            // In area mode, if user clicked near start to close it, discard duplicate end
            if (this.mode === 'area' && this.points.length > 3) {
                const last = this.points[this.points.length - 1];
                const first = this.points[0];
                if (last.distanceTo(first) < 1.0) {
                    this.points.pop();
                    const lastMarker = this.vertexMarkers.pop();
                    if (lastMarker) map.removeLayer(lastMarker);
                }
            }

            this.isFinished = true;
            this.clearRubberband();
            map.doubleClickZoom.enable();
            map.getContainer().classList.remove('measure-active');

            this.updateShape();
            if (this.mainPolygon) this.mainPolygon.redraw();
            if (this.mainPolyline) this.mainPolyline.redraw();
            if (window.syncAllRenderers) window.syncAllRenderers();
            this.calculateTotal();

            // In area mode, add closing edge segment and center badge
            if (this.mode === 'area' && this.points.length >= 3) {
                // Add closing segment badge
                const pFirst = this.points[0];
                const pLast = this.points[this.points.length - 1];
                const closingDist = pLast.distanceTo(pFirst);
                const midPoint = L.latLng((pFirst.lat + pLast.lat) / 2, (pFirst.lng + pLast.lng) / 2);

                const closingBadge = L.marker(midPoint, {
                    pane: 'measurePane',
                    interactive: false,
                    icon: L.divIcon({ className: 'measure-segment-dummy', iconSize: [0, 0] })
                });
                closingBadge.bindTooltip(this.formatDistance(closingDist), {
                    permanent: true,
                    direction: 'center',
                    className: 'measure-tooltip',
                    pane: 'measurePane',
                    interactive: false
                });
                closingBadge.addTo(map);
                this.segmentMarkers.push(closingBadge);

                // Add center badge
                this.addAreaCenterBadge();
            }

            this.refreshMarkers();
            this.updateUI();
        },

        addAreaCenterBadge() {
            if (this.areaCenterMarker) {
                map.removeLayer(this.areaCenterMarker);
                this.areaCenterMarker = null;
            }

            let center = null;
            try {
                if (window.turf && this.points.length >= 3) {
                    const coords = this.points.map(p => [p.lng, p.lat]);
                    coords.push([this.points[0].lng, this.points[0].lat]);
                    const poly = turf.polygon([coords]);
                    const centroid = turf.centroid(poly);
                    center = L.latLng(centroid.geometry.coordinates[1], centroid.geometry.coordinates[0]);
                }
            } catch (e) {
                console.warn('Centroid calculation fallback:', e);
            }

            if (!center && this.mainPolygon) {
                center = this.mainPolygon.getBounds().getCenter();
            }

            if (center) {
                const sqM = this.totalAreaSqM;
                const badgeIcon = L.divIcon({
                    className: 'measure-area-center-badge-container',
                    html: `<div class="measure-area-center-badge">
                        <div class="area-badge-ha"><i class="fa-solid fa-draw-polygon"></i> ${this.formatArea(sqM)}</div>
                        <div class="area-badge-m2">${Math.round(sqM).toLocaleString('pt-BR')} m²</div>
                    </div>`,
                    iconSize: [0, 0]
                });
                this.areaCenterMarker = L.marker(center, {
                    pane: 'measurePane',
                    interactive: false,
                    icon: badgeIcon
                }).addTo(map);
            }
        },

        undo() {
            if (!this.isActive || this.points.length === 0) return;

            if (this.isFinished) {
                this.isFinished = false;
                map.doubleClickZoom.disable();
                map.getContainer().classList.add('measure-active');
                if (this.areaCenterMarker) {
                    map.removeLayer(this.areaCenterMarker);
                    this.areaCenterMarker = null;
                }
            }

            this.points.pop();

            const lastMarker = this.vertexMarkers.pop();
            if (lastMarker) map.removeLayer(lastMarker);

            const lastSeg = this.segmentMarkers.pop();
            if (lastSeg) map.removeLayer(lastSeg);

            this.updateShape();
            this.calculateTotal();
            this.clearRubberband();
            this.refreshMarkers();
            this.updateUI();
        },

        handleMapClick(latlng) {
            if (!this.isActive || this.isFinished) return;
            const now = Date.now();
            if (now - this.lastClickTime < 80) return; // Deduplicate simultaneous events
            this.lastClickTime = now;

            // In area mode, clicking on or near start vertex closes the polygon
            if (this.mode === 'area' && this.points.length >= 3) {
                const first = this.points[0];
                const pixDist = map.latLngToContainerPoint(latlng).distanceTo(map.latLngToContainerPoint(first));
                if (pixDist < 20 || latlng.distanceTo(first) < 10) {
                    this.finish();
                    return;
                }
            }

            // In distance mode, clicking on last vertex finishes
            if (this.mode === 'distance' && this.points.length >= 2) {
                const last = this.points[this.points.length - 1];
                if (last.distanceTo(latlng) < 1.5) {
                    this.finish();
                    return;
                }
            }

            this.addPoint(latlng);
        },

        addPoint(latlng) {
            if (!this.isActive || this.isFinished) return;

            this.points.push(latlng);

            // Add segment badge between previous point and new point
            if (this.points.length >= 2) {
                const p1 = this.points[this.points.length - 2];
                const p2 = this.points[this.points.length - 1];
                const segDist = p1.distanceTo(p2);
                const midPoint = L.latLng((p1.lat + p2.lat) / 2, (p1.lng + p2.lng) / 2);

                const badge = L.marker(midPoint, {
                    pane: 'measurePane',
                    interactive: false,
                    icon: L.divIcon({ className: 'measure-segment-dummy', iconSize: [0, 0] })
                });
                badge.bindTooltip(this.formatDistance(segDist), {
                    permanent: true,
                    direction: 'center',
                    className: 'measure-tooltip',
                    pane: 'measurePane',
                    interactive: false
                });
                badge.addTo(map);
                this.segmentMarkers.push(badge);
            }

            // Vertex marker
            const markerType = (this.points.length === 1) ? 'start' : 'intermediate';
            const marker = L.marker(latlng, {
                pane: 'measurePane',
                interactive: false,
                icon: this.createVertexIcon(markerType)
            }).addTo(map);
            this.vertexMarkers.push(marker);

            this.updateShape();
            this.calculateTotal();
            this.updateUI();
        },

        handleMouseMove(latlng) {
            if (!this.isActive || this.isFinished) {
                this.clearRubberband();
                return;
            }

            if (this.mode === 'distance') {
                if (this.points.length === 0) {
                    this.updateCursorMarker(latlng, 'Clique para iniciar a medição');
                    return;
                }

                const lastPoint = this.points[this.points.length - 1];
                const segDist = lastPoint.distanceTo(latlng);
                const candidateTotal = this.totalDistance + segDist;

                if (!this.rubberbandPolyline) {
                    this.rubberbandPolyline = L.polyline([lastPoint, latlng], {
                        pane: 'measurePane',
                        color: '#16a34a',
                        weight: 2.2,
                        dashArray: '5, 5',
                        opacity: 0.85,
                        interactive: false
                    }).addTo(map);
                } else {
                    this.rubberbandPolyline.setLatLngs([lastPoint, latlng]);
                    if (!map.hasLayer(this.rubberbandPolyline)) {
                        this.rubberbandPolyline.addTo(map);
                    }
                }

                const tipText = (this.points.length === 1)
                    ? `+ ${this.formatDistance(segDist)}`
                    : `+ ${this.formatDistance(segDist)} (Total: ${this.formatDistance(candidateTotal)})`;

                this.updateCursorMarker(latlng, tipText);
            } else {
                // Mode: Area
                if (this.points.length === 0) {
                    this.updateCursorMarker(latlng, 'Clique para marcar o 1º vértice');
                    return;
                }

                if (this.points.length === 1) {
                    const p0 = this.points[0];
                    const segDist = p0.distanceTo(latlng);

                    if (!this.rubberbandPolyline) {
                        this.rubberbandPolyline = L.polyline([p0, latlng], {
                            pane: 'measurePane',
                            color: '#16a34a',
                            weight: 2.2,
                            dashArray: '5, 5',
                            opacity: 0.85,
                            interactive: false
                        }).addTo(map);
                    } else {
                        this.rubberbandPolyline.setLatLngs([p0, latlng]);
                        if (!map.hasLayer(this.rubberbandPolyline)) {
                            this.rubberbandPolyline.addTo(map);
                        }
                    }
                    this.updateCursorMarker(latlng, `+ ${this.formatDistance(segDist)}`);
                    return;
                }

                // If points.length >= 2, preview dynamic polygon with cursor
                const candPoints = [...this.points, latlng];
                if (this.rubberbandPolyline && map.hasLayer(this.rubberbandPolyline)) {
                    map.removeLayer(this.rubberbandPolyline);
                }

                if (!this.rubberbandPolygon) {
                    this.rubberbandPolygon = L.polygon(candPoints, {
                        pane: 'measurePane',
                        color: '#16a34a',
                        weight: 2.2,
                        dashArray: '5, 5',
                        fillColor: '#22c55e',
                        fillOpacity: 0.16,
                        interactive: false
                    }).addTo(map);
                } else {
                    this.rubberbandPolygon.setLatLngs(candPoints);
                    if (!map.hasLayer(this.rubberbandPolygon)) {
                        this.rubberbandPolygon.addTo(map);
                    }
                }

                // Calculate candidate area
                let candArea = 0;
                try {
                    if (window.turf && candPoints.length >= 3) {
                        const coords = candPoints.map(p => [p.lng, p.lat]);
                        coords.push([candPoints[0].lng, candPoints[0].lat]);
                        candArea = turf.area(turf.polygon([coords]));
                    }
                } catch (e) {
                    // Ignore turf errors on self-intersection
                }

                const first = this.points[0];
                const pixDist = map.latLngToContainerPoint(latlng).distanceTo(map.latLngToContainerPoint(first));
                if (this.points.length >= 3 && (pixDist < 20 || latlng.distanceTo(first) < 10)) {
                    this.updateCursorMarker(latlng, `Clique para fechar o polígono (${this.formatArea(candArea)})`);
                } else {
                    this.updateCursorMarker(latlng, `Área: ~${this.formatArea(candArea)}`);
                }
            }
        },

        updateCursorMarker(latlng, text) {
            if (!this.cursorMarker) {
                this.cursorMarker = L.marker(latlng, {
                    pane: 'measurePane',
                    interactive: false,
                    icon: L.divIcon({ className: 'measure-cursor-dummy', iconSize: [0, 0] })
                });
                this.cursorMarker.bindTooltip(text, {
                    permanent: true,
                    direction: 'right',
                    offset: [14, 0],
                    className: 'measure-rubberband-tooltip',
                    pane: 'measurePane',
                    interactive: false
                });
                this.cursorMarker.addTo(map);
            } else {
                this.cursorMarker.setLatLng(latlng);
                this.cursorMarker.setTooltipContent(text);
                if (!map.hasLayer(this.cursorMarker)) {
                    this.cursorMarker.addTo(map);
                }
            }
        },

        clearRubberband() {
            if (this.rubberbandPolyline) {
                this.rubberbandPolyline.setLatLngs([]);
                if (map.hasLayer(this.rubberbandPolyline)) {
                    map.removeLayer(this.rubberbandPolyline);
                }
                this.rubberbandPolyline = null;
            }
            if (this.rubberbandPolygon) {
                this.rubberbandPolygon.setLatLngs([]);
                if (map.hasLayer(this.rubberbandPolygon)) {
                    map.removeLayer(this.rubberbandPolygon);
                }
                this.rubberbandPolygon = null;
            }
            if (this.cursorMarker) {
                if (map.hasLayer(this.cursorMarker)) {
                    map.removeLayer(this.cursorMarker);
                }
                this.cursorMarker = null;
            }
        },

        updateShape() {
            if (this.mode === 'distance') {
                if (this.mainPolygon) {
                    map.removeLayer(this.mainPolygon);
                    this.mainPolygon = null;
                }
                if (!this.mainPolyline) {
                    this.mainPolyline = L.polyline(this.points, {
                        pane: 'measurePane',
                        color: '#16a34a',
                        weight: 3.5,
                        opacity: 0.9,
                        lineCap: 'round',
                        lineJoin: 'round',
                        interactive: false
                    }).addTo(map);
                } else {
                    this.mainPolyline.setLatLngs(this.points);
                    if (!map.hasLayer(this.mainPolyline)) {
                        this.mainPolyline.addTo(map);
                    }
                    this.mainPolyline.redraw();
                }
            } else {
                // Area mode
                if (this.points.length < 3) {
                    if (this.mainPolygon) {
                        map.removeLayer(this.mainPolygon);
                        this.mainPolygon = null;
                    }
                    if (!this.mainPolyline) {
                        this.mainPolyline = L.polyline(this.points, {
                            pane: 'measurePane',
                            color: '#16a34a',
                            weight: 2.8,
                            opacity: 0.9,
                            interactive: false
                        }).addTo(map);
                    } else {
                        this.mainPolyline.setLatLngs(this.points);
                        if (!map.hasLayer(this.mainPolyline)) {
                            this.mainPolyline.addTo(map);
                        }
                        this.mainPolyline.redraw();
                    }
                } else {
                    if (this.mainPolyline) {
                        map.removeLayer(this.mainPolyline);
                        this.mainPolyline = null;
                    }
                    if (!this.mainPolygon) {
                        this.mainPolygon = L.polygon(this.points, {
                            pane: 'measurePane',
                            color: '#15803d',
                            weight: 2.8,
                            fillColor: '#22c55e',
                            fillOpacity: this.isFinished ? 0.28 : 0.18,
                            dashArray: this.isFinished ? null : '6, 4',
                            lineCap: 'round',
                            lineJoin: 'round',
                            interactive: false
                        }).addTo(map);
                    } else {
                        this.mainPolygon.setLatLngs(this.points);
                        this.mainPolygon.setStyle({
                            fillOpacity: this.isFinished ? 0.28 : 0.18,
                            dashArray: this.isFinished ? null : '6, 4',
                            weight: this.isFinished ? 3.0 : 2.8
                        });
                        if (!map.hasLayer(this.mainPolygon)) {
                            this.mainPolygon.addTo(map);
                        }
                        this.mainPolygon.redraw();
                    }
                }
            }
        },

        calculateTotal() {
            if (this.mode === 'distance') {
                let total = 0;
                for (let i = 1; i < this.points.length; i++) {
                    total += this.points[i - 1].distanceTo(this.points[i]);
                }
                this.totalDistance = total;
                return total;
            } else {
                // Area mode
                if (this.points.length < 3) {
                    this.totalAreaSqM = 0;
                    let perim = 0;
                    for (let i = 1; i < this.points.length; i++) {
                        perim += this.points[i - 1].distanceTo(this.points[i]);
                    }
                    this.totalDistance = perim;
                    return 0;
                }

                try {
                    if (window.turf) {
                        const coords = this.points.map(p => [p.lng, p.lat]);
                        coords.push([this.points[0].lng, this.points[0].lat]);
                        const poly = turf.polygon([coords]);
                        this.totalAreaSqM = turf.area(poly);
                        this.totalDistance = turf.length(poly, { units: 'kilometers' }) * 1000;
                    }
                } catch (e) {
                    console.warn('Erro no cálculo de área com turf:', e);
                }
                return this.totalAreaSqM;
            }
        },

        refreshMarkers() {
            this.vertexMarkers.forEach((marker, idx) => {
                let type = 'intermediate';
                if (idx === 0) {
                    type = 'start';
                } else if (idx === this.vertexMarkers.length - 1 && this.isFinished && this.mode === 'distance') {
                    type = 'end';
                }
                marker.setIcon(this.createVertexIcon(type));
            });
        },

        createVertexIcon(type = 'intermediate') {
            let extraClass = '';
            let size = 12;
            if (type === 'start') {
                extraClass = 'measure-vertex-start';
                size = 14;
            } else if (type === 'end') {
                extraClass = 'measure-vertex-end';
                size = 14;
            }
            return L.divIcon({
                className: `measure-vertex-icon ${extraClass}`.trim(),
                iconSize: [size, size],
                iconAnchor: [size / 2, size / 2]
            });
        },

        formatDistance(meters) {
            if (!meters || meters < 1) return '0 m';
            if (meters < 1000) {
                return `${Math.round(meters)} m`;
            }
            const km = meters / 1000;
            return `${km.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`;
        },

        formatArea(sqMeters) {
            if (!sqMeters || sqMeters <= 0) return '0,00 ha';
            const ha = sqMeters / 10000;
            if (ha >= 0.01) {
                return `${ha.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha`;
            }
            return `${Math.round(sqMeters).toLocaleString('pt-BR')} m²`;
        },

        updateUI() {
            const totalEl = document.getElementById('measure-total-val');
            const subEl = document.getElementById('measure-points-sub');
            const hintEl = document.getElementById('measure-hint');
            const miniBadge = document.getElementById('measure-mini-badge');
            const btnUndo = document.getElementById('btn-measure-undo');
            const btnClear = document.getElementById('btn-measure-clear');
            const btnFinish = document.getElementById('btn-measure-finish');

            const count = this.points.length;
            const minPoints = (this.mode === 'area') ? 3 : 2;

            if (this.mode === 'distance') {
                const distStr = this.formatDistance(this.totalDistance);
                if (totalEl) totalEl.textContent = distStr;
                if (miniBadge) miniBadge.textContent = distStr;

                if (subEl) {
                    if (count === 0) {
                        subEl.textContent = 'Nenhum ponto marcado';
                    } else if (this.isFinished) {
                        subEl.textContent = `${count} ${count === 1 ? 'ponto' : 'pontos'} • Medição concluída`;
                    } else {
                        subEl.textContent = `${count} ${count === 1 ? 'ponto marcado' : 'pontos marcados'}`;
                    }
                }

                if (hintEl) {
                    if (count === 0) {
                        hintEl.innerHTML = '<i class="fa-solid fa-circle-info"></i> Clique no mapa para marcar o ponto inicial.';
                    } else if (this.isFinished) {
                        hintEl.innerHTML = '<i class="fa-solid fa-circle-check" style="color: #16a34a;"></i> Medição concluída. Use Limpar para recomeçar ou Fechar.';
                    } else if (count === 1) {
                        hintEl.innerHTML = '<i class="fa-solid fa-circle-info"></i> Mova o cursor e clique no mapa para o próximo ponto.';
                    } else {
                        hintEl.innerHTML = '<i class="fa-solid fa-circle-info"></i> Clique para continuar ou duplo-clique / Concluir para finalizar.';
                    }
                }
            } else {
                // Mode: Area
                const areaStr = this.formatArea(this.totalAreaSqM);
                if (totalEl) totalEl.textContent = areaStr;
                if (miniBadge) miniBadge.textContent = areaStr;

                if (subEl) {
                    if (count === 0) {
                        subEl.textContent = 'Nenhum vértice marcado';
                    } else if (count === 1) {
                        subEl.textContent = '1 vértice marcado';
                    } else if (count === 2) {
                        subEl.textContent = `2 vértices • Segmento: ${this.formatDistance(this.totalDistance)}`;
                    } else {
                        const m2Str = `${Math.round(this.totalAreaSqM).toLocaleString('pt-BR')} m²`;
                        const perimStr = `Perímetro: ${this.formatDistance(this.totalDistance)}`;
                        if (this.isFinished) {
                            subEl.textContent = `${count} vértices • ${m2Str} • ${perimStr} • Concluído`;
                        } else {
                            subEl.textContent = `${count} vértices • ${m2Str} • ${perimStr}`;
                        }
                    }
                }

                if (hintEl) {
                    if (count === 0) {
                        hintEl.innerHTML = '<i class="fa-solid fa-circle-info"></i> Clique no mapa para marcar o 1º vértice do polígono.';
                    } else if (this.isFinished) {
                        hintEl.innerHTML = `<i class="fa-solid fa-circle-check" style="color: #16a34a;"></i> Polígono de <strong>${areaStr}</strong> fixado no mapa. Use Limpar para novo cálculo.`;
                    } else if (count === 1) {
                        hintEl.innerHTML = '<i class="fa-solid fa-circle-info"></i> Clique no mapa para marcar o 2º vértice.';
                    } else if (count === 2) {
                        hintEl.innerHTML = '<i class="fa-solid fa-circle-info"></i> Clique para marcar o 3º vértice e formar a área.';
                    } else {
                        hintEl.innerHTML = '<i class="fa-solid fa-circle-info"></i> Clique para mais vértices ou clique no 1º ponto / Concluir para fechar.';
                    }
                }
            }

            if (btnUndo) btnUndo.disabled = (count === 0);
            if (btnClear) btnClear.disabled = (count === 0);
            if (btnFinish) btnFinish.disabled = (count < minPoints || this.isFinished);
        }
    };

    window.MeasureTool = MeasureTool;
    MeasureTool.init();
});
