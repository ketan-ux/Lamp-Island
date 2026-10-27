// Fully procedural Web Audio soundscape: pond and breeze bed, a seasonal drone,
// crickets in autumn / frogs and birds in spring, the wisp's crackle, a
// charging shimmer and spatialised bell chimes when spirits awaken.

const AUTUMN_SCALE = [ 220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66 ];
const SPRING_SCALE = [ 293.66, 329.63, 369.99, 440, 493.88, 587.33, 659.25, 739.99, 880, 987.77, 1174.66, 1318.51, 1479.98 ];

function noiseBuffer( ctx, seconds, brown = false ) {

	const len = Math.floor( ctx.sampleRate * seconds );
	const buf = ctx.createBuffer( 1, len, ctx.sampleRate );
	const d = buf.getChannelData( 0 );
	let last = 0;
	for ( let i = 0; i < len; i ++ ) {

		const w = Math.random() * 2 - 1;
		if ( brown ) {

			last = ( last + 0.02 * w ) / 1.02;
			d[ i ] = last * 3.5;

		} else d[ i ] = w;

	}

	return buf;

}

export class GroveAudio {

	constructor() {

		this.ctx = null;
		this.muted = false;
		this._timers = { critter: 1, crackle: 0.2 };

	}

	start() {

		if ( this.ctx ) {

			this.ctx.resume();
			return;

		}

		const AC = window.AudioContext || window.webkitAudioContext;
		if ( ! AC ) return;
		const ctx = this.ctx = new AC();

		this.master = ctx.createGain();
		this.master.gain.value = 0;
		const comp = ctx.createDynamicsCompressor();
		comp.threshold.value = - 18;
		comp.ratio.value = 3;
		this.master.connect( comp ).connect( ctx.destination );
		this.master.gain.linearRampToValueAtTime( 0.9, ctx.currentTime + 3 );

		this.white = noiseBuffer( ctx, 2 );
		this.brown = noiseBuffer( ctx, 4, true );

		// pond / breeze bed
		const bed = ctx.createBufferSource();
		bed.buffer = this.brown;
		bed.loop = true;
		const bedLp = ctx.createBiquadFilter();
		bedLp.type = 'lowpass';
		bedLp.frequency.value = 420;
		const bedGain = ctx.createGain();
		bedGain.gain.value = 0.22;
		bed.connect( bedLp ).connect( bedGain ).connect( this.master );
		bed.start();

		const breeze = ctx.createBufferSource();
		breeze.buffer = this.white;
		breeze.loop = true;
		const bp = ctx.createBiquadFilter();
		bp.type = 'bandpass';
		bp.frequency.value = 900;
		bp.Q.value = 0.7;
		this.breezeGain = ctx.createGain();
		this.breezeGain.gain.value = 0.012;
		breeze.connect( bp ).connect( this.breezeGain ).connect( this.master );
		breeze.start();
		const lfo = ctx.createOscillator();
		lfo.frequency.value = 0.07;
		const lfoGain = ctx.createGain();
		lfoGain.gain.value = 500;
		lfo.connect( lfoGain ).connect( bp.frequency );
		lfo.start();

		// seasonal drone: two chords crossfaded by the season value
		const droneLp = ctx.createBiquadFilter();
		droneLp.type = 'lowpass';
		droneLp.frequency.value = 700;
		droneLp.connect( this.master );
		this.droneLp = droneLp;
		this.autumnDrone = this._chord( [ 110, 164.81, 261.63 ], droneLp );
		this.springDrone = this._chord( [ 146.83, 220, 369.99 ], droneLp );

		// the wisp's voice (crackle + charging shimmer), positioned at the lantern
		this.wispPanner = this._panner();
		this.wispPanner.connect( this.master );
		this.crackleBus = ctx.createGain();
		this.crackleBus.gain.value = 0.5;
		const hp = ctx.createBiquadFilter();
		hp.type = 'highpass';
		hp.frequency.value = 2500;
		this.crackleBus.connect( hp ).connect( this.wispPanner );

		this.shimmerOsc = ctx.createOscillator();
		this.shimmerOsc.type = 'sine';
		this.shimmerOsc.frequency.value = 880;
		const trem = ctx.createOscillator();
		trem.frequency.value = 7;
		const tremGain = ctx.createGain();
		tremGain.gain.value = 0.3;
		this.shimmerGain = ctx.createGain();
		this.shimmerGain.gain.value = 0;
		const shimmerAmp = ctx.createGain();
		shimmerAmp.gain.value = 0.7;
		trem.connect( tremGain ).connect( shimmerAmp.gain );
		this.shimmerOsc.connect( shimmerAmp ).connect( this.shimmerGain ).connect( this.wispPanner );
		this.shimmerOsc.start();
		trem.start();

	}

