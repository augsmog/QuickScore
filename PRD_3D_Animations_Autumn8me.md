# PRD: 3D Animation System for Autumn8me Applications
## Delivering Premium Onboarding & UI Animations Across React Native

*v1.0 — March 19, 2026 — Autumn8me, Inc.*

---

## 1. Executive Summary

This PRD defines a shared 3D animation system for all Autumn8me React Native applications (SnapScore Golf, FairwayIQ, and future geospatial platform products). The goal: deliver the polish level of Duolingo, Headspace, or Starlink's app — animations that feel premium, not gimmicky — primarily for onboarding but extending to celebrations, transitions, empty states, and key product moments.

**Recommended approach:** A hybrid architecture using Rive as the primary engine for interactive 2D/2.5D animations (onboarding flows, celebrations, loading states, micro-interactions) plus React Three Fiber for true 3D scenes where camera control and spatial depth are required (course flyovers, ball flight, terrain visualization). React Native Reanimated 3 serves as the shared animation bus coordinating both.

**Free asset pipeline:** Tripo AI (text/image → 3D, 300 credits/month free) → Blender (cleanup, optimization, animation) → gltf-transform (compression) → CDN delivery. Mixamo for character animations. Rive editor (free) for all interactive 2D/2.5D assets.

---

## 2. Animation Technology Evaluation

### Tier 1: Recommended for Production

