import math
import urllib.request
import io
import os
import sys
import time
import argparse
import concurrent.futures
from PIL import Image
import numpy as np
import rasterio
from rasterio.transform import from_bounds
import subprocess

def deg2num(lat_deg, lon_deg, zoom):
    lat_rad = math.radians(lat_deg)
    n = 2.0 ** zoom
    xtile = int((lon_deg + 180.0) / 360.0 * n)
    ytile = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return (xtile, ytile)

def num2deg(xtile, ytile, zoom):
    n = 2.0 ** zoom
    lon_deg = xtile / n * 360.0 - 180.0
    lat_rad = math.atan(math.sinh(math.pi * (1 - 2 * ytile / n)))
    lat_deg = math.degrees(lat_rad)
    return (lat_deg, lon_deg)

def main():
    zoom = 14
    workers = 32

    # Bounding box with safety margin from df_boundary_meta.json
    west_pad = -48.330
    south_pad = -16.095
    east_pad = -47.265
    north_pad = -15.455

    x_min, y_min = deg2num(north_pad, west_pad, zoom)
    x_max, y_max = deg2num(south_pad, east_pad, zoom)

    cols = x_max - x_min + 1
    rows = y_max - y_min + 1
    total_tiles = cols * rows
    mosaic_w = cols * 256
    mosaic_h = rows * 256

    print(f"=== Distrito Federal Satellite Downloader (Zoom {zoom}) ===")
    print(f"Tiles: X:[{x_min}..{x_max}] ({cols} cols), Y:[{y_min}..{y_max}] ({rows} rows)")
    print(f"Total tiles: {total_tiles} | Mosaic: {mosaic_w} x {mosaic_h} px")

    tiles_data = {}
    downloaded = 0
    start_time = time.time()

    def fetch_tile(coord):
        x, y = coord
        url = f"https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={zoom}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=8) as resp:
                    data = resp.read()
                    img = Image.open(io.BytesIO(data))
                    return (x, y, img)
            except Exception:
                time.sleep(0.3 * (attempt + 1))
        print(f"Warning: Failed tile {x},{y}, placeholder used.")
        return (x, y, Image.new("RGB", (256, 256), color=(40, 50, 40)))

    coords = [(x, y) for x in range(x_min, x_max + 1) for y in range(y_min, y_max + 1)]

    print(f"Starting parallel download with {workers} threads...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(fetch_tile, c): c for c in coords}
        for future in concurrent.futures.as_completed(futures):
            x, y, img = future.result()
            tiles_data[(x, y)] = img
            downloaded += 1
            if downloaded % 200 == 0 or downloaded == total_tiles:
                elapsed = time.time() - start_time
                rate = downloaded / max(0.1, elapsed)
                pct = downloaded / total_tiles * 100
                print(f"Progress: {downloaded}/{total_tiles} ({pct:.1f}%) - {rate:.1f} tiles/s")

    elapsed_dl = time.time() - start_time
    print(f"Download completed in {elapsed_dl:.1f}s ({total_tiles/elapsed_dl:.1f} tiles/s)")

    print(f"Stitching {mosaic_w}x{mosaic_h} mosaic...")
    mosaic = Image.new("RGB", (mosaic_w, mosaic_h))
    for (x, y), tile_img in tiles_data.items():
        px = (x - x_min) * 256
        py = (y - y_min) * 256
        mosaic.paste(tile_img, (px, py))

    # Georeference in WGS84
    lat_top, lon_left = num2deg(x_min, y_min, zoom)
    lat_bottom, lon_right = num2deg(x_max + 1, y_max + 1, zoom)
    transform = from_bounds(lon_left, lat_bottom, lon_right, lat_top, mosaic_w, mosaic_h)

    wgs84_tif = "/mnt/e/AI_STUFF/MapBiomas3D_DF/df_satellite_wgs84_z14.tif"
    print(f"Saving georeferenced GeoTIFF: {wgs84_tif}...")
    np_img = np.array(mosaic)
    with rasterio.open(
        wgs84_tif,
        "w",
        driver="GTiff",
        height=mosaic_h,
        width=mosaic_w,
        count=3,
        dtype=np_img.dtype,
        crs="EPSG:4326",
        transform=transform,
        compress="lzw"
    ) as dst:
        for b in range(3):
            dst.write(np_img[:, :, b], b + 1)
    print("Saved WGS84 satellite mosaic successfully.")

    # Get target UTM bounds from DEM
    dem_utm = "/mnt/e/AI_STUFF/MapBiomas3D_DF/df_dem_utm.tif"
    with rasterio.open(dem_utm) as src:
        bounds = src.bounds
        crs = src.crs.to_string()
        w_dem, h_dem = src.width, src.height
        aspect = h_dem / w_dem

    print(f"Target UTM DEM Bounds: {bounds}, Aspect ratio H/W = {aspect:.4f}")

    out_pub = "/mnt/e/AI_STUFF/MapBiomas3D_DF/web/public"
    os.makedirs(out_pub, exist_ok=True)

    resolutions = [
        ("4k", 4096, int(round(4096 * aspect))),
        ("8k", 8192, int(round(8192 * aspect))),
        ("12k", 12288, int(round(12288 * aspect)))
    ]

    for name, w_res, h_res in resolutions:
        utm_tif = f"/mnt/e/AI_STUFF/MapBiomas3D_DF/df_satellite_utm_{name}.tif"
        out_jpg = os.path.join(out_pub, f"satellite_texture_{name}.jpg")
        print(f"\n--- Warping {name.upper()} ({w_res}x{h_res}) to UTM 23S ---")
        cmd = [
            "gdalwarp",
            "-t_srs", crs,
            "-te", str(bounds.left), str(bounds.bottom), str(bounds.right), str(bounds.top),
            "-ts", str(w_res), str(h_res),
            "-r", "cubic",
            "-co", "COMPRESS=JPEG",
            "-co", "JPEG_QUALITY=90",
            "-overwrite",
            wgs84_tif,
            utm_tif
        ]
        subprocess.run(cmd, check=True)

        print(f"Exporting optimized JPEG texture: {out_jpg}...")
        cmd_jpg = [
            "gdal_translate",
            "-of", "JPEG",
            "-co", "QUALITY=88",
            utm_tif,
            out_jpg
        ]
        subprocess.run(cmd_jpg, check=True)
        sz_mb = os.path.getsize(out_jpg) / (1024 * 1024)
        print(f"Generated {out_jpg} ({sz_mb:.2f} MB)")

    # Default satellite texture points to 8k
    default_jpg = os.path.join(out_pub, "satellite_texture.jpg")
    import shutil
    shutil.copy(os.path.join(out_pub, "satellite_texture_8k.jpg"), default_jpg)
    print(f"Copied 8K as default {default_jpg}")

if __name__ == "__main__":
    main()
