# PRD: 3D Animation System for Autumn8me React Native Applications

**Document Version:** 1.0
**Date:** March 19, 2026
**Author:** Autumn8me Engineering
**Status:** Draft
**Applies to:** SnapScore Golf, FairwayIQ, Geospatial ML Platform, Future Apps

---

## Executive Summary

This PRD defines the strategy, tooling, and architecture for delivering high-end 3D animations across all Autumn8me React Native applications. The system must support onboarding flows, celebratory moments, transitions, empty states, and loading states — delivering a premium, polished feel that differentiates Autumn8me products in the market.

After extensive evaluation of the 2025–2026 React Native animation ecosystem, this document recommends a **tiered approach**: Rive for interactive 2D/2.5D animations (onboarding, UI states, celebrations) combined with React Three Fiber + expo-gl for true 3D scenes (course flyovers, ball flight visualization, terrain rendering). This hybrid strategy maximizes quality while managing performance and bundle size across the device spectrum.

---

## 1. React Native 3D Animation Approaches — Full Evaluation

### 1.1 React Three Fiber (R3F) + expo-gl

| Attribute | Detail |
|---|---|
| **npm package** | `@react-three/fiber` v9.5.0 |
| **Weekly downloads** | ~700K |
| **GitHub stars** | 29,100+ (pmndrs/react-three-fiber) |
| **Last updated** | December 2025 |
| **React Native bridge** | `expo-gl` (provides WebGL interface over native OpenGL-ES) + `expo-three` (Three.js ↔ Expo GL abstraction) |

**How it works:** R3F is a React renderer for Three.js. On React Native, it renders through `expo-gl`, which provides an OpenGL-ES surface wrapped in a WebGL-compatible API. `expo-three` handles the DOM abstraction layer, translating Three.js calls to the native GL context.

**Quality ceiling:** Very high. Full Three.js feature set — PBR materials, shadow mapping, post-processing, skeletal animation, particle systems, custom shaders (GLSL). Capable of producing console-quality visuals within mobile polygon budgets.

**Performance on mobile:** Good to excellent with optimization. The Starlink app (Expo + Three.js) renders an interactive real-time sky scanner, proving production viability. Key constraints:
- Must test on physical devices only (iOS Simulator / Android Emulator crash with EXGL)
- Shadows are expensive; prefer baked lightmaps
- Target 30fps for complex scenes, 60fps for simple ones on mid-range devices

**Bundle size impact:** Significant. Three.js core is ~600KB minified+gzipped. With R3F, drei, and loaders, expect 800KB–1.2MB added to the JS bundle. GLB model assets are additional (target <2MB per scene).

**Expo compatibility:** ⚠️ **Active friction point.** Expo SDK 53 ships expo-gl@15, but R3F currently depends on expo-gl@11. This version mismatch causes crashes on real devices. The expo-three repo has an open issue (#313) for SDK 53 support as of June 2025. expo-three v8.0.0 uses Three v0.166, while SDK 52+ requires ≥v0.170. **This is the single biggest integration risk for this approach.** Workarounds exist (patch-package, pinning versions) but require active maintenance.

**Learning curve:** Moderate-to-high. Requires 3D graphics knowledge (lighting, materials, camera systems) plus React Three Fiber's declarative API. The R3F ecosystem (drei, rapier, postprocessing) reduces boilerplate significantly.

**Verdict:** ✅ **Best option for true 3D scenes** (course flyovers, ball flight, terrain). Not suitable for simple UI animations due to overhead. Must actively manage Expo version compatibility.

---

### 1.2 Rive

| Attribute | Detail |
|---|---|
| **npm package** | `@rive-app/react-native` v0.3.0 |
| **GitHub stars** | 1,200+ (rive-app/rive-react-native) |
| **Last updated** | March 2026 (5 days ago as of writing) |
| **Editor** | rive.app (browser-based, free tier available) |
| **Used by** | Spotify, Duolingo, Disney, ESPN, LinkedIn, Google |

**How it works:** Rive is a purpose-built runtime animation engine. Designers create animations in the Rive editor with built-in state machines (responds to user input, app state, gestures). Animations export as a single `.riv` binary that the native runtime renders via Metal (iOS) / Vulkan (Android) — no JS bridge overhead.

**Quality ceiling:** High for 2D/2.5D. Rive's 3D capabilities matured since the 2024 beta — supports perspective transforms, lighting effects, and pseudo-3D that reads as premium on mobile. Not true polygon-based 3D, but the "2.5D" aesthetic can be stunning (see Duolingo's character animations).

**Performance on mobile:** Excellent. Native runtime renders on the GPU without JS bridge round-trips. File sizes are tiny (typically 50–200KB per animation vs. 500KB+ for equivalent Lottie). State machines add zero runtime cost since logic is compiled into the .riv file.

**Bundle size impact:** ~2–4MB for the native Rive runtime (compiled into the app binary, not the JS bundle). Individual .riv files are 50–200KB each.

**Expo compatibility:** Requires a **development build** (not compatible with Expo Go). Works with EAS Build. Known issue: Expo SDK 53 may fail Android builds due to AGP version conflicts — workaround documented using `expo-build-properties` and `expo-custom-agp`.

**Learning curve:** Low-to-moderate. The Rive editor is intuitive for designers. State machines are visual (no code). Developer integration is straightforward — mount a `<Rive>` component, wire state machine inputs to app state.

**Verdict:** ✅ **Best option for interactive UI animations** — onboarding flows, celebrations, empty states, loading states, transitions. The state machine model is perfect for input-driven animations. Not suitable for true 3D scenes with camera control.

---

### 1.3 Lottie (lottie-react-native)

| Attribute | Detail |
|---|---|
| **npm package** | `lottie-react-native` v7.1.0 |
| **Weekly downloads** | ~350K |
| **GitHub stars** | 16,800+ |
| **Last updated** | 2025 |

