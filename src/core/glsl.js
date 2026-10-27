// Shared GLSL used by the patched standard materials and the custom shaders.
// Everything here works in world space and relies on three.js' built-in
// `cameraPosition` / `viewMatrix`, which are set per eye in WebXR.

export const GLSL_UNIFORMS = /* glsl */ `
uniform float uTime;
uniform vec3 uLanternPos;
uniform vec3 uLanternColor;
uniform float uLanternIntensity;
uniform float uMaskRadius;
uniform float uSeason;
uniform float uProgress;
uniform float uFinale;
uniform vec3 uFogColor;
uniform float uFogDensity;
`;

export const GLSL_NOISE = /* glsl */ `
float lkHash12( vec2 p ) {
	vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
	p3 += dot( p3, p3.yzx + 33.33 );
	return fract( ( p3.x + p3.y ) * p3.z );
}
float lkHash13( vec3 p3 ) {
	p3 = fract( p3 * 0.1031 );
	p3 += dot( p3, p3.zyx + 31.32 );
	return fract( ( p3.x + p3.y ) * p3.z );
}
float lkNoise2( vec2 p ) {
	vec2 i = floor( p );
	vec2 f = fract( p );
	f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( lkHash12( i ), lkHash12( i + vec2( 1.0, 0.0 ) ), f.x ),
		mix( lkHash12( i + vec2( 0.0, 1.0 ) ), lkHash12( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
float lkNoise3( vec3 p ) {
	vec3 i = floor( p );
	vec3 f = fract( p );
	f = f * f * ( 3.0 - 2.0 * f );
	return mix(
		mix( mix( lkHash13( i ), lkHash13( i + vec3( 1.0, 0.0, 0.0 ) ), f.x ),
			mix( lkHash13( i + vec3( 0.0, 1.0, 0.0 ) ), lkHash13( i + vec3( 1.0, 1.0, 0.0 ) ), f.x ), f.y ),
		mix( mix( lkHash13( i + vec3( 0.0, 0.0, 1.0 ) ), lkHash13( i + vec3( 1.0, 0.0, 1.0 ) ), f.x ),
			mix( lkHash13( i + vec3( 0.0, 1.0, 1.0 ) ), lkHash13( i + vec3( 1.0, 1.0, 1.0 ) ), f.x ), f.y ), f.z );
}
`;

