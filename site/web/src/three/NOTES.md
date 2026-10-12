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

**Changes →** the key light becomes a warm point light behind and above the train (`decay 2`), so each
flat face carries a falloff and the specular sweeps across the metal as the wheels turn and the pointer
tilts the rig; the directional light drops to a fill. The rosette loses the radial family and becomes
44 thinner rings with a 0.28 rad phase step per ring (a clean barleycorn moiré). A main plate is added
under the train: dark gilt (#3A3022) with a canvas perlage bump and a deep-brass bevelled edge, with the
ContactShadow just above it so wheels sit on something.

## Iteration 3
- **Big step up.** The plate turns floating cogs into a movement; brass now has real value range
  (bright bevels on the centre wheel's rim, darker faces away from the key).
- **Composition:** the plate (r 7.6) is too large; its edge runs behind "software" and "honest".
- **Highlights:** the point light reflects in the medallion's clearcoat as a small blown-out white disc,
  which reads as a cheap lens flare, not a studio softbox.
- **Steel:** pinions are too white and bright, like chrome plastic toys next to the brass.
- **Perlage:** too regular at bumpScale 1.2; reads as a woven pattern.

**Changes →** plate r 6.1 moved right, perlage bump halved, steel darkened (#8F9296, roughness 0.24),
pinions thinner, medallion clearcoat 0.35 / clearcoat roughness 0.3, key light moved further back-left.

## Iteration 4
- The hotspot is gone; the medallion reads as engraved, satin-clearcoated brass with a polished cartouche
  and a crisp raised serif H. Pinions now read as grey steel and give scale.
- **Composition:** the plate's edge still kisses the comma of "software,"; the upper-left wheel
  half-overhangs the plate edge, which looks accidental.

**Changes →** plate nudged right/back; that wheel moved to 1.65 rad around the centre wheel (checked
for clearance against the 40-tooth wheel: tip circles 2.95 apart vs 2.53 needed).

## Iteration 5 (shipped)
- Hero 1600×1000: clean negative space on the left (~560 px), the movement occupies the right two thirds,
  plate edge and wheels cropped on the right like a macro close-up. Contrast: highlights on bevels and
  the centre-wheel rim, deep shadows in the spoke windows.
- Mobile 900×1100: the movement is centred (no lens shift on portrait aspect), medallion upper-left of
  centre, wheels cropped on the right; reads well as a poster.
- Finale: zoom 1.45 showed the whole plate as a plain disc with an empty lower-right; reduced to 1.3 so
  the plate still crops slightly and the train stays the subject.
- Known limits: the H and rosette are bump-mapped (no parallax at grazing angles); ACES tone mapping
  slightly desaturates the highlight end. Chunk: 226.8 kB gzip (three + fiber + drei ContactShadows;
  fiber v8 registers the whole `three` namespace, so tree-shaking cannot trim three much further).
