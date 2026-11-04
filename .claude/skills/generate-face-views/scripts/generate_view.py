#!/usr/bin/env python3
"""Generate one head view (front, left, right or back) of a person from reference images.

    python3 generate_view.py --view front --style illustrated --ref photo.jpg --out front.png
    python3 generate_view.py --view left --ref front.png --ref photo.jpg --out left.png

Fallback for agents without built-in image generation. Calls the OpenAI Images
API (gpt-image-1, edit mode) with OPENAI_API_KEY from the environment and
writes a 1024x1024 PNG. Standard library only.
"""
import argparse
import base64
import json
import mimetypes
import os
import sys
import urllib.error
import urllib.request
import uuid

URL = "https://api.openai.com/v1/images/edits"

VIEWS = {
    "front": "Looking straight at the viewer, face fully visible, neutral friendly expression.",
    "left": "Exact side profile: the person has turned so their nose points to the LEFT edge of the image; only one eye visible.",
    "right": "Exact side profile: the person has turned so their nose points to the RIGHT edge of the image; only one eye visible.",
    "back": "Seen from directly behind: the back of the head and hair only, no face, no ears' front, same hairstyle and colour.",
}

STYLES = {
    "illustrated": "Soft flat-colour illustration with clean thin outlines, gentle shading.",
    "realistic": "Photorealistic, neutral studio portrait.",
    "cartoon": "Friendly cartoon style, slightly larger head and eyes, simple shapes.",
}


def prompt(view, style):
    return (
        "Portrait of the same person as in the reference image, head and top of the shoulders only, "
        f"centred, the head filling about 70% of the height. {VIEWS[view]} {STYLES[style]} "
        "Plain transparent background (or flat white if transparency isn't possible). "
        "Even, soft light from the front, no strong shadows. No text, no frame, no hands, "
        "no accessories that aren't in the reference. Keep the person's age, skin tone, hairstyle, "
        "hair colour, facial hair, glasses and earrings exactly as in the reference."
    )


def multipart(fields, files):
    boundary = uuid.uuid4().hex
    out = bytearray()
    for name, value in fields:
        out += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode()
    for name, path in files:
        mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
        with open(path, "rb") as f:
            data = f.read()
        out += (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{os.path.basename(path)}\"\r\n"
            f"Content-Type: {mime}\r\n\r\n"
        ).encode() + data + b"\r\n"
    out += f"--{boundary}--\r\n".encode()
    return bytes(out), f"multipart/form-data; boundary={boundary}"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--view", required=True, choices=VIEWS)
    ap.add_argument("--style", default="illustrated", choices=STYLES)
    ap.add_argument("--ref", action="append", required=True, help="reference image (repeatable; the first matters most)")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        sys.exit("OPENAI_API_KEY is not set.")
    for path in args.ref:
        if not os.path.isfile(path):
            sys.exit(f"No such file: {path}")

    fields = [("model", "gpt-image-1"), ("prompt", prompt(args.view, args.style)), ("size", "1024x1024"), ("background", "transparent")]
    body, content_type = multipart(fields, [("image[]", p) for p in args.ref])
    req = urllib.request.Request(URL, data=body, headers={"Authorization": f"Bearer {key}", "Content-Type": content_type})
    try:
        with urllib.request.urlopen(req, timeout=300) as res:
            result = json.load(res)
    except urllib.error.HTTPError as e:
        sys.exit(f"Image API error {e.code}: {e.read().decode(errors='replace')[:500]}")

    image = result["data"][0]["b64_json"]
    out = os.path.expanduser(args.out)
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "wb") as f:
        f.write(base64.b64decode(image))
    print(out)


if __name__ == "__main__":
    main()
