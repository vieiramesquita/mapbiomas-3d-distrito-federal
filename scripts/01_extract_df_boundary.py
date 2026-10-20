import json
import os
import geopandas as gpd

shp_path = "/mnt/e/Base_Geo_QGIS/SHPs/BR_UF_2022/BR_UF_2022.shp"
output_dir = "/mnt/e/AI_STUFF/MapBiomas3D_DF"
os.makedirs(output_dir, exist_ok=True)

print("Reading BR_UF_2022 shapefile...")
gdf = gpd.read_file(shp_path)
df_gdf = gdf[gdf['SIGLA_UF'] == 'DF'].copy()

print("Found DF feature:")
for col in ['NM_UF', 'SIGLA_UF', 'CD_UF', 'AREA_KM2']:
    print(f"  {col}: {df_gdf.iloc[0][col]}")

geojson_path = os.path.join(output_dir, "distrito_federal_boundary.geojson")
df_gdf.to_file(geojson_path, driver="GeoJSON")
print(f"Saved GeoJSON: {geojson_path}")

bounds = df_gdf.total_bounds
print(f"WGS84 Bounds: West={bounds[0]:.6f}, South={bounds[1]:.6f}, East={bounds[2]:.6f}, North={bounds[3]:.6f}")

buf = 0.03
buffered_bounds = [bounds[0] - buf, bounds[1] - buf, bounds[2] + buf, bounds[3] + buf]
print(f"Buffered Bounds: W={buffered_bounds[0]:.6f}, S={buffered_bounds[1]:.6f}, E={buffered_bounds[2]:.6f}, N={buffered_bounds[3]:.6f}")

df_utm = df_gdf.to_crs(epsg=31983)
utm_bounds = df_utm.total_bounds
utm_w = utm_bounds[2] - utm_bounds[0]
utm_h = utm_bounds[3] - utm_bounds[1]
print(f"UTM 23S Bounds: minX={utm_bounds[0]:.1f}, minY={utm_bounds[1]:.1f}, maxX={utm_bounds[2]:.1f}, maxY={utm_bounds[3]:.1f}")
print(f"Real Dimensions: Width={utm_w/1000:.2f} km, Height={utm_h/1000:.2f} km")

metadata = {
    "name": "Distrito Federal",
    "sigla": "DF",
    "crs_wgs84": "EPSG:4674",
    "crs_utm": "EPSG:31983",
    "bounds_wgs84": {
        "west": float(bounds[0]),
        "south": float(bounds[1]),
        "east": float(bounds[2]),
        "north": float(bounds[3])
    },
    "buffered_bounds_wgs84": {
        "west": float(buffered_bounds[0]),
        "south": float(buffered_bounds[1]),
        "east": float(buffered_bounds[2]),
        "north": float(buffered_bounds[3])
    },
    "bounds_utm23s": {
        "minX": float(utm_bounds[0]),
        "minY": float(utm_bounds[1]),
        "maxX": float(utm_bounds[2]),
        "maxY": float(utm_bounds[3]),
        "width_km": float(utm_w / 1000),
        "height_km": float(utm_h / 1000)
    }
}

with open(os.path.join(output_dir, "df_boundary_meta.json"), "w") as f:
    json.dump(metadata, f, indent=2)
print("Saved metadata to df_boundary_meta.json")
