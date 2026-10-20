# Flight Test: a VR ride-along (Meta Quest 3, WebXR)

A seated WebXR experience: sit in the driver's seat of a concept Roadster-style cabin and take one of two thruster-assisted
flights, then see what everyday use would require.

* **A, Curved ramp:** a thruster-assisted standing start, a run-up, a ramp curving through 170 degrees onto an overhead deck
  (held on by an underfloor suction fan), release from the lip upside-down, a barrel roll to upright and a thruster-cushioned
  landing on four wheels.
* **B, Car hop:** thrusters launch the car over a row of vehicles (Cybercab, Cybertruck, Model Y, Model 3, Semi), with a flip
  at the top and thruster braking on the way down.

Ride A follows the public reconstruction at bartblockmans.com/simulations/tesla-roadster-ramp (170 degree curve, release inverted
from the lip, about 3 s of flight, 2.8 m/s vertical touchdown); the rest is based on press descriptions of the October 2026 unveil.
Neither is a measurement of Tesla's actual car. It is about the *feel* and the
question "is this ready for daily use?", not a measured reconstruction.

Unofficial fan concept. Not affiliated with Tesla or SpaceX. The cabin is invented (the real interior has not been shown),
and figures such as the 3.3 g peak come from press coverage of the October 2026 unveil and are unverified.

## Run it

It is a static site with no build step (three.js is vendored in `vendor/three`).

```bash
python3 -m http.server 8000        # then open http://localhost:8000 on your computer
```

* **Desktop preview:** click *Desktop preview*, drag to look, click the panel buttons, `Enter` starts, `Esc` returns to the menu.
* **Quest 3:** WebXR needs HTTPS, so test on the device via GitHub Pages (below), or tunnel your local server
  (`npx localtunnel --port 8000` or `cloudflared tunnel --url http://localhost:8000`), then open the link in the Meta Quest
  Browser and tap *Enter VR*.

### Deploy on GitHub Pages

1. Create a repo and push this folder to it (`main` branch).
2. Settings > Pages > Build and deployment > Source: *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. Open `https://<user>.github.io/<repo>/` in the Quest Browser. The `.nojekyll` file stops Pages from processing the files.

### Remote debugging on Quest

Enable developer mode on the headset, connect over USB, then open `chrome://inspect` in desktop Chrome and inspect the
Quest Browser tab.

## Controls (in VR)

* Point at the panel with either controller and pull the trigger.
* **Squeeze a grip button during a ride to stop immediately.**
* Comfort modes: *Gentle* (slower drop, least rotation, strongest tunnel vision, default), *Standard*, *As shown* (full flip on the hop).

## How it works

| File | Role |
| --- | --- |
| `js/rides.js` | Ride kinematics (pure maths): drive, half-circle ramp, suction hold, thrust launch, free-fall, roll, thrust braking, touchdown. Baked to a table and sampled by time. Also felt g, rotation rate, thrust and suction level. |
| `js/vehicles.js` | The row of vehicles in the hop (low-poly silhouettes and roof heights). The row is placed under the flight path so each one is cleared. |
| `js/world.js` | Dusk test site, runway, light poles, ramp (ride A), row of parked cars (ride B), exit sign. |
| `js/cabin.js` | Invented concept cabin, yoke, centre screen, windscreen HUD and menu panel. |
| `js/comfort.js` | Dynamic vignette (tunnel vision), head sink under load, shake. |
| `js/audio.js` | Synthesised thruster, wind, drive whine, beeps. Muffles in free-fall. |
| `js/vapor.js` | Cold-gas plume particles. |
| `js/ui.js` | Canvas-drawn menu, result card, HUD and screen. |
| `js/main.js` | Renderer, XR session, controllers, haptics, state machine. |

The rig is `car > body > rig > camera`. The cabin is part of `body`, so it stays fixed relative to your head and gives your
brain a stable reference while the world moves; that is the main comfort technique. The car pivots about its centre of mass,
so flips swing the eye point realistically. Reference space is `local`, so your seated head position is the driver's eye point.

## Tuning

Check the headline numbers without a headset:

```bash
node tools/check-rides.mjs
```

Edit constants at the top of `js/rides.js` (`V_HOP`, `V_LOOP`, `F_LAUNCH`, `F_BRAKE`, `T_LAUNCH`, `T_TOP`, `LOOP`, and `MODES`) and re-run.
Debug URL parameters: `?ride=drop|hop&mode=gentle|standard|intense&autostart=1&seek=<seconds>` (`seek` freezes the ride at a time). `?cam=x,y,z&look=x,y,z` renders from a fixed outside camera, handy for checking models.

## Performance budget (Quest 3)

Roughly 150 draw calls, no real-time shadows, one canvas-texture update batch at about 15 Hz, particles in one draw call,
fixed foveation 0.5, target 90 Hz. If frames drop on device, lower `renderer.setPixelRatio`, shrink the hills/town, or cut
the vapor pool in `js/vapor.js`.

## Credits

three.js (MIT) is bundled in `vendor/three`; see `vendor/three/LICENSE`.
