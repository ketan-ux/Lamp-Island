import {
	BufferGeometry,
	CircleGeometry,
	Float32BufferAttribute,
	Group,
	Mesh,
	Sphere,
	Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { taperedTube } from '../core/geometry.js';
import { createNoise3, mulberry32 } from '../core/random.js';
import { WATER_Y, islandRadius } from '../core/config.js';
import { MAX_ROOTS, createMaskedMaterial } from '../materials/maskedMaterial.js';
import { islandHeight } from '../world/island.js';
import { Spirit } from './spirit.js';

// Gnarled roots that sleep curled like fiddleheads and unfurl in the light.
// Their shape is integrated on the GPU (see the 'root' deformer); the CPU
// only builds parametric attributes and mirrors the maths for hit testing.

const RINGS = 28;
const RADIAL = 7;
const LEAVES_PER_ROOT = 7;

function heading( r, u, curl ) {

	return r.pitch + r.wiggle * Math.sin( u * r.freq + r.seed ) + r.wiggle * 0.5 * Math.sin( u * r.freq * 2.3 + r.seed * 3 ) +
		r.droop * u + curl * r.turns * Math.PI * 2 * Math.pow( u, 1.25 );

}

// CPU twin of the GPU centreline (used for the spirit's focus segments).
function centreline( r, u, curl = 0 ) {

	let x = 0, y = 0;
	const steps = 16, du = u / steps;
	for ( let i = 0; i < steps; i ++ ) {

		const th = heading( r, ( i + 0.5 ) * du, curl );
		x += Math.cos( th ) * du * r.length;
		y += Math.sin( th ) * du * r.length;

	}

	const F = new Vector3( Math.cos( r.yaw ), 0, Math.sin( r.yaw ) );
	return r.base.clone().addScaledVector( F, x ).setY( r.base.y + y );

}

function buildCluster( roots, seed ) {

	const rand = mulberry32( seed );
	const noise = createNoise3( seed );
	const aRoot = [], aLeaf = [], uvs = [], index = [];
	let v = 0;

	roots.forEach( ( r, idx ) => {

		const start = v;
		for ( let i = 0; i <= RINGS; i ++ ) {

			const u = i / RINGS;
			const knot = i === RINGS ? 0 : 1 + 0.3 * noise( u * r.length * 7, idx * 3.1, seed ) + 0.15 * Math.max( 0, noise( u * 19, idx, 1 ) );
			for ( let j = 0; j <= RADIAL; j ++ ) {

				const phi = j / RADIAL * Math.PI * 2;
				aRoot.push( u, phi, idx, knot );
				aLeaf.push( 0, 0, 0, 0 );
				uvs.push( j / RADIAL, u * r.length / 0.3 );
				v ++;

			}

		}

		for ( let i = 0; i < RINGS; i ++ ) {

			for ( let j = 0; j < RADIAL; j ++ ) {

				const a = start + i * ( RADIAL + 1 ) + j, b = a + RADIAL + 1;
				index.push( a, a + 1, b, b, a + 1, b + 1 );

			}

		}

		for ( let k = 0; k < LEAVES_PER_ROOT; k ++ ) {

			const u = 0.28 + rand() * 0.68;
			const phi = rand() * Math.PI * 2;
			const len = 0.045 + rand() * 0.04;
			const knot = 1 + 0.3 * noise( u * r.length * 7, idx * 3.1, seed );
			const corners = [
				[ 0, 0, 0 ],
				[ len * 0.2, len * 0.35, len * 0.22 ],
				[ len * 0.45, len * 0.9, 0 ],
				[ len * 0.2, len * 0.35, - len * 0.22 ],
			];
			const s = v;
			for ( const [ lx, ly, lz ] of corners ) {

				aRoot.push( u, phi, idx, knot );
				aLeaf.push( lx, ly, lz, 1 );
				uvs.push( 0.5, 0.5 );
				v ++;

			}

			index.push( s, s + 1, s + 2, s, s + 2, s + 3 );

		}

	} );

	const g = new BufferGeometry();
	g.setAttribute( 'position', new Float32BufferAttribute( new Float32Array( v * 3 ), 3 ) );
	g.setAttribute( 'normal', new Float32BufferAttribute( new Float32Array( v * 3 ), 3 ) );
	g.setAttribute( 'uv', new Float32BufferAttribute( uvs, 2 ) );
	g.setAttribute( 'aRoot', new Float32BufferAttribute( aRoot, 4 ) );
	g.setAttribute( 'aLeaf', new Float32BufferAttribute( aLeaf, 4 ) );
	g.setIndex( index );
	return g;

}

function surface( x, z ) {

	return Math.max( islandHeight( x, z ), WATER_Y - 0.04 );

}

function stumpRoots( cx, cz, seed ) {

	const rand = mulberry32( seed );
	const out = Math.atan2( cz, cx );
	return [ - 2.4, - 1.3, - 0.5, 0.35, 1.2, 2.3 ].map( ( off ) => {

		const yaw = out + off + ( rand() - 0.5 ) * 0.2;
		const outward = Math.cos( off ) > 0;
		const base = new Vector3( cx + Math.cos( yaw ) * 0.14, 0, cz + Math.sin( yaw ) * 0.14 );
		base.y = surface( base.x, base.z ) + 0.05;
		return {
			yaw, base,
			length: 0.55 + rand() * 0.35,
			radius: 0.036 + rand() * 0.018,
			turns: 1.35 + rand() * 0.35,
			pitch: outward ? - 0.22 : - 0.04,
			droop: outward ? - 0.4 : - 0.05,
			wiggle: 0.22 + rand() * 0.1,
			freq: 7 + rand() * 4,
			seed: rand() * 6.28,
		};

	} );

}

function edgeArches( centreAngle, spread, count, seed ) {

	const rand = mulberry32( seed );
	return Array.from( { length: count }, ( _, i ) => {

		const a = centreAngle + ( i / ( count - 1 ) - 0.5 ) * spread + ( rand() - 0.5 ) * 0.1;
		const r = islandRadius( a ) * 0.8;
		const base = new Vector3( Math.cos( a ) * r, 0, Math.sin( a ) * r );
		base.y = surface( base.x, base.z ) + 0.02;
		return {
			yaw: a + ( rand() - 0.5 ) * 0.4,
			base,
			length: 0.75 + rand() * 0.3,
			radius: 0.038 + rand() * 0.02,
			turns: 1.4 + rand() * 0.3,
			pitch: 0.95 + rand() * 0.25,
			droop: - 2.5 - rand() * 0.4,
			wiggle: 0.12,
			freq: 7,
			seed: rand() * 6.28,
		};

	} );

}

export function createRoots( textures ) {

	const group = new Group();
	const spirits = [];

	const clusters = [
		{ name: 'Old Stump Roots', roots: stumpRoots( 1.12, 0.9, 41 ), stump: [ 1.12, 0.9 ], pitch: 1 },
		{ name: 'Heron Arch Roots', roots: edgeArches( Math.PI + 0.05, 0.75, 4, 42 ), pitch: 3 },
		{ name: 'Southern Root Bridge', roots: edgeArches( Math.PI / 2 + 0.15, 0.6, 3, 43 ), pitch: 5 },
	];

	clusters.forEach( ( c, ci ) => {

		const m = createMaskedMaterial( {
			kind: 'bark',
			set: textures.bark,
			deform: 'root',
			doubleSided: true,
			glow: 1.4,
		} );
		c.roots.slice( 0, MAX_ROOTS ).forEach( ( r, i ) => {

			m.uniforms.uRootA.value[ i ].set( r.yaw, r.length, r.radius, r.turns );
			m.uniforms.uRootB.value[ i ].set( r.base.x, r.base.y, r.base.z, r.pitch );
			m.uniforms.uRootC.value[ i ].set( r.wiggle, r.freq, r.droop, r.seed );

		} );

		const geometry = buildCluster( c.roots, 50 + ci );
		const centre = c.roots.reduce( ( acc, r ) => acc.add( r.base ), new Vector3() ).divideScalar( c.roots.length );
		geometry.boundingSphere = new Sphere( centre, 1.4 );
		const mesh = new Mesh( geometry, m.material );
		mesh.customDepthMaterial = m.depthMaterial;
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		group.add( mesh );

		const uniformSets = [ m.uniforms ];

		if ( c.stump ) {

			const [ x, z ] = c.stump;
			const y0 = surface( x, z );
			const stump = taperedTube( [ [ x, y0 - 0.12, z ], [ x + 0.01, y0 + 0.15, z ], [ x - 0.01, y0 + 0.38, z + 0.01 ] ], {
				r0: 0.2, r1: 0.15, segments: 10, radial: 12, seed: 99, gnarl: 0.35, uvLength: 0.3,
			} );
			const top = new CircleGeometry( 0.15, 12 );
			top.rotateX( - Math.PI / 2 );
			top.translate( x - 0.01, y0 + 0.37, z + 0.01 );
			const sm = createMaskedMaterial( { kind: 'bark', set: textures.bark, glow: 1.4 } );
			const stumpMesh = new Mesh( mergeGeometries( [ stump.geometry.toNonIndexed(), top.toNonIndexed() ] ), sm.material );
			stumpMesh.castShadow = true;
			stumpMesh.receiveShadow = true;
			group.add( stumpMesh );
			uniformSets.push( sm.uniforms );

		}

		const segments = c.roots.map( ( r ) => [ r.base.clone(), centreline( r, 0.6 ) ] );
		if ( c.stump ) segments.push( [ new Vector3( c.stump[ 0 ], 0, c.stump[ 1 ] ), new Vector3( c.stump[ 0 ], 0.4, c.stump[ 1 ] ) ] );
		spirits.push( new Spirit( {
			name: c.name,
			segments,
			reach: 0.12,
			uniforms: uniformSets,
			anchor: centre.clone().setY( centre.y + 0.25 ),
			pitch: c.pitch,
		} ) );

	} );

	return { group, spirits };

}
