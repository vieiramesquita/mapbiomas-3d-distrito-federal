# 🛰️ MapBiomas 3D - Distrito Federal (Brasília, Brasil)

[![MapBiomas Col. 11](https://img.shields.io/badge/MapBiomas-Coleção%2011%20(2025)-1f8d49?style=for-the-badge)](https://mapbiomas.org/)
[![DEM Copernicus](https://img.shields.io/badge/DEM-Copernicus%20GLO--30-3b82f6?style=for-the-badge)](https://spacedata.copernicus.eu/)
[![Three.js](https://img.shields.io/badge/Three.js-r128%20WebGL-black?style=for-the-badge&logo=three.js)](https://threejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

Aplicação web geoespacial interativa em **3D / WebGL** que transforma os dados de cobertura e uso da terra do **MapBiomas Coleção 11 (2025)** e o relevo digital do **DEM Copernicus (30m)** em um gêmeo digital volumétrico e fotorrealista de todo o território do **Distrito Federal (Brasília, DF, Brasil)**.

---

## ✨ Principais Funcionalidades

- **🏔️ Relevo Real Calibrado em Escala 1:1:**
  - Modelo Digital de Elevação (DEM) Copernicus GLO-30 metricamente calibrado: desnível real de **664,3 metros** (altitudes de 686,3m nos vales fluviais até 1.350,7m no Pico do Roncador / Chapada da Contagem).
  - Interpolação bilinear contínua na GPU eliminando artefatos de amostragem em degrau.
  - Controle dinâmico de exagero vertical (0.2x a 4.0x) e botão de restauração instantânea para escala física 1:1.

- **🏛️ Malha Urbana & Monumentos Modernistas de Brasília (Classe 24):**
  - Superquadras modernistas residenciais elevadas sobre **pilotis livres** no pavimento térreo, janelas em fita horizontal (*ribbon windows*) e cobogós.
  - Alinhamento dos blocos da **Esplanada dos Ministérios** com empenas de mármore e fachadas em vidro verde ao longo do Eixo Monumental.
  - Representação volumétrica do **Congresso Nacional** com as cúpulas e torres gêmeas no coração do Plano Piloto.
  - Arborização urbana rica: ipês amarelos (*Handroanthus chrysotrichus*), ipês rosas e árvores frondosas nos canteiros e superquadras.

- **🌾 Agronegócio, Linhas de Semeadura & Maquinário (PAD-DF):**
  - **Lavouras de Soja (3.2.1.1)** com sulcos paralelos contínuos orientados conforme o talhão agrícola.
  - **Colheitadeiras Draper** e **tratores agrícolas** em operação paralela nas leiras.
  - **Silvicultura (3.3):** talhões geométricos de eucalipto com ruas e corredores operacionais de manejo florestal.

- **🌿 Ecossistemas Nativos do Cerrado & Veredas:**
  - **Cerrado Típico & Savana (1.3):** árvores tortuosas e arbustos nativos nas áreas de conservação (Parque Nacional de Brasília, Água Mineral, Estação Ecológica).
  - **Matas de Galeria & Tropical (1.1):** florestas contínuas nos vales do Rio Descoberto, São Bartolomeu e bacia do Lago Paranoá.
  - **Veredas de Buriti (2.3):** palmeiras de buriti (*Mauritia flexuosa*) nas cabeceiras e nascentes do DF.
  - **Lago Paranoá & Corpos Hídricos (5.1):** águas translúcidas profundas integradas ao relevo.
  - **Fauna Rural nas Pastagens (3.1):** rebanhos bovinos Nelore e cavalos em piquetes de Brazlândia e arredores.

- **🛰️ Mosaico de Satélite Multirresolução (4K, 8K e 12K):**
  - Texturas de satélite de ultra-alta resolução: **4K (4.096px)**, **8K (8.192px)** e **12K Ultra (12.288px)** com alternância dinâmica em tempo real.
  - Modos de visualização: Satélite puro, Sobreposição com opacidade ajustável, MapBiomas temático puro e Mapa Hipsométrico.

- **📊 Painel Analítico & Balanço Territorial Completo:**
  - Resumo de macrogrupos (Vegetação Nativa 50,2%, Agropecuária 36,5%, Áreas Não Vegetadas 12,2%, Corpos Hídricos 1,1%).
  - Tabela completa de todas as 16 classes com contagem de pixels, área em hectares, km² e exportação em CSV.

---

## 📊 Matriz Geográfica & Dados

| Dado | Fonte | Resolução | CRS / Projeção |
|:---|:---|:---:|:---:|
| **Uso e Cobertura da Terra** | MapBiomas Brasil (Coleção 11 - 2025) | 30 metros | EPSG:31983 (SIRGAS 2000 / UTM 23S) |
| **Modelo Digital de Elevação** | Copernicus DEM (GLO-30) | 30 metros | EPSG:31983 (SIRGAS 2000 / UTM 23S) |
| **Mosaico de Satélite** | Google Satellite Tiles | 4K, 8K e 12K | EPSG:31983 (SIRGAS 2000 / UTM 23S) |
| **Delimitação Territorial** | IBGE 2022 (BR_UF_2022.shp - DF) | Vetorial | SIRGAS 2000 |

- **Dimensões do Terreno:** 112,14 km (Largura) × 68,82 km (Altura)
- **Matriz da Grade:** 3.738 colunas × 2.294 linhas (8.574.972 células de 30m)
- **Desnível Topográfico:** 664,3 metros (686,3m a 1.350,7m)
- **Área Mapeada Total:** 749.385 ha (~7.493,8 km² incluindo buffer de contexto)

---

## 📁 Estrutura do Projeto

```text
MapBiomas3D_DF/
├── scripts/
│   ├── 01_extract_df_boundary.py     # Extração da fronteira do DF via shapefile IBGE 2022
│   ├── 02_crop_mapbiomas.py          # Recorte do MapBiomas Col. 11 (2025) direto de COG em nuvem
│   ├── 03_prepare_dem.py             # Extração e fusão do Copernicus DEM 30m via gdalwarp
│   ├── 04_reproject_to_utm.py        # Alinhamento e reprojeção métrica para UTM 23S (EPSG:31983)
│   ├── 05_download_satellite.py      # Download multithread e mosaico de satélite
│   ├── 06_prepare_threejs_data.py    # Geração dos buffers binários e texturas Three.js
│   └── server.mjs                    # Servidor HTTP estático nativo Node.js
├── web/
│   ├── index.html                    # Interface HUD fotorrealista com Glassmorphism
│   ├── style.css                     # Sistema de design dark mode responsivo
│   ├── app.js                        # Motor 3D Three.js com shaders e props procedurais
│   └── public/
│       ├── elevation.bin             # Buffer Float32 de elevação contínua (34,3 MB)
│       ├── classes.bin               # Buffer Uint8 das classes MapBiomas (8,6 MB)
│       ├── mapbiomas_texture.png     # Textura temático-cromática oficial MapBiomas
│       ├── heightmap.png             # Heightmap 8-bit de referência
│       ├── satellite_texture_4k.jpg  # Textura de satélite 4K (4,5 MB)
│       ├── satellite_texture_8k.jpg  # Textura de satélite 8K (14,5 MB)
│       ├── satellite_texture_12k.jpg # Textura de satélite 12K Ultra (25,9 MB)
│       ├── metadata.json             # Metadados geoespaciais e estatísticas de classes
│       └── impostors/                # Sprites otimizados de vegetação e rochas
└── README.md
```

---

## 🚀 Como Executar Localmente

### Via Node.js:
```bash
# Entre na pasta do projeto
cd E:/AI_STUFF/MapBiomas3D_DF

# Inicie o servidor nativo
node scripts/server.mjs
```
Acesse no navegador: **[http://localhost:8080/](http://localhost:8080/)**

### Ou via qualquer servidor estático:
```bash
npx serve web -p 8080
```
ou em Python:
```bash
python3 -m http.server 8080 -d web
```

---

## 📜 Licença

Distribuído sob a licença **MIT**.
