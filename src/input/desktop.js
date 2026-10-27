import { Euler, Quaternion, Vector3 } from 'three';
import { WALK_RADIUS } from '../core/config.js';

// PC controls: pointer-lock mouse look, WASD to step around the island, hold
// the left mouse button to reach the lantern toward whatever you look at
// (the keeper kneels for low targets), Q/E or the wheel to tilt, right mouse
// or Space to shield the flame with the off-hand.

const REST = new Vector3( 0.24, - 0.15, - 0.5 );
const HAND_HIDDEN = new Vector3( - 0.4, - 0.55, - 0.25 );
const STAND = 1.62;
const KNEEL = 0.9;
const ARM = 1.2;

export class DesktopInput {

	constructor( canvas, camera, rig ) {

		this.canvas = canvas;
		this.camera = camera;
		this.rig = rig;
		this.enabled = false;
		this.locked = false;
		this.yaw = 0;
		this.pitch = - 0.18;
		this.eye = STAND;
		this.keys = new Set();
		this.reach = false;
		this.shieldMouse = false;
		this.roll = 0;
		this.wheelRoll = 0;
		this.onUnlock = null;
		this.onKey = null;

		this.grip = new Vector3();
		this._gripInit = false;
		this._v = new Vector3();
		this._w = new Vector3();
		this._e = new Euler( 0, 0, 0, 'YXZ' );
		this._drag = null;
		this.handPos = new Vector3();
		this.handQuat = new Quaternion();
		this.shieldAmount = 0;

		// Some embeds refuse pointer lock; fall back to drag-to-look for mice too.
		this.noLock = false;
		document.addEventListener( 'pointerlockerror', () => {

			this.noLock = true;

		} );

		document.addEventListener( 'pointerlockchange', () => {

			this.locked = document.pointerLockElement === canvas;
			if ( ! this.locked ) {

				this.reach = false;
				this.shieldMouse = false;
				this.keys.clear();
				if ( this.enabled ) this.onUnlock?.();

			}

		} );

		document.addEventListener( 'mousemove', ( e ) => {

			if ( ! this.enabled || ! this.locked ) return;
			this._look( e.movementX, e.movementY, 0.0022 );

		} );

		canvas.addEventListener( 'mousedown', ( e ) => {

			if ( ! this.enabled ) return;
			if ( ! this.locked ) return;
			if ( e.button === 0 ) this.reach = true;
			if ( e.button === 2 ) this.shieldMouse = true;

		} );

		window.addEventListener( 'mouseup', ( e ) => {

			if ( e.button === 0 ) this.reach = false;
			if ( e.button === 2 ) this.shieldMouse = false;

		} );

		canvas.addEventListener( 'contextmenu', ( e ) => e.preventDefault() );

		canvas.addEventListener( 'wheel', ( e ) => {

			if ( ! this.enabled ) return;
			e.preventDefault();
			this.wheelRoll = Math.max( - 1, Math.min( 1, this.wheelRoll + Math.sign( e.deltaY ) * 0.25 ) );

		}, { passive: false } );

		// Touch / no-pointer-lock fallback: drag to look, long press to reach.
		canvas.addEventListener( 'pointerdown', ( e ) => {

			if ( ! this.enabled || this.locked || ( e.pointerType === 'mouse' && ! this.noLock ) ) return;
			this._drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
			this._touchTimer = setTimeout( () => {

				this.reach = true;

			}, 350 );

		} );
		canvas.addEventListener( 'pointermove', ( e ) => {

			if ( ! this._drag || e.pointerId !== this._drag.id ) return;
			const dx = e.clientX - this._drag.x, dy = e.clientY - this._drag.y;
			if ( Math.hypot( dx, dy ) > 8 ) clearTimeout( this._touchTimer );
			this._look( dx, dy, 0.005 );
			this._drag.x = e.clientX;
			this._drag.y = e.clientY;

		} );
		const endDrag = ( e ) => {

			if ( ! this._drag || e.pointerId !== this._drag.id ) return;
			clearTimeout( this._touchTimer );
			this._drag = null;
			this.reach = false;

		};

		canvas.addEventListener( 'pointerup', endDrag );
		canvas.addEventListener( 'pointercancel', endDrag );

		window.addEventListener( 'keydown', ( e ) => {

			if ( ! this.enabled ) return;
			if ( e.code === 'Space' ) e.preventDefault();
			if ( ! e.repeat ) this.onKey?.( e.code );
			this.keys.add( e.code );

		} );
		window.addEventListener( 'keyup', ( e ) => this.keys.delete( e.code ) );
		window.addEventListener( 'blur', () => this.keys.clear() );

	}

	_look( dx, dy, s ) {

		this.yaw -= dx * s;
		this.pitch = Math.max( - 1.35, Math.min( 1.2, this.pitch - dy * s ) );

	}

	lock() {

		try {

			const p = this.canvas.requestPointerLock?.();
			p?.catch?.( () => {} );

		} catch ( e ) { /* pointer lock unavailable — drag-to-look still works */ }

	}

	get shielding() {

		return this.shieldMouse || this.keys.has( 'Space' );

	}

	resetPose() {

		this.yaw = 0;
		this.pitch = - 0.18;
		this.rig.position.set( 0, 0, 0 );
		this._gripInit = false;

	}

