#!/usr/bin/env python3
"""Download the generated site photos and save web-ready copies.

The photos were made with Nano Banana Pro on Higgsfield. The site only
ever loads the copies in the repo; this script is how they were made.
Running it writes two WebP files per photo into images/photos/:

    <name>.webp        2400px wide, for large screens
    <name>-1200.webp   1200px wide, the default

Usage:  pip install pillow && python3 tools/fetch-photos.py
"""
import io, pathlib, urllib.request
from PIL import Image

CDN = "https://d8j0ntlcm91z4.cloudfront.net/user_3Gv2OyuWJqIdyavqzYBMqQCnBPK/hf_20261004_004241_"
PHOTOS = {
    "classroom":     "554dbf9b-13a6-43a9-b05f-513ffa4878ed",
    "teen-producer": "952b104f-51bc-4b90-8ab8-7312c23b2dd5",
    "piano-lesson":  "8c28a27e-dd34-4906-bfcb-43636dfc13e7",
    "kids-keyboard": "88cb250b-a9f2-4b71-b0ff-73b1939e07c2",
    "online-callin": "0057504b-08ff-493f-a34a-64688a498007",
    "home-learner":  "32dd960d-bff0-42e5-862f-e71b40f2d5b9",
    "instructor":    "8fd84479-f906-400d-9161-a7ab36e9f492",
    "studio-space":  "14dd22cb-db5d-4ac2-81b5-10864dbfdf60",
    "pads":          "b9a1066d-f39b-4dea-b058-9836da9402f9",
    "showcase":      "c82886f1-697f-490a-b26b-2bd33f631b0d",
    "daw-screen":    "1b22bef8-2ffc-47a5-8770-a6e3f703598c",
    "family":        "e90e131a-d737-4719-a8bd-84e367796d8f",
}
OUT = pathlib.Path(__file__).resolve().parent.parent / "images" / "photos"
OUT.mkdir(parents=True, exist_ok=True)

for name, job in PHOTOS.items():
    with urllib.request.urlopen(CDN + job + ".png") as r:
        im = Image.open(io.BytesIO(r.read())).convert("RGB")
    for width, suffix, q in ((2400, "", 80), (1200, "-1200", 78)):
        h = round(im.height * width / im.width)
        im.resize((width, h), Image.LANCZOS).save(OUT / f"{name}{suffix}.webp", "WEBP", quality=q, method=6)
    print("saved", name)
