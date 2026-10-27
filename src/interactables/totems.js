import { BoxGeometry, Group, Mesh, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boulder, displace, offsetUv, tag } from '../core/geometry.js';
import { mulberry32 } from '../core/random.js';
import { createMaskedMaterial } from '../materials/maskedMaterial.js';
import { Spirit } from './spirit.js';

// Stone totems whose hidden spirit carvings surface under the lantern.

function cairnGeometry( seed ) {

	const rand = mulberry32( seed );
	const stones = [
		[ 0.2, 0.11, 0.18, 0.08 ],
		[ 0.165, 0.095, 0.15, 0.25 ],
		[ 0.135, 0.08, 0.12, 0.4 ],
		[ 0.105, 0.065, 0.095, 0.53 ],
		[ 0.075, 0.05, 0.07, 0.66 ],
	];
	const parts = stones.map( ( [ rx, ry, rz, y ], i ) => {

		const g = boulder( rx, ry, rz, { seed: seed * 10 + i, amp: 0.18 } );
		g.rotateY( rand() * Math.PI );
		g.translate( ( rand() - 0.5 ) * 0.03, y, ( rand() - 0.5 ) * 0.03 );
		offsetUv( g, rand(), rand() * 0.5, 2, 0.6 );
		return tag( g, 'aFloat', [ i === stones.length - 1 ? 1 : 0 ] );

	} );
	return { geometry: mergeGeometries( parts ), pivot: new Vector3( 0, 0.66, 0 ), top: 0.72 };

}

function monolithGeometry( seed ) {

	// Box faces keep separate vertices, so per-face planar UVs have no seams.
	const g = new BoxGeometry( 0.32, 1.15, 0.22, 6, 18, 4 );
	const pos = g.attributes.position;
	const nor = g.attributes.normal;
	const uv = g.attributes.uv;
	const s = 1 / 0.3;
	for ( let i = 0; i < pos.count; i ++ ) {

		const x = pos.getX( i ), y = pos.getY( i ) + 0.575, z = pos.getZ( i );
		const nx = nor.getX( i ), ny = nor.getY( i ), nz = nor.getZ( i );
		if ( Math.abs( ny ) > 0.5 ) uv.setXY( i, x * s, z * s );
		else if ( Math.abs( nx ) > 0.5 ) uv.setXY( i, z * Math.sign( nx ) * s + 0.37, y * s );
		else uv.setXY( i, x * Math.sign( nz ) * s + 0.71, y * s );

	}

	for ( let i = 0; i < pos.count; i ++ ) {

		// round the slab and taper the crown
		let x = pos.getX( i ), y = pos.getY( i ), z = pos.getZ( i );
		const t = ( y + 0.575 ) / 1.15;
		const taper = 1 - Math.pow( t, 3 ) * 0.45;
		x *= taper;
		z *= taper * ( 1 - Math.pow( t, 4 ) * 0.3 );
		const r = Math.hypot( x / 0.16, z / 0.11 );
		const k = 1 / Math.max( 1, Math.pow( r, 0.35 ) );
		pos.setXYZ( i, x * ( 0.75 + 0.25 * k ), y + 0.575, z * ( 0.75 + 0.25 * k ) );

	}

	g.computeVertexNormals();
	displace( g, { amp: 0.018, freq: 5, seed } );
	g.rotateZ( 0.05 );
	return tag( g, 'aFloat', [ 0 ] );

}

function faceStoneGeometry( seed ) {

	const g = boulder( 0.3, 0.27, 0.27, { seed, amp: 0.2, w: 28, h: 18 } );
	g.translate( 0, 0.2, 0 );
	offsetUv( g, 0.25, 0.1, 3, 1.2 );
	return tag( g, 'aFloat', [ 0 ] );

}

export function createTotems( textures ) {

	const group = new Group();
	const spirits = [];

	const defs = [
		{ name: 'Cairn of the Heron', pos: [ - 1.18, - 0.01, - 0.82 ], build: () => cairnGeometry( 11 ), seg: [ 0.05, 0.72 ], pitch: 0 },
		{ name: 'Moon Monolith', pos: [ 1.24, - 0.02, - 0.74 ], build: () => ( { geometry: monolithGeometry( 12 ), pivot: new Vector3(), top: 1.15 } ), seg: [ 0.1, 1.1 ], pitch: 2 },
		{ name: 'Sleeping Face Stone', pos: [ - 1.06, - 0.03, 0.98 ], build: () => ( { geometry: faceStoneGeometry( 13 ), pivot: new Vector3(), top: 0.45 } ), seg: [ 0.15, 0.3 ], pitch: 4 },
	];

	for ( const def of defs ) {

		const { geometry, pivot } = def.build();
		const m = createMaskedMaterial( {
			kind: 'stone',
			set: textures.stone,
			deform: 'totem',
			uvScale: [ 1, 1 ],
			glow: 1.3,
		} );
		m.uniforms.uFloatPivot.value.copy( pivot );
		const mesh = new Mesh( geometry, m.material );
		mesh.customDepthMaterial = m.depthMaterial;
		mesh.position.set( ...def.pos );
		mesh.rotation.y = Math.atan2( - def.pos[ 0 ], - def.pos[ 2 ] );
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		group.add( mesh );

		const base = new Vector3( ...def.pos );
		spirits.push( new Spirit( {
			name: def.name,
			segments: [ [ base.clone().setY( def.seg[ 0 ] ), base.clone().setY( def.seg[ 1 ] ) ] ],
			reach: 0.18,
			uniforms: [ m.uniforms ],
			anchor: base.clone().setY( def.seg[ 1 ] ),
			pitch: def.pitch,
		} ) );

	}

	return { group, spirits };

}
