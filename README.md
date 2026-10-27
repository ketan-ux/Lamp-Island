# The Lantern Keeper's Shrine

*A light-and-shadow diorama for WebXR. Built for VR first, and tuned for PC.*

You stand on a tiny mossy stone island in a mist-covered forest pond. In your hand is an ornate brass lantern that holds a living forest spirit: a warm, flickering wisp with a small face. Bring its light close to the stone totems, gnarled roots and paper lotuses and they wake up. Moss creeps across the stone, hidden spirit carvings start to glow, roots uncurl and grow leaves, and paper petals unfold. Tilt the lantern, or shield it with your other hand, to move the grove between **Autumn (amber)** and **Spring (cyan)**.

Wake the twelve spirits of the grove, then bring the wisp to the shrine's mirror.

## Controls

| | VR (Quest, hand tracking or controllers) | Desktop |
|---|---|---|
| Move the light | Hold the lantern in your hand | Hold **left click** to reach toward what you look at (you kneel for low targets) |
| Tilt → season | **Roll your wrist**: tip right pours Spring, tip left pours Autumn | **Q / E** or the **mouse wheel** |
| Shield → season | **Cup the flame** with your empty hand. The light dims and the season turns while it's covered | Hold **right click** or **Space** |
| Pass the lantern | Trigger, grip or pinch with the empty hand | — |
| Move | Snap turn with the stick on the lantern hand, glide with the stick on the empty hand, or just walk around in roomscale | **Mouse** to look, **WASD** to walk |
| Misc | — | **M** mute · **H** hints · **Esc** pause |

## How it works

### Spherical masking: dormant vs. bloom
Every surface you can wake (stone, ground, bark, paper) has **two texture sets**: *dormant* and *bloom*. They are baked once at load time on the GPU into mipmapped render targets (`src/materials/textures.js`), so the app downloads no image files. RGB holds albedo. The bloom set's alpha holds an emissive mask: spirit carvings, glowing veins and moss sparks.

`MeshLambertMaterial` is patched in `src/materials/maskedMaterial.js` so that the **fragment shader** works out the distance from each fragment to the wisp. It then:

- blends the dormant set into the bloom set inside a sphere around the lantern, with an animated noisy edge so the bloom seems to creep,
- draws a thin glowing wavefront where the two sets meet,
- lights the carvings in the current season's colour,
- recolours moss and foliage between rust (autumn) and teal (spring).

Shape changes are done on the GPU by vertex deformers. Lotus petals hinge open. Roots uncurl: their centreline is integrated in the vertex shader from a heading function, so they unfurl without changing length. The cairn's capstone floats. Each deformer has a matching depth material, so the shadows move with the shapes. Every spirit also keeps a smoothed CPU-side bloom value. Holding the light close for about 1.4 s wakes the spirit for good. After that it keeps a gentle partial bloom, and a spirit orb flies to the shrine.

### Single dynamic light budget
- There is **one real-time shadow-casting light**: a spot light inside the lantern, aimed forward and down, away from your eyes, so shadows fall where you look. Its shadow camera's far plane is **4.5 m**. It uses PCF shadows, with a 1024² map on Quest and 2048² on PC.
- A dim hemisphere light gives a faint moonlit fill. It is static and casts no shadows.
- The wisp's all-round glow is a cheap analytic term in the shaders, not a second light. Nothing beyond the island receives real lighting.
- Everything past the island fades into **stylised height fog**. The lantern's halo in the mist comes from analytically integrating its light along each view ray, which costs no extra passes.

### Quest / standalone optimisation
- About **40 draw calls and about 67k triangles per eye**, counting the shadow pass. Trees, reeds, lily pads, leaves and particles are all instanced.
- Masked surfaces use Lambert shading. There is no post-processing in XR (an additive halo stands in for bloom), and fixed foveation is set to maximum.
- Quest 2 renders at a 0.85 framebuffer scale to leave some GPU headroom. Newer headsets render at 1.0.
- Fireflies, falling leaves and petals, and the finale's sky lanterns are animated entirely on the GPU from per-particle seeds.
- No downloads apart from the JavaScript bundle (about 175 kB gzipped). Textures and all audio are generated procedurally with Web Audio.

### PC optimisation
- An MSAA HDR render target, then Unreal bloom, then ACES tone mapping.
- 2048² shadows, anisotropic filtering, and dynamic resolution that adjusts the pixel ratio to hold the frame rate.

## Running it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # static site in dist/
npm run preview      # serve the production build
```

**On a Quest headset:** WebXR needs a secure context. Run `npm run dev:https` and open the `https://<your-LAN-IP>:5173` address it prints in the Quest Browser (accept the self-signed certificate). You can also use the GitHub Pages deployment.

### Deploying
`.github/workflows/deploy.yml` builds the site and publishes it to GitHub Pages on every push to `main`. You can also run it by hand from the Actions tab. Enable it once under **Settings → Pages → Source: GitHub Actions**.

### Debug flags
- `?debug` exposes `window.__lk`, which holds the world, input and season state, for scripted testing.
- `?fast` allows larger simulation steps, for slow software-rendered test runs.

## Project layout

```
src/
  main.js                 renderer, modes (menu / desktop / XR), per-frame orchestration
  core/                   shared uniforms, GLSL (mask, fog, in-scatter), config, geometry helpers
  materials/              GPU-baked texture sets + the spherical-mask material patch
  world/                  sky, pond, forest, reeds, island + rune ring, leaning grove, particles
  interactables/          totems, gnarled roots, paper lotuses, the shrine, Spirit state machine
  lantern/                brass lantern + wisp + spot light, keeper's hands, season controller
  input/                  desktop (pointer lock) and WebXR (controllers + hand tracking)
  audio/                  procedural soundscape, chimes and seasonal critters
  ui/                     DOM overlay/HUD and in-headset captions
```

Built with [three.js](https://threejs.org) r186 and Vite.
