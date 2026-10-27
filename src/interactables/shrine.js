import {
	AdditiveBlending,
	BoxGeometry,
	CircleGeometry,
	ConeGeometry,
	Group,
	Mesh,
	ShaderMaterial,
	SphereGeometry,
	Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../core/uniforms.js';
import { GLSL_COMMON, TONE } from '../core/glsl.js';
import { createMaskedMaterial } from '../materials/maskedMaterial.js';
import { Spirit } from './spirit.js';

// The keeper's shrine (a small stone hokora). Its spirit mirror only accepts
// the lantern once every grove spirit has been woken.

export const SHRINE_POS = new Vector3( 0, 0, - 1.56 );

function box( w, h, d, y, seg = 3 ) {

	const g = new BoxGeometry( w, h, d, seg, seg, seg );
	g.translate( 0, y, 0 );
	return g;

}

function shrineGeometry() {

	const parts = [
		box( 0.66, 0.12, 0.54, 0.0 ),
		box( 0.52, 0.08, 0.44, 0.1 ),
		box( 0.38, 0.44, 0.32, 0.36 ),
		box( 0.6, 0.045, 0.52, 0.6 ),
	];
	const roof = new ConeGeometry( 0.44, 0.2, 4, 2 );
	roof.rotateY( Math.PI / 4 );
	roof.scale( 1, 1, 0.88 );
	roof.translate( 0, 0.72, 0 );
	parts.push( roof.toNonIndexed() );
	const jewel = new SphereGeometry( 0.035, 10, 8 );
	jewel.translate( 0, 0.84, 0 );
	parts.push( jewel.toNonIndexed() );
	return mergeGeometries( parts.map( ( g ) => g.index ? g.toNonIndexed() : g ) );

}

export function createShrine( textures, canAwaken ) {

	const group = new Group();
	group.position.copy( SHRINE_POS );

	const m = createMaskedMaterial( { kind: 'stone', set: textures.stone, glow: 1.5 } );
	const body = new Mesh( shrineGeometry(), m.material );
	body.castShadow = true;
	body.receiveShadow = true;
	group.add( body );

	// Spirit mirror set into the front face.
	const mirror = new Mesh( new CircleGeometry( 0.085, 32 ), new ShaderMaterial( {
		uniforms: { ...G, uReady: { value: 0 }, uLit: { value: 0 } },
		vertexShader: /* glsl */ `
			varying vec2 vUv;
			varying vec3 vWorld;
			void main() {
				vUv = uv * 2.0 - 1.0;
				vec4 w = modelMatrix * vec4( position, 1.0 );
				vWorld = w.xyz;
				gl_Position = projectionMatrix * viewMatrix * w;
			}
		`,
		fragmentShader: /* glsl */ `
			${GLSL_COMMON}
			uniform float uReady;
			uniform float uLit;
			varying vec2 vUv;
			varying vec3 vWorld;
			void main() {
				float r = length( vUv );
				float a = atan( vUv.y, vUv.x );
				float swirl = sin( a * 3.0 + r * 10.0 - uTime * 1.5 ) * 0.5 + 0.5;
				vec3 glow = lkSeasonGlow();
				vec3 col = vec3( 0.01, 0.012, 0.015 ) + glow * 0.04 * swirl;
				float rim = smoothstep( 0.82, 0.95, r ) * ( 1.0 - smoothstep( 0.95, 1.0, r ) );
				col += glow * rim * ( 0.25 + uProgress * 0.9 );
				col += glow * ( uReady * ( 0.3 + 0.3 * swirl ) * ( 0.6 + 0.4 * sin( uTime * 3.0 ) ) + uLit * ( 2.0 + swirl * 2.0 ) );
				col += vec3( 1.0 ) * uLit * smoothstep( 0.4, 0.0, r ) * 2.0;
				gl_FragColor = vec4( lkAtmosphere( col, vWorld ), 1.0 );
				${TONE}
			}
		`,
	} ) );
	mirror.position.set( 0, 0.39, 0.162 );
	group.add( mirror );

	// Beacon column that erupts during the finale.
	const beacon = new Mesh( new ConeGeometry( 0.42, 7, 16, 1, true ), new ShaderMaterial( {
		uniforms: { ...G },
		transparent: true,
		depthWrite: false,
		blending: AdditiveBlending,
		vertexShader: /* glsl */ `
			varying vec2 vUv;
			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}
		`,
		fragmentShader: /* glsl */ `
			${GLSL_COMMON}
			varying vec2 vUv;
			void main() {
				float fade = smoothstep( 0.0, 0.25, vUv.y ) * smoothstep( 1.0, 0.6, vUv.y );
				float streak = 0.6 + 0.4 * sin( vUv.x * 40.0 + uTime * 2.0 - vUv.y * 9.0 );
				gl_FragColor = vec4( lkSeasonGlow() * fade * streak * uFinale * 0.22, 1.0 );
				${TONE}
			}
		`,
	} ) );
	beacon.rotation.x = Math.PI;
	beacon.position.y = 4.3;
	beacon.renderOrder = 8;
	beacon.frustumCulled = false;
	group.add( beacon );

	const focus = SHRINE_POS.clone().setY( 0.39 ).add( new Vector3( 0, 0, 0.17 ) );
	const spirit = new Spirit( {
		name: 'The Keeper\'s Shrine',
		segments: [ [ focus, focus.clone().setY( 0.6 ) ] ],
		reach: 0.15,
		uniforms: [ m.uniforms ],
		anchor: focus.clone(),
		pitch: 12,
		canAwaken,
	} );

	return {
		group,
		spirit,
		mirrorUniforms: mirror.material.uniforms,
		orbTarget: SHRINE_POS.clone().setY( 0.95 ),
	};

}