	_chord( freqs, out ) {

		const ctx = this.ctx;
		const gain = ctx.createGain();
		gain.gain.value = 0;
		gain.connect( out );
		for ( const f of freqs ) {

			for ( const det of [ - 4, 4 ] ) {

				const o = ctx.createOscillator();
				o.type = 'triangle';
				o.frequency.value = f;
				o.detune.value = det;
				const g = ctx.createGain();
				g.gain.value = 0.05;
				o.connect( g ).connect( gain );
				o.start();

			}

		}

		return gain;

	}

	_panner() {

		const p = this.ctx.createPanner();
		p.panningModel = 'HRTF';
		p.distanceModel = 'inverse';
		p.refDistance = 0.6;
		p.rolloffFactor = 1.2;
		return p;

	}

	_place( panner, v ) {

		if ( panner.positionX ) {

			const t = this.ctx.currentTime;
			panner.positionX.setTargetAtTime( v.x, t, 0.02 );
			panner.positionY.setTargetAtTime( v.y, t, 0.02 );
			panner.positionZ.setTargetAtTime( v.z, t, 0.02 );

		} else panner.setPosition( v.x, v.y, v.z );

	}

	setListener( pos, forward, up ) {

		if ( ! this.ctx ) return;
		const l = this.ctx.listener;
		if ( l.positionX ) {

			const t = this.ctx.currentTime;
			l.positionX.setTargetAtTime( pos.x, t, 0.02 );
			l.positionY.setTargetAtTime( pos.y, t, 0.02 );
			l.positionZ.setTargetAtTime( pos.z, t, 0.02 );
			l.forwardX.setTargetAtTime( forward.x, t, 0.02 );
			l.forwardY.setTargetAtTime( forward.y, t, 0.02 );
			l.forwardZ.setTargetAtTime( forward.z, t, 0.02 );
			l.upX.setTargetAtTime( up.x, t, 0.02 );
			l.upY.setTargetAtTime( up.y, t, 0.02 );
			l.upZ.setTargetAtTime( up.z, t, 0.02 );

		} else {

			l.setPosition( pos.x, pos.y, pos.z );
			l.setOrientation( forward.x, forward.y, forward.z, up.x, up.y, up.z );

		}

	}

	update( dt, s ) {

		if ( ! this.ctx || this.ctx.state !== 'running' ) return;
		const t = this.ctx.currentTime;
		this.autumnDrone.gain.setTargetAtTime( ( 1 - s.season ) * ( 0.32 + s.finale * 0.4 ), t, 0.4 );
		this.springDrone.gain.setTargetAtTime( s.season * ( 0.32 + s.finale * 0.4 ), t, 0.4 );
		this.droneLp.frequency.setTargetAtTime( 500 + s.intensity * 400 + s.finale * 900, t, 0.5 );
		this._place( this.wispPanner, s.lanternPos );

		// charging shimmer, pitched to the spirit being woken
		this.shimmerGain.gain.setTargetAtTime( s.charging * 0.05, t, 0.08 );
		if ( s.chargePitch !== null ) {

			this.shimmerOsc.frequency.setTargetAtTime( this._freq( s.chargePitch, s.season ) * 2, t, 0.05 );

		}

		this._timers.crackle -= dt;
		if ( this._timers.crackle < 0 ) {

			this._timers.crackle = 0.04 + Math.random() * 0.25;
			this._crackle( 0.08 * s.intensity );

		}

		this._timers.critter -= dt;
		if ( this._timers.critter < 0 ) {

			this._timers.critter = 0.5 + Math.random() * 1.8;
			const spring = Math.random() < s.season;
			const pos = { x: ( Math.random() - 0.5 ) * 16, y: Math.random() * 2, z: ( Math.random() - 0.5 ) * 16 };
			if ( spring ) {

				if ( Math.random() < 0.55 ) this._frog( pos );
				else this._bird( pos );

			} else this._cricket( pos );

		}

	}

	_freq( index, season ) {

		const i = Math.max( 0, Math.min( AUTUMN_SCALE.length - 1, index ) );
		return season < 0.5 ? AUTUMN_SCALE[ i ] : SPRING_SCALE[ i ];

	}

	_crackle( level ) {

		const ctx = this.ctx;
		const src = ctx.createBufferSource();
		src.buffer = this.white;
		const g = ctx.createGain();
		const t = ctx.currentTime;
		g.gain.setValueAtTime( level * ( 0.3 + Math.random() ), t );
		g.gain.exponentialRampToValueAtTime( 0.0001, t + 0.015 + Math.random() * 0.02 );
		src.connect( g ).connect( this.crackleBus );
		src.start( t, Math.random() * 1.5, 0.05 );

	}

	_cricket( pos ) {

		const ctx = this.ctx;
		const p = this._panner();
		this._place( p, pos );
		p.connect( this.master );
		const o = ctx.createOscillator();
		o.frequency.value = 4100 + Math.random() * 600;
		const g = ctx.createGain();
		g.gain.value = 0;
		o.connect( g ).connect( p );
		let t = ctx.currentTime + 0.02;
		const pulses = 3 + Math.floor( Math.random() * 4 );
		for ( let i = 0; i < pulses; i ++ ) {

			g.gain.setValueAtTime( 0, t );
			g.gain.linearRampToValueAtTime( 0.03, t + 0.006 );
			g.gain.linearRampToValueAtTime( 0, t + 0.022 );
			t += 0.045;

		}

		o.start();
		o.stop( t + 0.05 );
		o.onended = () => p.disconnect();

	}

