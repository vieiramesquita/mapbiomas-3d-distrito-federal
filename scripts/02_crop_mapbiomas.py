import json
import os
import rasterio
from rasterio.windows import from_bounds
import numpy as np

# Load DF metadata
meta_path = "/mnt/e/AI_STUFF/MapBiomas3D_DF/df_boundary_meta.json"
with open(meta_path, "r") as f:
    df_meta = json.load(f)

buf_bounds = df_meta["buffered_bounds_wgs84"]
left = buf_bounds["west"]
bottom = buf_bounds["south"]
right = buf_bounds["east"]
top = buf_bounds["north"]

print(f"Target BBox WGS84: W={left:.4f}, S={bottom:.4f}, E={right:.4f}, N={top:.4f}")

# MapBiomas Col 11 COG URL
cog_url = "/vsicurl/https://storage.googleapis.com/mapbiomas-public/initiatives/brasil/collection11/lulc/coverage/brazil_coverage/brazil_coverage-col11_2025.tif"
output_tif = "/mnt/e/AI_STUFF/MapBiomas3D_DF/df_mapbiomas_2025_wgs84.tif"

print(f"Reading from MapBiomas COG:\n  {cog_url} ...")
with rasterio.open(cog_url) as src:
    print(f"Source CRS: {src.crs}, shape: {src.shape}")
    window = from_bounds(left, bottom, right, top, transform=src.transform)
    window = window.round_offsets().round_lengths()
    print(f"Crop window: {window}")
    
    data = src.read(1, window=window)
    win_transform = src.window_transform(window)
    
    meta = src.meta.copy()
    meta.update({
        "driver": "GTiff",
        "height": data.shape[0],
        "width": data.shape[1],
        "transform": win_transform,
        "compress": "lzw"
    })
    
    with rasterio.open(output_tif, "w", **meta) as dst:
        dst.write(data, 1)

print(f"\nSaved cropped MapBiomas raster: {output_tif} with shape {data.shape}")

# Value counts
unique, counts = np.unique(data, return_counts=True)
val_counts = dict(zip(unique, counts))

# Load legend
legend_src = "/mnt/e/AI_STUFF/MapBiomas3D/mapbiomas_col11_legend.json"
legend_dst = "/mnt/e/AI_STUFF/MapBiomas3D_DF/mapbiomas_col11_legend.json"
if os.path.exists(legend_src):
    import shutil
    shutil.copy(legend_src, legend_dst)
    with open(legend_dst, "r") as f:
        legend = json.load(f)
else:
    legend = {}

print(f"\nTotal pixels: {data.size:,}")
print("Present Classes in Distrito Federal region:")
for val, count in sorted(val_counts.items(), key=lambda x: x[1], reverse=True):
    val_int = int(val)
    info = legend.get(str(val_int), {"name_pt": f"Classe {val_int}", "hex": "#888888"})
    pct = (count / data.size) * 100
    print(f"  ID {val_int:2d} | {pct:5.2f}% ({count:8,d} px) | {info.get('name_pt')} ({info.get('hex')})")
