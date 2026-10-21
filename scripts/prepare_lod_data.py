#!/usr/bin/env python3
import json
import os
import numpy as np
from PIL import Image

BASE_DIR = "/mnt/e/AI_STUFF/MapBiomas3D_DF"
WEB_PUBLIC = os.path.join(BASE_DIR, "web", "public")

ELEV_BIN = os.path.join(WEB_PUBLIC, "elevation.bin")
CLASS_BIN = os.path.join(WEB_PUBLIC, "classes.bin")
META_JSON = os.path.join(WEB_PUBLIC, "metadata.json")

def prepare_lod_data():
    print("=" * 60)
    print("🚀 Preparando LOD para MapBiomas 3D - Distrito Federal")
    print("=" * 60)

    with open(META_JSON, "r", encoding="utf-8") as f:
        meta = json.load(f)

    W = meta["width"]   # 3738
    H = meta["height"]  # 2294
    print(f"Dimensões originais DF: {W} x {H} ({W * H:,} pixels)")

    elev_raw = np.fromfile(ELEV_BIN, dtype=np.float32).reshape((H, W))
    class_raw = np.fromfile(CLASS_BIN, dtype=np.uint8).reshape((H, W))

    # LOD 1: Meia resolução (1869 x 1147)
    W_lod1 = W // 2
    H_lod1 = H // 2
    print(f"Gerando LOD 1 DF ({W_lod1} x {H_lod1})...")

    img_elev = Image.fromarray(elev_raw)
    img_elev_lod1 = img_elev.resize((W_lod1, H_lod1), resample=Image.Resampling.BILINEAR)
    elev_lod1 = np.array(img_elev_lod1, dtype=np.float32)

    img_class = Image.fromarray(class_raw)
    img_class_lod1 = img_class.resize((W_lod1, H_lod1), resample=Image.Resampling.NEAREST)
    class_lod1 = np.array(img_class_lod1, dtype=np.uint8)

    elev_lod1_path = os.path.join(WEB_PUBLIC, "elevation_lod1.bin")
    elev_lod1.tofile(elev_lod1_path)
    size_elev_orig = os.path.getsize(ELEV_BIN)
    size_elev_lod1 = os.path.getsize(elev_lod1_path)
    print(f"✓ elevation_lod1.bin salvo: {size_elev_lod1 / 1024:.1f} KB (Original: {size_elev_orig / 1024:.1f} KB - Economia: {100 * (1 - size_elev_lod1 / size_elev_orig):.1f}%)")

    class_lod1_path = os.path.join(WEB_PUBLIC, "classes_lod1.bin")
    class_lod1.tofile(class_lod1_path)
    size_class_orig = os.path.getsize(CLASS_BIN)
    size_class_lod1 = os.path.getsize(class_lod1_path)
    print(f"✓ classes_lod1.bin salvo: {size_class_lod1 / 1024:.1f} KB (Original: {size_class_orig / 1024:.1f} KB - Economia: {100 * (1 - size_class_lod1 / size_class_orig):.1f}%)")

    GRID_COLS = 8
    GRID_ROWS = 4
    TOTAL_CHUNKS = GRID_COLS * GRID_ROWS
    TERRAIN_W = 200.0
    TERRAIN_H = 122.74
    BASE_HEIGHT = 1.1847

    chunk_w_px = W / GRID_COLS
    chunk_h_px = H / GRID_ROWS
    chunks_data = []

    for ry in range(GRID_ROWS):
        for cx in range(GRID_COLS):
            chunk_id = f"chunk_{cx}_{ry}"
            idx = ry * GRID_COLS + cx

            px_min = int(cx * chunk_w_px)
            px_max = int(min(W, (cx + 1) * chunk_w_px))
            py_min = int(ry * chunk_h_px)
            py_max = int(min(H, (ry + 1) * chunk_h_px))

            x_min = (cx / GRID_COLS - 0.5) * TERRAIN_W
            x_max = ((cx + 1) / GRID_COLS - 0.5) * TERRAIN_W
            z_min = (ry / GRID_ROWS - 0.5) * TERRAIN_H
            z_max = ((ry + 1) / GRID_ROWS - 0.5) * TERRAIN_H

            center_x = (x_min + x_max) / 2.0
            center_z = (z_min + z_max) / 2.0

            elev_sub = elev_raw[py_min:py_max, px_min:px_max]
            elev_min = float(elev_sub.min()) if elev_sub.size > 0 else 0.0
            elev_max = float(elev_sub.max()) if elev_sub.size > 0 else 0.0

            y_min = elev_min * BASE_HEIGHT
            y_max = elev_max * BASE_HEIGHT
            center_y = (y_min + y_max) / 2.0

            dx = (x_max - x_min) / 2.0
            dy = max(0.5, (y_max - y_min) / 2.0)
            dz = (z_max - z_min) / 2.0
            radius = round(float(np.sqrt(dx * dx + dy * dy + dz * dz)), 3)

            chunks_data.append({
                "id": chunk_id,
                "index": idx,
                "col": cx,
                "row": ry,
                "pixelBounds": [px_min, py_min, px_max, py_max],
                "worldBounds": {
                    "min": [round(x_min, 3), round(y_min, 3), round(z_min, 3)],
                    "max": [round(x_max, 3), round(y_max, 3), round(z_max, 3)]
                },
                "center": [round(center_x, 3), round(center_y, 3), round(center_z, 3)],
                "radius": radius
            })

    lod_metadata = {
        "version": "1.0",
        "strategy": "Aggregated Spatial Chunks + Hierarchical Impostors + Pre-baked Downsampling",
        "grid": { "cols": GRID_COLS, "rows": GRID_ROWS, "totalChunks": TOTAL_CHUNKS },
        "chunks": chunks_data
    }

    lod_json_path = os.path.join(WEB_PUBLIC, "lod_metadata.json")
    with open(lod_json_path, "w", encoding="utf-8") as f:
        json.dump(lod_metadata, f, indent=2, ensure_ascii=False)

    print(f"✓ lod_metadata.json DF salvo com sucesso: {lod_json_path}")

if __name__ == "__main__":
    prepare_lod_data()
