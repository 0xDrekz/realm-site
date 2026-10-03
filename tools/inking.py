"""
REALM — the dark edge round a being.

It lived in tools/scene.py until that name was reused for the script that
paints the site's door and chamber, which replaced the file and broke the
collection generator's import. It is on its own here so the two cannot
collide again.
"""
from scipy import ndimage


def outline(layer, colour=(10, 6, 16), width=1):
    """A dark edge round whatever is in this layer.

    The reference style has one on everything, and it is what stops a
    character dissolving into a busy background.
    """
    a = layer[:, :, 3] > 40
    grown = ndimage.binary_dilation(a, iterations=width)
    ring = grown & ~a
    out = layer.copy()
    out[ring] = list(colour) + [255]
    return out
