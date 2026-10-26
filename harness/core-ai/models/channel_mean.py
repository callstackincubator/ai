# Authors channel-mean.aimodel, the image input model of the raw function
# harness tests, which harness/fixtures.ts holds as base64. Its `main` takes a
# 64x48 BGRA image and a float32 scale, and returns the mean of each byte
# channel times the scale, as float32 [1, 1, 4] in B, G, R, A order. It has no
# weights. With coreai-core 1.0.0b3:
#
#   python channel_mean.py channel-mean.aimodel
import sys
from pathlib import Path
from typing import Annotated

import coreai.authoring as ca
from coreai._compiler.dialects.coreai import FourCC

module = ca.Module.create()
with module:
    @ca.graph(provided_name='main')
    def main(
        image: Annotated[ca.Value, ca.ImageType(FourCC.BGRA32, 48, 64, name='image')],
        scale: Annotated[ca.Value, ca.TensorType([1], ca.float32, name='scale')],
    ) -> Annotated[ca.Value, ca.TensorType([1, 1, 4], ca.float32, name='mean')]:
        pixels = ca.cast(ca.image_to_tensor(image), ca.float32)
        return ca.broadcasting_mul(ca.reduce_mean(pixels, [0, 1]), scale)

ca.AIProgram(module).save_asset(Path(sys.argv[1]))
