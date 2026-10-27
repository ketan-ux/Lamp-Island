import { DoubleSide, FrontSide, MeshDepthMaterial, MeshLambertMaterial, RGBADepthPacking, Vector2, Vector3, Vector4 } from 'three';
import { G } from '../core/uniforms.js';
import { GLSL_COMMON, GLSL_NOISE, GLSL_UNIFORMS } from '../core/glsl.js';

// MeshLambertMaterial patched with the lantern's SPHERICAL MASK (Lambert: the
// surfaces are matte and it is the cheapest lit model for standalone headsets):
//   * two texture sets (dormant / bloom) blended per fragment by the distance
//     to the wisp, with a noisy creeping edge and a glowing wavefront rim
//   * bloom-set alpha drives emissive spirit carvings / veins in season colour
//   * an unshadowed wrap-around term from the wisp (the real shadow-casting
//     spot light only covers the forward cone)
//   * stylised height fog + analytic lantern in-scattering
// Optional vertex deformers animate petals opening, roots uncurling and
// capstones levitating; the matching depth material keeps shadows in sync.

export const MAX_ROOTS = 6;

const DEFORMERS = {

	none: /* glsl */ `
		void lkDeform( inout vec3 p, inout vec3 n ) {}
	`,

	// Capstone of a cairn hovers and slowly turns once the spirit is awake.
	totem: /* glsl */ `
		attribute float aFloat;
		uniform vec3 uFloatPivot;
		void lkDeform( inout vec3 p, inout vec3 n ) {
			float f = aFloat * smoothstep( 0.0, 1.0, uAwake );
			if ( f > 0.0 ) {
				vec3 q = p - uFloatPivot;
				float a = uTime * 0.5 * f;
				float c = cos( a );
				float s = sin( a );
				q.xz = vec2( q.x * c - q.z * s, q.x * s + q.z * c );
				n.xz = vec2( n.x * c - n.z * s, n.x * s + n.z * c );
				p = uFloatPivot + q + vec3( 0.0, f * ( 0.075 + 0.012 * sin( uTime * 1.7 ) ), 0.0 );
			}
		}
	`,

	// Gnarled roots: the centreline is integrated on the GPU from a heading
	// function, so curling is length preserving. Dormant roots coil up like
	// fiddleheads; light makes them unfurl and sprout leaves.
	root: /* glsl */ `
		#define LK_MAX_ROOTS ${MAX_ROOTS}
		uniform vec4 uRootA[ LK_MAX_ROOTS ]; // yaw, length, base radius, curl turns
		uniform vec4 uRootB[ LK_MAX_ROOTS ]; // base xyz, rest pitch
		uniform vec4 uRootC[ LK_MAX_ROOTS ]; // wiggle amp, wiggle freq, droop, seed
		attribute vec4 aRoot;               // u along root, ring angle, root index, gnarl scale
		attribute vec4 aLeaf;               // leaf offset (T, radial, side), is leaf
		float lkRootHeading( vec4 A, vec4 B, vec4 C, float u, float curl ) {
			return B.w + C.x * sin( u * C.y + C.w ) + C.x * 0.5 * sin( u * C.y * 2.3 + C.w * 3.0 ) + C.z * u + curl * A.w * 6.2831853 * pow( u, 1.25 );
		}
		void lkDeform( inout vec3 p, inout vec3 n ) {
			int idx = int( aRoot.z + 0.5 );
			vec4 A = uRootA[ idx ];
			vec4 B = uRootB[ idx ];
			vec4 C = uRootC[ idx ];
			float u = aRoot.x;
			float curl = 1.0 - smoothstep( 0.0, 1.0, uBloom );
			vec2 c2 = vec2( 0.0 );
			float du = u / 16.0;
			for ( int i = 0; i < 16; i ++ ) {
				float th = lkRootHeading( A, B, C, ( float( i ) + 0.5 ) * du, curl );
				c2 += vec2( cos( th ), sin( th ) ) * du * A.y;
			}
			float th = lkRootHeading( A, B, C, u, curl );
			vec3 F = vec3( cos( A.x ), 0.0, sin( A.x ) );
			vec3 S = vec3( - sin( A.x ), 0.0, cos( A.x ) );
			float lat = ( 0.1 * sin( u * 5.0 + C.w * 1.7 ) + 0.04 * sin( u * 13.0 + C.w ) ) * u;
			vec3 centre = B.xyz + F * c2.x + vec3( 0.0, c2.y, 0.0 ) + S * lat;
			vec3 T = F * cos( th ) + vec3( 0.0, sin( th ), 0.0 );
			vec3 N = - F * sin( th ) + vec3( 0.0, cos( th ), 0.0 );
			vec3 dir = cos( aRoot.y ) * N + sin( aRoot.y ) * S;
			float r = A.z * ( 1.0 - 0.82 * u ) * aRoot.w;
			if ( aLeaf.w > 0.5 ) {
				float grow = smoothstep( 0.35, 1.0, uBloom );
				vec3 side = cross( T, dir );
				p = centre + dir * r + grow * ( aLeaf.x * T + aLeaf.y * dir + aLeaf.z * side );
				n = normalize( dir + 0.3 * T );
				vLkPart = 2.0;
			} else {
				p = centre + dir * r;
				n = dir;
			}
		}
	`,

	// Origami lotus: each petal hinges open around its own base.
	flower: /* glsl */ `
		attribute vec4 aPetal; // azimuth, ring radius, closed angle, open angle
		attribute vec3 aPart;  // part (0 petal, 1 core, 2 leaf / pad, 3 stem), stagger, hinge height
		void lkDeform( inout vec3 p, inout vec3 n ) {
			vLkPart = aPart.x;
			if ( aPart.x < 0.5 ) {
				float o = smoothstep( aPart.y * 0.4, aPart.y * 0.4 + 0.6, uBloom );
				float ang = mix( aPetal.z, aPetal.w, o ) + sin( uTime * 1.1 + aPetal.x * 3.0 ) * 0.05 * o;
				float c = cos( ang );
				float s = sin( ang );
				p = vec3( p.x, p.y * c - p.z * s, p.y * s + p.z * c );
				n = vec3( n.x, n.y * c - n.z * s, n.y * s + n.z * c );
				float ca = cos( aPetal.x );
				float sa = sin( aPetal.x );
				p = vec3( p.x * ca + p.z * sa, p.y, - p.x * sa + p.z * ca ) + vec3( sa, 0.0, ca ) * aPetal.y;
				n = vec3( n.x * ca + n.z * sa, n.y, - n.x * sa + n.z * ca );
				p.y += aPart.z;
			} else if ( aPart.x < 1.5 ) {
				p *= 0.5 + 0.5 * smoothstep( 0.0, 0.8, uBloom );
				p.y += aPart.z;
			}
		}
	`,

};