export const GLSL_WORLD = /* glsl */ `
// Mirrors islandRadius() in config.js.
float lkIslandRadius( float theta ) {
	float north = pow( max( 0.0, - sin( theta ) ), 4.0 );
	return 1.82 + 0.1 * sin( 3.0 * theta + 1.3 ) + 0.06 * sin( 5.0 * theta + 0.4 ) +
		0.04 * sin( 9.0 * theta + 2.1 ) + 0.3 * north;
}

// --- Spherical lantern mask -------------------------------------------------
// Distance from the wisp, perturbed by animated noise so the bloom front
// creeps across surfaces organically instead of as a perfect sphere.
float lkMaskDistance( vec3 wp ) {
	float n = lkNoise3( wp * 7.0 + vec3( 0.0, uTime * 0.45, 0.0 ) );
	return distance( wp, uLanternPos ) + ( n - 0.5 ) * 0.3 * uMaskRadius;
}
float lkMask( float d ) {
	return 1.0 - smoothstep( uMaskRadius * 0.5, uMaskRadius, d );
}
// Thin glowing wavefront right where dormant turns to bloom.
float lkMaskRim( float d ) {
	float x = ( d - uMaskRadius * 0.9 ) / ( uMaskRadius * 0.05 );
	return exp( - x * x );
}

// --- Seasonal recolouring ---------------------------------------------------
// Only foliage-like (green dominant) texels shift: amber/rust in autumn,
// fresh teal-green in spring. Stone, bark and paper keep their own hue.
vec3 lkSeasonal( vec3 c ) {
	float foliage = smoothstep( 0.0, 0.05, c.g - max( c.r, c.b ) );
	float l = dot( c, vec3( 0.3, 0.6, 0.1 ) );
	vec3 autumn = l * vec3( 2.3, 0.78, 0.16 );
	vec3 spring = l * vec3( 0.55, 1.2, 1.0 );
	return mix( c, mix( autumn, spring, uSeason ), foliage );
}
vec3 lkSeasonGlow() {
	return mix( vec3( 1.0, 0.45, 0.1 ), vec3( 0.15, 0.85, 1.0 ), uSeason );
}

// --- Sky / mist -------------------------------------------------------------
const vec3 LK_MOON_DIR = vec3( -0.38, 0.42, -0.82 );
vec3 lkSkyDisc( vec3 rd, float disc ) {
	float h = rd.y;
	vec3 zenith = vec3( 0.003, 0.006, 0.011 );
	vec3 horizon = uFogColor * 1.3;
	vec3 col = mix( horizon, zenith, smoothstep( -0.05, 0.55, h ) );
	float m = max( dot( rd, normalize( LK_MOON_DIR ) ), 0.0 );
	col += vec3( 0.32, 0.42, 0.5 ) * ( pow( m, 900.0 ) * 5.0 * disc + pow( m, 24.0 ) * 0.07 + pow( m, 4.0 ) * 0.015 );
	return col;
}
vec3 lkSky( vec3 rd ) {
	return lkSkyDisc( rd, 1.0 );
}

// Height-weighted exp2 fog plus analytic in-scattering of the wisp's light:
// the integral of 1 / (h^2 + s^2) along the view ray gives the glowing halo
// the lantern casts into the mist, with no extra passes or lights.
vec3 lkScatter( vec3 ro, vec3 rd, float dist ) {
	vec3 lo = uLanternPos - ro;
	float tc = dot( lo, rd );
	float h = max( length( lo - rd * tc ), 0.09 );
	float s = ( atan( ( dist - tc ) / h ) - atan( - tc / h ) ) / h;
	// the mist thins out right around the keeper, so short rays scatter less
	float medium = 1.0 - exp( - dist * 0.35 );
	return uLanternColor * uLanternIntensity * s * 0.006 * medium;
}
vec3 lkAtmosphere( vec3 col, vec3 wp ) {
	vec3 ro = cameraPosition;
	vec3 rv = wp - ro;
	float dist = length( rv );
	vec3 rd = rv / max( dist, 1e-4 );
	float lift = mix( 1.15, 0.55, smoothstep( 0.0, 7.0, wp.y ) );
	float fd = dist * uFogDensity * lift * ( 1.0 - 0.3 * uFinale );
	float fog = 1.0 - exp( - fd * fd );
	vec3 fogCol = mix( uFogColor, lkSky( rd ), 0.35 );
	return mix( col, fogCol, fog ) + lkScatter( ro, rd, dist );
}

// Unshadowed wrap-around light from the wisp for custom (non-standard) shaders.
vec3 lkLanternLight( vec3 wp, vec3 n, float wrap ) {
	vec3 l = uLanternPos - wp;
	float d2 = dot( l, l );
	float ndl = dot( n, l * inversesqrt( d2 ) );
	float diff = clamp( ( ndl + wrap ) / ( 1.0 + wrap ), 0.0, 1.0 );
	float fade = 1.0 - smoothstep( 3.0, 6.0, sqrt( d2 ) );
	return uLanternColor * uLanternIntensity * diff * fade * 1.2 / ( 0.35 + d2 );
}
`;

export const GLSL_COMMON = GLSL_UNIFORMS + GLSL_NOISE + GLSL_WORLD;

export const TONE = /* glsl */ `
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
`;

export const INSTANCED_WORLD = /* glsl */ `
	vec4 lkWorldPos( vec3 p ) {
		vec4 w = vec4( p, 1.0 );
		#ifdef USE_INSTANCING
			w = instanceMatrix * w;
		#endif
		return modelMatrix * w;
	}
	vec3 lkWorldNormal( vec3 n ) {
		#ifdef USE_INSTANCING
			n = mat3( instanceMatrix ) * n;
		#endif
		return normalize( mat3( modelMatrix ) * n );
	}
	vec3 lkInstanceOrigin() {
		#ifdef USE_INSTANCING
			return ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
		#else
			return ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
		#endif
	}
`;

export const SEASON_LOCAL = /* glsl */ `
	uniform float uSeasonFar;
	// The season change ripples outward from the lantern through the grove.
	float lkLocalSeason( vec3 wp ) {
		return mix( uSeason, uSeasonFar, smoothstep( 0.6, 7.0, distance( wp, uLanternPos ) ) );
	}
`;
