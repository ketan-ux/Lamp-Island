import {
	CanvasTexture,
	LinearFilter,
	LinearMipmapLinearFilter,
	Mesh,
	OrthographicCamera,
	PlaneGeometry,
	RepeatWrapping,
	SRGBColorSpace,
	Scene,
	ShaderMaterial,
	WebGLRenderTarget,
} from 'three';
import { mulberry32 } from '../core/random.js';

// Procedural texture sets, baked once at load on the GPU into mipmapped
// render targets. Every surface kind gets two sets — DORMANT and BLOOM — and the
// lantern's spherical mask blends between them per fragment.
//
// RGB = albedo (stored sRGB, sampled linear). Alpha = emissive mask in the bloom
// set (spirit carvings, glowing veins, moss sparks); unused in the dormant set.

const GEN_COMMON = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uSeed;
uniform sampler2D uGlyphs;

float h2( vec2 p ) {
	vec3 p3 = fract( vec3( p.xyx + uSeed * 17.31 ) * 0.1031 );
	p3 += dot( p3, p3.yzx + 33.33 );
	return fract( ( p3.x + p3.y ) * p3.z );
}
vec2 h22( vec2 p ) {
	vec3 p3 = fract( vec3( p.xyx + uSeed * 9.17 ) * vec3( 0.1031, 0.1030, 0.0973 ) );
	p3 += dot( p3, p3.yzx + 33.33 );
	return fract( ( p3.xx + p3.yz ) * p3.zy );
}
// Periodic value noise: lattice wraps every 'period' cells so textures tile.
float pnoise( vec2 p, vec2 period ) {
	vec2 i = floor( p );
	vec2 f = fract( p );
	vec2 u = f * f * ( 3.0 - 2.0 * f );
	vec2 i0 = mod( i, period );
	vec2 i1 = mod( i + 1.0, period );
	float a = h2( i0 );
	float b = h2( vec2( i1.x, i0.y ) );
	float c = h2( vec2( i0.x, i1.y ) );
	float d = h2( i1 );
	return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}