	_frog( pos ) {

		const ctx = this.ctx;
		const p = this._panner();
		this._place( p, pos );
		p.connect( this.master );
		const o = ctx.createOscillator();
		o.type = 'sawtooth';
		const f = ctx.createBiquadFilter();
		f.type = 'bandpass';
		f.frequency.value = 700;
		f.Q.value = 4;
		const g = ctx.createGain();
		const t = ctx.currentTime + 0.02;
		g.gain.setValueAtTime( 0, t );
		for ( let i = 0; i < 2; i ++ ) {

			const s = t + i * 0.16;
			o.frequency.setValueAtTime( 260, s );
			o.frequency.exponentialRampToValueAtTime( 140, s + 0.1 );
			g.gain.setValueAtTime( 0, s );
			g.gain.linearRampToValueAtTime( 0.05, s + 0.01 );
			g.gain.linearRampToValueAtTime( 0, s + 0.11 );

		}

		o.connect( f ).connect( g ).connect( p );
		o.start( t );
		o.stop( t + 0.4 );
		o.onended = () => p.disconnect();

	}

	_bird( pos ) {

		const ctx = this.ctx;
		const p = this._panner();
		this._place( p, { x: pos.x, y: 3 + Math.random() * 3, z: pos.z } );
		p.connect( this.master );
		const o = ctx.createOscillator();
		const g = ctx.createGain();
		const t = ctx.currentTime + 0.02;
		const notes = 2 + Math.floor( Math.random() * 3 );
		g.gain.setValueAtTime( 0, t );
		for ( let i = 0; i < notes; i ++ ) {

			const s = t + i * 0.14;
			const base = 2400 + Math.random() * 1200;
			o.frequency.setValueAtTime( base, s );
			o.frequency.exponentialRampToValueAtTime( base * 1.35, s + 0.09 );
			g.gain.setValueAtTime( 0, s );
			g.gain.linearRampToValueAtTime( 0.025, s + 0.02 );
			g.gain.linearRampToValueAtTime( 0, s + 0.1 );

		}

		o.connect( g ).connect( p );
		o.start( t );
		o.stop( t + notes * 0.14 + 0.1 );
		o.onended = () => p.disconnect();

	}

	// Struck bell made of inharmonic partials.
	chime( pos, index, season, level = 1 ) {

		if ( ! this.ctx ) return;
		const ctx = this.ctx;
		const p = this._panner();
		this._place( p, pos );
		p.connect( this.master );
		const f0 = this._freq( index, season );
		const t = ctx.currentTime + 0.01;
		const partials = [ [ 1, 1, 3.2 ], [ 2.76, 0.45, 1.8 ], [ 5.4, 0.25, 1.0 ], [ 8.93, 0.12, 0.6 ], [ 0.5, 0.3, 4 ] ];
		let end = 0;
		for ( const [ ratio, amp, decay ] of partials ) {

			const o = ctx.createOscillator();
			o.frequency.value = f0 * ratio;
			const g = ctx.createGain();
			g.gain.setValueAtTime( 0, t );
			g.gain.linearRampToValueAtTime( 0.14 * amp * level, t + 0.005 );
			g.gain.exponentialRampToValueAtTime( 0.0001, t + decay );
			o.connect( g ).connect( p );
			o.start( t );
			o.stop( t + decay + 0.05 );
			end = Math.max( end, decay );

		}

		setTimeout( () => p.disconnect(), ( end + 0.3 ) * 1000 );

	}

	finale( pos, season ) {

		if ( ! this.ctx ) return;
		[ 0, 2, 4, 7, 9, 11 ].forEach( ( n, i ) => setTimeout( () => this.chime( pos, n, season, 0.9 ), i * 280 ) );
		const ctx = this.ctx;
		const src = ctx.createBufferSource();
		src.buffer = this.white;
		const f = ctx.createBiquadFilter();
		f.type = 'bandpass';
		f.Q.value = 1.5;
		const g = ctx.createGain();
		const t = ctx.currentTime;
		f.frequency.setValueAtTime( 300, t );
		f.frequency.exponentialRampToValueAtTime( 4000, t + 4 );
		g.gain.setValueAtTime( 0, t );
		g.gain.linearRampToValueAtTime( 0.12, t + 2 );
		g.gain.linearRampToValueAtTime( 0, t + 5 );
		src.connect( f ).connect( g ).connect( this.master );
		src.loop = true;
		src.start( t );
		src.stop( t + 5.2 );

	}

	toggleMute() {

		if ( ! this.ctx ) return this.muted;
		this.muted = ! this.muted;
		this.master.gain.setTargetAtTime( this.muted ? 0 : 0.9, this.ctx.currentTime, 0.1 );
		return this.muted;

	}

	suspend() {

		this.ctx?.suspend();

	}

}
