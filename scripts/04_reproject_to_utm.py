import subprocess
import rasterio

input_dem = "/mnt/e/AI_STUFF/MapBiomas3D_DF/df_dem_copernicus_wgs84.tif"
output_dem_utm = "/mnt/e/AI_STUFF/MapBiomas3D_DF/df_dem_utm.tif"

# 1. Reproject DEM to UTM 23S (EPSG:31983) with 30m resolution
cmd_dem = [
    "gdalwarp",
    "-t_srs", "EPSG:31983",
    "-tr", "30", "30",
    "-r", "bilinear",
    "-co", "COMPRESS=DEFLATE",
    "-overwrite",
    input_dem,
    output_dem_utm
]

print("Reprojecting DEM to UTM 23S (EPSG:31983) at 30m resolution...")
subprocess.run(cmd_dem, check=True)

# 2. Get bounds and dimensions of the UTM DEM
with rasterio.open(output_dem_utm) as src:
    bounds = src.bounds
    width, height = src.width, src.height
    res_x, res_y = src.res
    print(f"Reprojected DEM UTM: {width}x{height} pixels, res=({res_x:.1f}m, {res_y:.1f}m)")
    print(f"Bounds UTM: X=[{bounds.left:.1f} .. {bounds.right:.1f}], Y=[{bounds.bottom:.1f} .. {bounds.top:.1f}]")
    print(f"Real Dimensions: Width = {(bounds.right - bounds.left)/1000:.2f} km, Height = {(bounds.top - bounds.bottom)/1000:.2f} km")

# 3. Reproject MapBiomas raster to match DEM grid exactly using nearest neighbor
input_mb = "/mnt/e/AI_STUFF/MapBiomas3D_DF/df_mapbiomas_2025_wgs84.tif"
output_mb_utm = "/mnt/e/AI_STUFF/MapBiomas3D_DF/df_mapbiomas_utm.tif"

cmd_mb = [
    "gdalwarp",
    "-t_srs", "EPSG:31983",
    "-te", str(bounds.left), str(bounds.bottom), str(bounds.right), str(bounds.top),
    "-ts", str(width), str(height),
    "-r", "near",
    "-co", "COMPRESS=LZW",
    "-overwrite",
    input_mb,
    output_mb_utm
]

print("\nReprojecting MapBiomas to UTM 23S to match DEM grid exactly...")
subprocess.run(cmd_mb, check=True)

with rasterio.open(output_mb_utm) as src:
    print(f"Reprojected MapBiomas UTM: {src.width}x{src.height}, bounds={src.bounds}")

print("\nSuccessfully aligned DEM and MapBiomas in UTM 23S (EPSG:31983)!")
