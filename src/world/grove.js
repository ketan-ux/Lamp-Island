import {
	BufferGeometry,
	DoubleSide,
	Float32BufferAttribute,
	Group,
	InstancedBufferAttribute,
	InstancedMesh,
	Mesh,
	Object3D,
	ShaderMaterial,
	Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../core/uniforms.js';
import { GLSL_COMMON, INSTANCED_WORLD, SEASON_LOCAL, TONE } from '../core/glsl.js';
import { WATER_Y } from '../core/config.js';
import { mulberry32 } from '../core/random.js';
import { taperedTube } from '../core/geometry.js';
import { createMaskedMaterial } from '../materials/maskedMaterial.js';

// The immediate grove: three old trees leaning over the island. Their leaves
// are what visibly turns between Autumn and Spring as the lantern changes.

const W = WATER_Y - 0.35;

const TREES = [
	{
		trunk: [ [ - 2.75, W, - 2.35 ], [ - 2.62, 1.0, - 2.2 ], [ - 2.3, 2.2, - 1.85 ], [ - 1.75, 3.0, - 1.35 ], [ - 0.95, 3.45, - 0.85 ] ],
		r0: 0.24, r1: 0.06,
		branches: [
			[ [ - 2.3, 2.2, - 1.85 ], [ - 2.6, 2.9, - 1.0 ], [ - 2.2, 3.4, - 0.1 ] ],
			[ [ - 1.75, 3.0, - 1.35 ], [ - 1.0, 3.35, - 2.0 ], [ - 0.2, 3.5, - 2.3 ] ],
		],
	},
	{
		trunk: [ [ 2.95, W, 1.7 ], [ 2.85, 1.2, 1.55 ], [ 2.45, 2.4, 1.15 ], [ 1.75, 3.15, 0.65 ], [ 0.95, 3.5, 0.35 ] ],
		r0: 0.22, r1: 0.05,
		branches: [
			[ [ 2.45, 2.4, 1.15 ], [ 2.1, 3.1, 2.0 ], [ 1.2, 3.4, 2.4 ] ],
			[ [ 1.75, 3.15, 0.65 ], [ 2.2, 3.5, - 0.4 ], [ 1.9, 3.7, - 1.2 ] ],
		],
	},
	{
		trunk: [ [ 2.35, W, - 3.25 ], [ 2.3, 2.0, - 3.15 ], [ 2.15, 4.2, - 3.0 ], [ 2.0, 6.0, - 2.9 ] ],
		r0: 0.28, r1: 0.08,
		branches: [
			[ [ 2.2, 3.4, - 3.05 ], [ 1.4, 3.8, - 2.3 ], [ 0.6, 3.9, - 1.9 ] ],
			[ [ 2.15, 4.4, - 3.0 ], [ 3.2, 4.9, - 2.4 ] ],
		],
	},
];

function leafGeometry() {

	// A folded, pointed leaf ~9 cm long lying along +Y.
	const v = [
		0, 0, 0, 0.022, 0.035, 0.008, 0, 0.09, 0,
		0, 0, 0, 0, 0.09, 0, - 0.022, 0.035, 0.008,
	];
	const g = new BufferGeometry();
	g.setAttribute( 'position', new Float32BufferAttribute( v, 3 ) );
	g.computeVertexNormals();
	return g;

}

export function createGrove( textures ) {

	const group = new Group();
	const rand = mulberry32( 404 );

	// --- trunks & branches (masked bark, awakened by the finale) ---
	const parts = [];
	const leafAnchors = [];
	TREES.forEach( ( tree, ti ) => {

		const trunk = taperedTube( tree.trunk, { r0: tree.r0, r1: tree.r1, segments: 40, radial: 9, seed: 30 + ti, gnarl: 0.3 } );
		parts.push( trunk.geometry );
		for ( let t = 0.55; t <= 1.0; t += 0.07 ) leafAnchors.push( trunk.curve.getPointAt( t ) );
		tree.branches.forEach( ( b, bi ) => {

			const branch = taperedTube( b, { r0: tree.r1 * 1.3, r1: 0.015, segments: 18, radial: 6, seed: 60 + ti * 4 + bi, gnarl: 0.2 } );
			parts.push( branch.geometry );
			for ( let t = 0.25; t <= 1.0; t += 0.18 ) leafAnchors.push( branch.curve.getPointAt( t ) );

		} );

	} );

	const bark = createMaskedMaterial( { kind: 'bark', set: textures.bark, uvScale: [ 1, 1 ], glow: 0.3 } );
	const trunks = new Mesh( mergeGeometries( parts ), bark.material );
	trunks.receiveShadow = true;
	group.add( trunks );

	// --- leaves ---
	const leaf = leafGeometry();
	const dummy = new Object3D();
	const transforms = [];
	const tmp = new Vector3();

	for ( const anchor of leafAnchors ) {

		const n = 26;
		for ( let i = 0; i < n; i ++ ) {

			tmp.set( rand() - 0.5, ( rand() - 0.5 ) * 0.6, rand() - 0.5 ).normalize().multiplyScalar( 0.15 + rand() * 0.55 );
			transforms.push( [ anchor.x + tmp.x, anchor.y + tmp.y, anchor.z + tmp.z, 0.8 + rand() * 0.6 ] );

		}

	}

	// Hanging willow strands that a raised lantern can reach.
	const strandTips = [
		[ - 1.3, - 1.0 ], [ - 1.0, - 0.55 ], [ - 1.75, - 0.45 ], [ - 2.1, 0.1 ], [ - 0.4, - 2.1 ],
		[ 1.2, 0.5 ], [ 1.55, 1.0 ], [ 1.15, 1.6 ], [ 1.9, - 0.6 ], [ 0.7, - 1.75 ], [ 1.45, 2.2 ],
	];
	for ( const [ x, z ] of strandTips ) {

		const top = 3.25 + rand() * 0.3;
		const bottom = 1.95 + rand() * 0.25;
		for ( let y = top; y > bottom; y -= 0.045 ) {

			const sway = Math.sin( y * 3 ) * 0.03;
			transforms.push( [ x + sway + ( rand() - 0.5 ) * 0.06, y, z + ( rand() - 0.5 ) * 0.06, 0.6 + rand() * 0.4 ] );

		}

	}

	const count = transforms.length;
	const seeds = new Float32Array( count );
	const leaves = new InstancedMesh( leaf, null, count );
	transforms.forEach( ( [ x, y, z, s ], i ) => {

		dummy.position.set( x, y, z );
		dummy.rotation.set( rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2 );
		dummy.scale.setScalar( s );
		dummy.updateMatrix();
		leaves.setMatrixAt( i, dummy.matrix );
		seeds[ i ] = rand();

	} );
	leaf.setAttribute( 'aSeed', new InstancedBufferAttribute( seeds, 1 ) );

	leaves.material = new ShaderMaterial( {
		uniforms: { ...G },
		side: DoubleSide,
		vertexShader: /* glsl */ `
			${INSTANCED_WORLD}
			uniform float uTime;
			attribute float aSeed;
			varying vec3 vWorld;
			varying vec3 vNormal;
			varying float vSeed;
			void main() {
				vec4 w = lkWorldPos( position );
				vec3 o = lkInstanceOrigin();
				float flutter = sin( uTime * 2.3 + aSeed * 40.0 ) * 0.012 + sin( uTime * 0.6 + o.x * 0.8 ) * 0.03;
				w.xz += vec2( flutter, flutter * 0.6 ) * ( position.y * 8.0 + 0.3 );
				vWorld = w.xyz;
				vNormal = lkWorldNormal( normal );
				vSeed = aSeed;
				gl_Position = projectionMatrix * viewMatrix * w;
			}
		`,
		fragmentShader: /* glsl */ `
			${GLSL_COMMON}
			${SEASON_LOCAL}
			varying vec3 vWorld;
			varying vec3 vNormal;
			varying float vSeed;
			void main() {
				vec3 n = normalize( vNormal ) * ( gl_FrontFacing ? 1.0 : - 1.0 );
				float s = lkLocalSeason( vWorld );
				vec3 autumn = mix( vec3( 0.55, 0.06, 0.012 ), vec3( 0.95, 0.42, 0.04 ), vSeed );
				vec3 spring = mix( vec3( 0.02, 0.28, 0.14 ), vec3( 0.3, 0.75, 0.8 ), vSeed * vSeed );
				vec3 alb = mix( autumn, spring, smoothstep( 0.15, 0.85, s ) );
				vec3 light = vec3( 0.02, 0.03, 0.045 ) + lkLanternLight( vWorld, n, 0.9 );
				vec3 col = alb * light;
				float m = lkMask( lkMaskDistance( vWorld ) );
				col += alb * lkSeasonGlow() * m * 0.6 + alb * uFinale * 0.08;
				gl_FragColor = vec4( lkAtmosphere( col, vWorld ), 1.0 );
				${TONE}
			}
		`,
	} );
	leaves.frustumCulled = false;
	group.add( leaves );

	return { group, awake: bark.uniforms.uAwake, leafCount: count };

}