const VERTEX_PARS = /* glsl */ `
	${GLSL_UNIFORMS}
	uniform float uBloom;
	uniform float uAwake;
	varying vec3 vLkWorld;
	varying vec2 vLkUv;
	varying float vLkPart;
`;

const FRAGMENT_PARS = /* glsl */ `
	${GLSL_COMMON}
	uniform sampler2D uDormantMap;
	uniform sampler2D uBloomMap;
	uniform vec2 uUvScale;
	uniform vec2 uUvOffset;
	uniform float uBloom;
	uniform float uAwake;
	uniform float uGlow;
	uniform float uOmni;
	varying vec3 vLkWorld;
	varying vec2 vLkUv;
	varying float vLkPart;
`;

const FRAGMENT_MAP = /* glsl */ `
	vec2 lkUv = vLkUv * uUvScale + uUvOffset;
	vec4 lkD = texture2D( uDormantMap, lkUv );
	vec4 lkB = texture2D( uBloomMap, lkUv );
	float lkDist = lkMaskDistance( vLkWorld );
	float lkLit = smoothstep( 0.05, 0.4, uLanternIntensity );
	float lkM = lkMask( lkDist ) * lkLit;
	float lkFloor = uAwake * mix( 0.4, 1.0, uFinale );
	float lkBlend = max( lkM, lkFloor );
	vec3 lkBloomAlb = lkSeasonal( lkB.rgb );
	float lkGlyph = lkB.a;
	vec3 lkGlowCol = lkSeasonGlow();

	#ifdef LK_KIND_PAPER
		vec3 lkAutumnPaper = mix( vec3( 0.95, 0.16, 0.03 ), vec3( 1.0, 0.6, 0.2 ), vLkUv.y );
		vec3 lkSpringPaper = mix( vec3( 0.06, 0.45, 0.8 ), vec3( 0.7, 0.95, 1.0 ), vLkUv.y );
		lkBloomAlb = lkB.rgb * mix( lkAutumnPaper, lkSpringPaper, uSeason );
		if ( vLkPart > 1.5 ) {
			// leaf pads, sepals and stems: green paper
			float lkLum = dot( lkB.rgb, vec3( 0.33 ) );
			lkBloomAlb = lkSeasonal( vec3( 0.06, 0.2, 0.035 ) * lkLum * 1.4 );
			lkD.rgb *= vec3( 0.5, 0.62, 0.45 );
			lkGlyph *= 0.3;
		}
	#endif

	#ifdef LK_DEFORM_ROOT
		if ( vLkPart > 1.5 ) {
			lkBloomAlb = lkSeasonal( vec3( 0.05, 0.22, 0.03 ) );
			lkD.rgb = vec3( 0.06, 0.05, 0.035 );
			lkGlyph = 0.25;
		}
	#endif

	vec3 lkAlbedo = mix( lkD.rgb, lkBloomAlb, lkBlend );
	diffuseColor.rgb *= lkAlbedo;

	float lkPulse = 0.75 + 0.25 * sin( uTime * 2.1 + dot( vLkWorld, vec3( 3.1, 1.7, 2.3 ) ) );
	totalEmissiveRadiance += lkGlowCol * lkGlyph * ( lkM * 1.7 + lkFloor * 0.5 ) * lkPulse * uGlow;
	totalEmissiveRadiance += lkGlowCol * lkGlowCol * lkMaskRim( lkDist ) * 0.35 * lkLit * ( 1.0 - lkFloor * 0.6 );

	#ifdef LK_KIND_PAPER
		if ( vLkPart > 0.5 && vLkPart < 1.5 ) {
			// lotus heart: a tiny seed of the wisp's light
			diffuseColor.rgb = vec3( 1.0 );
			totalEmissiveRadiance += lkGlowCol * ( 0.1 + 1.4 * max( uBloom, lkFloor ) ) * lkPulse;
		}
	#endif
`;

