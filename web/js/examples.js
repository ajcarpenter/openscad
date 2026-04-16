/**
 * examples.js — Built-in example models for OpenSCAD Web
 *
 * Each example has a name, description, and OpenSCAD source code.
 */

export const examples = [
  {
    name: 'Hello Cube',
    description: 'A simple cube — the "Hello World" of 3D modeling.',
    code: `// Hello Cube
// A simple centered cube.

size = 30; // [10:60] Size

cube([size, size, size], center=true);
`,
  },
  {
    name: 'Parametric Box',
    description: 'A hollow box with adjustable dimensions and wall thickness.',
    code: `// Parametric Box
// A hollow box with configurable dimensions.

width = 40;     // [10:80] Width
depth = 30;     // [10:80] Depth
height = 25;    // [5:60] Height
wall = 2;       // [1:0.5:5] Wall thickness

difference() {
  cube([width, depth, height], center=true);
  translate([0, 0, wall])
    cube([width - 2*wall, depth - 2*wall, height], center=true);
}
`,
  },
  {
    name: 'Gear',
    description: 'A parametric spur gear with involute teeth.',
    code: `// Parametric Gear
// A simple gear with configurable teeth.

teeth = 20;       // [8:40] Number of teeth
module_val = 2;   // [1:0.5:4] Module (tooth size)
thickness = 8;    // [3:20] Gear thickness
bore = 5;         // [2:15] Center bore diameter

pitch_r = teeth * module_val / 2;
outer_r = pitch_r + module_val;
inner_r = pitch_r - 1.25 * module_val;

$fn = 64;

difference() {
  union() {
    // Gear body
    cylinder(r=inner_r, h=thickness, center=true);
    
    // Teeth
    for (i = [0:teeth-1]) {
      rotate([0, 0, i * 360/teeth])
        translate([pitch_r, 0, 0])
          cube([module_val*2, module_val*1.5, thickness], center=true);
    }
  }
  // Center bore
  cylinder(d=bore, h=thickness+1, center=true);
}
`,
  },
  {
    name: 'Vase',
    description: 'A smooth vase created with rotate_extrude.',
    code: `// Parametric Vase
// Uses rotate_extrude with a custom profile.

height = 60;       // [30:100] Height
radius = 15;       // [8:30] Base radius
wall = 2;          // [1:4] Wall thickness
waves = 3;         // [0:6] Number of wave undulations
wave_amp = 5;      // [0:10] Wave amplitude

$fn = 64;

module vase_profile(h, r, w, waves, amp) {
  difference() {
    polygon(points=[
      for (i = [0:2:h])
        let(t = i/h)
        let(wave = waves > 0 ? amp * sin(t * waves * 360) : 0)
        [r + wave * (0.3 + t*0.7), i]
      ,
      for (i = [h:-2:0])
        let(t = i/h)
        let(wave = waves > 0 ? amp * sin(t * waves * 360) : 0)
        [max(1, r + wave * (0.3 + t*0.7) - w), i]
    ]);
  }
}

rotate_extrude($fn=64)
  vase_profile(height, radius, wall, waves, wave_amp);
`,
  },
  {
    name: 'Fidget Spinner',
    description: 'A three-lobed fidget spinner toy.',
    code: `// Fidget Spinner
// A simple three-lobed spinner.

body_r = 12;    // [8:18] Lobe radius
center_r = 8;   // [5:12] Center radius
thickness = 6;  // [4:10] Thickness
arms = 3;       // [2:6] Number of arms
spacing = 25;   // [18:35] Arm spacing

$fn = 48;

difference() {
  union() {
    // Center hub
    cylinder(r=center_r, h=thickness, center=true);
    
    // Lobes
    for (i = [0:arms-1]) {
      rotate([0, 0, i * 360/arms])
        translate([spacing, 0, 0])
          cylinder(r=body_r, h=thickness, center=true);
    }
    
    // Connecting arms
    for (i = [0:arms-1]) {
      rotate([0, 0, i * 360/arms])
        hull() {
          cylinder(r=center_r-1, h=thickness, center=true);
          translate([spacing, 0, 0])
            cylinder(r=body_r-1, h=thickness, center=true);
        }
    }
  }
  
  // Center bearing hole
  cylinder(r=4, h=thickness+1, center=true);
  
  // Weight holes in lobes
  for (i = [0:arms-1]) {
    rotate([0, 0, i * 360/arms])
      translate([spacing, 0, 0])
        cylinder(r=body_r-3, h=thickness+1, center=true);
  }
}
`,
  },
  {
    name: 'Phone Stand',
    description: 'An adjustable phone/tablet stand.',
    code: `// Phone Stand
// A simple angled phone stand.

width = 70;       // [40:100] Width
depth = 50;       // [30:80] Depth
angle = 65;       // [45:85] Viewing angle
thickness = 4;    // [2:6] Material thickness
slot_width = 12;  // [8:20] Phone slot width

$fn = 32;

module stand() {
  // Base
  cube([width, depth, thickness]);
  
  // Back support
  translate([0, 0, 0])
    rotate([90 - angle, 0, 0])
      cube([width, depth * 0.8, thickness]);
  
  // Phone lip
  translate([0, -thickness, 0])
    cube([width, thickness, slot_width + thickness]);
}

// Center it
translate([-width/2, -depth/3, 0])
  stand();
`,
  },
  {
    name: 'Knurled Knob',
    description: 'A textured cylindrical knob for 3D printing.',
    code: `// Knurled Knob
// A knob with knurled grip texture.

diameter = 25;    // [15:40] Outer diameter
height = 15;      // [8:30] Height
knurl_n = 30;     // [12:60] Number of knurls
knurl_d = 1.5;    // [0.5:0.5:3] Knurl depth
bore = 6;         // [3:12] Bore diameter

$fn = 64;

difference() {
  union() {
    // Main body with knurling
    for (i = [0:knurl_n-1]) {
      rotate([0, 0, i * 360/knurl_n])
        translate([diameter/2, 0, 0])
          cylinder(r=knurl_d, h=height, center=true, $fn=6);
    }
    cylinder(d=diameter - knurl_d, h=height, center=true);
    
    // Top cap
    translate([0, 0, height/2 - 1])
      cylinder(d=diameter + 1, h=2, center=true);
  }
  
  // Center bore
  cylinder(d=bore, h=height+2, center=true);
  
  // Set screw hole
  translate([0, diameter/2, 0])
    rotate([90, 0, 0])
      cylinder(d=3, h=diameter/2, $fn=16);
}
`,
  },
  {
    name: 'Snowflake',
    description: 'A 2D snowflake pattern extruded to 3D.',
    code: `// Snowflake
// A decorative snowflake ornament.

size = 40;       // [20:60] Overall size
thickness = 2;   // [1:4] Thickness
branches = 6;    // [3:8] Number of branches
detail = 3;      // [1:5] Detail level

$fn = 32;

module branch(len, w, depth) {
  // Main branch
  square([len, w], center=true);
  
  if (depth > 0) {
    // Sub-branches
    translate([len * 0.3, 0])
      rotate([0, 0, 40])
        branch(len * 0.45, w * 0.8, depth - 1);
    translate([len * 0.3, 0])
      rotate([0, 0, -40])
        branch(len * 0.45, w * 0.8, depth - 1);
    translate([len * 0.55, 0])
      rotate([0, 0, 40])
        branch(len * 0.35, w * 0.7, depth - 1);
    translate([len * 0.55, 0])
      rotate([0, 0, -40])
        branch(len * 0.35, w * 0.7, depth - 1);
  }
}

linear_extrude(height=thickness)
  union() {
    circle(d=size*0.12);
    for (i = [0:branches-1]) {
      rotate([0, 0, i * 360/branches])
        translate([size*0.03, 0])
          branch(size * 0.45, size*0.04, detail);
    }
  }
`,
  },
];