**How it works:** Lottie plays After Effects animations exported as JSON via the Bodymovin plugin. The native runtime (Airbnb's original, now community-maintained) renders vector animations frame-by-frame.

**Quality ceiling:** Medium. Strictly 2D vector animations. Can achieve "2.5D" with careful layering and parallax, but the results look flat compared to Rive's 3D capabilities. No built-in state machines — animation is linear (play/pause/seek).

**Performance on mobile:** Good for simple animations, degrades with complexity. Full-screen Lottie files with many layers can cause frame drops on mid-range Android. No GPU-native rendering — relies on the platform's animation framework.

**Bundle size impact:** Minimal runtime (~100KB). But individual Lottie JSON files can be 200KB–2MB for complex animations, and they're uncompressed JSON (not binary like .riv).

**Expo compatibility:** ✅ Excellent. First-party Expo support via `expo-lottie`. Works in Expo Go.

**Verdict:** ⚠️ **Viable but dated.** Lottie is the incumbent standard, but Rive surpasses it in every dimension that matters for Autumn8me: interactivity (state machines vs. linear playback), file size (binary vs. JSON), performance (native GPU vs. platform animation), and 3D capabilities (2.5D/3D vs. flat 2D). **Recommend Rive over Lottie for new development.** Lottie remains useful only if leveraging existing After Effects animation assets.

---

### 1.4 React Native Skia (@shopify/react-native-skia)

| Attribute | Detail |
|---|---|
| **npm package** | `@shopify/react-native-skia` |
| **GitHub stars** | 7,200+ |
| **Maintained by** | Shopify |
| **Last updated** | Active (2026) |

**How it works:** Brings Google's Skia 2D graphics engine (powers Chrome and Android's UI) to React Native. Supports custom shaders (SkSL, similar to GLSL), image filters, path animations, and — with the upcoming Skia Graphite backend — WebGPU-based 3D compositing.

**Quality ceiling:** Very high for 2D effects and shader-based visuals. The Shopify "Game On" initiative is bringing WebGPU to React Native Skia, enabling 2D/3D compositing where Skia's 2D primitives render on WebGPU 3D surfaces at zero cost. Demos show 3D scenes with WebGPU textures running path animations and text layout.

**Performance on mobile:** Excellent. Up to 50% faster animation on iOS and nearly 200% faster on Android compared to previous versions. Deep Reanimated integration means animations run on the UI thread with zero JS bridge overhead.

**Bundle size impact:** ~3–5MB added to app binary (native Skia library).

**Expo compatibility:** ✅ Good. Works with Expo development builds. Compatible with React Native 0.79+ and React 19+.

**3D capability:** Currently 2D-focused with shader-based pseudo-3D effects. True 3D via WebGPU/Skia Graphite is emerging but not production-ready for complex 3D scenes as of March 2026.

**Verdict:** ✅ **Excellent for shader effects, transitions, and GPU-accelerated 2D.** Best-in-class for effects like scanning animations, ripples, glows, and gradient transitions. Complements both Rive (for state-machine animations) and R3F (for 3D scenes). WebGPU future makes this a strategic long-term investment.

---

### 1.5 Spline

| Attribute | Detail |
|---|---|
| **Platform** | spline.design (browser-based editor) |
| **React package** | `@splinetool/react-spline` (web only) |
| **React Native support** | iOS only (native SwiftUI); Android via WebView |

**How it works:** Spline is a browser-based 3D design tool with one-click code export. For React web, it embeds a WebGL viewer. For React Native, native support exists only for iOS via the spline-ios library. Android requires wrapping in a WebView.

**Quality ceiling:** High. Beautiful out-of-the-box with minimal effort. Supports interactions, physics, and real-time events.

**Performance on mobile:** Poor for Android (WebView overhead). Good on iOS native. The WebView approach adds 100–200ms input latency and cannot achieve 60fps consistently.

**Free tier:** Unlimited personal projects but web exports include Spline branding. AI 3D generation requires a paid plan ($12–15/month minimum). Code/mobile exports require paid plan.

**Verdict:** ❌ **Not recommended for cross-platform React Native.** The Android WebView approach is a dealbreaker for a premium app experience. Useful only as a prototyping/design tool — designers can prototype in Spline, then recreate assets in Blender for R3F export.

---

### 1.6 Babylon.js React Native

| Attribute | Detail |
|---|---|
| **npm package** | `@babylonjs/react-native` |
| **GitHub** | BabylonJS/BabylonReactNative |
| **Last updated** | March 2026 |

**How it works:** Embeds the Babylon Native engine (C++) in a React Native view, providing a full 3D engine with PBR, physics, and XR support.

**Critical issues:**
- Latest supported React Native version is **0.70** — severely outdated (current is 0.78+)
- **Not compatible with Expo** — requires bare React Native CLI
- Touch input only (no keyboard/controller)
- Single view limitation
- TypeScript compatibility issues

**Verdict:** ❌ **Not recommended.** The React Native version lock at 0.70 and Expo incompatibility make this unusable for Autumn8me's Expo-based stack.

---

### 1.7 Unity/Unreal Embedded

**Approach:** Embed a Unity or Unreal Engine view within React Native using packages like `@nicejava/react-native-unity-view` or custom native modules.

**Quality ceiling:** Maximum — full game engine capabilities.

