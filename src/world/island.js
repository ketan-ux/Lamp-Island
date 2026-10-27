import {
	BufferGeometry,
	Float32BufferAttribute,
	Group,
	Mesh,
	RingGeometry,
	ShaderMaterial,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../core/uniforms.js';
import { GLSL_COMMON, TONE } from '../core/glsl.js';
import { WATER_Y, islandRadius } from '../core/config.js';
import { createNoise3, fbm3, mulberry32 } from '../core/random.js';
import { boulder } from '../core/geometry.js';
import { createMaskedMaterial } from '../materials/maskedMaterial.js';

// The mossy stone island: a polar-grid mesh with a flat standing area, a rocky
// rim sloping under the water, shore boulders, and a carved rune ring that
// lights segment by segment as spirits awaken.

export function islandHeight( x, z, noise ) {

	const r = Math.hypot( x, z );
	const t = r / islandRadius( Math.atan2( z, x ) );
	const drop = Math.pow( Math.max( 0, ( t - 0.7 ) / 0.3 ), 1.5 );
	let y = - 0.42 * drop;
	if ( noise ) {

		const rough = Math.min( 1, Math.max( 0, ( r - 0.75 ) / 0.6 ) );
		y += fbm3( noise, x * 1.6, 0, z * 1.6, 4 ) * 0.07 * rough;

	}

	return y;

}

function buildIslandGeometry() {

	const noise = createNoise3( 5 );
	const rings = 34, segs = 120;
	const positions = [];
	const uvs = [];
	const indices = [];
	for ( let i = 0; i <= rings; i ++ ) {

		const t = i / rings * 1.1;
		for ( let j = 0; j <= segs; j ++ ) {

			const a = j / segs * Math.PI * 2;
			const R = islandRadius( a );
			const r = t * R;
			const x = Math.cos( a ) * r, z = Math.sin( a ) * r;
			let y = islandHeight( x, z, noise );
			if ( t > 1 ) y -= ( t - 1 ) * 3; // skirt below the waterline
			positions.push( x, y, z );
			uvs.push( x * 0.7, z * 0.7 );

		}

	}

	for ( let i = 0; i < rings; i ++ ) {

		for ( let j = 0; j < segs; j ++ ) {

			const a = i * ( segs + 1 ) + j;
			const b = a + segs + 1;
			indices.push( a, a + 1, b, b, a + 1, b + 1 );

		}

	}

	const g = new BufferGeometry();
	g.setAttribute( 'position', new Float32BufferAttribute( positions, 3 ) );
	g.setAttribute( 'uv', new Float32BufferAttribute( uvs, 2 ) );
	g.setIndex( indices );
	g.computeVertexNormals();
	// the centre ring is degenerate; give it a clean upward normal
	const n = g.attributes.normal;
	for ( let j = 0; j <= segs; j ++ ) n.setXYZ( j, 0, 1, 0 );
	return g;

}

function buildRocks() {

	const rand = mulberry32( 77 );
	const noise = createNoise3( 5 );
	const parts = [];
	for ( let i = 0; i < 26; i ++ ) {

		const a = rand() * Math.PI * 2;
		const shore = i < 18;
		const R = islandRadius( a );
		const r = shore ? R * ( 0.9 + rand() * 0.22 ) : R * ( 0.62 + rand() * 0.18 );
		const s = shore ? 0.08 + rand() * 0.16 : 0.03 + rand() * 0.06;
		const g = boulder( s * ( 1 + rand() * 0.6 ), s * ( 0.5 + rand() * 0.4 ), s * ( 1 + rand() * 0.5 ), { seed: 100 + i, w: 12, h: 8 } );
		g.rotateY( rand() * Math.PI );
		const x = Math.cos( a ) * r, z = Math.sin( a ) * r;
		const y = shore ? Math.max( islandHeight( x, z, noise ), WATER_Y - 0.06 ) : islandHeight( x, z, noise );
		g.translate( x, y + s * 0.15, z );
		parts.push( g );

	}

	return mergeGeometries( parts );

}

export function createIsland( textures, glyphs ) {

	const group = new Group();

	const ground = createMaskedMaterial( { kind: 'ground', set: textures.ground, glow: 1.2 } );
	const island = new Mesh( buildIslandGeometry(), ground.material );
	island.receiveShadow = true;
	group.add( island );

	const rockMat = createMaskedMaterial( { kind: 'ground', set: textures.ground, uvScale: [ 3, 3 ], glow: 1.2 } );
	const rocks = new Mesh( buildRocks(), rockMat.material );
	rocks.castShadow = true;
	rocks.receiveShadow = true;
	group.add( rocks );

	group.add( createRuneRing( glyphs ) );

	// The island and its rocks remember the light once the shrine awakens.
	const awake = { set value( v ) {

		ground.uniforms.uAwake.value = v;
		rockMat.uniforms.uAwake.value = v;

	} };

	return { group, awake };

}

// Twelve carved glyph segments around the keeper's standing spot.
function createRuneRing( glyphs ) {

	const geo = new RingGeometry( 0.46, 0.64, 144, 1 );
	geo.rotateX( - Math.PI / 2 );
	const material = new ShaderMaterial( {
		uniforms: { ...G, uGlyphs: { value: glyphs } },
		transparent: true,
		depthWrite: false,
		polygonOffset: true,
		polygonOffsetFactor: - 2,
		polygonOffsetUnits: - 2,
		vertexShader: /* glsl */ `
			varying vec3 vWorld;
			void main() {
				vec4 w = modelMatrix * vec4( position, 1.0 );
				vWorld = w.xyz;
				gl_Position = projectionMatrix * viewMatrix * w;
			}
		`,
		fragmentShader: /* glsl */ `
			${GLSL_COMMON}
			uniform sampler2D uGlyphs;
			varying vec3 vWorld;
			void main() {
				vec2 p = vWorld.xz;
				float r = length( p );
				// segment 0 starts at the shrine (north, -Z) and runs clockwise
				float a01 = fract( atan( p.x, - p.y ) / 6.2831853 + 1.0 );
				float s12 = a01 * 12.0;
				float seg = floor( s12 );
				float local = fract( s12 );
				float radial = clamp( ( r - 0.46 ) / 0.18, 0.0, 1.0 );
				vec2 cell = vec2( mod( seg, 4.0 ), floor( seg / 4.0 ) );
				vec2 cont = vec2( s12, radial ) * 0.2;
				vec2 guv = ( cell + 0.1 + vec2( local, radial ) * 0.8 ) / 4.0;
				float g = textureGrad( uGlyphs, guv, dFdx( cont ), dFdy( cont ) ).r;
				float edge = 1.0 - smoothstep( 0.0, 0.08, radial ) + smoothstep( 0.92, 1.0, radial );
				float sep = 1.0 - smoothstep( 0.0, 0.05, min( local, 1.0 - local ) );
				float carve = clamp( max( g, max( edge, sep ) ), 0.0, 1.0 );
				float lit = step( seg + 0.5, uProgress * 12.0 );
				float m = lkMask( lkMaskDistance( vWorld ) ) * uLanternIntensity;
				float pulse = 0.75 + 0.25 * sin( uTime * 2.0 + seg * 0.9 );
				vec3 glow = lkSeasonGlow() * carve * ( lit * 1.8 * pulse + m * 0.9 + uFinale * 0.6 );
				vec3 groove = vec3( 0.004, 0.005, 0.004 );
				float glowAmt = clamp( max( lit, max( m, uFinale ) ), 0.0, 1.0 );
				vec3 col = mix( groove, glow, glowAmt );
				gl_FragColor = vec4( lkAtmosphere( col, vWorld ), carve * 0.85 );
				${TONE}
			}
		`,
	} );
	const ring = new Mesh( geo, material );
	ring.position.y = 0.004;
	ring.renderOrder = 2;
	return ring;

}