const FRAGMENT_LIGHT = /* glsl */ `
	{
		vec3 lkLv = ( viewMatrix * vec4( uLanternPos, 1.0 ) ).xyz - geometryPosition;
		float lkD2 = dot( lkLv, lkLv );
		vec3 lkL = lkLv * inversesqrt( lkD2 );
		float lkNdl = dot( geometryNormal, lkL );
		float lkWrap = clamp( ( lkNdl + 0.45 ) / 1.45, 0.0, 1.0 );
		float lkFade = 1.0 - smoothstep( 3.0, 5.0, sqrt( lkD2 ) );
		vec3 lkIrr = uLanternColor * uLanternIntensity * lkFade / ( 0.3 + lkD2 );
		reflectedLight.directDiffuse += lkIrr * lkWrap * uOmni * BRDF_Lambert( material.diffuseColor );
		#ifdef LK_KIND_PAPER
			// paper glows when lit from behind
			float lkBack = clamp( - lkNdl, 0.0, 1.0 );
			totalEmissiveRadiance += diffuseColor.rgb * lkIrr * lkBack * ( 0.12 + 0.3 * lkBlend );
		#endif
	}
`;

function patchVertex( src, deform ) {

	return src
		.replace( '#include <common>', `#include <common>\n${VERTEX_PARS}\n${GLSL_NOISE}\n${DEFORMERS[ deform ]}` )
		.replace( '#include <beginnormal_vertex>', /* glsl */ `
			vec3 objectNormal = vec3( normal );
			vec3 lkPos = vec3( position );
			vLkPart = 0.0;
			lkDeform( lkPos, objectNormal );
		` )
		.replace( '#include <begin_vertex>', 'vec3 transformed = lkPos;' )
		.replace( '#include <worldpos_vertex>', /* glsl */ `
			#include <worldpos_vertex>
			{
				vec4 lkW = vec4( transformed, 1.0 );
				#ifdef USE_INSTANCING
					lkW = instanceMatrix * lkW;
				#endif
				vLkWorld = ( modelMatrix * lkW ).xyz;
				vLkUv = uv;
			}
		` );

}