**Practical issues:**
- Adds 50–200MB to app binary (Unity runtime alone is ~50MB)
- Complex build pipeline requiring native module bridging
- Two separate development environments (C#/Unity + TypeScript/RN)
- Memory management conflicts between RN and the game engine
- App Store review concerns with embedded game engines

**Verdict:** ❌ **Massively over-engineered for animation use cases.** Only justified for apps that are primarily 3D experiences with a thin RN wrapper.

---

### 1.8 Pre-Rendered Video (MP4/WebM)

**Approach:** Render 3D animations in Blender/After Effects, export as optimized MP4, play via `react-native-video`.

**Quality ceiling:** Unlimited (offline rendering with ray tracing, global illumination, etc.)

**Advantages:**
- Zero runtime GPU cost beyond video decode (hardware-accelerated on all devices)
- Guaranteed visual fidelity — what you render is what you get
- Works on every device, every OS version
- No native module dependencies beyond react-native-video

**Disadvantages:**
- Not interactive (can't respond to user input or app state)
- File sizes: 1–5MB per animation at acceptable quality (H.265/HEVC helps)
- Alpha channel support varies (iOS ProRes with alpha works; Android requires VP9+alpha or fallback)
- Must pre-render every variant (no dynamic content)

**Verdict:** ✅ **Excellent fallback for complex one-shot animations** (splash screens, celebratory moments) where interactivity isn't needed. Best option for devices that struggle with real-time 3D. Should be part of the progressive enhancement strategy.

---

### 1.9 Reanimated + Skia (Combined)

**Approach:** Use Reanimated 3 for gesture-driven UI animations combined with Skia for GPU-accelerated custom rendering.

This is not a standalone 3D solution but the **foundation layer** that all other approaches should integrate with. Reanimated shared values drive Skia shader uniforms, Three.js camera positions, and Rive state machine inputs — providing a unified animation timing system.

**Verdict:** ✅ **Required foundation layer**, not a standalone option.

---

### Comparison Matrix

| Approach | True 3D | Quality | Mobile Perf | Bundle Size | Expo Compat | Interactivity | Maintenance Risk |
|---|---|---|---|---|---|---|---|
| **R3F + expo-gl** | ✅ Full | ★★★★★ | ★★★☆☆ | +1.2MB JS | ⚠️ Version conflicts | Full camera/input | Medium-High |
| **Rive** | 2.5D | ★★★★☆ | ★★★★★ | +3MB native | ✅ Dev build | State machines | Low |
| **Lottie** | ❌ 2D | ★★★☆☆ | ★★★★☆ | +100KB | ✅ Expo Go | Play/pause only | Low |
| **RN Skia** | Shader 3D | ★★★★☆ | ★★★★★ | +4MB native | ✅ Dev build | Shader params | Low |
| **Spline** | ✅ Full | ★★★★☆ | ★★☆☆☆ Android | N/A | ❌ | Events | High |
| **Babylon.js** | ✅ Full | ★★★★★ | ★★★★☆ | +8MB native | ❌ | Full | Critical |
| **Unity** | ✅ Full | ★★★★★ | ★★★★★ | +50MB | ❌ | Full | Critical |
| **Pre-rendered** | N/A | ★★★★★ | ★★★★★ | +2MB/anim | ✅ | ❌ None | None |
| **Reanimated+Skia** | Shader | ★★★★☆ | ★★★★★ | +4MB native | ✅ Dev build | Full gesture | Low |

---

## 2. Free 3D Asset Generation Tools — Full Evaluation

### 2.1 Blender (Free, Open Source)

| Attribute | Detail |
|---|---|
| **Version** | 4.3+ (current as of early 2026) |
| **License** | GPL v2 — free for all use, including commercial |
| **Platform** | Windows, macOS, Linux |

**The gold standard for free 3D creation.** Blender is the only free tool with a complete professional pipeline: modeling, sculpting, texturing, rigging, animation, simulation, compositing, and rendering.

**Mobile-specific features:**
- **Decimate modifier**: Reduce polygon count with control over quality loss
- **glTF 2.0 exporter**: Built-in, actively maintained, supports PBR materials, skeletal animation, morph targets, and Draco compression
- **Bake workflow**: Bake complex lighting/materials to simple textures for mobile
- **LOD generation**: Model at high detail, generate low-poly versions with the Decimate modifier
- **Animation export**: Full skeletal animation → glTF with bone constraints and IK

**Mobile optimization workflow:**
1. Model at desired detail level
2. UV unwrap with uniform texel density
3. Bake AO/lighting to texture atlas (512–2K resolution)
4. Apply Decimate modifier to hit polygon budget
5. Export as GLB with Draco compression enabled
6. Validate in glTF Viewer or Three.js editor

**Verdict:** ✅ **Primary asset creation tool.** Requires 3D expertise but produces the highest quality results. Essential for custom golf course terrain, ball flight paths, and branded assets.

---

### 2.2 AI-Powered 3D Generation Tools

#### Meshy AI

| Attribute | Detail |
|---|---|
| **URL** | meshy.ai |
| **Latest version** | Meshy 6 (January 2026) |
| **Free tier** | 100 credits/month, 10 downloads/month |
| **Capabilities** | Text-to-3D, image-to-3D, AI texturing, basic rigging/animation |
| **Output formats** | GLB, FBX, OBJ, USDZ |
| **License (free)** | CC BY 4.0 |

Meshy 6 significantly improved geometry quality — refined meshes with reduced cleanup time for characters and organic models, sharper edges for mechanical assets. At 100 credits/month on the free tier, you can generate roughly 5 models (20 credits for Meshy 6 Preview per generation).

**Golf use case:** Generate golf ball, tee, flag, trophy, and simple prop models. Quality is sufficient for stylized/low-poly aesthetics but requires manual cleanup in Blender for production assets.

**Verdict:** ✅ **Good for rapid prototyping and simple props.** Not sufficient as sole asset pipeline — output requires Blender cleanup and optimization.

---

#### Tripo AI

| Attribute | Detail |
|---|---|
| **URL** | tripo3d.ai |
| **Latest version** | Tripo 3.0 (September 2025) — 2B parameter model |
| **Free tier** | 300 credits/month (~24–30 models), 1 concurrent task |
| **Capabilities** | Text-to-3D, image-to-3D, sketch-to-3D, auto-rigging |
| **Output formats** | GLB, FBX, OBJ, USDZ |
| **License (free)** | CC BY 4.0 (public models) |

Tripo 3.0 claims 300% improved detail over v2. The auto-rigging feature is particularly useful — upload a character model and get a rigged skeleton ready for Mixamo animations.

**Golf use case:** Generate character models (golfer silhouettes, caddies) and environmental props. The sketch-to-3D feature enables designers to draw concepts that become 3D assets.

**Verdict:** ✅ **Best free-tier AI generator for volume.** 300 credits/month substantially exceeds Meshy's 100. Auto-rigging is a differentiator.

---

#### Luma AI Genie

| Attribute | Detail |
|---|---|
| **URL** | lumalabs.ai |
| **Capability** | Text-to-3D in under 10 seconds |
| **Output** | Quad mesh with materials, standard formats |
| **Status (2026)** | Product availability unclear; Genie page redirects to main Luma platform |

Genie generates quad meshes (cleaner topology than triangulated AI outputs) with customizable materials at any polygon count. Compatible with Unity, Unreal, Blender, Maya. However, the free tier details and current availability are unclear — the dedicated Genie page now redirects, suggesting product restructuring.

**Verdict:** ⚠️ **Promising but uncertain availability.** Check current access before relying on this tool.

---

#### TripoSR (Open Source)

| Attribute | Detail |
|---|---|
| **GitHub** | VAST-AI-Research/TripoSR |
| **Developers** | Tripo AI + Stability AI |
| **License** | MIT |
| **Speed** | <0.5 seconds on NVIDIA A100 |

Single-image to 3D mesh reconstruction. Fully open source — can run locally or on any GPU server. Best-in-class speed for image-to-3D.

**Golf use case:** Turn reference photos of golf equipment, course features, or trophy designs into 3D models instantly.

**Verdict:** ✅ **Best open-source option.** Requires a capable GPU to run locally but produces results fast. Free with no credit limits.

---

#### InstantMesh (Open Source)

| Attribute | Detail |
|---|---|
| **GitHub** | TencentARC/InstantMesh |
| **License** | Apache 2.0 |
| **Approach** | Multi-view diffusion → sparse-view reconstruction |

Generates consistent multi-view images, then reconstructs a 3D mesh. Better multi-view consistency than TripoSR for complex objects.

**Verdict:** ✅ **Complementary to TripoSR** for objects requiring better angular consistency.

---

### 2.3 Free Asset Libraries

| Library | Golf Assets? | Format | License | Notes |
|---|---|---|---|---|
| **Sketchfab** | Yes (golf tag) | glTF/GLB native | CC licenses (check each) | 800K+ free models, direct GLB download |
| **Poly Pizza** | Limited sports | glTF | CC0 | Low-poly stylized assets, great for UI icons |
| **Kenney Assets** | No golf-specific | glTF, FBX | CC0 | Game-ready assets, consistent style |
| **Quaternius** | Sports category | glTF | CC0 | Free game-ready animated characters |

---

### 2.4 Mixamo (Free Character Animations)

| Attribute | Detail |
|---|---|
| **URL** | mixamo.com |
| **Cost** | Free (requires Adobe ID) |
| **License** | Royalty-free for personal and commercial use |
| **Library** | Thousands of motion-captured animations |
| **Limitations** | Bipedal humanoids only, no facial animation/blend shapes |

**Workflow:** Upload custom character model → Mixamo auto-rigs it → Browse/apply animations → Export as FBX → Import into Blender → Re-export as GLB for React Native.

**Golf use case:** Golf swing animations, celebration dances, walking/idle animations for caddy characters. Apply to custom Autumn8me character designs.

**Verdict:** ✅ **Essential for character animation.** The auto-rigging alone saves days of work. Combined with Tripo AI for character generation, this creates a free character pipeline.

---

### 2.5 Spline (Free Tier)

| Attribute | Detail |
|---|---|
| **Free tier** | Unlimited personal projects, web exports with Spline branding |
| **Paid (Pro)** | $12–15/month — removes branding, adds code/mobile exports, video import |
| **AI 3D generation** | Paid-only (requires AI Add-on on Pro+ plan) |

**Verdict:** ⚠️ **Useful as a design/prototyping tool only.** Free tier cannot export for mobile code integration. Designers can prototype animations in Spline, then recreate in Rive or Blender for production.

---

### Asset Tool Recommendation Matrix

| Use Case | Primary Tool | Backup Tool |
|---|---|---|
| Custom branded 3D models | Blender | — |
| Quick prop generation | Tripo AI (free tier) | Meshy AI (free tier) |
| Image-to-3D conversion | TripoSR (open source) | InstantMesh |
| Character models | Tripo AI + Blender cleanup | Meshy AI |
| Character animations | Mixamo (free) | Blender manual animation |
| Stock 3D assets | Sketchfab (free, CC) | Poly Pizza (CC0) |
| Design prototyping | Spline (free tier) | Blender |
| Golf terrain/courses | Blender (manual modeling) | — |

---

## 3. Animation Pipeline for Mobile

### 3.1 Optimal File Formats

| Format | Use Case | Why |
|---|---|---|
| **GLB** (binary glTF) | R3F 3D scenes | Single binary file, Draco compression, PBR materials, skeletal animation. Industry standard for real-time 3D |
| **.riv** | Rive animations | Binary format, 10–50x smaller than equivalent Lottie JSON. Embeds state machine logic |
| **MP4 (H.265/HEVC)** | Pre-rendered fallbacks | Hardware decode on all modern devices. 50% smaller than H.264 at same quality |
| **WebP animated** | Simple sprite animations | Supported on both platforms, smaller than GIF |
| **USDZ** | iOS AR Quick Look only | Not needed for in-app animations |

### 3.2 Polygon Budget for Mobile

Based on real-world benchmarks and device testing:

| Device Tier | Max Polygons/Scene | Max Draw Calls | Target FPS | Example Devices |
|---|---|---|---|---|
| **Low-end** | 10,000–30,000 | 50–100 | 30fps | iPhone 8, Galaxy A13 |
| **Mid-range** | 50,000–100,000 | 100–200 | 60fps | iPhone 12, Pixel 6 |
| **High-end** | 200,000–500,000 | 200–500 | 60fps | iPhone 15 Pro, Galaxy S24 |

**Autumn8me target:** Design for mid-range (50K polygon budget per scene) with LOD fallbacks for low-end. Individual hero models should be 5,000–15,000 polygons.

### 3.3 Texture Optimization

| Texture Type | Resolution | Format | Notes |
|---|---|---|---|
| Hero object albedo | 1024×1024 | KTX2 (Basis Universal) | Main character/object |
| Environment/terrain | 2048×2048 | KTX2 | Can be lower if tiling |
| UI elements/icons | 512×512 | PNG/WebP | Small overlays |
| Normal maps | 512×512 | KTX2 | Optional for mobile |
| Background props | 256×256 | KTX2 | Distant objects |

**Atlas packing:** Combine multiple small textures into a single atlas (1024×1024 or 2048×2048) to reduce draw calls. Blender's UV editing tools support multi-object atlas creation.

**Compression pipeline:**
1. Author textures at 2× target resolution
2. Downscale to target
3. Convert to KTX2 with Basis Universal compression using `gltf-transform` CLI
4. Apply Draco mesh compression
5. Validate file size < 2MB per scene

### 3.4 Animation Export Workflow

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐     ┌──────────────┐
│ Blender      │────▶│ glTF Export   │────▶│ gltf-transform│────▶│ React Native │
│ (Model +     │     │ (GLB, Draco)  │     │ (optimize,    │     │ (R3F loads   │
│  Animate)    │     │               │     │  KTX2, prune) │     │  .glb file)  │
└─────────────┘     └──────────────┘     └───────────────┘     └──────────────┘

┌─────────────┐     ┌──────────────┐     ┌───────────────────────────────────┐
│ Rive Editor  │────▶│ .riv export  │────▶│ React Native (@rive-app/react-   │
│ (Design +    │     │ (binary)     │     │  native mounts .riv file)        │
│  State Machine)│   │              │     │                                   │
└─────────────┘     └──────────────┘     └───────────────────────────────────┘
```

### 3.5 gltf-transform Optimization Commands

```bash
# Install
npm install -g @gltf-transform/cli

# Full optimization pipeline
gltf-transform optimize input.glb output.glb \
  --compress draco \
  --texture-compress ktx2 \
  --texture-size 1024 \
  --simplify --simplify-ratio 0.75 \
  --prune \
  --dedup
```

### 3.6 Level of Detail (LOD) Strategy

For R3F scenes, use the `<Detailed>` component from `@react-three/drei`:

```jsx
import { Detailed } from '@react-three/drei'

function GolfBall() {
  return (
    <Detailed distances={[0, 10, 25]}>
      <GolfBallHigh />   {/* < 10 units: 5,000 polys */}
      <GolfBallMed />    {/* 10-25 units: 1,500 polys */}
      <GolfBallLow />    {/* > 25 units: 500 polys */}
    </Detailed>
  )
}
```

### 3.7 Lazy Loading & Progressive Enhancement

```
Level 1 (Instant):     Static placeholder + Rive loading animation
Level 2 (< 1 second):  Low-poly GLB loads, basic materials
Level 3 (< 3 seconds): Full-resolution textures stream in
Level 4 (< 5 seconds): Shadows, post-processing, particle effects enable
```

**Implementation:**
- Bundle critical Rive animations in the app binary (< 200KB each)
- Lazy-load GLB models from CDN on first use
- Cache loaded models in device storage for subsequent launches
- Use R3F's `PerformanceMonitor` to adaptively reduce quality on struggling devices

---

## 4. Specific Use Cases for Autumn8me Apps

### 4.1 SnapScore Golf

| Moment | Animation Type | Engine | Description | Priority |
|---|---|---|---|---|
| **Onboarding — Welcome** | Interactive 2.5D | Rive | Animated golf ball bounces in, transforms into the SnapScore logo. State machine: ball responds to tap (squish/bounce). 3–4 screens with character guide | P0 |
| **Onboarding — Scan Tutorial** | Rive + Skia shader | Rive + Skia | Rive character demonstrates scan gesture. Skia shader renders a "scanning beam" effect that sweeps across a sample scorecard | P0 |
| **Scan Success** | Rive celebration | Rive | Golf ball launches through a hoop, confetti burst, score counter animates up. State machine triggers based on scan confidence score (higher confidence = bigger celebration) | P0 |
| **Game Mode Selection** | Rive interactive | Rive | 3D-style game tokens (Nassau, Skins, Wolf) rotate on selection. Each token has idle animation + selected state. Smooth transitions between modes | P1 |
| **Settlement** | Rive + pre-rendered | Rive | Poker chip / money stack animations. Chips slide and stack based on dollar amounts. Winner gets a spotlight effect | P1 |
| **Empty State — No Games** | Rive loop | Rive | Lonely golf flag on a tiny green island, gentle wind animation on flag, ball rolls by occasionally. Subtle and charming | P2 |
| **Loading State** | Rive loop | Rive | Golf ball rolling on infinite green, occasionally dropping into a cup (loop point) | P2 |
| **Score Entry** | Reanimated | Reanimated | Number counter scrolling animation with haptic feedback. Not 3D — pure UI animation | P1 |

---

### 4.2 FairwayIQ

| Moment | Animation Type | Engine | Description | Priority |
|---|---|---|---|---|
| **Onboarding — Welcome** | 3D scene | R3F | Drone-style flyover of a stylized low-poly golf course. Camera follows a path over fairways, greens, water hazards. Interactive: user can swipe to rotate camera | P0 |
| **Onboarding — Caddy Intro** | Rive character | Rive | Animated caddy character with state machine: waves, points at features, gives thumbs up. Guides user through feature tour | P0 |
| **Course Preview** | 3D scene | R3F | Per-hole 3D flyover with stylized terrain (low-poly aesthetic). Shows pin position, hazards, yardage markers. Generated from course data | P1 |
| **Shot Tracking** | 3D + Skia | R3F + Skia | 3D ball flight arc from tee to landing zone. Skia renders the trail/tracer effect. Ball physics simulation for realistic trajectory | P1 |
| **Green Reading** | 3D terrain | R3F | 3D contour map of green surface with animated ball roll simulation showing break and speed. Color gradient overlay for elevation | P2 |
| **Round Summary** | Rive + Reanimated | Rive | Animated scorecard with stats flowing in. Par/birdie/eagle celebrations with appropriate fanfare (Rive). Stat counters animate up (Reanimated) | P1 |
| **Empty State — No Rounds** | Rive loop | Rive | Golf bag sitting on an empty course, clubs gently swaying, bird lands on bag | P2 |

---

### 4.3 Geospatial ML Platform (Future)

| Moment | Animation Type | Engine | Description | Priority |
|---|---|---|---|---|
| **Onboarding — Welcome** | 3D scene | R3F | 3D globe with satellite scanning effect — beam sweeps across terrain, data points light up. Interactive rotation | P0 |
| **Data Visualization** | 3D terrain | R3F | 3D terrain mesh with overlay layers (heat maps, classification boundaries). Camera controls for orbit/zoom/pan | P0 |
| **Processing State** | Rive loop | Rive | Satellite orbiting Earth with scanning beam. Progress indicator integrated into orbit path. State machine: phases (uploading → processing → complete) | P1 |
| **Data Loading** | Rive + Skia | Rive + Skia | Terrain mesh "materializes" tile by tile. Skia shader for the "digital construction" effect | P1 |
| **Empty State** | Rive loop | Rive | Satellite floating in space, gentle rotation, stars twinkling. "Upload data to begin" prompt | P2 |

---

## 5. Recommended Architecture

### 5.1 Primary Technology Stack

```
┌─────────────────────────────────────────────────────────┐
│                    Autumn8me App                         │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │         @autumn8me/animation-system              │   │
│  │                                                   │   │
│  │  ┌─────────┐  ┌──────────┐  ┌────────────────┐ │   │
│  │  │  Rive    │  │   R3F    │  │  Skia Effects  │ │   │
│  │  │  Layer   │  │  Layer   │  │    Layer       │ │   │
│  │  │          │  │          │  │                │ │   │
│  │  │ • UI     │  │ • 3D     │  │ • Shaders     │ │   │
│  │  │   anims  │  │   scenes │  │ • Transitions │ │   │
│  │  │ • State  │  │ • Terrain│  │ • Scan FX     │ │   │
│  │  │   machines│ │ • Camera │  │ • Glow/ripple │ │   │
│  │  │ • 2.5D   │  │   control│  │               │ │   │
│  │  └─────────┘  └──────────┘  └────────────────┘ │   │
│  │                                                   │   │
│  │  ┌──────────────────────────────────────────┐    │   │
│  │  │        Reanimated 3 (Animation Bus)       │    │   │
│  │  │  Shared values drive all animation layers │    │   │
│  │  └──────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │              Asset Management                     │   │
│  │  • CDN-hosted GLB models (lazy loaded)           │   │
│  │  • Bundled .riv files (critical animations)      │   │
│  │  • Device-tier detection → LOD selection         │   │
│  │  • Offline cache (AsyncStorage + file system)    │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 5.2 Shared Component Library: `@autumn8me/animation-system`

This monorepo package provides reusable animation components across all Autumn8me apps:

```
@autumn8me/animation-system/
├── src/
│   ├── rive/
│   │   ├── RiveAnimation.tsx        # Wrapper with loading/error states
│   │   ├── OnboardingCarousel.tsx    # Multi-screen onboarding with Rive
│   │   ├── CelebrationBurst.tsx     # Configurable celebration animation
│   │   ├── EmptyState.tsx           # Animated empty state container
│   │   └── LoadingState.tsx         # Animated loading indicator
│   ├── three/
│   │   ├── Scene3D.tsx              # R3F scene wrapper with perf monitoring
│   │   ├── TerrainMesh.tsx          # Golf course terrain renderer
│   │   ├── BallFlight.tsx           # 3D ball trajectory visualization
│   │   ├── CameraFlyover.tsx        # Animated camera path system
│   │   └── GlobeSphere.tsx          # Interactive 3D globe
│   ├── skia/
│   │   ├── ScanBeamEffect.tsx       # Scanning beam shader
│   │   ├── GlowEffect.tsx          # Radial glow shader
│   │   ├── TransitionWipe.tsx       # Screen transition shaders
│   │   └── ContourOverlay.tsx       # Elevation contour rendering
│   ├── hooks/
│   │   ├── useDeviceTier.ts         # Detect device performance tier
│   │   ├── useAssetLoader.ts        # Lazy load + cache 3D assets
│   │   ├── useAnimationBus.ts       # Reanimated shared value bridge
│   │   └── useProgressiveQuality.ts # Adapt quality to device capability
│   └── utils/
│       ├── performanceMonitor.ts    # FPS tracking and adaptive quality
│       └── assetManifest.ts         # CDN URLs and version management
├── assets/
│   ├── rive/                        # .riv files (bundled)
│   └── models/                      # .glb files (CDN manifest)
└── package.json
```

### 5.3 Asset Creation Pipeline

```
                    ┌─────────────────┐
                    │   CONCEPT ART    │
                    │  (Figma/Spline   │
                    │   prototypes)    │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │ AI Generate │  │  Blender   │  │  Rive      │
     │ (Tripo/     │  │  (Custom   │  │  Editor    │
     │  Meshy/     │  │   models)  │  │  (2D/2.5D  │
     │  TripoSR)   │  │            │  │   anims)   │
     └──────┬─────┘  └─────┬──────┘  └─────┬──────┘
            │              │               │
            ▼              ▼               │
     ┌────────────────────────┐            │
     │    Blender Cleanup     │            │
     │  • Retopology          │            │
     │  • UV optimization     │            │
     │  • Material baking     │            │
     │  • Animation cleanup   │            │
     │  • LOD generation      │            │
     └───────────┬────────────┘            │
                 ▼                         │
     ┌────────────────────────┐            │
     │    gltf-transform      │            │
     │  • Draco compression   │            │
     │  • KTX2 textures       │            │
     │  • Mesh simplification │            │
     │  • Deduplication       │            │
     └───────────┬────────────┘            │
                 ▼                         ▼
     ┌────────────────────────────────────────┐
     │           Asset CDN / Bundle           │
     │  • GLB files on CDN (lazy loaded)     │
     │  • .riv files in app bundle           │
     │  • Manifest with version hashes       │
     └────────────────────────────────────────┘
```

### 5.4 Performance Optimization Strategy

**Device Tier Detection:**
```typescript
function getDeviceTier(): 'low' | 'mid' | 'high' {
  // iOS: Check device model (A-series chip generation)
  // Android: Check RAM + GPU renderer string
  // Fallback: Benchmark a simple scene at load time
}
```

**Adaptive Quality Table:**

| Feature | Low Tier | Mid Tier | High Tier |
|---|---|---|---|
| 3D scenes | Pre-rendered video fallback | GLB with basic materials | Full PBR + shadows |
| Rive animations | Static frames for complex anims | Full playback | Full playback + blur effects |
| Texture resolution | 512×512 | 1024×1024 | 2048×2048 |
| Polygon budget | 10K | 50K | 200K |
| Post-processing | None | FXAA only | FXAA + bloom + vignette |
| Particle effects | Disabled | Reduced count | Full |

---

## 6. Risk Assessment

### 6.1 Performance Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| R3F scenes drop below 30fps on mid-range Android | Medium | High | Device tier detection → LOD/fallback. Pre-rendered video for lowest tier. PerformanceMonitor auto-degrades |
| Memory pressure from multiple 3D scenes in navigation stack | Medium | High | Unmount 3D scenes when off-screen. Use `React.memo` + `useMemo` aggressively. Limit one R3F canvas active at a time |
| Rive + R3F + Skia combined native binary size | Low | Medium | Tree-shake unused features. Rive runtime is ~3MB, Skia ~4MB. Total overhead acceptable at ~7–10MB |

### 6.2 Expo Compatibility Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **expo-gl / R3F version mismatch** | **High** | **Critical** | Pin expo-gl version via patch-package. Monitor expo-three GitHub issues. Have pre-rendered video fallback ready for every R3F scene. Consider contributing to expo-three SDK 53 support |
| Rive Android build failure on SDK 53+ | Medium | High | Document workaround (expo-build-properties + expo-custom-agp). Pin working AGP version |
| expo-gl deprecation in favor of WebGPU | Low (2026) | High | Skia Graphite + WebGPU is the Shopify-backed future path. R3F + WebGPU integration is actively developed. Plan migration path for 2027 |

### 6.3 Maintenance Burden

| Concern | Severity | Strategy |
|---|---|---|
| Three separate animation runtimes (Rive, R3F, Skia) | Medium | Shared component library abstracts runtime choice. Components declare capabilities, library selects engine |
| Asset pipeline requires Blender expertise | Medium | Invest in Blender training for one designer. AI tools (Tripo, Meshy) reduce manual modeling. Establish asset templates |
| Rive editor learning curve for design team | Low | Rive's editor is purpose-built and intuitive. Extensive documentation and tutorials. 1–2 week ramp-up for experienced designers |

### 6.4 Platform-Specific Issues

| Issue | iOS | Android |
|---|---|---|
| GL rendering | Stable on Metal | Fragmented GPU drivers; test on Samsung, Pixel, Xiaomi |
| Video alpha channel | ProRes with alpha works | Requires VP9+alpha (limited support). Use Rive instead |
| Rive runtime | Stable | AGP version conflicts on newer Expo SDKs |
| Haptic feedback | Excellent (Taptic Engine) | Inconsistent across OEMs |
| Memory limits | Generous (6–8GB on modern) | Aggressive OEM memory management kills background GL contexts |

---

## 7. Implementation Roadmap

### Phase 1: Foundation (Weeks 1–4)

**Goal:** Establish the shared animation system and prove out the technical stack.

| Week | Deliverable |
|---|---|
| 1 | Set up `@autumn8me/animation-system` monorepo package. Install Rive, R3F, Skia, Reanimated. Resolve Expo compatibility issues. Create CI pipeline with physical device testing |
| 2 | Build device tier detection (`useDeviceTier`). Build asset loader with CDN + caching (`useAssetLoader`). Build performance monitor |
| 3 | Create first Rive animation: generic loading state. Create first R3F scene: simple rotating golf ball with PBR material. Validate both render at 60fps on mid-range test devices |
| 4 | Build `OnboardingCarousel`, `CelebrationBurst`, `EmptyState`, `LoadingState` wrapper components. Document component API. Create Storybook/example app for the animation library |

**Technical spike tasks:**
- Resolve expo-gl version conflict for SDK 53
- Benchmark Rive .riv file sizes across animation complexity levels
- Test R3F GLB loading time from CDN vs. bundled
- Validate Skia shader compilation time on low-end Android

---

### Phase 2: SnapScore Golf Onboarding (Weeks 5–10)

**Goal:** Ship the complete SnapScore Golf onboarding flow with animations.

| Week | Deliverable |
|---|---|
| 5–6 | **Design:** Create Rive animations for all onboarding screens (welcome, scan tutorial, permissions). Design scan beam shader in Skia. Create celebration animation for scan success |
| 7–8 | **Integration:** Wire Rive state machines to onboarding navigation. Implement scan beam effect with camera preview overlay. Build game mode selection with interactive tokens |
| 9 | **Polish:** Settlement chip animations. Empty state and loading state animations. Screen transitions using Skia wipe shaders |
| 10 | **QA & Optimization:** Performance testing across device matrix (iPhone 8 through 15 Pro, Galaxy A13 through S24). Fix frame drops. Optimize asset sizes. A/B test animation vs. static onboarding |

**Asset creation (parallel):**
- Rive: 8–10 animation files (~100–200KB each)
- Skia: 3–4 shader effects (code, no external assets)
- Pre-rendered: 1 video fallback for low-end devices

---

### Phase 3: FairwayIQ Integration (Weeks 11–18)

**Goal:** Bring 3D capabilities to FairwayIQ with course visualization.

| Week | Deliverable |
|---|---|
| 11–12 | **3D Pipeline:** Build terrain mesh generation from course elevation data. Create low-poly golf course style guide in Blender. Build `TerrainMesh` and `CameraFlyover` components |
| 13–14 | **Onboarding:** Rive caddy character with state machines. 3D course flyover for onboarding welcome screen. Wire to navigation flow |
| 15–16 | **Shot Tracking:** Ball flight 3D visualization with Skia trail effect. Integration with shot data API. Real-time trajectory rendering |
| 17 | **Green Reading:** 3D contour visualization. Color gradient elevation overlay. Ball roll physics simulation |
| 18 | **QA & Optimization:** Cross-device testing. LOD tuning for course flyover. Memory profiling for long sessions |

**Asset creation (parallel):**
- Blender: Golf course template model, terrain shader setup
- Rive: Caddy character (walk, point, celebrate states), round summary animations
- R3F: Ball model with physics, green contour shader

---

### Phase 4: Platform-Wide Design System (Weeks 19–24)

**Goal:** Codify animation patterns into a design system usable by all current and future apps.

| Week | Deliverable |
|---|---|
| 19–20 | **Documentation:** Animation design guidelines (when to use Rive vs. R3F vs. Skia). Motion principles (timing, easing, choreography). Asset creation guides for designers |
| 21–22 | **Geospatial Prep:** Build `GlobeSphere` component for the geospatial platform. Satellite orbit animation (Rive). Data layer overlay system (R3F + Skia) |
| 23 | **Design Tokens:** Animation duration/easing tokens shared across all apps. Consistent celebration tiers (subtle → medium → epic). Standardized loading/empty/error states |
| 24 | **Handoff:** Published npm package with full TypeScript types. Storybook documentation with live examples. Performance benchmarking dashboard. Migration guide for adding to new apps |

---

## 8. Success Metrics

| Metric | Target | Measurement |
|---|---|---|
| Onboarding completion rate | +15% vs. static onboarding | A/B test (animated vs. static) |
| Time to first action | <30 seconds from app open | Analytics event tracking |
| Animation frame rate | ≥30fps on low-tier, ≥55fps on mid-tier | PerformanceMonitor telemetry |
| App binary size increase | <15MB total (Rive + Skia + base assets) | Build size tracking in CI |
| JS bundle size increase | <1.5MB (R3F + Three.js tree-shaken) | Bundle analyzer in CI |
| Asset load time (CDN) | <2 seconds on 4G | Network performance monitoring |
| Crash rate from animations | <0.1% of sessions | Crash reporting (Sentry) |
| User satisfaction (animation) | ≥4.0/5.0 in user testing | Post-onboarding survey |

---

## 9. Open Questions & Decisions Needed

1. **Art direction:** Realistic vs. stylized/low-poly aesthetic? Low-poly is dramatically cheaper to produce and better for performance. Recommend low-poly with premium materials (subtle reflections, ambient occlusion).

2. **Rive vs. Lottie for existing assets:** If Autumn8me has existing Lottie animations, should they be migrated to Rive or maintained in parallel? Recommendation: maintain existing Lottie, create all new animations in Rive.

3. **CDN provider for 3D assets:** CloudFront, Fastly, or Cloudflare R2? Need global low-latency delivery for GLB files.

4. **expo-gl resolution strategy:** Wait for official SDK 53 support, fork and patch, or pin to SDK 52? This decision affects the Phase 1 timeline.

5. **Designer tooling investment:** Purchase Rive Team plan ($50/month/editor) or use free tier? Team plan adds collaboration features, version history, and private file hosting.

6. **Pre-rendered video codec:** H.265/HEVC (better compression, universal hardware decode) vs. AV1 (open, best compression, limited older device support)?

---

## 10. Appendix: Key Resources

**Libraries & Packages:**
- React Three Fiber: github.com/pmndrs/react-three-fiber
- Rive React Native: github.com/rive-app/rive-react-native
- React Native Skia: github.com/Shopify/react-native-skia
- Reanimated: github.com/software-mansion/react-native-reanimated
- expo-gl: docs.expo.dev/versions/latest/sdk/gl-view
- expo-three: github.com/expo/expo-three
- gltf-transform: gltf-transform.dev

**Asset Creation:**
- Blender: blender.org
- Rive Editor: rive.app
- Tripo AI: tripo3d.ai
- Meshy AI: meshy.ai
- TripoSR: github.com/VAST-AI-Research/TripoSR
- Mixamo: mixamo.com
- Sketchfab: sketchfab.com

**Reference Implementations:**
- Starlink app (Expo + Three.js real-time 3D)
- Duolingo (Rive character animations with state machines)
- Spotify (Rive interactive UI animations)
