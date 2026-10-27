import {
	AdditiveBlending,
	BufferAttribute,
	BufferGeometry,
	CylinderGeometry,
	DoubleSide,
	Float32BufferAttribute,
	InstancedBufferAttribute,
	InstancedMesh,
	Object3D,
	Points,
	ShaderMaterial,
	Vector3,
} from 'three';
import { G } from '../core/uniforms.js';
import { GLSL_COMMON, INSTANCED_WORLD, SEASON_LOCAL, TONE } from '../core/glsl.js';
import { WATER_Y, islandRadius } from '../core/config.js';
import { mulberry32 } from '../core/random.js';

// All particle motion is evaluated on the GPU from per-particle seeds, so the
// CPU cost per frame is a handful of uniform writes.

// Shared point-size uniform: half the render target height in pixels.
export const POINT_SCALE = { value: 500 };

export function createFireflies( count = 240 ) {

	const rand = mulberry32( 12 );
	const seeds = new Float32Array( count * 4 );
	const pos = new Float32Array( count * 3 );
	for ( let i = 0; i < count; i ++ ) {

		const a = rand() * Math.PI * 2;
		const r = 1.6 + Math.pow( rand(), 0.7 ) * 13;
		pos.set( [ Math.cos( a ) * r, 0.2 + rand() * 3.2, Math.sin( a ) * r ], i * 3 );
		seeds.set( [ rand(), rand(), rand(), rand() ], i * 4 );

	}

	const g = new BufferGeometry();
	g.setAttribute( 'position', new BufferAttribute( pos, 3 ) );
	g.setAttribute( 'aSeed', new BufferAttribute( seeds, 4 ) );

	const material = new ShaderMaterial( {
		uniforms: { ...G, uPointScale: POINT_SCALE },
		transparent: true,
		depthWrite: false,
		blending: AdditiveBlending,
		vertexShader: /* glsl */ `
			${GLSL_COMMON}
			uniform float uPointScale;
			attribute vec4 aSeed;
			varying vec3 vColor;
			varying float vAlpha;
			void main() {
				float t = uTime * ( 0.15 + aSeed.x * 0.25 ) + aSeed.y * 40.0;
				vec3 p = position + vec3( sin( t * 1.3 ) * 0.6, sin( t * 0.9 + aSeed.z * 6.0 ) * 0.35, cos( t * 1.1 ) * 0.6 );
				// motes near the wisp are drawn into a slow orbit around it
				vec3 toL = uLanternPos - p;
				float pull = ( 1.0 - smoothstep( 0.6, 2.6, length( toL ) ) ) * uLanternIntensity;
				float oa = uTime * ( 0.8 + aSeed.w ) + aSeed.y * 6.28;
				vec3 orbit = uLanternPos + vec3( cos( oa ), sin( oa * 0.7 ) * 0.6, sin( oa ) ) * ( 0.22 + aSeed.z * 0.25 );
				p = mix( p, orbit, pull * 0.85 );
				// finale: the grove's spirits rise
				p.y += uFinale * ( 1.5 + aSeed.x * 6.0 ) * smoothstep( 0.0, 1.0, uFinale );
				float blink = smoothstep( 0.2, 1.0, sin( uTime * ( 0.7 + aSeed.w * 1.4 ) + aSeed.x * 30.0 ) );
				vAlpha = mix( blink, 1.0, pull ) * ( 0.55 + 0.45 * aSeed.z );
				vColor = mix( vec3( 0.75, 1.0, 0.35 ), lkSeasonGlow(), max( pull, uFinale * 0.6 ) );
				vec4 mv = viewMatrix * vec4( p, 1.0 );
				gl_Position = projectionMatrix * mv;
				gl_PointSize = clamp( projectionMatrix[ 1 ][ 1 ] * uPointScale * ( 0.018 + 0.012 * aSeed.w ) / - mv.z, 1.0, 48.0 );
			}
		`,
		fragmentShader: /* glsl */ `
			varying vec3 vColor;
			varying float vAlpha;
			void main() {
				vec2 c = gl_PointCoord - 0.5;
				float d = dot( c, c ) * 4.0;
				float a = exp( - d * 5.0 ) + exp( - d * 40.0 );
				gl_FragColor = vec4( vColor * a * vAlpha * 1.6, 1.0 );
				${TONE}
			}
		`,
	} );
	const points = new Points( g, material );
	points.frustumCulled = false;
	points.renderOrder = 5;
	return points;

}

