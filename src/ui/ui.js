// DOM overlay: title card, desktop HUD (spirit pips + season gauge), hints,
// toasts and the pause card. VR relies on diegetic feedback instead.

const $ = ( id ) => document.getElementById( id );

export class UI {

	constructor( total ) {

		this.overlay = $( 'overlay' );
		this.hud = $( 'hud' );
		this.pause = $( 'pause' );
		this.status = $( 'status' );
		this.vrButton = $( 'btn-vr' );
		this.desktopButton = $( 'btn-desktop' );
		this.hint = $( 'hint' );
		this.toastEl = $( 'toast' );
		this.marker = $( 'season-marker' );
		this.pips = [];
		const spirits = $( 'spirits' );
		for ( let i = 0; i <= total; i ++ ) {

			const pip = document.createElement( 'i' );
			if ( i === total ) pip.className = 'shrine';
			spirits.appendChild( pip );
			this.pips.push( pip );

		}

		this._toastTimer = 0;
		this._hintTimer = 0;
		this.hintsEnabled = true;

	}

	setStatus( text ) {

		this.status.textContent = text;

	}

	setReady( { vr, desktop = true } ) {

		this.vrButton.disabled = ! vr;
		this.vrButton.textContent = vr ? 'Enter VR' : 'VR not available here';
		this.desktopButton.disabled = ! desktop;
		this.desktopButton.classList.toggle( 'primary', ! vr );
		if ( ! vr ) this.vrButton.classList.remove( 'primary' );

	}

	showMenu( visible ) {

		this.overlay.classList.toggle( 'hidden', ! visible );

	}

	showHud( visible ) {

		this.hud.classList.toggle( 'hidden', ! visible );

	}

	showPause( visible ) {

		this.pause.classList.toggle( 'hidden', ! visible );

	}

	update( { awakened, total, shrine, season, glow } ) {

		this.marker.style.left = `${( season * 100 ).toFixed( 1 )}%`;
		this.hud.style.setProperty( '--glow', glow );
		for ( let i = 0; i < total; i ++ ) this.pips[ i ].classList.toggle( 'on', i < awakened );
		this.pips[ total ].classList.toggle( 'on', shrine );

	}

	toast( text, seconds = 3.5 ) {

		this.toastEl.textContent = text;
		this.toastEl.classList.add( 'show' );
		clearTimeout( this._toastTimer );
		this._toastTimer = setTimeout( () => this.toastEl.classList.remove( 'show' ), seconds * 1000 );

	}

	showHint( text, seconds = 6 ) {

		if ( ! this.hintsEnabled ) return;
		this.hint.textContent = text;
		this.hint.classList.add( 'show' );
		clearTimeout( this._hintTimer );
		this._hintTimer = setTimeout( () => this.hint.classList.remove( 'show' ), seconds * 1000 );

	}

	toggleHints() {

		this.hintsEnabled = ! this.hintsEnabled;
		if ( ! this.hintsEnabled ) this.hint.classList.remove( 'show' );
		return this.hintsEnabled;

	}

}
