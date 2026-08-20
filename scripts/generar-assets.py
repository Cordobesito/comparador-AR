"""
generar-assets.py — regenera los PNG de marca.

    python scripts/generar-assets.py

Produce, en public/:
  · apple-touch-icon.png  180×180  — icono al agregar a pantalla de inicio en iOS
  · og-image.png         1200×630  — tarjeta al compartir el link (WhatsApp, X, etc.)

El favicon vive en public/favicon.svg y no se genera acá: es vectorial y no
necesita rasterizarse. Este script redibuja el mismo isotipo (la línea de
cotización dentro del círculo, de Guzmán Asesor Bursátil) con las mismas
proporciones, para que los tres assets sean consistentes.

Solo hace falta correrlo si cambia la marca. Requiere Pillow (pip install pillow).
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
PUBLIC = RAIZ / "public"

# Paleta de la marca, muestreada del logo original.
CREMA = "#f1ede2"
TINTA = "#2e2d29"
ORO = "#a1885c"

# Trazo del isotipo en el mismo sistema de coordenadas que favicon.svg
# (viewBox de 64×64, círculo centrado en 32,32 con radio 23.5).
TRAZO = [(19, 35), (25, 40), (29, 36), (33, 39), (44, 22)]
RADIO = 23.5


def dibujar_isotipo(lienzo, centro, tam, con_fondo=True):
    """Dibuja el isotipo centrado en `centro`, ocupando `tam` píxeles."""
    d = ImageDraw.Draw(lienzo)
    k = tam / 64
    cx, cy = centro
    ox, oy = cx - tam / 2, cy - tam / 2

    def p(x, y):
        return (ox + x * k, oy + y * k)

    if con_fondo:
        d.rounded_rectangle([ox, oy, ox + tam, oy + tam], radius=12 * k, fill=CREMA)

    r = RADIO * k
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=TINTA, width=max(1, round(3.2 * k)))
    d.line([p(x, y) for x, y in TRAZO], fill=TINTA, width=max(1, round(3.6 * k)), joint="curve")

    px, py = p(*TRAZO[-1])
    pr = 2.8 * k
    d.ellipse([px - pr, py - pr, px + pr, py + pr], fill=ORO)


def fuente(nombre, tam):
    """Busca una fuente del sistema; si no está, cae a la de PIL."""
    for ruta in (
        f"C:/Windows/Fonts/{nombre}",
        f"/usr/share/fonts/truetype/dejavu/{nombre}",
        f"/System/Library/Fonts/{nombre}",
    ):
        try:
            return ImageFont.truetype(ruta, tam)
        except OSError:
            continue
    return ImageFont.load_default()


def apple_touch_icon():
    """iOS le pone las esquinas redondeadas por su cuenta: acá va cuadrado y a sangre."""
    S = 180
    img = Image.new("RGB", (S, S), CREMA)
    dibujar_isotipo(img, (S / 2, S / 2), 150, con_fondo=False)
    destino = PUBLIC / "apple-touch-icon.png"
    img.save(destino)
    print(f"OK  {destino.relative_to(RAIZ)}  ({S}x{S})")


def og_image():
    """1200x630 es el tamaño que esperan WhatsApp, X, Facebook y LinkedIn."""
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), CREMA)
    d = ImageDraw.Draw(img)

    # Franja de acento al borde derecho
    d.rectangle([W - 14, 0, W, H], fill=ORO)

    margen = 90
    dibujar_isotipo(img, (margen + 43, 132), 86, con_fondo=False)

    f_marca = fuente("segoeuib.ttf", 25)
    f_titulo = fuente("segoeuib.ttf", 72)
    f_bajada = fuente("segoeui.ttf", 30)
    f_pie = fuente("segoeuib.ttf", 24)

    d.text((margen + 106, 120), "GUZMÁN · ASESOR BURSÁTIL", font=f_marca, fill=TINTA, anchor="lm")

    d.text((margen, 250), "¿Dónde conviene", font=f_titulo, fill=TINTA, anchor="lm")
    d.text((margen, 330), "poner los pesos?", font=f_titulo, fill=TINTA, anchor="lm")

    d.text(
        (margen, 420),
        "Plazo fijo, billeteras y dólar, con el rendimiento",
        font=f_bajada,
        fill=TINTA,
    )
    d.text((margen, 462), "real después de la inflación.", font=f_bajada, fill=TINTA)

    d.text((margen, H - 78), "comparadorar.netlify.app", font=f_pie, fill=ORO)

    destino = PUBLIC / "og-image.png"
    img.save(destino, optimize=True)
    print(f"OK  {destino.relative_to(RAIZ)}  ({W}x{H})")


if __name__ == "__main__":
    PUBLIC.mkdir(exist_ok=True)
    apple_touch_icon()
    og_image()