float fbm( vec2 uv, vec2 freq, int oct ) {
	float s = 0.0;
	float a = 0.5;
	float n = 0.0;
	for ( int i = 0; i < 7; i ++ ) {
		if ( i >= oct ) break;
		s += a * pnoise( uv * freq, freq );
		n += a;
		a *= 0.5;
		freq *= 2.0;
	}
	return s / n;
}
// Periodic Voronoi: x = distance to nearest feature, y = distance to cell edge.
vec2 voronoi( vec2 uv, vec2 freq ) {
	vec2 p = uv * freq;
	vec2 i = floor( p );
	vec2 f = fract( p );
	vec2 mg;
	vec2 mr;
	float md = 8.0;
	for ( int y = - 1; y <= 1; y ++ ) for ( int x = - 1; x <= 1; x ++ ) {
		vec2 g = vec2( float( x ), float( y ) );
		vec2 o = h22( mod( i + g, freq ) );
		vec2 r = g + o - f;
		float d = dot( r, r );
		if ( d < md ) { md = d; mr = r; mg = g; }
	}
	float ed = 8.0;
	for ( int y = - 2; y <= 2; y ++ ) for ( int x = - 2; x <= 2; x ++ ) {
		vec2 g = mg + vec2( float( x ), float( y ) );
		vec2 o = h22( mod( i + g, freq ) );
		vec2 r = g + o - f;
		if ( dot( mr - r, mr - r ) > 0.00001 ) ed = min( ed, dot( 0.5 * ( mr + r ), normalize( r - mr ) ) );
	}
	return vec2( sqrt( md ), ed );
}
float glyph( vec2 uv ) {
	return texture2D( uGlyphs, uv ).r;
}
`;

// --- per-kind generators -----------------------------------------------------

const STONE = /* glsl */ `
vec4 gen( vec2 uv ) {
	float base = fbm( uv, vec2( 6.0 ), 6 );
	float tone = fbm( uv + 0.37, vec2( 3.0 ), 3 );
	vec2 vor = voronoi( uv + 0.1 * vec2( fbm( uv + 3.0, vec2( 4.0 ), 3 ), fbm( uv + 6.0, vec2( 4.0 ), 3 ) ), vec2( 3.0 ) );
	float crack = ( 1.0 - smoothstep( 0.0, 0.018, vor.y ) ) * smoothstep( 0.35, 0.6, fbm( uv + 9.0, vec2( 3.0 ), 3 ) );
	vec3 c = mix( vec3( 0.05, 0.055, 0.06 ), vec3( 0.16, 0.16, 0.155 ), base );
	c *= ( 0.85 + 0.3 * tone ) * ( 0.8 + 0.4 * fbm( uv + 5.5, vec2( 96.0 ), 3 ) );
	float lichen = smoothstep( 0.58, 0.68, fbm( uv + 4.1, vec2( 9.0 ), 4 ) );
	float speck = step( 0.985, h2( floor( uv * 220.0 ) ) );
#ifdef BLOOM
	float g = glyph( uv );
	float moss = smoothstep( 0.46, 0.62, fbm( uv + 1.7, vec2( 4.0 ), 5 ) ) * ( 1.0 - g );
	c = mix( c, vec3( 0.1, 0.095, 0.085 ), lichen * 0.4 );
	c *= 1.0 - 0.3 * crack;
	vec3 mossCol = mix( vec3( 0.025, 0.09, 0.012 ), vec3( 0.07, 0.2, 0.03 ), fbm( uv + 7.3, vec2( 24.0 ), 3 ) );
	c = mix( c, mossCol, moss );
	c *= 1.0 - 0.6 * g;
	float spark = speck * moss;
	c = mix( c, vec3( 0.9, 0.85, 0.7 ), spark );
	return vec4( c, clamp( g + spark * 0.8, 0.0, 1.0 ) );
#else
	c = mix( c, vec3( 0.14, 0.15, 0.13 ), lichen * 0.75 );
	c *= 1.0 - 0.4 * crack;
	float dead = smoothstep( 0.55, 0.7, fbm( uv + 1.7, vec2( 4.0 ), 5 ) );
	c = mix( c, vec3( 0.06, 0.045, 0.03 ), dead * 0.8 );
	return vec4( c * 0.8, 0.0 );
#endif
}
`;

const GROUND = /* glsl */ `
vec4 gen( vec2 uv ) {
	vec2 vor = voronoi( uv, vec2( 4.0 ) );
	float gap = 1.0 - smoothstep( 0.02, 0.09, vor.y );
	float base = fbm( uv, vec2( 8.0 ), 6 );
	float grain = fbm( uv + 4.4, vec2( 96.0 ), 3 ) - 0.5;
	float slabTone = h2( floor( uv * 4.0 + vor.x ) );
	vec3 stone = mix( vec3( 0.04, 0.045, 0.048 ), vec3( 0.12, 0.12, 0.115 ), base ) * ( 0.8 + 0.35 * slabTone ) * ( 1.0 + grain * 0.5 );
	float patchN = fbm( uv + 2.3, vec2( 5.0 ), 5 );
	// fallen leaves / needles: small elongated cells with their own tone
	vec2 leafVor = voronoi( uv + 0.004 * fbm( uv, vec2( 16.0 ), 2 ), vec2( 36.0, 25.0 ) );
	float leafEdge = smoothstep( 0.0, 0.06, leafVor.y );
	float leafTone = h2( floor( uv * vec2( 36.0, 25.0 ) + leafVor.x * 3.0 ) );
#ifdef BLOOM
	float moss = clamp( smoothstep( 0.35, 0.55, patchN ) + gap, 0.0, 1.0 );
	float tuft = fbm( uv + 9.1, vec2( 64.0 ), 4 );
	float fuzz = fbm( uv + 1.2, vec2( 160.0 ), 2 );
	vec3 mossCol = mix( vec3( 0.015, 0.05, 0.008 ), vec3( 0.09, 0.24, 0.035 ), tuft ) * ( 0.75 + 0.5 * fuzz );
	vec3 c = mix( stone * 0.9, mossCol, moss );
	vec2 sp = floor( uv * 160.0 );
	float r = h2( sp );
	vec2 local = fract( uv * 160.0 ) - 0.5;
	float dotMask = 1.0 - smoothstep( 0.18, 0.32, length( local ) );
	float spark = step( 0.965, r ) * dotMask * moss;
	c = mix( c, mix( vec3( 0.95, 0.8, 0.9 ), vec3( 0.9, 0.95, 1.0 ), h2( sp + 3.0 ) ), spark );
	return vec4( c, spark );
#else
	float litter = clamp( smoothstep( 0.42, 0.6, patchN ) + gap * 0.8, 0.0, 1.0 );
	vec3 leafCol = mix( vec3( 0.03, 0.02, 0.012 ), vec3( 0.1, 0.065, 0.03 ), leafTone ) * mix( 0.45, 1.0, leafEdge );
	vec3 c = mix( stone, leafCol, litter );
	return vec4( c * 0.85, 0.0 );
#endif
}
`;

const BARK = /* glsl */ `
vec4 gen( vec2 uv ) {
	// plated bark: vertically elongated plates split by deep furrows
	vec2 warp = vec2( fbm( uv + 1.3, vec2( 4.0, 2.0 ), 3 ), fbm( uv + 7.7, vec2( 4.0, 2.0 ), 3 ) ) - 0.5;
	vec2 vor = voronoi( uv + warp * vec2( 0.05, 0.12 ), vec2( 9.0, 3.0 ) );
	float furrow = 1.0 - smoothstep( 0.0, 0.07, vor.y );
	float fib = fbm( uv, vec2( 64.0, 6.0 ), 4 );
	float grain = fbm( uv + 2.0, vec2( 128.0, 32.0 ), 2 );
	float plate = smoothstep( 0.1, 0.5, vor.x );
	float tone = fbm( uv + 3.3, vec2( 3.0, 1.0 ), 3 );
#ifdef BLOOM
	vec3 c = mix( vec3( 0.07, 0.035, 0.018 ), vec3( 0.2, 0.11, 0.055 ), fib * 0.7 + plate * 0.3 ) * ( 0.75 + 0.5 * tone ) * ( 0.85 + 0.3 * grain );
	c *= 1.0 - 0.75 * furrow;
	float moss = smoothstep( 0.5, 0.64, fbm( uv + 1.9, vec2( 4.0, 2.0 ), 5 ) ) * ( 0.6 + 0.4 * furrow );
	c = mix( c, mix( vec3( 0.025, 0.08, 0.01 ), vec3( 0.08, 0.2, 0.03 ), fib ), moss );
	// spirit veins run along the furrows
	float vein = ( 1.0 - smoothstep( 0.0, 0.025, vor.y ) ) * smoothstep( 0.3, 0.55, fbm( uv + 8.8, vec2( 2.0, 3.0 ), 3 ) );
	c = mix( c, vec3( 0.5, 0.4, 0.28 ), vein * 0.5 );
	return vec4( c, vein );
#else
	vec3 c = mix( vec3( 0.05, 0.048, 0.045 ), vec3( 0.19, 0.18, 0.16 ), fib * 0.6 + plate * 0.4 ) * ( 0.8 + 0.4 * tone ) * ( 0.85 + 0.3 * grain );
	c *= 1.0 - 0.8 * furrow;
	float rot = smoothstep( 0.6, 0.75, fbm( uv + 1.9, vec2( 4.0, 2.0 ), 4 ) );
	c = mix( c, vec3( 0.045, 0.038, 0.032 ), rot );
	return vec4( c, 0.0 );
#endif
}
`;

const PAPER = /* glsl */ `
vec4 gen( vec2 uv ) {
	vec2 vor = voronoi( uv, vec2( 6.0, 8.0 ) );
	float crumple = vor.x * 0.6 + smoothstep( 0.0, 0.05, vor.y ) * 0.4;
	float fibres = fbm( vec2( uv.x * 2.0, uv.y * 0.5 ), vec2( 64.0, 4.0 ), 4 );
#ifdef BLOOM
	vec3 c = vec3( 0.86, 0.84, 0.8 ) * ( 0.88 + 0.12 * fibres ) * ( 0.94 + 0.06 * crumple );
	float u = abs( uv.x - 0.5 );
	float veinLines = abs( fract( ( uv.x - 0.5 ) * ( 7.0 - 3.0 * uv.y ) + 0.5 ) - 0.5 );
	float vein = ( 1.0 - smoothstep( 0.02, 0.07, veinLines ) ) * smoothstep( 0.02, 0.2, uv.y ) * ( 1.0 - smoothstep( 0.75, 1.0, uv.y ) );
	float mid = ( 1.0 - smoothstep( 0.005, 0.03, u ) ) * smoothstep( 0.0, 0.1, uv.y );
	vein = max( vein * 0.7, mid );
	c *= 1.0 - 0.18 * vein;
	return vec4( c, vein );
#else
	vec3 c = vec3( 0.26, 0.25, 0.235 ) * ( 0.8 + 0.25 * crumple ) * ( 0.9 + 0.15 * fibres );
	float edge = smoothstep( 0.32, 0.5, abs( uv.x - 0.5 ) ) + smoothstep( 0.85, 1.0, uv.y );
	c = mix( c, vec3( 0.12, 0.09, 0.06 ), clamp( edge, 0.0, 1.0 ) * 0.7 );
	return vec4( c, 0.0 );
#endif
}
`;

const KINDS = { stone: STONE, ground: GROUND, bark: BARK, paper: PAPER };
const SIZES = { ground: 1024 };

// --- glyph atlas (Canvas 2D strokes) ----------------------------------------

// 4x4 atlas of hand-drawn-looking spirit carvings, white on black.
export function createGlyphAtlas( size = 512, seed = 7 ) {

	const rand = mulberry32( seed );
	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext( '2d' );
	ctx.fillStyle = '#000';
	ctx.fillRect( 0, 0, size, size );
	ctx.strokeStyle = '#fff';
	ctx.fillStyle = '#fff';
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';

	const cell = size / 4;
	const drawers = [ spiral, rings, eye, leaf, waves, triskele, moon, tree, spiral, eye, rings, leaf, triskele, waves, tree, moon ];

	for ( let i = 0; i < 16; i ++ ) {

		const cx = ( i % 4 ) * cell + cell / 2;
		const cy = Math.floor( i / 4 ) * cell + cell / 2;
		ctx.save();
		ctx.translate( cx, cy );
		ctx.rotate( ( rand() - 0.5 ) * 0.6 );
		ctx.lineWidth = cell * ( 0.045 + rand() * 0.02 );
		drawers[ i ]( ctx, cell * 0.36, rand );
		ctx.restore();

	}

	const tex = new CanvasTexture( canvas );
	tex.wrapS = tex.wrapT = RepeatWrapping;
	tex.minFilter = LinearMipmapLinearFilter;
	tex.magFilter = LinearFilter;
	return tex;

}

function spiral( ctx, r, rand ) {

	ctx.beginPath();
	const turns = 2.2 + rand();
	for ( let t = 0; t <= 1; t += 0.01 ) {

		const a = t * turns * Math.PI * 2;
		const rr = r * t;
		ctx.lineTo( Math.cos( a ) * rr, Math.sin( a ) * rr );

	}

	ctx.stroke();

}

function rings( ctx, r ) {

	for ( const k of [ 1, 0.66, 0.33 ] ) {

		ctx.beginPath();
		ctx.arc( 0, 0, r * k, 0, Math.PI * 2 );
		ctx.stroke();

	}

	ctx.beginPath();
	ctx.arc( 0, 0, r * 0.08, 0, Math.PI * 2 );
	ctx.fill();

}

function eye( ctx, r ) {

	ctx.beginPath();
	ctx.moveTo( - r, 0 );
	ctx.quadraticCurveTo( 0, - r * 1.1, r, 0 );
	ctx.quadraticCurveTo( 0, r * 1.1, - r, 0 );
	ctx.stroke();
	ctx.beginPath();
	ctx.arc( 0, 0, r * 0.3, 0, Math.PI * 2 );
	ctx.stroke();
	ctx.beginPath();
	ctx.arc( 0, 0, r * 0.1, 0, Math.PI * 2 );
	ctx.fill();
	for ( let i = - 2; i <= 2; i ++ ) {

		ctx.beginPath();
		ctx.moveTo( i * r * 0.3, - r * 0.62 );
		ctx.lineTo( i * r * 0.38, - r * 0.95 );
		ctx.stroke();

	}

}

function leaf( ctx, r ) {

	ctx.beginPath();
	ctx.moveTo( 0, r );
	ctx.quadraticCurveTo( r * 0.9, 0, 0, - r );
	ctx.quadraticCurveTo( - r * 0.9, 0, 0, r );
	ctx.stroke();
	ctx.beginPath();
	ctx.moveTo( 0, r * 1.1 );
	ctx.lineTo( 0, - r * 0.8 );
	ctx.stroke();
	for ( let i = 0; i < 3; i ++ ) {

		const y = r * ( 0.4 - i * 0.4 );
		ctx.beginPath();
		ctx.moveTo( 0, y );
		ctx.lineTo( r * 0.35, y - r * 0.3 );
		ctx.moveTo( 0, y );
		ctx.lineTo( - r * 0.35, y - r * 0.3 );
		ctx.stroke();

	}

}

function waves( ctx, r ) {

	for ( let k = - 1; k <= 1; k ++ ) {

		ctx.beginPath();
		for ( let x = - 1; x <= 1.001; x += 0.05 ) {

			ctx.lineTo( x * r, k * r * 0.55 + Math.sin( x * Math.PI * 2 ) * r * 0.18 );

		}

		ctx.stroke();

	}

}

function triskele( ctx, r ) {

	for ( let k = 0; k < 3; k ++ ) {

		ctx.save();
		ctx.rotate( k * Math.PI * 2 / 3 );
		ctx.beginPath();
		for ( let t = 0; t <= 1; t += 0.02 ) {

			const a = t * Math.PI * 2.4;
			const rr = r * 0.5 * ( 1 - t * 0.85 );
			ctx.lineTo( r * 0.42 + Math.cos( a ) * rr, Math.sin( a ) * rr );

		}

		ctx.stroke();
		ctx.restore();

	}

}

function moon( ctx, r, rand ) {

	ctx.beginPath();
	ctx.arc( 0, 0, r * 0.75, Math.PI * 0.3, Math.PI * 1.7 );
	ctx.arc( r * 0.3, 0, r * 0.55, Math.PI * 1.6, Math.PI * 0.4, true );
	ctx.closePath();
	ctx.stroke();
	for ( let i = 0; i < 4; i ++ ) {

		ctx.beginPath();
		ctx.arc( r * ( 0.55 + rand() * 0.4 ), r * ( rand() * 1.6 - 0.8 ), r * 0.07, 0, Math.PI * 2 );
		ctx.fill();

	}

}

function tree( ctx, r ) {

	ctx.beginPath();
	ctx.moveTo( 0, r );
	ctx.lineTo( 0, - r );
	ctx.stroke();
	for ( let i = 0; i < 3; i ++ ) {

		const y = r * ( 0.5 - i * 0.5 );
		const w = r * ( 0.9 - i * 0.25 );
		ctx.beginPath();
		ctx.moveTo( - w, y - r * 0.3 );
		ctx.quadraticCurveTo( 0, y + r * 0.15, w, y - r * 0.3 );
		ctx.stroke();

	}

	ctx.beginPath();
	ctx.moveTo( - r * 0.5, r );
	ctx.lineTo( r * 0.5, r );
	ctx.stroke();

}

// --- baking -----------------------------------------------------------------

export function bakeTextureSets( renderer, { glyphs, size = 512, anisotropy = 4 } = {} ) {

	const scene = new Scene();
	const camera = new OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );
	const quad = new Mesh( new PlaneGeometry( 2, 2 ) );
	quad.frustumCulled = false;
	scene.add( quad );

	const vertexShader = /* glsl */ `
		varying vec2 vUv;
		void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }
	`;

	const prevTarget = renderer.getRenderTarget();
	const prevXr = renderer.xr.enabled;
	renderer.xr.enabled = false;

	const sets = {};
	let seed = 1;
	for ( const [ kind, body ] of Object.entries( KINDS ) ) {

		sets[ kind ] = {};
		for ( const variant of [ 'dormant', 'bloom' ] ) {

			const res = SIZES[ kind ] || size;
			const target = new WebGLRenderTarget( res, res, {
				depthBuffer: false,
				generateMipmaps: true,
				minFilter: LinearMipmapLinearFilter,
				magFilter: LinearFilter,
				wrapS: RepeatWrapping,
				wrapT: RepeatWrapping,
				colorSpace: SRGBColorSpace,
				anisotropy,
			} );
			quad.material = new ShaderMaterial( {
				defines: variant === 'bloom' ? { BLOOM: '' } : {},
				uniforms: { uSeed: { value: seed }, uGlyphs: { value: glyphs } },
				vertexShader,
				fragmentShader: GEN_COMMON + body + /* glsl */ `
					void main() { gl_FragColor = gen( vUv ); }
				`,
			} );
			renderer.setRenderTarget( target );
			renderer.render( scene, camera );
			quad.material.dispose();
			sets[ kind ][ variant ] = target.texture;

		}

		seed ++;

	}

	renderer.setRenderTarget( prevTarget );
	renderer.xr.enabled = prevXr;
	quad.geometry.dispose();
	return sets;

}
