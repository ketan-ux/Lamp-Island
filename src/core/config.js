// Tunables shared across the experience. Distances are metres (WebXR local-floor).

export const WATER_Y = -0.12;

// Shadow camera far plane for the lantern's spot light. Kept under 5 m so the
// single real-time shadow stays cheap and crisp on standalone headsets.
export const SHADOW_DISTANCE = 4.5;

// Radius of the spherical bloom mask carried by the lantern.
export const MASK_RADIUS = 0.72;
export const MASK_RADIUS_SHIELDED = 0.42;

// How long (seconds of close lantern light) a spirit needs before it awakens.
export const AWAKEN_TIME = 1.4;

// Walkable radius for desktop / thumbstick locomotion.
export const WALK_RADIUS = 1.3;

export const QUALITY = {
	desktop: {
		shadowMapSize: 2048,
		maxPixelRatio: 2,
		bloom: true,
	},
	xr: {
		shadowMapSize: 1024,
		foveation: 1,
		bloom: false,
	},
};

// Irregular shoreline. Mirrored in GLSL (see glsl.js: lkIslandRadius) so the
// water shader can draw foam that hugs the exact island edge.
export function islandRadius( theta ) {

	const north = Math.pow( Math.max( 0, - Math.sin( theta ) ), 4 );
	return 1.82 +
		0.1 * Math.sin( 3 * theta + 1.3 ) +
		0.06 * Math.sin( 5 * theta + 0.4 ) +
		0.04 * Math.sin( 9 * theta + 2.1 ) +
		0.3 * north;

}