function patchFragment( src ) {

	return src
		.replace( '#include <common>', `#include <common>\n${FRAGMENT_PARS}` )
		.replace( '#include <map_fragment>', FRAGMENT_MAP )
		.replace( '#include <lights_fragment_end>', `#include <lights_fragment_end>\n${FRAGMENT_LIGHT}` )
		.replace( '#include <fog_fragment>', '' )
		.replace( '#include <tonemapping_fragment>', 'gl_FragColor.rgb = lkAtmosphere( gl_FragColor.rgb, vLkWorld );\n#include <tonemapping_fragment>' );

}

function patchDepthVertex( src, deform ) {

	return src
		.replace( '#include <common>', `#include <common>\n${VERTEX_PARS}\n${DEFORMERS[ deform ]}` )
		.replace( '#include <begin_vertex>', /* glsl */ `
			vec3 transformed = vec3( position );
			vec3 lkN = vec3( normal );
			lkDeform( transformed, lkN );
		` );

}

/**
 * @param {object} o
 * @param {'stone'|'ground'|'bark'|'paper'} o.kind surface family (texture set + shading tweaks)
 * @param {{dormant: Texture, bloom: Texture}} o.set the two texture sets
 * @param {'none'|'totem'|'root'|'flower'} [o.deform]
 * @param {object} [o.local] per-object uniforms to share (uBloom / uAwake ...)
 */
export function createMaskedMaterial( {
	kind,
	set,
	deform = 'none',
	local = {},
	uvScale = [ 1, 1 ],
	uvOffset = [ 0, 0 ],
	glow = 1,
	omni = 1,
	doubleSided = false,
} ) {

	const uniforms = Object.assign( {
		uBloom: { value: 0 },
		uAwake: { value: 0 },
		uFloatPivot: { value: new Vector3() },
	}, local );

	if ( deform === 'root' && ! uniforms.uRootA ) {

		uniforms.uRootA = { value: Array.from( { length: MAX_ROOTS }, () => new Vector4() ) };
		uniforms.uRootB = { value: Array.from( { length: MAX_ROOTS }, () => new Vector4() ) };
		uniforms.uRootC = { value: Array.from( { length: MAX_ROOTS }, () => new Vector4() ) };

	}

	const material = new MeshLambertMaterial( {
		side: doubleSided ? DoubleSide : FrontSide,
	} );
	material.defines = {
		[ `LK_KIND_${kind.toUpperCase()}` ]: '',
		[ `LK_DEFORM_${deform.toUpperCase()}` ]: '',
	};
	const own = {
		uDormantMap: { value: set.dormant },
		uBloomMap: { value: set.bloom },
		uUvScale: { value: new Vector2( ...uvScale ) },
		uUvOffset: { value: new Vector2( ...uvOffset ) },
		uGlow: { value: glow },
		uOmni: { value: omni },
	};
	material.onBeforeCompile = ( shader ) => {

		Object.assign( shader.uniforms, G, uniforms, own );
		shader.vertexShader = patchVertex( shader.vertexShader, deform );
		shader.fragmentShader = patchFragment( shader.fragmentShader );

	};

	material.customProgramCacheKey = () => `lk-${kind}-${deform}`;

	let depthMaterial = null;
	if ( deform !== 'none' ) {

		depthMaterial = new MeshDepthMaterial( { depthPacking: RGBADepthPacking } );
		depthMaterial.defines = { [ `LK_DEFORM_${deform.toUpperCase()}` ]: '' };
		depthMaterial.onBeforeCompile = ( shader ) => {

			Object.assign( shader.uniforms, G, uniforms );
			shader.vertexShader = patchDepthVertex( shader.vertexShader, deform );

		};

		depthMaterial.customProgramCacheKey = () => `lk-depth-${deform}`;

	}

	return { material, depthMaterial, uniforms, own };

}

