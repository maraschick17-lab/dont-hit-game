"""Export only earned campaign captures, never leaderboard or seeded-fixture images."""
import hashlib
import json
import re
import shutil
import struct
import sys
from pathlib import Path

source, target = map(Path, sys.argv[1:3])
target.mkdir(parents=True, exist_ok=True)
manifest = json.loads((source / "manifest.json").read_text())
stages = {}
final = {}
for test in manifest:
    if "testNativeFourStageCampaignEarnsUnlock" not in test.get("testIdentifier", ""):
        continue
    for item in test.get("attachments", []):
        if item.get("isAssociatedWithFailure"):
            continue
        name = item.get("suggestedHumanReadableName", "")
        match = re.match(r"^Native campaign attempt ([12]) stage ([0-3])\b", name)
        if match:
            attempt, stage = map(int, match.groups())
            stages.setdefault(attempt, {})[stage] = item
        elif name.startswith("Native earned victory"):
            final["05-victory"] = item
        elif name.startswith("Native earned Endless Orbit"):
            final["06-endless-orbit"] = item
assert set(final) == {"05-victory", "06-endless-orbit"}, "Missing earned victory or Endless capture"
complete = [attempt for attempt, images in stages.items() if set(images) == {0, 1, 2, 3}]
assert complete, "Missing complete four-stage screenshot set"
attempt = max(complete)
selected = dict(zip(("01-highway", "02-waterway", "03-air", "04-space"),
                    (stages[attempt][i] for i in range(4))))
selected.update(final)
report = []
for label, item in selected.items():
    file = (source / item["exportedFileName"]).resolve()
    assert file.parent == source.resolve(), "Unexpected attachment path"
    data = file.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n" and data[12:16] == b"IHDR", "Expected original PNG"
    width, height, depth, color = struct.unpack(">IIBB", data[16:26])
    # Apple accepts these portrait dimensions for the required Dynamic Island medium size.
    # Record alpha capability conservatively; review/flatten if needed before upload.
    destination = target / (label + ".png")
    shutil.copyfile(file, destination)
    report.append({"file": destination.name, "width": width, "height": height,
                   "accepted_medium_portrait_size": (width, height) in {(1179, 2556), (1206, 2622)},
                   "png_bit_depth": depth, "png_color_type": color,
                   "alpha_or_palette_review_required": color != 2 or b"tRNS" in data,
                   "sha256": hashlib.sha256(data).hexdigest()})
(target / "capture-inventory.json").write_text(json.dumps({
    "source": "Native XCTest earned campaign; synthetic steering only; no seeded unlock",
    "attempt": attempt, "status": "Unmodified candidates; visual review and final store approval required",
    "captures": report
}, indent=2) + "\n")
print(json.dumps(report, indent=2))
