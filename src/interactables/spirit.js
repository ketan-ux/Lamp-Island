import { Vector3 } from 'three';
import { AWAKEN_TIME } from '../core/config.js';

const _ab = new Vector3();
const _ap = new Vector3();

function distanceToSegment( p, a, b ) {

	_ab.subVectors( b, a );
	_ap.subVectors( p, a );
	const len2 = _ab.lengthSq();
	const t = len2 > 0 ? Math.max( 0, Math.min( 1, _ap.dot( _ab ) / len2 ) ) : 0;
	return _ap.addScaledVector( _ab, - t ).length();

}

// A sleeping spirit bound to some geometry. Bloom follows the lantern's
// proximity in real time; holding the light close long enough wakes the
// spirit for good (it keeps a gentle partial bloom afterwards).
export class Spirit {

	/**
	 * @param {object} o
	 * @param {string} o.name
	 * @param {Array<[Vector3, Vector3]>} o.segments world-space focus segments
	 * @param {number} o.reach extra radius added to the mask radius
	 * @param {Array<{uBloom, uAwake}>} o.uniforms uniform sets to drive
	 * @param {Vector3} o.anchor where spirit orbs / chimes originate
	 */
	constructor( { name, segments, reach = 0.2, uniforms, anchor, pitch = 0, canAwaken = () => true } ) {

		this.name = name;
		this.segments = segments;
		this.reach = reach;
		this.uniforms = uniforms;
		this.anchor = anchor;
		this.pitch = pitch;
		this.canAwaken = canAwaken;
		this.bloom = 0;
		this.awake = 0;
		this.awakened = false;
		this.charge = 0;
		this.proximity = 0;
		this.distance = Infinity;

	}

	distanceTo( p ) {

		let d = Infinity;
		for ( const [ a, b ] of this.segments ) d = Math.min( d, distanceToSegment( p, a, b ) );
		return d;

	}

	update( dt, lanternPos, power, maskRadius, finale, allowAwaken = true ) {

		const d = this.distanceTo( lanternPos );
		this.distance = d;
		const reach = maskRadius + this.reach;
		const x = Math.min( 1, Math.max( 0, ( d - reach * 0.4 ) / ( reach * 0.6 ) ) );
		this.proximity = ( 1 - x * x * ( 3 - 2 * x ) ) * power;

		const rest = this.awake * 0.5 + finale * 0.5;
		const target = Math.max( this.proximity, rest );
		const rate = target > this.bloom ? 2.4 : 0.55;
		this.bloom += ( target - this.bloom ) * ( 1 - Math.exp( - rate * dt ) );

		let event = null;
		if ( ! this.awakened && allowAwaken && this.canAwaken() ) {

			this.charge += this.proximity > 0.55 ? dt * this.proximity : - dt * 0.35;
			this.charge = Math.max( 0, this.charge );
			if ( this.charge >= AWAKEN_TIME ) {

				this.awakened = true;
				event = 'awakened';

			}

		}

		if ( this.awakened ) this.awake = Math.min( 1, this.awake + dt * 0.5 );

		for ( const u of this.uniforms ) {

			u.uBloom.value = this.bloom;
			u.uAwake.value = this.awake;

		}

		return event;

	}

	get chargeRatio() {

		return this.awakened ? 1 : Math.min( 1, this.charge / AWAKEN_TIME );

	}

}