// Lightweight patch for props that are not mask-blended (lantern brass, the
// keeper's hands): adds the wisp's close-range glow and the shared atmosphere.
export function patchLanternLit( material, { strength = 1, emissive = 0 } = {} ) {

	const own = { uLitStrength: { value: strength }, uLitEmissive: { value: emissive } };
	material.onBeforeCompile = ( shader ) => {

		Object.assign( shader.uniforms, G, own );
		shader.vertexShader = shader.vertexShader
			.replace( '#include <common>', '#include <common>\nvarying vec3 vLkWorld;' )
			.replace( '#include <worldpos_vertex>', /* glsl */ `
				#include <worldpos_vertex>
				{
					vec4 lkW = vec4( transformed, 1.0 );
					#ifdef USE_INSTANCING
						lkW = instanceMatrix * lkW;
					#endif
					vLkWorld = ( modelMatrix * lkW ).xyz;
				}
			` );
		shader.fragmentShader = shader.fragmentShader
			.replace( '#include <common>', `#include <common>\n${GLSL_COMMON}\nuniform float uLitStrength;\nuniform float uLitEmissive;\nvarying vec3 vLkWorld;` )
			.replace( '#include <lights_fragment_end>', /* glsl */ `
				#include <lights_fragment_end>
				{
					vec3 lkLv = ( viewMatrix * vec4( uLanternPos, 1.0 ) ).xyz - geometryPosition;
					float lkD2 = dot( lkLv, lkLv );
					vec3 lkL = lkLv * inversesqrt( lkD2 );
					float lkNdl = dot( geometryNormal, lkL );
					vec3 lkIrr = uLanternColor * uLanternIntensity / ( 0.01 + lkD2 );
					reflectedLight.directDiffuse += lkIrr * clamp( ( lkNdl + 0.3 ) / 1.3, 0.0, 1.0 ) * uLitStrength * BRDF_Lambert( material.diffuseContribution );
					vec3 lkH = normalize( lkL + geometryViewDir );
					float lkSpec = pow( max( dot( geometryNormal, lkH ), 0.0 ), 40.0 );
					reflectedLight.directSpecular += lkIrr * lkSpec * max( lkNdl, 0.0 ) * uLitStrength * 0.05 * material.diffuseColor;
					totalEmissiveRadiance += material.diffuseColor * lkIrr * max( lkNdl, 0.0 ) * uLitEmissive;
				}
			` )
			.replace( '#include <fog_fragment>', '' )
			.replace( '#include <tonemapping_fragment>', 'gl_FragColor.rgb = lkAtmosphere( gl_FragColor.rgb, vLkWorld );\n#include <tonemapping_fragment>' );

	};

	material.customProgramCacheKey = () => 'lk-lit';
	return material;

}
