import { BufferAttribute, BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, SphereGeometry, Vector3 } from 'three';
import { createNoise3, fbm3 } from './random.js';

// Push vertices along their normals with low-frequency noise. Uses position as
// the noise domain so duplicated seam vertices stay welded.
export function displace( geometry, { amp = 0.02, freq = 4, seed = 1, octaves = 3 } = {} ) {

	const noise = createNoise3( seed );
	const pos = geometry.attributes.position;
	const nor = geometry.attributes.normal;
	const p = new Vector3();
	const n = new Vector3();
	for ( let i = 0; i < pos.count; i ++ ) {

		p.fromBufferAttribute( pos, i );
		n.fromBufferAttribute( nor, i );
		const d = fbm3( noise, p.x * freq + 11.1, p.y * freq + 3.7, p.z * freq + 7.3, octaves ) * amp;
		p.addScaledVector( n, d );
		pos.setXYZ( i, p.x, p.y, p.z );

	}

	geometry.computeVertexNormals();
	return geometry;

}

// A weathered, squashed boulder with clean UVs (SphereGeometry based).
export function boulder( rx, ry, rz, { seed = 1, amp = 0.25, freq = 2.2, w = 22, h = 14 } = {} ) {

	const g = new SphereGeometry( 1, w, h );
	g.scale( rx, ry, rz );
	const scale = Math.min( rx, ry, rz );
	displace( g, { amp: amp * scale, freq: freq / scale * 0.5, seed } );
	return g;

}

// Adds a constant per-vertex attribute (used to tag merged sub-parts).
export function tag( geometry, name, values ) {

	const count = geometry.attributes.position.count;
	const size = values.length;
	const arr = new Float32Array( count * size );
	for ( let i = 0; i < count; i ++ ) arr.set( values, i * size );
	geometry.setAttribute( name, new BufferAttribute( arr, size ) );
	return geometry;

}

export function offsetUv( geometry, du, dv, su = 1, sv = 1 ) {

	const uv = geometry.attributes.uv;
	for ( let i = 0; i < uv.count; i ++ ) uv.setXY( i, uv.getX( i ) * su + du, uv.getY( i ) * sv + dv );
	return geometry;

}

// Tapered, knobbly tube along a Catmull-Rom spline (trunks, branches, stumps).
export function taperedTube( points, { radial = 8, segments = 32, r0 = 0.1, r1 = 0.03, seed = 1, gnarl = 0.25, uvLength = 0.45 } = {} ) {

	const curve = new CatmullRomCurve3( points.map( ( p ) => new Vector3( ...p ) ) );
	const frames = curve.computeFrenetFrames( segments, false );
	const length = curve.getLength();
	const noise = createNoise3( seed );
	const positions = [], normals = [], uvs = [], indices = [];
	const P = new Vector3(), dir = new Vector3();
	for ( let i = 0; i <= segments; i ++ ) {

		const t = i / segments;
		curve.getPointAt( t, P );
		const N = frames.normals[ i ], B = frames.binormals[ i ];
		for ( let j = 0; j <= radial; j ++ ) {

			const phi = j / radial * Math.PI * 2;
			const knob = 1 + gnarl * noise( t * length * 4, Math.cos( phi ) * 1.3, Math.sin( phi ) * 1.3 + seed );
			const r = ( r0 + ( r1 - r0 ) * Math.pow( t, 0.8 ) ) * knob;
			dir.copy( N ).multiplyScalar( Math.cos( phi ) ).addScaledVector( B, Math.sin( phi ) );
			positions.push( P.x + dir.x * r, P.y + dir.y * r, P.z + dir.z * r );
			normals.push( dir.x, dir.y, dir.z );
			uvs.push( j / radial, t * length / uvLength );

		}

	}

	for ( let i = 0; i < segments; i ++ ) {

		for ( let j = 0; j < radial; j ++ ) {

			const a = i * ( radial + 1 ) + j, b = a + radial + 1;
			indices.push( a, a + 1, b, b, a + 1, b + 1 );

		}

	}

	const g = new BufferGeometry();
	g.setAttribute( 'position', new Float32BufferAttribute( positions, 3 ) );
	g.setAttribute( 'normal', new Float32BufferAttribute( normals, 3 ) );
	g.setAttribute( 'uv', new Float32BufferAttribute( uvs, 2 ) );
	g.setIndex( indices );
	return { geometry: g, curve };

}
