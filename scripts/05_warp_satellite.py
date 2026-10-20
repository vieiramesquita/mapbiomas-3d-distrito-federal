import os
import rasterio
import numpy as np
from PIL import Image
import subprocess

wgs84_tif = "/mnt/e/AI_STUFF/MapBiomas3D_DF/df_satellite_wgs84_z14.tif"
dem_utm = "/mnt/e/AI_STUFF/MapBiomas3D_DF/df_dem_utm.tif"

with rasterio.open(dem_utm) as src:
    bounds = src.bounds
    crs = src.crs.to_string()
    w_dem, h_dem = src.width, src.height
    aspect = h_dem / w_dem

print(f"Target UTM DEM Bounds: {bounds}, Aspect ratio H/W = {aspect:.4f}")

out_pub = "/mnt/e/AI_STUFF/MapBiomas3D_DF/web/public"
os.makedirs(out_pub, exist_ok=True)

targets = [
    {"name": "4K",  "w": 4096,  "h": int(round(4096 * aspect)),  "tif": "/mnt/e/AI_STUFF/MapBiomas3D_DF/df_satellite_utm_4k.tif",  "jpg": os.path.join(out_pub, "satellite_texture_4k.jpg"),  "qual": 88},
    {"name": "8K",  "w": 8192,  "h": int(round(8192 * aspect)),  "tif": "/mnt/e/AI_STUFF/MapBiomas3D_DF/df_satellite_utm_8k.tif",  "jpg": os.path.join(out_pub, "satellite_texture_8k.jpg"),  "qual": 86},
    {"name": "12K", "w": 12288, "h": int(round(12288 * aspect)), "tif": "/mnt/e/AI_STUFF/MapBiomas3D_DF/df_satellite_utm_12k.tif", "jpg": os.path.join(out_pub, "satellite_texture_12k.jpg"), "qual": 82}
]

for t in targets:
    print(f"\n--- Processing {t['name']} ({t['w']} x {t['h']} px) ---")
    cmd = [
        "gdalwarp",
        "-t_srs", crs,
        "-te", str(bounds.left), str(bounds.bottom), str(bounds.right), str(bounds.top),
        "-ts", str(t["w"]), str(t["h"]),
        "-r", "cubic",
        "-co", "COMPRESS=LZW",
        "-overwrite",
        wgs84_tif,
        t["tif"]
    ]
    print(f"Running gdalwarp for {t['name']}...")
    subprocess.run(cmd, check=True)

    print(f"Exporting optimized web JPEG: {t['jpg']}...")
    with rasterio.open(t["tif"]) as src:
        r = src.read(1)
        g = src.read(2)
        b = src.read(3)
        rgb = np.stack([r, g, b], axis=-1)
        tex_img = Image.fromarray(rgb, mode="RGB")
        tex_img.save(t["jpg"], "JPEG", quality=t["qual"], subsampling=0, optimize=True)
        fsize_mb = os.path.getsize(t["jpg"]) / (1024 * 1024)
        print(f"Successfully generated {t['name']} texture: {t['jpg']} ({fsize_mb:.2f} MB)")

# Set default to 8K
default_jpg = os.path.join(out_pub, "satellite_texture.jpg")
import shutil
shutil.copy(targets[1]["jpg"], default_jpg)
print(f"\nCopied 8K as default {default_jpg} ({os.path.getsize(default_jpg)/(1024*1024):.2f} MB)")