	/**
	 * Advances the player and returns the lantern pose for this frame.
	 * @param {Array} spirits reach targets
	 */
	update( dt, spirits ) {

		const cam = this.camera;
		const forward = this._v.set( - Math.sin( this.yaw ), 0, - Math.cos( this.yaw ) );
		const right = this._w.set( Math.cos( this.yaw ), 0, - Math.sin( this.yaw ) );

		// walk (kept on the island)
		let mx = 0, mz = 0;
		if ( this.keys.has( 'KeyW' ) || this.keys.has( 'ArrowUp' ) ) mz += 1;
		if ( this.keys.has( 'KeyS' ) || this.keys.has( 'ArrowDown' ) ) mz -= 1;
		if ( this.keys.has( 'KeyD' ) || this.keys.has( 'ArrowRight' ) ) mx += 1;
		if ( this.keys.has( 'KeyA' ) || this.keys.has( 'ArrowLeft' ) ) mx -= 1;
		if ( mx || mz ) {

			const len = Math.hypot( mx, mz );
			const speed = 1.1 * dt / len;
			this.rig.position.addScaledVector( forward, mz * speed ).addScaledVector( right, mx * speed );
			const r = Math.hypot( this.rig.position.x, this.rig.position.z );
			if ( r > WALK_RADIUS ) this.rig.position.multiplyScalar( WALK_RADIUS / r );

		}

		this.rig.rotation.set( 0, this.yaw, 0 );

		// tilt
		const tiltKeys = ( this.keys.has( 'KeyE' ) ? 1 : 0 ) - ( this.keys.has( 'KeyQ' ) ? 1 : 0 );
		this.wheelRoll *= Math.exp( - 1.4 * dt );
		const rollTarget = Math.max( - 0.9, Math.min( 0.9, tiltKeys * 0.75 + this.wheelRoll * 0.75 ) );
		this.roll += ( rollTarget - this.roll ) * ( 1 - Math.exp( - 8 * dt ) );

		// reach target
		cam.position.set( 0, this.eye, 0 );
		cam.rotation.set( this.pitch, 0, 0 );
		this.rig.updateMatrixWorld( true );
		const head = cam.getWorldPosition( new Vector3() );
		const viewDir = cam.getWorldDirection( new Vector3() );
		const desired = REST.clone().applyMatrix4( cam.matrixWorld );
		let eyeTarget = STAND;

		if ( this.reach ) {

			const target = this._findTarget( head, viewDir, spirits );
			const shoulder = head.clone().addScaledVector( right, 0.16 ).add( new Vector3( 0, - 0.22, 0 ) );
			if ( target.y < 1.0 ) eyeTarget = Math.max( KNEEL, Math.min( STAND, target.y + 0.85 ) );
			const offset = target.clone().sub( shoulder );
			const dist = offset.length();
			if ( dist > ARM ) offset.multiplyScalar( ARM / dist );
			desired.copy( shoulder ).add( offset );

		}

		this.eye += ( eyeTarget - this.eye ) * ( 1 - Math.exp( - 3.5 * dt ) );

		if ( ! this._gripInit ) {

			this.grip.copy( desired );
			this._gripInit = true;

		}

		this.grip.lerp( desired, 1 - Math.exp( - ( this.reach ? 7 : 12 ) * dt ) );

		// off-hand shield pose: palm cupped on the far side of the flame
		const s = this.shielding ? 1 : 0;
		this.shieldAmount += ( s - this.shieldAmount ) * ( 1 - Math.exp( - 9 * dt ) );
		const e = this.shieldAmount * this.shieldAmount * ( 3 - 2 * this.shieldAmount );
		const toLantern = this.grip.clone().sub( head ).setY( 0 ).normalize();
		// palm (+X) faces back toward the flame, fingers (-Z) sweep across it
		this._e.set( 0, Math.atan2( toLantern.z, - toLantern.x ), 0 );
		this.handQuat.setFromEuler( this._e );
		const fingers = new Vector3( 0, 0, - 1 ).applyQuaternion( this.handQuat );
		const shieldPos = this.grip.clone().addScaledVector( toLantern, 0.09 ).addScaledVector( fingers, - 0.045 ).add( new Vector3( 0, - 0.14, 0 ) );
		const hiddenPos = HAND_HIDDEN.clone().applyMatrix4( cam.matrixWorld );
		this.handPos.copy( hiddenPos ).lerp( shieldPos, e );

		return {
			gripPos: this.grip,
			yaw: this.yaw,
			roll: this.roll,
			shielding: this.shielding,
			head,
			forward: viewDir,
			right: right.clone(),
		};

	}

	_findTarget( head, dir, spirits ) {

		let best = null, bestScore = 0.28;
		const p = new Vector3(), q = new Vector3();
		for ( const s of spirits ) {

			for ( const [ a, b ] of s.segments ) {

				// closest point on the segment to the view ray (sampled)
				for ( let i = 0; i <= 4; i ++ ) {

					p.copy( a ).lerp( b, i / 4 );
					q.copy( p ).sub( head );
					const along = q.dot( dir );
					if ( along < 0.2 || along > 3.4 ) continue;
					const off = q.addScaledVector( dir, - along ).length();
					const score = off / along;
					if ( score < bestScore ) {

						bestScore = score;
						best = p.clone();

					}

				}

			}

		}

		if ( best ) return best.addScaledVector( dir, - 0.1 );
		if ( dir.y < - 0.05 ) {

			const t = ( head.y - 0.12 ) / - dir.y;
			if ( t < 3 ) return head.clone().addScaledVector( dir, t );

		}

		return head.clone().addScaledVector( dir, 1.0 );

	}

}
