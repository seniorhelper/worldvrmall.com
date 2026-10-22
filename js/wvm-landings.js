/* World VR Mall · the island · landing views (Oct 21 2026). Every Go / tour / ?to= destination was visited in the VR simulator and measured:
   where a landing faced a wall, a hillside, a pole or empty ground, the place gets a standing spot (x, z) that sees the whole place,
   the direction to face (yaw, the engine's convention) and the point it frames (look). Scan tools + contact sheets live in the hand-over notes.
   Applied to app.places as they register (places can arrive late), so the 2D/3D travel, the VR menu, the guided tour and ?to= all use them. */
export const LANDINGS = {
  "airport": {"x":300,"z":-270,"yaw":0.79},
  "allofus-portal": {"x":-68.2,"z":92.9,"yaw":-1.94,"look":[-32.4,106.7]},
  "aurora": {"x":190,"z":116.6,"yaw":0,"look":[190,98.1]},
  "balloon": {"x":-53.5,"z":262.4,"yaw":0.4,"look":[-67.1,230.3]},
  "blaster": {"x":94.7,"z":46,"yaw":-2.15,"look":[125.8,66.3]},
  "chiller": {"x":142,"z":30.3,"yaw":2.95,"look":[136.3,59.3]},
  "fame": {"x":-80.9,"z":107.7,"yaw":-1.97,"look":[-36.7,126.5]},
  "harmony": {"x":-247.2,"z":254.4,"yaw":2.81,"look":[-254.2,274.5]},
  "lagoon": {"x":265,"z":255,"yaw":3.14},
  "lake": {"x":-116.5,"z":88.2,"yaw":0.3,"look":[-126.5,56.1]},
  "mall": {"x":-20,"z":96,"yaw":-0.29,"look":[0,30]},
  "market": {"x":-115.1,"z":193.8,"yaw":0.04,"look":[-116.5,161.1]},
  "observatory": {"x":-317.6,"z":-267.3,"yaw":0.26,"look":[-330,-313.7]},
  "park": {"x":144.2,"z":73.7,"yaw":-2.33,"look":[173.3,101.5]},
  "raincloud": {"x":-1.9,"z":80.6,"yaw":1.23,"look":[-36.3,68.5]},
  "spider-world": {"x":-140,"z":-296,"yaw":0},
  "teleport": {"x":-29.8,"z":163.9,"yaw":-0.75,"look":[3,128.8]},
  "train": {"x":63.6,"z":225.1,"yaw":0.1,"look":[59.4,184.6]},
  "zoo-gate": {"x":-234.8,"z":-404.4,"yaw":2.58,"look":[-247.7,-383.7]}
};
/* inside the mall (/mall/): the food court landed you looking down the row with the counter off to the side; each restaurant now faces its own storefront from 2.5 m, and the Raised In A Barn booth is seen from 3 m back */
export const LANDINGS_INSIDE = {
  "dine-gorditos-fresh-mex": {"x":43.2,"z":1158.5,"yaw":0.07},
  "dine-la-sanpedrana": {"x":-100.8,"z":1158.5,"yaw":0.07},
  "dine-las-frutas-locas": {"x":-4.8,"z":1158.5,"yaw":0.07},
  "dine-lidias-deli": {"x":-43.2,"z":1201.5,"yaw":-3.07},
  "dine-nueve-anos": {"x":52.8,"z":1201.5,"yaw":-3.07},
  "dine-rainbow-grill": {"x":-91.2,"z":1201.5,"yaw":-3.07},
  "dine-sugar-shack": {"x":91.2,"z":1158.5,"yaw":0.07},
  "dine-thai-tacos-waikiki": {"x":100.8,"z":1201.5,"yaw":-3.07},
  "dine-tropical-paradise": {"x":4.8,"z":1201.5,"yaw":-3.07},
  "dine-wayos": {"x":-52.8,"z":1158.5,"yaw":0.07},
  "raised-in-a-barn-booth": {"x":-15.6,"z":26.9,"yaw":0.15}
};
export function applyLandings(app, table = LANDINGS) {
  const fix = () => { for (const p of (app.places || [])) { const f = p && table[p.id]; if (!f || p._landing) continue; p._landing = { x: p.x, z: p.z, yaw: p.yaw, look: p.look }; if (f.look) p.look = f.look; if (f.x !== undefined) { p.x = f.x; p.z = f.z; } if (f.yaw !== undefined) p.yaw = f.yaw; } };
  fix(); let n = 0; const iv = setInterval(() => { try { fix(); } catch (e) { } if (++n > 60) clearInterval(iv); }, 1500);
  try { if (app.travel && !app.travel._landings) { const t0 = app.travel.bind(app); app.travel = (pl, mode) => { try { fix(); } catch (e) { } return t0(pl, mode); }; app.travel._landings = true; } } catch (e) { }
  return fix;
}
