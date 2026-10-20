// The row of vehicles in the hop, in the order press coverage listed them. Profiles are side
// silhouettes (x = metres from the rear, y = height) extruded to `width`. Low-poly stand-ins,
// not replicas. `h` is the roof height used to check the jump clears each one.
export const VEHICLES = [
  { name: 'Cybercab', len: 4.4, h: 1.65, width: 1.85, color: 0xdfe3e8,
    profile: [[0, 0.4], [0.25, 0.8], [0.9, 1.0], [1.4, 1.62], [2.9, 1.65], [3.6, 1.0], [4.35, 0.85], [4.4, 0.4]] },
  { name: 'Cybertruck', len: 5.7, h: 1.95, width: 2.0, color: 0xb9bdc4,
    profile: [[0, 0.4], [0, 1.45], [2.9, 1.95], [5.65, 1.0], [5.7, 0.4]] },
  { name: 'Model Y', len: 4.75, h: 1.65, width: 1.9, color: 0xf2f2f2,
    profile: [[0, 0.4], [0.1, 1.05], [0.5, 1.55], [3.0, 1.65], [3.8, 1.1], [4.7, 0.95], [4.75, 0.4]] },
  { name: 'Model 3', len: 4.7, h: 1.45, width: 1.85, color: 0x9b1f26,
    profile: [[0, 0.4], [0.1, 1.0], [0.6, 1.1], [1.4, 1.45], [2.9, 1.45], [3.8, 1.0], [4.65, 0.9], [4.7, 0.4]] },
  { name: 'Semi', len: 9.5, h: 4.0, width: 2.5, color: 0xeeeeee,
    profile: [[0, 0.7], [0, 4.0], [7.0, 4.0], [7.0, 3.0], [7.3, 3.0], [7.3, 4.0], [9.2, 4.0], [9.5, 3.0], [9.5, 0.7]] },
];