#### Rive — PRIMARY ENGINE for Interactive Animations
- **What it is:** Design tool + runtime for interactive animations with state machines. Native GPU rendering (Metal on iOS, OpenGL on Android).
- **React Native:** `rive-react-native` — new Nitro-based runtime with excellent performance. Near-zero dropped frames even on older Android devices.
- **Quality ceiling:** Extremely high for 2D/2.5D. Supports bone animation, mesh deformation, state machines (interactive logic), and blend states. Can achieve pseudo-3D with parallax layers and perspective transforms.
- **Performance:** 60fps native rendering. Significantly lighter than JS-bridge approaches. .riv files are tiny (10-200KB typically).
- **Bundle size:** ~2MB native binary addition (iOS + Android).
- **Expo compatibility:** Full support. No bare workflow needed.
- **Free tier:** Rive editor is free for individuals. Community plan allows unlimited .riv files.
- **Used by:** Duolingo, Spotify, Google, Figma.
- **Best for:** Onboarding carousels, celebration animations, loading states, empty states, micro-interactions, animated icons, character animations, interactive tutorials.
- **Sources:** [rive-react-native](https://github.com/rive-app/rive-react-native), [Rive 2025 Guide](https://codercrafter.in/blogs/react-native/rive-animation-in-react-native-the-ultimate-2025-guide-for-developers)

#### React Three Fiber (R3F) — FOR TRUE 3D SCENES
- **What it is:** React renderer for Three.js. Full 3D engine with camera control, lighting, physics, post-processing.
- **React Native:** `@react-three/fiber/native` — uses `expo-gl` for WebGL2 bindings.
- **Quality ceiling:** Unlimited. Full 3D with PBR materials, shadows, particles, post-processing.
- **Performance:** Depends on scene complexity. 60fps achievable with optimized scenes (<50K triangles, baked lighting).
- **Bundle size:** ~1.2MB JS bundle addition for Three.js core.
- **Expo compatibility:** CRITICAL ISSUE — Expo SDK 53 ships expo-gl@15, but R3F depends on expo-gl@11. This version mismatch causes crashes on physical devices. Requires resolution (pin expo-gl version or wait for R3F update).
- **Best for:** Course flyovers, 3D terrain visualization, ball flight paths, green contour rendering, globe animations.
- **Precedent:** Starlink app uses Three.js + Expo GL for satellite visualization.
- **Sources:** [R3F Installation](https://r3f.docs.pmnd.rs/getting-started/installation), [State of R3F in RN](https://trifonstatkov.medium.com/the-current-state-of-using-react-three-fiber-in-react-native-expo-c65918593eaf)

#### React Native Reanimated 3 — ANIMATION BUS
- **What it is:** Worklet-based animation library running on the UI thread. 60fps guaranteed for transform/opacity animations.
- **Role:** Coordinates Rive and R3F animations with native UI transitions. Handles gesture-driven animations, shared element transitions, and layout animations.
- **Bundle size:** Already in most RN projects. Minimal overhead.
- **Best for:** Page transitions, gesture responses, parallax scrolling, coordinating animation triggers between Rive/R3F scenes and native UI.
- **Source:** [Reanimated 3 Guide](https://dev.to/erenelagz/react-native-reanimated-3-the-ultimate-guide-to-high-performance-animations-in-2025-4ae4)

### Tier 2: Viable Alternatives

#### React Native Skia
- **What it is:** 2D drawing engine (Skia via C++) with shader support. Can achieve pseudo-3D with custom shaders.
- **Strengths:** WebGPU improvements in 2025, video support, deep Reanimated integration. Excellent for scan beam effects, particle systems, gradient animations, custom transitions.
- **Weakness:** Not a 3D engine — no camera, no mesh loading, no lighting. 3D effects require hand-written shaders.
- **Use in our stack:** Supplementary — scan line effects, glow shaders, custom transitions that don't warrant a full Rive animation.
- **Source:** [React Native Skia](https://shopify.github.io/react-native-skia/)

#### Lottie (react-native-lottie)
- **What it is:** After Effects → JSON animation player. Industry standard for 2D animations.
- **Strengths:** Massive asset library (LottieFiles), well-understood workflow, tiny file sizes.
- **Weakness:** No interactivity (no state machines), no 3D, performance issues with complex compositions on Android. Rive is strictly superior for new development.
- **Verdict:** Use existing Lottie assets if you have them. All new animation work should use Rive.

#### Spline
- **What it is:** Browser-based 3D design tool with React integration.
- **Weakness:** No official React Native runtime. Would require embedding via WebView (poor performance) or pre-rendering to video. The web React component doesn't work in RN.
- **Verdict:** Great for prototyping 3D concepts, but export to glTF → R3F for production.

#### Pre-Rendered Video (MP4/WebM)
- **What it is:** Render complex 3D animations as video files and play in-app.
- **Strengths:** Maximum visual quality — anything Blender can render, you can play. No runtime GPU cost.
- **Weakness:** Large file sizes (2-10MB per animation), no interactivity, no dynamic data, looks "canned."
- **Verdict:** Fallback for extremely complex scenes that can't run in real-time. Consider for marketing/trailer content, not in-app.

### Technology Decision Matrix

| Capability | Rive | R3F | Skia | Lottie | Video |
|---|:---:|:---:|:---:|:---:|:---:|
| 2D Animation | 10 | 3 | 7 | 8 | 10 |
| 2.5D / Pseudo-3D | 9 | 5 | 6 | 3 | 10 |
| True 3D Scenes | 2 | 10 | 3 | 0 | 10 |
| Interactivity | 10 | 8 | 6 | 1 | 0 |
| Performance (mobile) | 10 | 7 | 9 | 6 | 9 |
| File Size | 10 | 5 | 8 | 9 | 2 |
| Expo Compat (2026) | 10 | 6* | 9 | 10 | 10 |
| Learning Curve | 7 | 4 | 5 | 8 | 9 |
| Free Tooling | 10 | 10 | 10 | 8 | 8 |

*R3F Expo score reflects the expo-gl version mismatch issue that needs resolution.

---

## 3. Free 3D Asset Generation Tools

### AI-Powered Generation (Text/Image → 3D)

#### Tripo AI — RECOMMENDED PRIMARY
- **Free tier:** 300-600 credits/month (24-30 models). Free outputs are public, CC BY 4.0.
- **Quality:** Tripo 3.0 (September 2025) uses a 2B parameter foundation model with 300% improved detail over v2.
- **Formats:** GLB, glTF, FBX, OBJ, STL, USD, 3MF — full compatibility with our pipeline.
- **Workflow:** Text prompt or single image → 3D model in ~10 seconds. Includes auto-rigging for character animation.
- **Strength:** Sketch-to-3D conversion is excellent for rapid prototyping. Image-to-3D works from single views.
- **Limitation:** Free tier models are public. Topology may need cleanup in Blender for animation-ready meshes.
- **Source:** [Tripo AI](https://www.tripo3d.ai/)

#### Meshy AI
- **Free tier:** Limited free generations (check current terms).
- **Quality:** Known for cleaner meshes and better edge flow than Tripo, especially with detailed prompts.
- **Formats:** STL, 3MF, FBX, GLB, OBJ, USDZ.
- **Strength:** Better structural control. Good for mechanical/architectural objects.
- **Limitation:** Slower generation than Tripo. Free tier more restrictive.
- **Source:** [Meshy AI](https://www.meshy.ai/)

#### TripoSR (Open Source)
- **What:** Open-source image-to-3D model from Stability AI and Tripo. Run locally for free.
- **Advantage:** No credit limits, no public requirement, full control.
- **Limitation:** Requires local GPU for inference (NVIDIA recommended). Lower quality than Tripo 3.0 cloud.
- **Use case:** Batch generation for asset libraries without credit constraints.
- **Source:** [GitHub: TripoSR](https://github.com/VAST-AI-Research/TripoSR)

#### InstantMesh
- **What:** Open-source single-image to 3D mesh. Higher quality than TripoSR for certain object types.
- **Source:** [GitHub: InstantMesh](https://github.com/TencentARC/InstantMesh)

### Traditional Tools (Manual Creation)

#### Blender — ESSENTIAL (Hub of the Pipeline)
- **Cost:** Completely free, open-source.
- **Role in pipeline:** Asset cleanup, UV unwrapping, texture baking, animation, optimization, glTF export. Every AI-generated asset passes through Blender before production.
- **Key features for mobile:** Decimate modifier (polygon reduction), texture baking (complex materials → simple textures), glTF exporter with Draco compression, animation NLA editor for combining clips.
- **Learning curve:** Steep initially. Focus on: basic modeling cleanup, UV editing, glTF export, and NLA animation. Skip rendering — we're exporting, not rendering.

#### Mixamo (Adobe) — CHARACTER ANIMATION
- **Cost:** Free (requires Adobe account).
- **What:** Library of 2,500+ character animations (walk, run, dance, celebrate, wave, golf swing). Upload any humanoid mesh, auto-rigs it, applies animations.
- **Use for Autumn8me:** Caddy character for FairwayIQ onboarding, celebration characters for SnapScore, mascot animations.
- **Format:** FBX export → import to Blender → re-export as glTF with animations.
- **Source:** [Mixamo](https://www.mixamo.com/)

#### Spline (Free Tier)
- **Cost:** Free tier with limited exports.
- **Strength:** Browser-based, intuitive for designers. Good for 3D illustrations (isometric scenes, product shots).
- **Limitation:** Can't export animations as glTF in free tier. Export as OBJ/glTF static → animate in Blender.
- **Use:** Prototyping 3D concepts, creating static 3D illustrations for marketing.

### Free Asset Libraries

| Source | Type | License | Best For |
|---|---|---|---|
| [Sketchfab](https://sketchfab.com/features/free-3d-models) | 500K+ free models | CC licenses (check each) | Golf equipment, nature, props |
| [Poly Pizza](https://poly.pizza/) | Low-poly 3D models | CC0 (public domain) | Stylized game assets, icons |
| [Kenney.nl](https://kenney.nl/assets) | Game-ready asset packs | CC0 | UI elements, nature packs |
| [Quaternius](https://quaternius.com/) | Low-poly animated packs | CC0 | Characters, nature, props |
| [Google Poly Archive](https://poly.pizza/google-poly) | Former Google Poly library | CC-BY | Varied objects |
| [Three.js examples](https://threejs.org/examples/) | Demo models/scenes | MIT | Reference implementations |

---

## 4. Mobile Optimization Pipeline

### Performance Budgets

| Metric | Target | Why |
|---|---|---|
| Triangle count per scene | <50,000 | Smooth 60fps on mid-range devices (iPhone 12, Pixel 6) |
| Texture size | Max 1024x1024, prefer 512x512 | GPU memory constraints |
| .riv file size | <200KB per animation | Fast loading, minimal storage |
| .glb file size | <2MB per 3D scene | Reasonable download on cellular |
| Total animation assets per app | <15MB | App Store size consciousness |
| First animation frame | <500ms | Avoid blank screens during load |

### Asset Optimization Pipeline

```
1. AI Generate (Tripo/Meshy)
   └── Text/image prompt → raw 3D model (often 50-200K triangles)

2. Blender Cleanup
   ├── Decimate to <10K triangles (for simple objects) or <30K (complex scenes)
   ├── Clean topology (remove non-manifold geometry, merge by distance)
   ├── UV unwrap and bake textures (diffuse, normal, roughness → single atlas)
   ├── Compress textures to 512x512 or 1024x1024 PNG
   └── Add animations (keyframe or Mixamo import)

3. Export
   ├── glTF 2.0 / GLB with Draco compression (for R3F scenes)
   └── .riv (for Rive animations — created in Rive editor, not Blender)

4. Optimize
   ├── gltf-transform (CLI) — merge meshes, quantize, compress
   ├── Squoosh/TinyPNG — texture compression
   └── Target: final GLB <500KB for simple objects, <2MB for scenes

5. Deliver
   ├── Bundle critical animations (onboarding) with app binary
   └── Lazy-load non-critical animations from CDN (Supabase Storage or Cloudflare R2)
```

### Format Reference

| Format | Use | Size | Compatibility |
|---|---|---|---|
| .riv | Rive animations | 10-200KB | Rive runtime only |
| .glb | 3D models + animations for R3F | 100KB-2MB | Three.js/R3F |
| .gltf | Same as GLB but separate files | Varies | Three.js/R3F |
| .usdz | iOS AR Quick Look | 500KB-5MB | iOS only (Apple) |
| .json (Lottie) | Legacy 2D animations | 20-500KB | Lottie player |

---

## 5. App-Specific Animation Specifications

### SnapScore Golf

| Moment | Engine | Description | Priority |
|---|---|---|---|
| Onboarding Slide 1 | Rive | Golf ball rolls in, camera shutter animation clicks, scorecard materializes with parallax depth | P0 |
| Onboarding Slide 2 | Rive | Game mode tokens (Skins, Nassau, Wolf) cascade in with bounce physics, interactive tap to flip | P0 |
| Onboarding Slide 3 | Rive | Settlement animation — dollar amounts fly between player avatars, "settled" checkmark stamps down | P0 |
| Scan Processing | Rive | Scan beam sweeps across scorecard with data extraction particles. Progress states with contextual messages | P0 |
| Scan Success | Rive | Green checkmark burst with confetti particles. Haptic sync. | P1 |
| Game Mode Win | Rive | Trophy/crown drops onto winner's name, gold particle burst. Scale intensity by win amount. | P1 |
| Settlement Reveal | Rive | Slot-machine-style number roll for each player's net amount, settling into final position | P1 |
| Empty State (no contests) | Rive | Lonely golf flag on green, gentle wind animation, ball rolls in from edge → CTA appears | P2 |
| Premium Unlock | Rive | Lock explodes into gold particles, revealing the PRO badge with glow effect | P2 |

### FairwayIQ

| Moment | Engine | Description | Priority |
|---|---|---|---|
| Onboarding Intro | Rive + R3F | 3D globe zooms into course location, transitions to aerial view of hole | P0 |
| Course Preview | R3F | 3D flyover of hole with terrain, bunkers, water rendered from elevation data. Camera follows tee-to-green path. | P0 |
| Green Reading | R3F | 3D green contour visualization with simulated ball roll showing break direction | P1 |
| Shot Tracking | R3F | 3D ball flight arc from tee to landing zone with trail effect | P1 |
| Caddy Tip | Rive | Animated caddy character delivers tip with speech bubble animation | P2 |
| Weather Integration | Rive | Dynamic wind direction indicator, rain/sun transitions | P2 |

### Geospatial Platform (Future)

| Moment | Engine | Description | Priority |
|---|---|---|---|
| Onboarding | R3F | 3D globe with satellite orbit animation, scanning beam sweeps across surface | P0 |
| Processing State | Rive | Satellite icon orbits while ML processes imagery, progress ring fills | P0 |
| Data Visualization | R3F | 3D terrain with segmentation overlay layers (crop health, building footprints, forest canopy) | P1 |
| API Response | Rive | Data "arriving" animation — packets flow into result card | P2 |

---

## 6. Shared Component Library Architecture

### Package Structure

```
@autumn8me/animations/
├── package.json
├── src/
│   ├── rive/
│   │   ├── RiveAnimation.tsx        # Wrapper with loading/error states
│   │   ├── OnboardingCarousel.tsx    # Reusable onboarding with Rive slides
│   │   ├── Celebration.tsx          # Configurable celebration (confetti, trophy, etc.)
│   │   ├── LoadingState.tsx         # Animated loading with progress
│   │   ├── EmptyState.tsx           # Animated empty states
│   │   └── ScanBeam.tsx             # Scan processing animation
│   ├── three/
│   │   ├── Scene3D.tsx              # R3F scene wrapper with perf defaults
│   │   ├── TerrainView.tsx          # 3D terrain from elevation data
│   │   ├── GlobeView.tsx            # Interactive 3D globe
│   │   ├── FlightPath.tsx           # Ball/trajectory visualization
│   │   └── CourseOverview.tsx        # Hole flyover camera path
│   ├── transitions/
│   │   ├── PageTransition.tsx       # Reanimated page transitions
│   │   ├── SharedElement.tsx        # Shared element transitions
│   │   └── GestureAnimation.tsx     # Gesture-driven animations
│   └── hooks/
│       ├── useAnimationTrigger.ts   # Coordinate animation with app state
│       ├── usePrefetch.ts           # Preload animation assets
│       └── useReducedMotion.ts      # Respect accessibility settings
├── assets/
│   ├── rive/                        # .riv files
│   ├── models/                      # .glb files
│   └── textures/                    # Shared textures
└── index.ts
```

### Key Design Principles

1. **Accessibility first:** Always check `useReducedMotion()`. Provide static fallbacks for every animation. Never convey critical information only through animation.

2. **Progressive enhancement:** Apps work without animations. Animations load asynchronously. First render is instant; animation enhances after load.

3. **Performance by default:** Scene3D wrapper enforces polygon budgets, auto-downgrades on low-end devices (check `Platform` and device model), and provides FPS monitoring in dev mode.

4. **Consistent API:** Every animation component exposes: `onStart`, `onComplete`, `isPlaying`, `trigger()`, `reset()`. Rive and R3F components share the same interface.

---

## 7. Risk Assessment

| Risk | Level | Mitigation |
|---|---|---|
| **expo-gl version mismatch (R3F + Expo SDK 53)** | High | Pin expo-gl@11 via package.json overrides. Monitor pmndrs/react-three-fiber for fix. Worst case: defer R3F features to Phase 2 and ship onboarding with Rive-only. |
| **Android performance variance** | Medium | Test on Pixel 4a (low-end baseline). Rive's native rendering handles this well. R3F scenes need aggressive LOD and triangle budgets. |
| **Bundle size bloat** | Medium | Rive: ~2MB (acceptable). R3F/Three.js: ~1.2MB JS. Total ~3.2MB additional. Mitigate: lazy-load R3F only on screens that need it. |
| **Learning curve for team** | Medium | Rive has excellent tutorials and visual editor. R3F requires Three.js knowledge. Recommendation: start all animation work in Rive; only use R3F where true 3D is unavoidable. |
| **AI-generated asset quality** | Low-Medium | Tripo 3.0 quality is good but topology needs Blender cleanup for animation. Budget 30-60 min per asset for cleanup. |
| **Rive editor limitations for 3D** | Low | Rive is 2D/2.5D — won't do true camera-controlled 3D. This is by design: Rive handles 80% of use cases, R3F handles the rest. |
| **App Store size increase** | Low | Total animation assets target <15MB. Modern apps average 100-200MB. This is within budget. |
| **Accessibility complaints** | Low | Respect `prefers-reduced-motion`. Provide static alternatives. Test with screen readers. |

---

## 8. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-3)

**Goal:** Shared animation library with Rive integration proven.

- Set up `@autumn8me/animations` package (monorepo or npm package)
- Install and configure `rive-react-native` in SnapScore Golf
- Build `RiveAnimation` wrapper component with loading/error states
- Build `useReducedMotion` hook
- Create first Rive animation: SnapScore Golf scan beam effect
- Validate performance on iPhone 12 and Pixel 4a
- **Resolve expo-gl compatibility for R3F** — pin version or identify workaround

Deliverable: Working Rive animation in SnapScore Golf scan flow.

### Phase 2: SnapScore Onboarding (Weeks 4-6)

**Goal:** Full 3-screen onboarding with Rive animations.

- Design and build 3 onboarding Rive animations in Rive editor
- Generate golf-themed 3D assets via Tripo AI → cleanup in Blender → reference for Rive
- Build `OnboardingCarousel` reusable component
- Add celebration animations (scan success, game win, settlement)
- Add empty state animations
- Build asset preloading system

Deliverable: SnapScore Golf ships with animated onboarding and key moment animations.

### Phase 3: R3F Integration & FairwayIQ (Weeks 7-12)

**Goal:** True 3D capabilities for FairwayIQ course visualization.

- Integrate R3F in FairwayIQ (resolve expo-gl issues from Phase 1)
- Build `TerrainView` component from USGS elevation data
- Build `CourseOverview` hole flyover with camera animation
- Build `GreenContour` 3D visualization
- Optimize for 60fps on target devices
- Generate course-specific 3D assets (flags, tee markers, trees) via Tripo AI

Deliverable: FairwayIQ has 3D course preview and green reading.

### Phase 4: Platform Design System (Weeks 13-18)

**Goal:** Animation system is a reusable platform for all future apps.

- Document component library with Storybook/example app
- Build `GlobeView` for geospatial platform onboarding
- Build reusable `DataVisualization3D` terrain overlay component
- Create animation style guide (timing curves, duration standards, interaction patterns)
- Performance regression testing pipeline

Deliverable: Any new Autumn8me app can have premium animations in <1 week of integration.

---

## 9. Asset Creation Workflow Summary

### For Rive Animations (80% of use cases)
```
1. Concept sketch / reference
2. Design in Rive Editor (free, browser-based)
   - Build artwork with vector tools or import SVGs
   - Add bones/mesh deformation for organic motion
   - Create state machine for interactive logic
   - Test with Rive's preview
3. Export .riv file (<200KB target)
4. Drop into @autumn8me/animations/assets/rive/
5. Use <RiveAnimation source="scan-beam" /> in app
```

### For 3D Scenes (R3F, 20% of use cases)
```
1. Generate base model: Tripo AI (text/image → 3D, ~10 seconds)
2. Import to Blender:
   - Decimate to <30K triangles
   - Clean topology, UV unwrap
   - Bake textures to 512x512 atlas
   - Add keyframe animations or import from Mixamo
3. Export as .glb with Draco compression
4. Optimize with gltf-transform CLI
5. Place in @autumn8me/animations/assets/models/
6. Use <Scene3D model="course-overview" /> in app
```

### Tools Required (All Free)

| Tool | Purpose | Cost |
|---|---|---|
| Rive Editor | 2D/2.5D animation creation | Free (community plan) |
| Blender 4.x | 3D modeling, cleanup, animation, export | Free (open source) |
| Tripo AI | AI text/image → 3D model generation | Free (300 credits/mo) |
| Meshy AI | Alternative AI 3D generation | Free tier |
| Mixamo | Character auto-rigging and animation library | Free (Adobe account) |
| gltf-transform | GLB optimization CLI | Free (npm) |
| Squoosh | Texture compression | Free (web) |
| TripoSR | Local open-source image-to-3D (no credits) | Free (GPU required) |

---

## 10. Success Metrics

| Metric | Target | Measurement |
|---|---|---|
| Onboarding completion rate | >80% (vs. ~60% without animation) | Analytics (PostHog) |
| Time to first wow moment | <30 seconds from app open | Session recording |
| Animation frame rate | 60fps on iPhone 12+ and Pixel 6+ | Performance monitoring |
| App size increase from animations | <15MB total | Build artifact analysis |
| User-reported "premium feel" (App Store reviews) | Mentioned in >10% of reviews | Review sentiment analysis |
| Crash rate from animation code | <0.1% | Crash reporting |
| Reduced motion respect | 100% of animations have static fallback | Manual QA |

---

## Appendix: Key Sources

- [Rive React Native Runtime](https://github.com/rive-app/rive-react-native)
- [Rive 2025 Developer Guide](https://codercrafter.in/blogs/react-native/rive-animation-in-react-native-the-ultimate-2025-guide-for-developers)
- [React Three Fiber Installation](https://r3f.docs.pmnd.rs/getting-started/installation)
- [State of R3F in React Native](https://trifonstatkov.medium.com/the-current-state-of-using-react-three-fiber-in-react-native-expo-c65918593eaf)
- [Reanimated 3 Guide](https://dev.to/erenelagz/react-native-reanimated-3-the-ultimate-guide-to-high-performance-animations-in-2025-4ae4)
- [State of React Native 2024: Animations](https://results.stateofreactnative.com/en-US/animations/)
- [Tripo AI](https://www.tripo3d.ai/) — 2B parameter model, GLB/glTF export
- [Meshy AI](https://www.meshy.ai/) — Clean mesh generation
- [TripoSR (open source)](https://github.com/VAST-AI-Research/TripoSR)
- [InstantMesh (open source)](https://github.com/TencentARC/InstantMesh)
- [Mixamo](https://www.mixamo.com/) — Free character animations
- [Best AI 3D Generators 2025](https://www.magic3d.io/blog/best-ai-3d-generators-2025)
- [12 Essential AI 3D Tools 2026](https://www.3daistudio.com/3d-generator-ai-comparison-alternatives-guide/best-3d-generation-tools-2026/12-essential-ai-3d-creation-tools-2026)
