# Hero 3D movement: look-development notes

Screenshots from `three-demo.html?still=1&text=1` at 1600×1000 (headless Chromium, SwiftShader WebGL),
with a placeholder headline on the left to judge the negative space.

## Iteration 1
- **Composition:** far too close. The train fills the frame edge to edge and the upper-left wheel sits
  behind the headline; there is no negative space on the left.
- **Brass:** reads as flat yellow "gold", not brass. RoomEnvironment at full intensity reflects a bright,
  even grey room into every metal face, so there is no contrast between faces and bevels.
- **Wheels:** module 0.075 gives chunky, few teeth; it reads as a clip-art cog, not a watch wheel.
- **Medallion:** guilloché bump too faint and the face too pale; the "H" is fine but lacks polish.
- **Bevels:** too small to catch light.
- What works: the meshing is correct (teeth interleave), the deep-brass variant on two wheels adds depth,
  the ruby jewels and steel collets are a believable detail.

**Changes →** module 0.055 with tooth counts scaled up (110/28/64/40/22/48/32), wider bevels, steel
10-leaf pinions on every arbor, environment intensity 0.9 → 0.5, stronger warm key + a cool rim light,
camera pulled back with a lens shift (`filmOffset`) so the movement sits in the right two thirds with
perspective unchanged, deeper medallion colour, stronger bump.

## Iteration 2
- **Composition:** the left is now clean for the headline, but the cluster hugs the right edge and is
  cropped on two sides; it feels pushed off rather than placed.
- **Brass:** still low dynamic range. A directional key lights a flat face uniformly, so every top face
  has the same value; nothing reads as a polished highlight sweeping across metal.
- **Medallion:** the second family of curved radial strokes makes the rosette look hairy (a fingerprint),
  not the crisp moiré lattice of a rose-engine cut.
- What works: finer teeth and steel pinions immediately read as horology; the jewel + collet + pinion
  stack gives each arbor scale.
