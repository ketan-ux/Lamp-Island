import { Quaternion, Vector3 } from 'three';
import { WALK_RADIUS } from '../core/config.js';

// WebXR controllers and hand tracking. The lantern rides in one hand (right
// by default); pressing trigger/grip — or pinching — with the other hand
// passes it across. The empty hand is the shield.

const SHIELD_ON = 0.13;
const SHIELD_OFF = 0.17;
const SNAP = Math.PI / 6;

const _up = new Vector3( 0, 1, 0 );

export class XRInput {

	constructor( renderer, rig ) {

		this.renderer = renderer;
		this.rig = rig;
		this.onSwap = null;
		this.slots = [ 0, 1 ].map( ( i ) => {

			const slot = {
				index: i,
				grip: renderer.xr.getControllerGrip( i ),
				ray: renderer.xr.getController( i ),
				hand: renderer.xr.getHand( i ),
				source: null,
				handedness: null,
				snapReady: true,
			};
			rig.add( slot.grip, slot.ray, slot.hand );
			slot.grip.addEventListener( 'connected', ( e ) => {

				slot.source = e.data;
				slot.handedness = e.data.handedness;
				this._assign();

			} );
			slot.grip.addEventListener( 'disconnected', () => {

				slot.source = null;
				if ( this.lantern === slot ) this.lantern = null;
				this._assign();

			} );
			const grab = () => this._grab( slot );
			slot.ray.addEventListener( 'selectstart', grab );
			slot.ray.addEventListener( 'squeezestart', grab );
			return slot;

		} );

		this.lantern = null;
		this._chosen = false; // set once the keeper passes the lantern themselves
		this.shielding = false;
		this._pos = new Vector3();
		this._q = new Quaternion();
		this._f = new Vector3();
		this._u = new Vector3();
		this._palm = new Vector3();
		this._lastRoll = 0;

	}

	_assign() {

		// Controllers connect one at a time; keep preferring the right hand
		// until the keeper deliberately passes the lantern across.
		if ( this._chosen && this.lantern?.source ) return;
		const live = this.slots.filter( ( s ) => s.source );
		const next = live.find( ( s ) => s.handedness === 'right' ) || live[ 0 ] || null;
		if ( next !== this.lantern ) {

			this.lantern = next;
			this.onSwap?.( next, false );

		}

	}

	_grab( slot ) {

		if ( ! slot.source || slot === this.lantern ) return;
		this.lantern = slot;
		this._chosen = true;
		this.pulse( slot, 0.5, 60 );
		this.onSwap?.( slot, true );

	}

	get offHand() {

		return this.slots.find( ( s ) => s.source && s !== this.lantern ) || null;

	}

	get isHandTracking() {

		return this.slots.some( ( s ) => s.source?.hand );

	}

	pulse( slot, intensity, ms ) {

		const act = slot?.source?.gamepad?.hapticActuators?.[ 0 ];
		try {

			if ( act?.pulse ) act.pulse( intensity, ms );
			else slot?.source?.gamepad?.vibrationActuator?.playEffect?.( 'dual-rumble', { duration: ms, strongMagnitude: intensity, weakMagnitude: intensity } );

		} catch ( e ) { /* haptics are optional */ }

	}

	palmPosition( slot, out ) {

		const joints = slot.hand?.joints;
		const j = joints?.[ 'middle-finger-metacarpal' ];
		if ( slot.source?.hand && j && j.visible ) return j.getWorldPosition( out );
		return slot.grip.getWorldPosition( out );

	}

	/**
	 * @param {number} dt
	 * @param {Camera} camera the XR camera's parent-space camera (the rig child)
	 * @returns lantern pose or null if no hand is tracked yet
	 */
	update( dt, camera, wisp ) {

		this.rig.updateMatrixWorld( true );
		const head = camera.getWorldPosition( new Vector3() );
		const forward = camera.getWorldDirection( new Vector3() );
		const flat = forward.clone().setY( 0 );
		if ( flat.lengthSq() < 1e-4 ) flat.set( 0, 0, - 1 );
		flat.normalize();
		const right = new Vector3().crossVectors( flat, _up ).normalize();

		this._locomotion( dt, head, flat, right );

		// shield: off-hand palm close to the wisp
		const off = this.offHand;
		if ( off && wisp ) {

			const d = this.palmPosition( off, this._palm ).distanceTo( wisp );
			const was = this.shielding;
			this.shielding = was ? d < SHIELD_OFF : d < SHIELD_ON;
			if ( this.shielding && ! was ) this.pulse( off, 0.25, 40 );

		} else this.shielding = false;

		const slot = this.lantern;
		if ( ! slot ) return { gripPos: null, head, forward, right, shielding: false };

		slot.grip.matrixWorld.decompose( this._pos, this._q, this._f );
		const f = this._f.set( 0, 0, - 1 ).applyQuaternion( this._q );
		const u = this._u.set( 0, 1, 0 ).applyQuaternion( this._q );

		const yaw = Math.abs( f.y ) < 0.95 ? Math.atan2( - f.x, - f.z ) : Math.atan2( - flat.x, - flat.z );

		// roll of the hand about its pointing axis, relative to world up
		const wu = _up.clone().addScaledVector( f, - f.dot( _up ) );
		const uu = u.clone().addScaledVector( f, - f.dot( u ) );
		let roll = this._lastRoll;
		if ( wu.lengthSq() > 1e-3 && uu.lengthSq() > 1e-3 ) {

			roll = Math.atan2( new Vector3().crossVectors( wu, uu ).dot( f ), wu.dot( uu ) );
			this._lastRoll = roll;

		}

		return {
			gripPos: this._pos.clone().add( new Vector3( 0, - 0.01, 0 ) ),
			yaw,
			roll,
			shielding: this.shielding,
			head,
			forward,
			right,
		};

	}

	_locomotion( dt, head, flat, right ) {

		for ( const slot of this.slots ) {

			const gp = slot.source?.gamepad;
			if ( ! gp || ! gp.axes ) continue;
			const ax = gp.axes.length >= 4 ? gp.axes[ 2 ] : gp.axes[ 0 ] || 0;
			const ay = gp.axes.length >= 4 ? gp.axes[ 3 ] : gp.axes[ 1 ] || 0;

			if ( slot === this.lantern ) {

				// snap turn around the head
				if ( slot.snapReady && Math.abs( ax ) > 0.7 ) {

					slot.snapReady = false;
					this._turn( ax > 0 ? - SNAP : SNAP, head );

				} else if ( Math.abs( ax ) < 0.3 ) slot.snapReady = true;

			} else if ( Math.hypot( ax, ay ) > 0.15 ) {

				// gentle smooth glide, clamped to the island
				const speed = 0.9 * dt;
				const move = right.clone().multiplyScalar( ax * speed ).addScaledVector( flat, - ay * speed );
				this.rig.position.add( move );
				const hx = head.x + move.x, hz = head.z + move.z;
				const r = Math.hypot( hx, hz );
				if ( r > WALK_RADIUS + 0.25 ) {

					const k = ( WALK_RADIUS + 0.25 ) / r;
					this.rig.position.x += hx * k - hx;
					this.rig.position.z += hz * k - hz;

				}

			}

		}

	}

	_turn( angle, head ) {

		const p = this.rig.position.clone().sub( head );
		p.applyAxisAngle( _up, angle );
		this.rig.position.copy( head ).add( p ).setY( this.rig.position.y );
		this.rig.rotation.y += angle;

	}

	reset() {

		this._chosen = false;
		this._assign();
		this.rig.position.set( 0, 0, 0 );
		this.rig.rotation.set( 0, 0, 0 );

	}

}
