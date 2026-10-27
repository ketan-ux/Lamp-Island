import {
	BufferGeometry,
	CircleGeometry,
	CylinderGeometry,
	Float32BufferAttribute,
	Group,
	IcosahedronGeometry,
	Mesh,
	Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATER_Y } from '../core/config.js';
import { mulberry32 } from '../core/random.js';
import { createMaskedMaterial } from '../materials/maskedMaterial.js';
import { islandHeight } from '../world/island.js';
import { Spirit } from './spirit.js';

// Folded-paper lotuses. Petals are built hinge-at-origin in their own frame;
// the 'flower' deformer swings each one open around its base.

function petalGeometry( width, length, cup ) {

	const NU = 4, NV = 6;
	const grid = [];
	for ( let j = 0; j <= NV; j ++ ) {

		const v = j / NV;
		const w = width * ( 0.3 + 0.7 * Math.sin( Math.min( v * 1.4, 1 ) * Math.PI / 2 ) ) * ( 1 - Math.pow( v, 3 ) );
		for ( let i = 0; i <= NU; i ++ ) {

			const u = i / NU * 2 - 1;
			const x = u * w * 0.5;
			const z = ( 1 - Math.abs( u ) ) * w * 0.28 - cup * v * v;
			grid.push( [ x, v * length, z, u * 0.5 + 0.5, v ] );

		}

	}

	const pos = [], uv = [];
	const at = ( i, j ) => grid[ j * ( NU + 1 ) + i ];
	for ( let j = 0; j < NV; j ++ ) {

		for ( let i = 0; i < NU; i ++ ) {

			for ( const [ a, b ] of [ [ i, j ], [ i + 1, j ], [ i + 1, j + 1 ], [ i, j ], [ i + 1, j + 1 ], [ i, j + 1 ] ] ) {

				const p = at( a, b );
				pos.push( p[ 0 ], p[ 1 ], p[ 2 ] );
				uv.push( p[ 3 ], p[ 4 ] );

			}

		}

	}

	const g = new BufferGeometry();
	g.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new Float32BufferAttribute( uv, 2 ) );
	g.computeVertexNormals();
	return g;

}

function withAttributes( g, petal, part ) {

	const n = g.attributes.position.count;
	const a = new Float32Array( n * 4 ), b = new Float32Array( n * 3 );
	for ( let i = 0; i < n; i ++ ) {

		a.set( petal, i * 4 );
		b.set( part, i * 3 );

	}

	g.setAttribute( 'aPetal', new Float32BufferAttribute( a, 4 ) );
	g.setAttribute( 'aPart', new Float32BufferAttribute( b, 3 ) );
	return g;

}