// Autumn leaves / spring petals drifting down around the island.
export function createDrift( count = 110 ) {

	const rand = mulberry32( 31 );
	const geo = new BufferGeometry();
	geo.setAttribute( 'position', new Float32BufferAttribute( [
		0, - 0.03, 0, 0.018, 0, 0.004, 0, 0.03, 0,
		0, - 0.03, 0, 0, 0.03, 0, - 0.018, 0, 0.004,
	], 3 ) );
	geo.computeVertexNormals();
	const mesh = new InstancedMesh( geo, null, count );
	const seeds = new Float32Array( count * 4 );
	const dummy = new Object3D();
	for ( let i = 0; i < count; i ++ ) {

		const a = rand() * Math.PI * 2;
		const r = Math.sqrt( rand() ) * 3.2;
		dummy.position.set( Math.cos( a ) * r, 0, Math.sin( a ) * r );
		dummy.updateMatrix();
		mesh.setMatrixAt( i, dummy.matrix );
		seeds.set( [ rand(), rand(), rand(), rand() ], i * 4 );

	}

	geo.setAttribute( 'aSeed', new InstancedBufferAttribute( seeds, 4 ) );
	mesh.material = new ShaderMaterial( {
		uniforms: { ...G },
		side: DoubleSide,
		vertexShader: /* glsl */ `
			${INSTANCED_WORLD}
			uniform float uTime;
			attribute vec4 aSeed;
			varying vec3 vWorld;
			varying vec3 vNormal;
			varying float vSeed;
			mat3 rotAxis( vec3 a, float ang ) {
				float s = sin( ang ), c = cos( ang ), oc = 1.0 - c;
				return mat3( oc * a.x * a.x + c, oc * a.x * a.y + a.z * s, oc * a.z * a.x - a.y * s,
					oc * a.x * a.y - a.z * s, oc * a.y * a.y + c, oc * a.y * a.z + a.x * s,
					oc * a.z * a.x + a.y * s, oc * a.y * a.z - a.x * s, oc * a.z * a.z + c );
			}
			void main() {
				vec3 o = lkInstanceOrigin();
				float speed = 0.12 + aSeed.x * 0.12;
				float cycle = 4.3;
				float y = 3.6 - mod( uTime * speed + aSeed.y * cycle, cycle );
				float t = uTime * ( 0.4 + aSeed.z * 0.5 ) + aSeed.w * 20.0;
				vec3 c = vec3( o.x + sin( t ) * 0.35, y, o.z + cos( t * 0.8 ) * 0.35 );
				vec3 axis = normalize( vec3( aSeed.z - 0.5, 0.4, aSeed.w - 0.5 ) );
				mat3 R = rotAxis( axis, uTime * ( 1.0 + aSeed.x * 2.0 ) + aSeed.y * 10.0 );
				vec3 w = c + R * position * ( 0.8 + aSeed.w * 0.6 );
				vWorld = w;
				vNormal = R * normal;
				vSeed = aSeed.z;
				gl_Position = projectionMatrix * viewMatrix * vec4( w, 1.0 );
			}
		`,
		fragmentShader: /* glsl */ `
			${GLSL_COMMON}
			${SEASON_LOCAL}
			varying vec3 vWorld;
			varying vec3 vNormal;
			varying float vSeed;
			void main() {
				if ( vWorld.y < ${WATER_Y.toFixed( 3 )} ) discard;
				vec3 n = normalize( vNormal ) * ( gl_FrontFacing ? 1.0 : - 1.0 );
				float s = lkLocalSeason( vWorld );
				vec3 autumn = mix( vec3( 0.6, 0.08, 0.01 ), vec3( 1.0, 0.5, 0.05 ), vSeed );
				vec3 spring = mix( vec3( 0.55, 0.85, 0.95 ), vec3( 0.95, 0.98, 1.0 ), vSeed );
				vec3 alb = mix( autumn, spring, s );
				vec3 col = alb * ( vec3( 0.025, 0.035, 0.05 ) + lkLanternLight( vWorld, n, 1.0 ) );
				col += alb * lkSeasonGlow() * lkMask( lkMaskDistance( vWorld ) ) * 0.5;
				gl_FragColor = vec4( lkAtmosphere( col, vWorld ), 1.0 );
				${TONE}
			}
		`,
	} );
	mesh.frustumCulled = false;
	return mesh;

}

// Spirit orbs that fly from an awakened spirit to the shrine.
export class SpiritOrbs {

	constructor( max = 16 ) {

		this.max = max;
		this.orbs = [];
		const pos = new Float32Array( max * 3 ).fill( - 999 );
		const life = new Float32Array( max );
		this.geometry = new BufferGeometry();
		this.position = new BufferAttribute( pos, 3 );
		this.life = new BufferAttribute( life, 1 );
		this.geometry.setAttribute( 'position', this.position );
		this.geometry.setAttribute( 'aLife', this.life );
		const material = new ShaderMaterial( {
			uniforms: { ...G, uPointScale: POINT_SCALE },
			transparent: true,
			depthWrite: false,
			blending: AdditiveBlending,
			vertexShader: /* glsl */ `
				${GLSL_COMMON}
				uniform float uPointScale;
				attribute float aLife;
				varying float vLife;
				void main() {
					vLife = aLife;
					vec4 mv = viewMatrix * vec4( position, 1.0 );
					gl_Position = projectionMatrix * mv;
					gl_PointSize = clamp( projectionMatrix[ 1 ][ 1 ] * uPointScale * 0.07 / - mv.z, 1.0, 96.0 ) * step( 0.001, aLife );
				}
			`,
			fragmentShader: /* glsl */ `
				${GLSL_COMMON}
				varying float vLife;
				void main() {
					vec2 c = gl_PointCoord - 0.5;
					float d = dot( c, c ) * 4.0;
					float a = exp( - d * 6.0 ) * 0.6 + exp( - d * 60.0 ) * 1.5;
					float fade = smoothstep( 0.0, 0.1, vLife ) * smoothstep( 1.0, 0.85, vLife );
					gl_FragColor = vec4( lkSeasonGlow() * a * fade * 2.0, 1.0 );
					${TONE}
				}
			`,
		} );
		this.points = new Points( this.geometry, material );
		this.points.frustumCulled = false;
		this.points.renderOrder = 6;

	}

