// Season state driven by two gestures:
//  * TILT — rolling the lantern pours its light toward a season
//    (tip right → Spring cyan, tip left → Autumn amber); the value stays where
//    you leave it.
//  * SHIELD — cupping the flame with the off-hand dims it and, while covered,
//    the wisp turns to the opposite season; uncover it to reveal the change.

const DEADZONE = 0.22; // radians of tilt before pouring starts
const POUR_RATE = 0.95; // season units per second at full tilt
const SHIELD_RATE = 0.8;

export class SeasonController {

	constructor() {

		this.value = 0;
		this.far = 0;
		this.shield = 0;
		this.pouring = 0;
		this._target = null;

	}

	update( dt, tilt, shielding ) {

		const mag = Math.abs( tilt );
		const pour = mag > DEADZONE ? Math.sign( tilt ) * Math.min( 1, ( mag - DEADZONE ) / 0.55 ) : 0;
		this.pouring = pour;
		let v = this.value + pour * POUR_RATE * dt;

		const k = 1 - Math.exp( - ( shielding ? 7 : 4 ) * dt );
		this.shield += ( ( shielding ? 1 : 0 ) - this.shield ) * k;

		if ( shielding ) {

			if ( this._target === null ) this._target = this.value < 0.5 ? 1 : 0;
			const step = SHIELD_RATE * dt * this.shield;
			v += Math.max( - step, Math.min( step, this._target - v ) );

		} else {

			this._target = null;

		}

		this.value = Math.min( 1, Math.max( 0, v ) );
		this.far += ( this.value - this.far ) * ( 1 - Math.exp( - 0.7 * dt ) );

	}

}