function lotusGeometry( { scale, floating, seed } ) {

	const rand = mulberry32( seed );
	const hinge = floating ? 0.018 : 0.15 * scale;
	const parts = [];
	const rings = [
		{ n: 6, w: 0.032, l: 0.072, cup: 0.012, r: 0.01, closed: 0.1, open: 0.7, stagger: 0.7 },
		{ n: 8, w: 0.038, l: 0.092, cup: 0.014, r: 0.017, closed: 0.2, open: 1.12, stagger: 0.38 },
		{ n: 9, w: 0.042, l: 0.105, cup: 0.012, r: 0.024, closed: 0.32, open: 1.42, stagger: 0.0 },
	];
	rings.forEach( ( ring, ri ) => {

		for ( let k = 0; k < ring.n; k ++ ) {

			const az = ( k + ri * 0.5 ) / ring.n * Math.PI * 2 + ( rand() - 0.5 ) * 0.15;
			const s = scale * ( 0.92 + rand() * 0.16 );
			const g = petalGeometry( ring.w * s, ring.l * s, ring.cup * s );
			parts.push( withAttributes( g, [ az, ring.r * scale, ring.closed, ring.open + ( rand() - 0.5 ) * 0.12 ], [ 0, ring.stagger, hinge ] ) );

		}

	} );

	const core = new IcosahedronGeometry( 0.017 * scale, 1 );
	core.translate( 0, 0.014 * scale, 0 );
	parts.push( withAttributes( core, [ 0, 0, 0, 0 ], [ 1, 0, hinge ] ) );

	if ( floating ) {

		const pad = new CircleGeometry( 0.15 * scale, 20, 0.3, Math.PI * 2 - 0.6 ).toNonIndexed();
		pad.rotateX( - Math.PI / 2 );
		pad.translate( 0, 0.004, 0 );
		parts.push( withAttributes( pad, [ 0, 0, 0, 0 ], [ 2, 0, 0 ] ) );

	} else {

		const stem = new CylinderGeometry( 0.006, 0.009, hinge, 6 ).toNonIndexed();
		stem.translate( 0, hinge / 2, 0 );
		parts.push( withAttributes( stem, [ 0, 0, 0, 0 ], [ 3, 0, 0 ] ) );
		for ( let k = 0; k < 4; k ++ ) {

			const leaf = petalGeometry( 0.05 * scale, 0.12 * scale, 0.02 );
			leaf.rotateX( 1.25 + rand() * 0.2 );
			leaf.rotateY( k / 4 * Math.PI * 2 + rand() );
			leaf.translate( 0, 0.01, 0 );
			parts.push( withAttributes( leaf, [ 0, 0, 0, 0 ], [ 2, 0, 0 ] ) );

		}

	}

	return { geometry: mergeGeometries( parts ), hinge };

}

const FLOWERS = [
	{ name: 'Lotus of the First Light', at: [ 0.55, - 1.0 ], scale: 1.0 },
	{ name: 'Lotus of Quiet Water', at: [ - 0.62, - 1.08 ], scale: 0.92 },
	{ name: 'Lotus of the Long Night', at: [ 0.92, 0.12 ], scale: 1.08 },
	{ name: 'Drifting Lotus of the East', at: [ 1.98, - 0.25 ], scale: 1.25, floating: true },
	{ name: 'Drifting Lotus of the Reeds', at: [ - 1.3, - 1.8 ], scale: 1.2, floating: true },
	{ name: 'Drifting Lotus of the South', at: [ - 0.38, 2.0 ], scale: 1.3, floating: true },
];

export function createFlowers( textures ) {

	const group = new Group();
	const spirits = [];
	const floaters = [];

	FLOWERS.forEach( ( f, i ) => {

		const { geometry, hinge } = lotusGeometry( { scale: f.scale, floating: !! f.floating, seed: 70 + i } );
		const m = createMaskedMaterial( {
			kind: 'paper',
			set: textures.paper,
			deform: 'flower',
			doubleSided: true,
			glow: 1.1,
			omni: 1.2,
		} );
		const mesh = new Mesh( geometry, m.material );
		mesh.customDepthMaterial = m.depthMaterial;
		const [ x, z ] = f.at;
		const y = f.floating ? WATER_Y : islandHeight( x, z );
		mesh.position.set( x, y, z );
		mesh.rotation.y = i * 1.7;
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		group.add( mesh );
		if ( f.floating ) floaters.push( { mesh, base: y, phase: i * 2.1 } );

		const centre = new Vector3( x, y + hinge + 0.03 * f.scale, z );
		spirits.push( new Spirit( {
			name: f.name,
			segments: [ [ centre, centre.clone().setY( centre.y + 0.06 ) ] ],
			reach: 0.12,
			uniforms: [ m.uniforms ],
			anchor: centre.clone(),
			pitch: 6 + i,
		} ) );

	} );

	function update( time ) {

		for ( const f of floaters ) {

			f.mesh.position.y = f.base + Math.sin( time * 0.9 + f.phase ) * 0.007;
			f.mesh.rotation.z = Math.sin( time * 0.7 + f.phase ) * 0.03;

		}

	}

	return { group, spirits, update };

}