	launch( from, to, onArrive ) {

		if ( this.orbs.length >= this.max ) return;
		const mid = from.clone().lerp( to, 0.5 );
		mid.y = Math.max( from.y, to.y ) + 1.2;
		this.orbs.push( { from: from.clone(), mid, to: to.clone(), t: 0, onArrive } );

	}

	update( dt ) {

		const p = new Vector3();
		for ( let i = 0; i < this.max; i ++ ) {

			const o = this.orbs[ i ];
			if ( ! o ) {

				this.position.setXYZ( i, 0, - 999, 0 );
				this.life.setX( i, 0 );
				continue;

			}

			o.t += dt / 2.6;
			const t = Math.min( o.t, 1 );
			const e = t * t * ( 3 - 2 * t );
			// quadratic bezier with a little spiral wobble
			p.copy( o.from ).multiplyScalar( ( 1 - e ) * ( 1 - e ) )
				.addScaledVector( o.mid, 2 * e * ( 1 - e ) )
				.addScaledVector( o.to, e * e );
			p.x += Math.sin( t * 18 ) * 0.08 * ( 1 - t );
			p.z += Math.cos( t * 18 ) * 0.08 * ( 1 - t );
			this.position.setXYZ( i, p.x, p.y, p.z );
			this.life.setX( i, Math.max( t, 0.0011 ) );

		}

		for ( let i = this.orbs.length - 1; i >= 0; i -- ) {

			if ( this.orbs[ i ].t >= 1 ) {

				const [ o ] = this.orbs.splice( i, 1 );
				o.onArrive?.();

			}

		}

		this.position.needsUpdate = true;
		this.life.needsUpdate = true;

	}

}

// Floating paper lanterns released from the pond during the finale.
export function createSkyLanterns( count = 40 ) {

	const rand = mulberry32( 88 );
	const geo = new CylinderGeometry( 0.07, 0.055, 0.15, 8, 1 );
	const mesh = new InstancedMesh( geo, null, count );
	const seeds = new Float32Array( count * 4 );
	const dummy = new Object3D();
	for ( let i = 0; i < count; i ++ ) {

		const a = rand() * Math.PI * 2;
		const r = islandRadius( a ) + 1.6 + rand() * 9;
		dummy.position.set( Math.cos( a ) * r, WATER_Y + 0.08, Math.sin( a ) * r );
		dummy.updateMatrix();
		mesh.setMatrixAt( i, dummy.matrix );
		seeds.set( [ rand(), rand(), rand(), rand() ], i * 4 );

	}

	geo.setAttribute( 'aSeed', new InstancedBufferAttribute( seeds, 4 ) );
	const finaleTime = { value: 0 };
	mesh.material = new ShaderMaterial( {
		uniforms: { ...G, uFinaleTime: finaleTime },
		vertexShader: /* glsl */ `
			${INSTANCED_WORLD}
			uniform float uTime;
			uniform float uFinaleTime;
			attribute vec4 aSeed;
			varying vec3 vWorld;
			varying float vSeed;
			varying float vY;
			void main() {
				vec3 o = lkInstanceOrigin();
				float t = max( uFinaleTime - aSeed.x * 7.0, 0.0 );
				float rise = t * ( 0.18 + aSeed.y * 0.22 );
				float show = smoothstep( 0.0, 1.5, t );
				vec3 c = o + vec3( sin( t * 0.5 + aSeed.z * 6.0 ) * 0.3 * min( rise, 1.0 ), rise, cos( t * 0.4 + aSeed.w * 6.0 ) * 0.3 * min( rise, 1.0 ) );
				vec3 w = c + position * show * ( 0.8 + aSeed.w * 0.6 );
				vWorld = w;
				vSeed = aSeed.z;
				vY = position.y;
				gl_Position = projectionMatrix * viewMatrix * vec4( w, 1.0 );
			}
		`,
		fragmentShader: /* glsl */ `
			${GLSL_COMMON}
			varying vec3 vWorld;
			varying float vSeed;
			varying float vY;
			void main() {
				vec3 warm = mix( vec3( 1.6, 0.65, 0.18 ), vec3( 0.25, 1.2, 1.5 ), uSeason );
				vec3 col = warm * ( 0.6 + 0.6 * vSeed ) * ( 0.75 + 0.25 * sin( uTime * 6.0 + vSeed * 30.0 ) );
				col *= 0.5 + smoothstep( 0.075, - 0.06, vY );
				gl_FragColor = vec4( lkAtmosphere( col, vWorld ), 1.0 );
				${TONE}
			}
		`,
	} );
	mesh.frustumCulled = false;
	return { mesh, finaleTime };

}
