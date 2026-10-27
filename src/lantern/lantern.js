import {
	AdditiveBlending,
	BackSide,
	Color,
	CylinderGeometry,
	Euler,
	Group,
	LatheGeometry,
	DoubleSide,
	Mesh,
	MeshStandardMaterial,
	PMREMGenerator,
	PlaneGeometry,
	Scene,
	ShaderMaterial,
	SphereGeometry,
	SpotLight,
	TorusGeometry,
	Vector2,
	Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../core/uniforms.js';
import { GLSL_COMMON, TONE } from '../core/glsl.js';
import { SHADOW_DISTANCE } from '../core/config.js';
import { patchLanternLit } from '../materials/maskedMaterial.js';

// The ornate brass lantern and its wisp. The lantern root sits at the top of
// the handle (where the hand grips); the wisp floats inside the glass.

export const WISP_OFFSET = new Vector3( 0, - 0.15, 0 );
const BRASS = new Color( 0xb08a3e );

// The halo shader only needs the colour/intensity uniforms.
const HALO_UNIFORMS = /* glsl */ `
	uniform vec3 uLanternColor;
	uniform float uLanternIntensity;
`;

function lathe( profile, segments = 6 ) {

	return new LatheGeometry( profile.map( ( [ r, y ] ) => new Vector2( r, y ) ), segments );

}

function buildBrass() {

	const parts = [];

	// handle ring (gripped by the hand)
	const ring = new TorusGeometry( 0.03, 0.0045, 8, 28 );
	ring.translate( 0, 0.006, 0 );
	parts.push( ring );

	// crown finial + domed cap
	const finial = new SphereGeometry( 0.011, 10, 8 );
	finial.translate( 0, - 0.03, 0 );
	parts.push( finial );
	parts.push( lathe( [
		[ 0.0, - 0.034 ], [ 0.012, - 0.036 ], [ 0.016, - 0.044 ], [ 0.03, - 0.056 ],
		[ 0.055, - 0.072 ], [ 0.074, - 0.08 ], [ 0.076, - 0.085 ], [ 0.068, - 0.088 ], [ 0.0, - 0.088 ],
	], 12 ) );

	// filigree scrolls around the cap
	for ( let i = 0; i < 6; i ++ ) {

		const scroll = new TorusGeometry( 0.011, 0.0018, 5, 12, Math.PI * 1.3 );
		scroll.rotateY( Math.PI / 2 );
		scroll.translate( 0, - 0.06, 0.052 );
		scroll.rotateY( i / 6 * Math.PI * 2 + Math.PI / 6 );
		parts.push( scroll );

	}

	// bands framing the glass
	const bandTop = new TorusGeometry( 0.066, 0.004, 6, 6 );
	bandTop.rotateX( Math.PI / 2 );
	bandTop.rotateY( Math.PI / 6 );
	bandTop.translate( 0, - 0.09, 0 );
	parts.push( bandTop );
	const bandBot = bandTop.clone();
	bandBot.translate( 0, - 0.122, 0 );
	parts.push( bandBot );

	// base
	parts.push( lathe( [
		[ 0.0, - 0.208 ], [ 0.07, - 0.208 ], [ 0.076, - 0.214 ], [ 0.072, - 0.224 ],
		[ 0.05, - 0.232 ], [ 0.032, - 0.238 ], [ 0.03, - 0.246 ], [ 0.0, - 0.246 ],
	], 12 ) );
	for ( let i = 0; i < 3; i ++ ) {

		const foot = new SphereGeometry( 0.008, 8, 6 );
		const a = i / 3 * Math.PI * 2;
		foot.translate( Math.cos( a ) * 0.035, - 0.248, Math.sin( a ) * 0.035 );
		parts.push( foot );

	}

	// wisp cradle: a small brass cup the spirit hovers over
	parts.push( lathe( [ [ 0.0, - 0.205 ], [ 0.018, - 0.205 ], [ 0.012, - 0.19 ], [ 0.016, - 0.182 ], [ 0.0, - 0.184 ] ], 10 ) );

	return mergeGeometries( parts.map( ( g ) => g.index ? g.toNonIndexed() : g ) );

}

function buildPosts() {

	const parts = [];
	for ( let i = 0; i < 6; i ++ ) {

		const a = i / 6 * Math.PI * 2;
		const post = new CylinderGeometry( 0.0035, 0.0035, 0.12, 5 );
		post.translate( Math.cos( a ) * 0.064, - 0.149, Math.sin( a ) * 0.064 );
		parts.push( post.toNonIndexed() );
		const knob = new SphereGeometry( 0.0065, 6, 5 );
		knob.translate( Math.cos( a ) * 0.066, - 0.09, Math.sin( a ) * 0.066 );
		parts.push( knob.toNonIndexed() );

	}

	return mergeGeometries( parts );

}

function createEnvMap( renderer ) {

	// A tiny dusky environment so the brass has something to reflect.
	const scene = new Scene();
	const dome = new Mesh( new SphereGeometry( 10, 24, 12 ), new ShaderMaterial( {
		side: BackSide,
		vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize( position ); gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
		fragmentShader: /* glsl */ `
			varying vec3 vDir;
			void main() {
				float h = vDir.y;
				vec3 col = mix( vec3( 0.03, 0.025, 0.02 ), vec3( 0.12, 0.16, 0.2 ), smoothstep( - 0.3, 0.6, h ) );
				col += vec3( 1.2, 0.8, 0.45 ) * pow( max( dot( vDir, normalize( vec3( 0.5, - 0.2, 0.6 ) ) ), 0.0 ), 8.0 );
				gl_FragColor = vec4( col, 1.0 );
			}
		`,
	} ) );
	scene.add( dome );
	const pmrem = new PMREMGenerator( renderer );
	const xr = renderer.xr.enabled;
	renderer.xr.enabled = false;
	const env = pmrem.fromScene( scene, 0.04 ).texture;
	renderer.xr.enabled = xr;
	pmrem.dispose();
	dome.geometry.dispose();
	dome.material.dispose();
	return env;

}

export class Lantern {

	constructor( renderer, scene ) {

		this.root = new Group();
		this.root.name = 'lantern';
		scene.add( this.root );

		const brassMat = patchLanternLit( new MeshStandardMaterial( {
			color: BRASS,
			metalness: 0.85,
			roughness: 0.32,
			envMap: createEnvMap( renderer ),
			envMapIntensity: 0.9,
			side: DoubleSide,
		} ), { strength: 0.8, emissive: 0.02 } );

		this.brass = new Mesh( buildBrass(), brassMat );
		this.root.add( this.brass );

		this.posts = new Mesh( buildPosts(), brassMat );
		this.root.add( this.posts );

		this.glass = new Mesh( new CylinderGeometry( 0.062, 0.062, 0.118, 6, 1, true ), new ShaderMaterial( {
			uniforms: { ...G },
			transparent: true,
			depthWrite: false,
			blending: AdditiveBlending,
			vertexShader: /* glsl */ `
				varying vec3 vN;
				varying vec3 vV;
				varying vec2 vUv;
				void main() {
					vec4 w = modelMatrix * vec4( position, 1.0 );
					vN = normalize( mat3( modelMatrix ) * normal );
					vV = normalize( cameraPosition - w.xyz );
					vUv = uv;
					gl_Position = projectionMatrix * viewMatrix * w;
				}
			`,
			fragmentShader: /* glsl */ `
				${GLSL_COMMON}
				varying vec3 vN;
				varying vec3 vV;
				varying vec2 vUv;
				void main() {
					float f = pow( 1.0 - abs( dot( normalize( vN ), normalize( vV ) ) ), 2.0 );
					float smudge = lkNoise2( vUv * vec2( 18.0, 6.0 ) ) * 0.5 + 0.5;
					vec3 col = uLanternColor * uLanternIntensity * ( 0.04 + 0.22 * f ) * smudge;
					gl_FragColor = vec4( col, 1.0 );
					${TONE}
				}
			`,
		} ) );
		this.glass.position.y = - 0.149;
		this.glass.rotation.y = Math.PI / 6;
		this.glass.renderOrder = 21;
		this.root.add( this.glass );

		// The wisp: a world-upright billboard flame with a little face.
		this.flameUniforms = {
			uLean: { value: new Vector3() },
			uLook: { value: new Vector2() },
			uBlink: { value: 0 },
		};
		this.flame = new Mesh( new PlaneGeometry( 1, 1 ), new ShaderMaterial( {
			uniforms: { ...G, ...this.flameUniforms },
			transparent: true,
			depthWrite: false,
			vertexShader: /* glsl */ `
				varying vec2 vUv;
				void main() {
					vec3 c = ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
					vec3 toCam = cameraPosition - c;
					vec3 right = cross( vec3( 0.0, 1.0, 0.0 ), toCam );
					right = dot( right, right ) < 1e-6 ? vec3( 1.0, 0.0, 0.0 ) : normalize( right );
					vec3 w = c + right * position.x * 0.07 + vec3( 0.0, 1.0, 0.0 ) * ( position.y * 0.09 + 0.012 );
					vUv = uv * 2.0 - 1.0;
					gl_Position = projectionMatrix * viewMatrix * vec4( w, 1.0 );
				}
			`,
			fragmentShader: /* glsl */ `
				${GLSL_COMMON}
				uniform vec3 uLean;
				uniform vec2 uLook;
				uniform float uBlink;
				varying vec2 vUv;
				void main() {
					vec2 p = vUv;
					float up = ( p.y + 1.0 ) * 0.5;
					p.x += ( lkNoise2( vec2( p.y * 3.0 - uTime * 5.0, uTime * 1.7 ) ) - 0.5 ) * 0.35 * up * up;
					p.x -= uLean.x * up * up;
					// teardrop: round belly, pointed tip
					float w = mix( 0.62, 0.08, smoothstep( - 0.35, 1.0, p.y ) );
					float d = length( vec2( p.x / w, ( p.y + 0.35 ) * mix( 1.5, 0.75, step( - 0.35, p.y ) ) ) );
					float body = 1.0 - smoothstep( 0.55, 1.0, d );
					float core = 1.0 - smoothstep( 0.0, 0.55, d );
					vec3 glow = lkSeasonGlow();
					vec3 col = mix( glow * 1.6, vec3( 3.2, 3.0, 2.6 ), core * core ) * uLanternIntensity;
					// face
					vec2 e = vec2( abs( p.x - uLook.x ) - 0.2, ( p.y + 0.3 - uLook.y ) * mix( 1.0, 7.0, uBlink ) );
					float eyes = 1.0 - smoothstep( 0.075, 0.105, length( e ) );
					vec2 m = vec2( p.x - uLook.x * 0.8, p.y + 0.55 - uLook.y );
					float mouth = ( 1.0 - smoothstep( 0.012, 0.03, abs( length( m - vec2( 0.0, 0.1 ) ) - 0.1 ) ) ) * step( m.y, 0.05 ) * step( abs( m.x ), 0.08 );
					float face = max( eyes, mouth * 0.7 ) * step( p.y, 0.0 );
					col = mix( col, vec3( 0.05, 0.02, 0.01 ), face * 0.85 );
					gl_FragColor = vec4( col, body );
					${TONE}
				}
			`,
		} ) );
		this.flame.position.copy( WISP_OFFSET );
		this.flame.renderOrder = 20;
		this.flame.frustumCulled = false;
		this.root.add( this.flame );

		// Soft halo — a cheap stand-in for bloom in VR.
		this.halo = new Mesh( new PlaneGeometry( 1, 1 ), new ShaderMaterial( {
			uniforms: { ...G, uHalo: { value: 1 } },
			transparent: true,
			depthWrite: false,
			blending: AdditiveBlending,
			vertexShader: /* glsl */ `
				varying vec2 vUv;
				void main() {
					vec4 mv = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
					mv.xy += position.xy * 0.75;
					vUv = uv * 2.0 - 1.0;
					gl_Position = projectionMatrix * mv;
				}
			`,
			fragmentShader: /* glsl */ `
				${HALO_UNIFORMS}
				uniform float uHalo;
				varying vec2 vUv;
				void main() {
					float d = dot( vUv, vUv );
					float a = exp( - d * 9.0 ) * 0.35 + exp( - d * 60.0 ) * 0.6;
					gl_FragColor = vec4( uLanternColor * uLanternIntensity * a * uHalo, 1.0 );
					${TONE}
				}
			`,
		} ) );
		this.halo.position.copy( WISP_OFFSET );
		this.halo.renderOrder = 22;
		this.halo.frustumCulled = false;
		this.root.add( this.halo );

		// The single dynamic, shadow-casting light.
		// decay 1.5 (not 2) keeps the near field from blowing out when the
		// lantern is pressed right up against a surface.
		this.spot = new SpotLight( 0xffffff, 3.5, SHADOW_DISTANCE, 1.12, 0.85, 1.5 );
		this.spot.castShadow = true;
		this.spot.shadow.camera.near = 0.03;
		this.spot.shadow.bias = - 0.0004;
		this.spot.shadow.normalBias = 0.015;
		this.spot.shadow.radius = 2.5;
		this.spot.shadow.mapSize.set( 1024, 1024 );
		scene.add( this.spot, this.spot.target );

		this.wisp = new Vector3();
		this._pos = new Vector3();
		this._prevPos = new Vector3();
		this._vel = new Vector3();
		this._prevVel = new Vector3();
		this._swing = new Vector2();
		this._swingVel = new Vector2();
		this._e = new Euler();
		this._tmp = new Vector3();
		this._dir = new Vector3();
		this.tilt = 0;
		this._blinkTimer = 2;
		this._initialised = false;

	}

	setShadowMapSize( size ) {

		if ( this.spot.shadow.mapSize.x === size ) return;
		this.spot.shadow.mapSize.set( size, size );
		this.spot.shadow.map?.dispose();
		this.spot.shadow.map = null;

	}

	// Forget motion history (e.g. after the lantern changes hands) so the
	// jump does not kick the pendulum.
	snap() {

		this._initialised = false;
		this._swing.set( 0, 0 );
		this._swingVel.set( 0, 0 );
		this._prevVel.set( 0, 0 );

	}

	setHaloStrength( v ) {

		this.halo.material.uniforms.uHalo.value = v;

	}

	/**
	 * @param {number} dt
	 * @param {object} pose  gripPos (world), yaw, roll (radians, + = tilted toward viewer's right)
	 * @param {object} view  head position / right vector for spot aiming and tilt reading
	 */
	update( dt, pose, view, lookTarget ) {

		const { gripPos, yaw, roll } = pose;
		if ( ! this._initialised ) {

			this._pos.copy( gripPos );
			this._prevPos.copy( gripPos );
			this._prevVel.set( 0, 0, 0 );
			this._initialised = true;

		}

		this._pos.copy( gripPos );
		const idt = 1 / Math.max( dt, 1e-3 );
		this._vel.copy( this._pos ).sub( this._prevPos ).multiplyScalar( idt );
		this._prevPos.copy( this._pos );
		const ax = ( this._vel.x - this._prevVel.x ) * idt;
		const az = ( this._vel.z - this._prevVel.z ) * idt;
		this._prevVel.copy( this._vel );

		// Small damped pendulum wobble from hand acceleration (in yaw frame).
		const cy = Math.cos( yaw ), sy = Math.sin( yaw );
		const localX = ax * cy - az * sy;
		const localZ = ax * sy + az * cy;
		const k = 90, c = 7, gain = 0.004;
		const fx = - Math.max( - 40, Math.min( 40, localZ ) ) * gain * k;
		const fy = Math.max( - 40, Math.min( 40, localX ) ) * gain * k;
		// sub-step so a long frame cannot destabilise the spring
		const steps = Math.min( 8, Math.ceil( dt * 120 ) );
		const h = dt / steps;
		for ( let i = 0; i < steps; i ++ ) {

			this._swingVel.x += ( - k * this._swing.x - c * this._swingVel.x + fx ) * h;
			this._swingVel.y += ( - k * this._swing.y - c * this._swingVel.y + fy ) * h;
			this._swing.addScaledVector( this._swingVel, h );

		}

		this._swing.clampScalar( - 0.3, 0.3 );

		this.root.position.copy( this._pos );
		this._e.set( this._swing.x, yaw, - roll + this._swing.y, 'YXZ' );
		this.root.quaternion.setFromEuler( this._e );
		this.root.updateMatrixWorld( true );

		this.wisp.copy( WISP_OFFSET ).applyMatrix4( this.root.matrixWorld );
		// The flame rises upright; use the lantern's world tilt for the season.
		this._tmp.set( 0, 1, 0 ).applyQuaternion( this.root.quaternion );
		this.tilt = Math.atan2( this._tmp.dot( view.right ), this._tmp.y );

		// Flame leans against motion (screen-space x only).
		const lean = Math.max( - 0.6, Math.min( 0.6, this._vel.dot( view.right ) * 0.35 ) );
		const fl = this.flameUniforms.uLean.value;
		fl.x += ( lean - fl.x ) * Math.min( 1, dt * 8 );

		// Wisp glances toward the next sleeping spirit.
		const look = this.flameUniforms.uLook.value;
		if ( lookTarget ) {

			this._dir.copy( lookTarget ).sub( this.wisp ).normalize();
			look.x += ( Math.max( - 0.12, Math.min( 0.12, this._dir.dot( view.right ) * 0.14 ) ) - look.x ) * Math.min( 1, dt * 4 );
			look.y += ( Math.max( - 0.06, Math.min( 0.08, this._dir.y * 0.1 ) ) - look.y ) * Math.min( 1, dt * 4 );

		}

		this._blinkTimer -= dt;
		if ( this._blinkTimer < 0 ) {

			this._blinkTimer = 2.5 + Math.random() * 4;

		}

		this.flameUniforms.uBlink.value = this._blinkTimer < 0.14 ? 1 : 0;

		// Aim the spot forward-and-down, away from the viewer, so shadows fall
		// where the keeper is looking.
		this._dir.copy( this.wisp ).sub( view.head );
		this._dir.y = 0;
		if ( this._dir.lengthSq() < 1e-4 ) this._dir.copy( view.forward );
		this._dir.normalize().multiplyScalar( 0.85 );
		this._dir.y = - 1;
		this.spot.position.copy( this.wisp );
		this.spot.target.position.copy( this.wisp ).add( this._dir );
		this.spot.target.updateMatrixWorld();

	}

	applyLight( color, intensity ) {

		this.spot.color.copy( color );
		this.spot.intensity = 3.5 * intensity;

	}

}
