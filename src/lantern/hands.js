import {
	CapsuleGeometry,
	Color,
	InstancedMesh,
	Mesh,
	MeshStandardMaterial,
	Object3D,
	SphereGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchLanternLit } from '../materials/maskedMaterial.js';

// The keeper's gloved off-hand. Local frame: palm faces +X, fingers point -Z,
// thumb up +Y (a left hand held naturally). Mirror with scale.x = -1 for the
// right hand. `curl` 0..1 bends the fingers into a cupping shield.

const GLOVE = new Color( 0x3b2a1f );

function fingerGeometry( length, radius ) {

	const g = new CapsuleGeometry( radius, length, 4, 8 );
	g.rotateX( Math.PI / 2 ); // along Z
	g.translate( 0, 0, - length / 2 );
	return g;

}

export class KeeperHand {

	constructor() {

		this.material = patchLanternLit( new MeshStandardMaterial( { color: GLOVE, roughness: 0.75 } ), { strength: 1, emissive: 0.04 } );
		this.root = new Object3D();

		const palm = new SphereGeometry( 1, 14, 10 );
		palm.scale( 0.016, 0.042, 0.048 );
		palm.translate( 0, 0, - 0.02 );
		const cuff = new CapsuleGeometry( 0.03, 0.04, 4, 10 );
		cuff.rotateX( Math.PI / 2 );
		cuff.scale( 0.75, 1, 1 );
		cuff.translate( - 0.004, 0, 0.05 );
		this.palm = new Mesh( mergeGeometries( [ palm, cuff ] ), this.material );
		this.palm.castShadow = true;
		this.root.add( this.palm );

		this.fingers = [];
		const specs = [ [ 0.03, 0.054 ], [ 0.01, 0.06 ], [ - 0.01, 0.056 ], [ - 0.028, 0.046 ] ];
		for ( const [ y, len ] of specs ) {

			const pivot = new Object3D();
			pivot.position.set( 0.002, y, - 0.062 );
			const f = new Mesh( fingerGeometry( len, 0.0085 ), this.material );
			f.castShadow = true;
			pivot.add( f );
			this.root.add( pivot );
			this.fingers.push( pivot );

		}

		this.thumb = new Object3D();
		this.thumb.position.set( 0.012, 0.035, - 0.015 );
		const t = new Mesh( fingerGeometry( 0.045, 0.0095 ), this.material );
		t.castShadow = true;
		this.thumb.add( t );
		this.root.add( this.thumb );

		this.setCurl( 0.2 );

	}

	setCurl( c ) {

		this.curl = c;
		this.fingers.forEach( ( f, i ) => f.rotation.set( 0, - ( 0.25 + c * 0.9 ) - i * 0.04, 0 ) );
		this.thumb.rotation.set( 0.4 + c * 0.3, - 0.5 - c * 0.5, 0 );

	}

	setMirrored( mirrored ) {

		this.root.scale.x = mirrored ? - 1 : 1;

	}

}

// Hand-tracking visual: one instanced draw of small knuckle beads per hand.
export class JointHands {

	constructor() {

		this.material = patchLanternLit( new MeshStandardMaterial( { color: GLOVE, roughness: 0.7 } ), { strength: 1, emissive: 0.05 } );
		this.mesh = new InstancedMesh( new SphereGeometry( 1, 8, 6 ), this.material, 50 );
		this.mesh.castShadow = true;
		this.mesh.frustumCulled = false;
		this.mesh.count = 0;
		this._o = new Object3D();

	}

	update( hands ) {

		let n = 0;
		for ( const hand of hands ) {

			if ( ! hand || ! hand.visible || ! hand.joints ) continue;
			for ( const name in hand.joints ) {

				const j = hand.joints[ name ];
				if ( ! j.visible ) continue;
				j.getWorldPosition( this._o.position );
				this._o.scale.setScalar( Math.max( 0.006, ( j.jointRadius || 0.008 ) * 1.05 ) );
				this._o.updateMatrix();
				this.mesh.setMatrixAt( n ++, this._o.matrix );
				if ( n >= 50 ) break;

			}

		}

		this.mesh.count = n;
		this.mesh.instanceMatrix.needsUpdate = true;

	}

}
