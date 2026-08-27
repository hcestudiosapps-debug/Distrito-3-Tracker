import zlib
import struct
import math
import os

def create_png(width, height, draw_fn, output_path):
    # RGBA image buffer
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0) # Filter type 0 (None)
        for x in range(width):
            r, g, b, a = draw_fn(x, y, width, height)
            raw_data.extend([r, g, b, a])
    
    compressed = zlib.compress(bytes(raw_data), 9)
    
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
    
    png_header = b"\x89PNG\r\n\x1a\n"
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    
    with open(output_path, "wb") as f:
        f.write(png_header)
        f.write(chunk(b"IHDR", ihdr_data))
        f.write(chunk(b"IDAT", compressed))
        f.write(chunk(b"IEND", b""))
    print(f"Generated {output_path} ({width}x{height})")

def icon_drawer(x, y, w, h):
    # Normalized coords (-1 to 1)
    nx = (x / w) * 2 - 1
    ny = (y / h) * 2 - 1
    dist = math.sqrt(nx * nx + ny * ny)
    
    # Background #0b1220
    bg_r, bg_g, bg_b = 11, 18, 32
    
    # Outer circle border (cyan #38bdf8)
    if 0.78 <= dist <= 0.88:
        return 56, 189, 248, 255
    
    # Inner background circle #132034
    if dist < 0.78:
        # Simple high contrast logo drawing
        # D shape (left half)
        in_d = (-0.50 <= nx <= -0.05) and (-0.45 <= ny <= 0.45)
        in_d_hole = (-0.35 <= nx <= -0.15) and (-0.25 <= ny <= 0.25)
        
        # 3 shape (right half)
        in_3 = (0.05 <= nx <= 0.50) and (-0.45 <= ny <= 0.45)
        in_3_hole_top = (0.15 <= nx <= 0.35) and (-0.35 <= ny <= -0.10)
        in_3_hole_bot = (0.15 <= nx <= 0.35) and (0.10 <= ny <= 0.35)
        in_3_cut_left = (0.05 <= nx <= 0.30) and (-0.10 <= ny <= 0.10)
        
        is_d = in_d and not in_d_hole
        is_3 = in_3 and not (in_3_hole_top or in_3_hole_bot or in_3_cut_left)
        
        if is_d or is_3:
            return 56, 189, 248, 255 # Cyan
        
        return 19, 32, 52, 255 # Inner dark blue
    
    return bg_r, bg_g, bg_b, 255

os.makedirs("public", exist_ok=True)
create_png(192, 192, icon_drawer, "public/pwa-192x192.png")
create_png(512, 512, icon_drawer, "public/pwa-512x512.png")
create_png(512, 512, icon_drawer, "public/maskable-icon-512x512.png")
create_png(64, 64, icon_drawer, "public/pwa-64x64.png")
