import {
	ACESFilmicToneMapping,
	Color,
	Group,
	HalfFloatType,
	HemisphereLight,
	PCFShadowMap,
	PerspectiveCamera,
	Scene,
	Timer,
	Vector2,
	Vector3,
	WebGLRenderTarget,
	WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { AUTUMN_LIGHT, G, SPRING_LIGHT } from './core/uniforms.js';
import { MASK_RADIUS, MASK_RADIUS_SHIELDED, QUALITY } from './core/config.js';
import { bakeTextureSets, createGlyphAtlas } from './materials/textures.js';
import { createForest, createLilyPads, createReeds, createSky, createWater } from './world/environment.js';
import { createIsland } from './world/island.js';
import { createGrove } from './world/grove.js';
import { POINT_SCALE, SpiritOrbs, createDrift, createFireflies, createSkyLanterns } from './world/particles.js';
import { createTotems } from './interactables/totems.js';
import { createRoots } from './interactables/roots.js';
import { createFlowers } from './interactables/flowers.js';
import { createShrine } from './interactables/shrine.js';
import { Lantern } from './lantern/lantern.js';
import { JointHands, KeeperHand } from './lantern/hands.js';
import { SeasonController } from './lantern/season.js';
import { DesktopInput } from './input/desktop.js';
import { XRInput } from './input/xr.js';
import { GroveAudio } from './audio/audio.js';
import { UI } from './ui/ui.js';
import { WorldHint } from './ui/worldHint.js';

const GROVE_SPIRITS = 12;
const params = new URLSearchParams( location.search );
// `?fast` lets slow (software-rendered) test runs take larger time steps.
const MAX_DT = params.has( 'fast' ) ? 0.25 : 0.05;
const ui = new UI( GROVE_SPIRITS );
const nextFrame = () => new Promise( ( r ) => requestAnimationFrame( () => r() ) );

// --- renderer ---------------------------------------------------------------

let renderer;
try {

	renderer = new WebGLRenderer( { antialias: true, powerPreference: 'high-performance' } );

} catch ( e ) {

	ui.setStatus( 'WebGL 2 is required to light the lantern. Please try a recent browser.' );
	throw e;

}

let pixelRatio = Math.min( window.devicePixelRatio, QUALITY.desktop.maxPixelRatio );
renderer.setPixelRatio( pixelRatio );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFShadowMap;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType( 'local-floor' );
document.body.prepend( renderer.domElement );

const scene = new Scene();
const camera = new PerspectiveCamera( 70, window.innerWidth / window.innerHeight, 0.03, 220 );
const rig = new Group();
rig.add( camera );
scene.add( rig );
camera.position.set( 0, 1.62, 0 );

// Faint moonlight fill. The lantern's spot light is the only dynamic,
// shadow-casting light in the scene.
scene.add( new HemisphereLight( 0x6f8fb0, 0x0c100c, 0.35 ) );

// MSAA render target so the desktop post chain keeps antialiasing.
const composer = new EffectComposer( renderer, new WebGLRenderTarget( window.innerWidth, window.innerHeight, { type: HalfFloatType, samples: 4 } ) );
composer.addPass( new RenderPass( scene, camera ) );
const bloomPass = new UnrealBloomPass( new Vector2( window.innerWidth, window.innerHeight ), 0.42, 0.6, 0.85 );
composer.addPass( bloomPass );
composer.addPass( new OutputPass() );

// --- state ------------------------------------------------------------------

const audio = new GroveAudio();
const season = new SeasonController();
const timer = new Timer();
timer.connect( document );
const desktop = new DesktopInput( renderer.domElement, camera, rig );
const xr = new XRInput( renderer, rig );
let mode = 'menu';
let world = null;

const state = {
	time: 0,
	arrived: 0,
	awakened: 0,
	finale: 0,
	finaleActive: false,
	finaleTime: 0,
	hapticTimer: 0,
	hints: new Set(),
	frameTimes: [],
	resTimer: 0,
};

const worldHint = new WorldHint();
scene.add( worldHint.mesh );

const GUIDE = {
	start: {
		desktop: 'Hold left click to reach the lantern toward a sleeping stone, root or paper lotus.',
		vr: 'Bring the lantern close to a sleeping stone, root or paper lotus.',
	},
	stir: { desktop: 'Hold the light close… the spirit is stirring.', vr: 'Hold the light close… the spirit is stirring.', seconds: 4 },
	tilt: {
		desktop: 'Press Q / E (or roll the wheel) to tilt the lantern and pour Autumn amber or Spring cyan.',
		vr: 'Roll your wrist to tilt the lantern: right pours Spring, left pours Autumn.',
		delay: 3.5,
	},
	shield: {
		desktop: 'Hold right click or Space to cup the flame with your other hand — the season turns while it is shielded.',
		vr: 'Cup the flame with your other hand — the season turns while it is shielded.',
		delay: 4,
	},
	shrine: {
		desktop: 'All twelve spirits are awake. Bring the wisp to the mirror in the shrine.',
		vr: 'All twelve spirits are awake. Bring the wisp to the shrine\'s mirror.',
		seconds: 9,
	},
};

// Each tip is shown once, as a HUD hint on desktop or a floating caption in VR.
function guide( key ) {

	if ( state.hints.has( key ) || mode === 'menu' ) return;
	state.hints.add( key );
	const g = GUIDE[ key ];
	const show = () => {

		if ( mode === 'xr' ) worldHint.show( g.vr, g.seconds || 7 );
		else if ( mode === 'desktop' ) ui.showHint( g.desktop, g.seconds || 8 );

	};

	if ( g.delay ) setTimeout( show, g.delay * 1000 );
	else show();

}

// Big story beats: centred toast on desktop, caption in VR.
function announce( text, seconds = 3.5 ) {

	if ( mode === 'xr' ) worldHint.show( text, seconds + 1 );
	else if ( mode === 'desktop' ) ui.toast( text, seconds );

}

const lightColor = new Color();
const view = { head: new Vector3(), right: new Vector3( 1, 0, 0 ), forward: new Vector3( 0, 0, - 1 ) };

// --- build ------------------------------------------------------------------

async function init() {

	ui.setStatus( 'Weaving the grove…' );
	await nextFrame();

	const glyphs = createGlyphAtlas();
	const textures = bakeTextureSets( renderer, {
		glyphs,
		anisotropy: Math.min( 8, renderer.capabilities.getMaxAnisotropy() ),
	} );

	scene.add( createSky(), createWater(), createForest(), createReeds(), createLilyPads() );
	const island = createIsland( textures, glyphs );
	const grove = createGrove( textures );
	const totems = createTotems( textures );
	const roots = createRoots( textures );
	const flowers = createFlowers( textures );
	const spirits = [ ...totems.spirits, ...roots.spirits, ...flowers.spirits ];
	const shrine = createShrine( textures, () => state.arrived >= spirits.length );
	scene.add( island.group, grove.group, totems.group, roots.group, flowers.group, shrine.group );

	const fireflies = createFireflies();
	const drift = createDrift();
	const orbs = new SpiritOrbs();
	const skyLanterns = createSkyLanterns();
	scene.add( fireflies, drift, orbs.points, skyLanterns.mesh );

	const lantern = new Lantern( renderer, scene );
	lantern.setShadowMapSize( QUALITY.desktop.shadowMapSize );
	lantern.setHaloStrength( 0.3 );

	const offHand = new KeeperHand();
	offHand.root.visible = false;
	scene.add( offHand.root );
	const jointHands = new JointHands();
	scene.add( jointHands.mesh );

	world = { textures, island, grove, totems, roots, flowers, shrine, spirits, all: [ ...spirits, shrine.spirit ], fireflies, drift, orbs, skyLanterns, lantern, offHand, jointHands };

	ui.setStatus( 'Waking the shaders…' );
	await nextFrame();
	try {

		await renderer.compileAsync( scene, camera );

	} catch ( e ) {

		console.warn( 'Shader precompile skipped:', e );

	}

	const vr = await navigator.xr?.isSessionSupported?.( 'immersive-vr' ).catch( () => false );
	ui.setReady( { vr: !! vr } );
	ui.setStatus( vr ? 'Headset detected. Step onto the island when ready.' : 'No headset found — the desktop path is fully playable.' );

	if ( params.has( 'debug' ) ) {

		window.__lk = { desktop, xr, season, state, world, G, renderer, scene, camera, setMode: ( m ) => ( mode = m ) };

	}

	renderer.setAnimationLoop( frame );

}

// --- modes ------------------------------------------------------------------

ui.desktopButton.addEventListener( 'click', () => {

	audio.start();
	mode = 'desktop';
	ui.showMenu( false );
	ui.showHud( true );
	desktop.enabled = true;
	desktop.resetPose();
	desktop.lock();
	guide( 'start' );

} );

ui.vrButton.addEventListener( 'click', async () => {

	audio.start();
	try {

		renderer.xr.setFramebufferScaleFactor( QUALITY.xr.framebufferScale );
		const session = await navigator.xr.requestSession( 'immersive-vr', {
			optionalFeatures: [ 'local-floor', 'bounded-floor', 'hand-tracking', 'layers' ],
		} );
		await renderer.xr.setSession( session );

	} catch ( e ) {

		ui.setStatus( `Could not start VR: ${e.message}` );

	}

} );

ui.pause.addEventListener( 'click', () => {

	ui.showPause( false );
	desktop.lock();

} );

desktop.onUnlock = () => {

	if ( mode === 'desktop' ) ui.showPause( true );

};

desktop.onKey = ( code ) => {

	if ( code === 'KeyM' ) ui.showHint( audio.toggleMute() ? 'Sound muted.' : 'Sound on.', 2 );
	if ( code === 'KeyH' ) ui.toggleHints();

};

renderer.xr.addEventListener( 'sessionstart', () => {

	mode = 'xr';
	ui.showMenu( false );
	ui.showHud( false );
	ui.showPause( false );
	desktop.enabled = false;
	if ( document.pointerLockElement ) document.exitPointerLock();
	xr.reset();
	camera.position.set( 0, 0, 0 );
	camera.rotation.set( 0, 0, 0 );
	renderer.xr.setFoveation( QUALITY.xr.foveation );
	world.lantern.setShadowMapSize( QUALITY.xr.shadowMapSize );
	world.lantern.setHaloStrength( 1 );
	const layer = renderer.xr.getBaseLayer?.();
	POINT_SCALE.value = ( ( layer && ( layer.textureHeight || layer.framebufferHeight ) ) || 1800 ) / 2;
	state.hints.clear();
	setTimeout( () => guide( 'start' ), 1500 );

} );

renderer.xr.addEventListener( 'sessionend', () => {

	mode = 'menu';
	ui.showMenu( true );
	xr.reset();
	camera.position.set( 0, 1.62, 0 );
	world.lantern.setShadowMapSize( QUALITY.desktop.shadowMapSize );
	world.lantern.setHaloStrength( 0.3 );
	world.offHand.root.removeFromParent();
	scene.add( world.offHand.root );
	worldHint.hide();
	state.hints.clear();
	onResize();

} );

xr.onSwap = ( slot, byKeeper ) => {

	world?.lantern.snap();
	if ( byKeeper ) audio.chime( world.lantern.wisp, 5, season.value, 0.25 );

};

function onResize() {

	if ( renderer.xr.isPresenting ) return;
	const w = window.innerWidth, h = window.innerHeight;
	camera.aspect = w / h;
	camera.updateProjectionMatrix();
	renderer.setPixelRatio( pixelRatio );
	renderer.setSize( w, h );
	composer.setPixelRatio( pixelRatio );
	composer.setSize( w, h );
	POINT_SCALE.value = h * pixelRatio / 2;

}

window.addEventListener( 'resize', onResize );
onResize();

// --- per-frame ----------------------------------------------------------------

function attractPose( t ) {

	// Menu backdrop: the lantern drifts around the island on its own.
	rig.position.set( 0, 0, 0 );
	rig.rotation.set( 0, Math.sin( t * 0.05 ) * 0.35, 0 );
	camera.position.set( 0, 1.62, 0.35 );
	camera.rotation.set( - 0.3, 0, 0 );
	rig.updateMatrixWorld( true );
	const a = t * 0.21;
	const grip = new Vector3( Math.sin( a ) * 1.0, 0.62 + Math.sin( t * 0.37 ) * 0.22, - 0.55 + Math.cos( a ) * 0.65 );
	return {
		gripPos: grip,
		yaw: rig.rotation.y,
		roll: Math.sin( t * 0.13 ) * 0.75,
		shielding: false,
		head: camera.getWorldPosition( new Vector3() ),
		forward: camera.getWorldDirection( new Vector3() ),
		right: new Vector3( 1, 0, 0 ).applyQuaternion( rig.quaternion ),
	};

}

function nearestSleeping( from ) {

	let best = null, bestD = Infinity;
	for ( const s of world.all ) {

		if ( s.awakened || ! s.canAwaken() ) continue;
		const d = s.distanceTo( from );
		if ( d < bestD ) {

			bestD = d;
			best = s;

		}

	}

	return best;

}

function onAwaken( spirit ) {

	const w = world;
	state.awakened ++;
	audio.chime( spirit.anchor, spirit.pitch, season.value );
	if ( mode === 'xr' ) xr.pulse( xr.lantern, 0.85, 140 );
	if ( spirit === w.shrine.spirit ) {

		startFinale();
		return;

	}

	announce( `${spirit.name} awakens` );
	w.orbs.launch( spirit.anchor, w.shrine.orbTarget, () => {

		state.arrived ++;
		audio.chime( w.shrine.orbTarget, state.arrived, season.value, 0.45 );
		if ( state.arrived === w.spirits.length ) {

			if ( mode === 'desktop' ) ui.toast( 'The shrine is listening…' );
			guide( 'shrine' );
			if ( mode === 'xr' ) xr.pulse( xr.lantern, 0.5, 300 );

		}

	} );

	guide( 'tilt' );

}

function startFinale() {

	if ( state.finaleActive ) return;
	state.finaleActive = true;
	audio.finale( world.shrine.orbTarget, season.value );
	announce( 'The grove remembers. Thank you, Lantern Keeper.', 8 );
	if ( mode === 'xr' ) xr.pulse( xr.lantern, 1, 400 );

}

const _fwd = new Vector3();
const _up = new Vector3();

function frame( timestamp ) {

	timer.update( timestamp );
	const dt = Math.min( timer.getDelta(), MAX_DT );
	state.time += dt;
	const t = state.time;
	const w = world;
	G.uTime.value = t;

	// 1. input → lantern pose
	let pose;
	if ( mode === 'xr' ) {

		pose = xr.update( dt, camera, w.lantern.wisp );
		if ( ! pose.gripPos ) {

			// no tracked hand yet: float the lantern in front of the head
			pose.gripPos = pose.head.clone().addScaledVector( pose.forward, 0.45 ).add( new Vector3( 0, - 0.2, 0 ) );
			pose.yaw = Math.atan2( - pose.forward.x, - pose.forward.z );
			pose.roll = 0;

		}

	} else if ( mode === 'desktop' ) {

		pose = desktop.update( dt, w.all );

	} else {

		pose = attractPose( t );

	}

	view.head.copy( pose.head );
	view.right.copy( pose.right );
	view.forward.copy( pose.forward );

	const sleeping = nearestSleeping( w.lantern.wisp );
	w.lantern.update( dt, pose, view, sleeping?.anchor );

	// 2. season & light
	season.update( dt, w.lantern.tilt, pose.shielding );
	const flicker = 1 + 0.03 * Math.sin( t * 11.3 ) * Math.sin( t * 7.1 + 1.3 ) + 0.015 * Math.sin( t * 23.7 );
	const intensity = flicker * ( 1 - 0.62 * season.shield ) * ( 1 + 0.25 * state.finale );
	lightColor.copy( AUTUMN_LIGHT ).lerp( SPRING_LIGHT, season.value );
	G.uSeason.value = season.value;
	G.uSeasonFar.value = season.far;
	G.uLanternPos.value.copy( w.lantern.wisp );
	G.uLanternColor.value.copy( lightColor );
	G.uLanternIntensity.value = intensity;
	G.uMaskRadius.value = ( MASK_RADIUS + ( MASK_RADIUS_SHIELDED - MASK_RADIUS ) * season.shield ) * ( 1 + 0.2 * state.finale );
	w.lantern.applyLight( lightColor, intensity );

	// 3. spirits
	const power = 1 - 0.5 * season.shield;
	let charging = 0, chargePitch = null, maxProx = 0;
	for ( const s of w.all ) {

		const ev = s.update( dt, w.lantern.wisp, power, G.uMaskRadius.value, state.finale, mode !== 'menu' );
		if ( ev === 'awakened' ) onAwaken( s );
		maxProx = Math.max( maxProx, s.proximity );
		if ( ! s.awakened && s.proximity > 0.5 && s.chargeRatio > charging ) {

			charging = s.chargeRatio;
			chargePitch = s.pitch;

		}

	}

	G.uProgress.value += ( state.arrived / w.spirits.length - G.uProgress.value ) * ( 1 - Math.exp( - 3 * dt ) );
	const ready = state.arrived >= w.spirits.length ? 1 : 0;
	const mirror = w.shrine.mirrorUniforms;
	mirror.uReady.value += ( ready - mirror.uReady.value ) * ( 1 - Math.exp( - 2 * dt ) );

	if ( state.finaleActive ) {

		state.finale = Math.min( 1, state.finale + dt / 6 );
		state.finaleTime += dt;

	}

	G.uFinale.value = state.finale;
	w.skyLanterns.finaleTime.value = state.finaleTime;
	w.island.awake.value = state.finale;
	w.grove.awake.value = state.finale;
	mirror.uLit.value = state.finale;

	w.orbs.update( dt );
	w.flowers.update( t );

	// 4. hands
	updateHands( dt, pose );

	// 5. feedback
	if ( mode === 'xr' && charging > 0 ) {

		state.hapticTimer -= dt;
		if ( state.hapticTimer < 0 ) {

			state.hapticTimer = 0.22;
			xr.pulse( xr.lantern, 0.06 + 0.3 * charging, 18 );

		}

	}

	if ( maxProx > 0.6 && state.awakened === 0 ) guide( 'stir' );
	if ( state.hints.has( 'tilt' ) && Math.abs( season.pouring ) > 0.5 ) guide( 'shield' );
	worldHint.update( dt, pose.head, pose.forward );

	if ( mode === 'desktop' ) {

		const g = lightColor.clone().convertLinearToSRGB();
		ui.update( {
			awakened: state.arrived,
			total: w.spirits.length,
			shrine: w.shrine.spirit.awakened,
			season: season.value,
			glow: `rgb(${Math.round( g.r * 255 )}, ${Math.round( g.g * 255 )}, ${Math.round( g.b * 255 )})`,
		} );

	}

	if ( mode !== 'menu' ) {

		_fwd.copy( pose.forward );
		_up.set( 0, 1, 0 );
		audio.setListener( pose.head, _fwd, _up );
		audio.update( dt, {
			season: season.value,
			intensity,
			finale: state.finale,
			lanternPos: w.lantern.wisp,
			charging,
			chargePitch,
		} );

	}

	// 6. render
	if ( renderer.xr.isPresenting ) {

		renderer.render( scene, camera );

	} else {

		adaptResolution( dt );
		composer.render( dt );

	}

}

function updateHands( dt, pose ) {

	const { offHand, jointHands } = world;
	if ( mode === 'xr' ) {

		const tracking = xr.isHandTracking;
		jointHands.mesh.visible = tracking;
		if ( tracking ) jointHands.update( xr.slots.map( ( s ) => s.hand ) );
		const off = xr.offHand;
		if ( ! tracking && off ) {

			if ( offHand.root.parent !== off.grip ) off.grip.add( offHand.root );
			offHand.root.position.set( 0, 0, 0 );
			offHand.root.quaternion.identity();
			offHand.setMirrored( off.handedness === 'right' );
			offHand.root.visible = true;
			offHand.setCurl( pose.shielding ? 0.85 : 0.35 );

		} else offHand.root.visible = false;
		return;

	}

	jointHands.mesh.visible = false;
	if ( offHand.root.parent !== scene ) scene.add( offHand.root );
	const s = mode === 'desktop' ? desktop.shieldAmount : 0;
	offHand.root.visible = s > 0.02;
	if ( offHand.root.visible ) {

		offHand.root.position.copy( desktop.handPos );
		offHand.root.quaternion.copy( desktop.handQuat );
		offHand.setMirrored( false );
		offHand.setCurl( 0.25 + 0.6 * s );

	}

}

// Desktop dynamic resolution: trade pixels for a steady frame rate.
function adaptResolution( dt ) {

	state.frameTimes.push( dt );
	state.resTimer += dt;
	if ( state.resTimer < 2 ) return;
	const avg = state.frameTimes.reduce( ( a, b ) => a + b, 0 ) / state.frameTimes.length;
	state.frameTimes.length = 0;
	state.resTimer = 0;
	const max = Math.min( window.devicePixelRatio, QUALITY.desktop.maxPixelRatio );
	let next = pixelRatio;
	if ( avg > 1 / 45 && pixelRatio > 0.75 ) next = Math.max( 0.75, pixelRatio - 0.25 );
	else if ( avg < 1 / 80 && pixelRatio < max ) next = Math.min( max, pixelRatio + 0.25 );
	if ( next !== pixelRatio ) {

		pixelRatio = next;
		onResize();

	}

}

init().catch( ( e ) => {

	console.error( e );
	ui.setStatus( `Something went wrong while building the grove: ${e.message}` );

} );
