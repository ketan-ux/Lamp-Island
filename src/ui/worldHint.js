import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from 'three';

// Floating, softly glowing caption used inside the headset where the DOM HUD
// cannot be seen. It drifts to stay in front of the keeper's gaze.

const W = 1024, H = 192;

export class WorldHint {

	constructor() {

		this.canvas = document.createElement( 'canvas' );
		this.canvas.width = W;
		this.canvas.height = H;
		this.ctx = this.canvas.getContext( '2d' );
		this.texture = new CanvasTexture( this.canvas );
		this.texture.colorSpace = SRGBColorSpace;
		this.mesh = new Mesh( new PlaneGeometry( 1.0, H / W ), new MeshBasicMaterial( {
			map: this.texture,
			transparent: true,
			depthWrite: false,
			opacity: 0,
			toneMapped: false,
		} ) );
		this.mesh.renderOrder = 30;
		this.mesh.visible = false;
		this.timer = 0;
		this.opacity = 0;
		this._target = new Vector3();
		this._placed = false;

	}

	show( text, seconds = 7 ) {

		const ctx = this.ctx;
		ctx.clearRect( 0, 0, W, H );
		ctx.font = 'italic 500 54px "Cormorant Garamond", Georgia, serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		const lines = wrap( ctx, text, W - 80 );
		lines.forEach( ( line, i ) => {

			const y = H / 2 + ( i - ( lines.length - 1 ) / 2 ) * 62;
			ctx.shadowColor = 'rgba(255, 190, 110, 0.9)';
			ctx.shadowBlur = 18;
			ctx.fillStyle = 'rgba(255, 244, 225, 0.95)';
			ctx.fillText( line, W / 2, y );

		} );
		this.texture.needsUpdate = true;
		this.timer = seconds;
		this.mesh.visible = true;

	}

	hide() {

		this.timer = 0;

	}

	update( dt, head, forward ) {

		this.timer -= dt;
		const target = this.timer > 0 ? 1 : 0;
		this.opacity += ( target - this.opacity ) * ( 1 - Math.exp( - 3 * dt ) );
		this.mesh.material.opacity = this.opacity;
		this.mesh.visible = this.opacity > 0.01;
		if ( ! this.mesh.visible ) {

			this._placed = false;
			return;

		}

		// hold slightly below eye level, 1.3 m ahead, lazily following the gaze
		const flat = this._target.set( forward.x, 0, forward.z );
		if ( flat.lengthSq() < 1e-4 ) flat.set( 0, 0, - 1 );
		flat.normalize().multiplyScalar( 1.3 ).add( head );
		flat.y = head.y - 0.18;
		if ( ! this._placed ) {

			this.mesh.position.copy( flat );
			this._placed = true;

		} else this.mesh.position.lerp( flat, 1 - Math.exp( - 1.5 * dt ) );

		this.mesh.lookAt( head );

	}

}

function wrap( ctx, text, max ) {

	const words = text.split( ' ' );
	const lines = [];
	let line = '';
	for ( const w of words ) {

		const test = line ? `${line} ${w}` : w;
		if ( ctx.measureText( test ).width > max && line ) {

			lines.push( line );
			line = w;

		} else line = test;

	}

	if ( line ) lines.push( line );
	return lines.slice( 0, 2 );

}
