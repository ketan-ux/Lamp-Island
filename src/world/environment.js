import {
	BackSide,
	BufferGeometry,
	CircleGeometry,
	ConeGeometry,
	CylinderGeometry,
	DoubleSide,
	Float32BufferAttribute,
	Group,
	IcosahedronGeometry,
	InstancedBufferAttribute,
	InstancedMesh,
	Mesh,
	Object3D,
	PlaneGeometry,
	ShaderMaterial,
	SphereGeometry,
} from 'three';
import { G } from '../core/uniforms.js';
import { GLSL_COMMON, INSTANCED_WORLD, SEASON_LOCAL, TONE } from '../core/glsl.js';
import { WATER_Y, islandRadius } from '../core/config.js';
import { mulberry32 } from '../core/random.js';

// Everything beyond arm's reach: sky, pond, the forest wall dissolving into
// mist, reeds and lily pads. All of it is unshadowed and lit only by the
// analytic wisp term so the single real shadow stays on the island.

export function createSky() {

	const material = new ShaderMaterial( {
		uniforms: { ...G },
		vertexShader: /* glsl */ `
			varying vec3 vWorld;
			void main() {
				vec4 w = modelMatrix * vec4( position, 1.0 );
				vWorld = w.xyz;
				gl_Position = projectionMatrix * viewMatrix * w;
			}
		`,
		fragmentShader: /* glsl */ `
			${GLSL_COMMON}
			varying vec3 vWorld;
			void main() {
				vec3 rd = normalize( vWorld - cameraPosition );
				vec3 col = lkSky( rd );
				// faint stars where the mist thins out overhead
				vec2 sp = rd.xz / ( rd.y + 1.2 ) * 90.0;
				float star = step( 0.9975, lkHash12( floor( sp ) ) ) * smoothstep( 0.35, 0.8, rd.y );
				col += star * vec3( 0.25, 0.3, 0.35 ) * ( 0.6 + 0.4 * sin( uTime * 3.0 + sp.x ) ) * ( 0.3 + 0.7 * uFinale );
				col += lkScatter( cameraPosition, rd, 60.0 );
				gl_FragColor = vec4( col, 1.0 );
				${TONE}
			}
		`,
		side: BackSide,
		depthWrite: false,
	} );
	const sky = new Mesh( new SphereGeometry( 90, 32, 16 ), material );
	sky.renderOrder = - 10;
	sky.frustumCulled = false;
	return sky;

}

export function createWater() {

	const material = new ShaderMaterial( {
		uniforms: { ...G },
		vertexShader: /* glsl */ `
			varying vec3 vWorld;
			void main() {
				vec4 w = modelMatrix * vec4( position, 1.0 );
				vWorld = w.xyz;
				gl_Position = projectionMatrix * viewMatrix * w;
			}
		`,
		fragmentShader: /* glsl */ `
			${GLSL_COMMON}
			varying vec3 vWorld;

			// Analytic gradient of a few travelling sines + shore ripples.
			vec2 waterGrad( vec2 p, float sd ) {
				float t = uTime;
				vec2 g = vec2( 0.0 );
				vec2 d1 = vec2( 0.8, 0.6 );
				vec2 d2 = vec2( - 0.5, 0.86 );
				vec2 d3 = vec2( 0.95, - 0.3 );
				vec2 d4 = vec2( - 0.2, - 0.98 );
				g += d1 * 0.025 * cos( dot( p, d1 ) * 2.1 + t * 0.9 );
				g += d2 * 0.022 * cos( dot( p, d2 ) * 3.7 + t * 1.3 );
				g += d3 * 0.02 * cos( dot( p, d3 ) * 7.3 + t * 1.9 );
				g += d4 * 0.016 * cos( dot( p, d4 ) * 11.7 + t * 2.3 );
				vec2 radial = p / max( length( p ), 1e-3 );
				g += radial * 0.09 * cos( sd * 24.0 - t * 2.2 ) * exp( - sd * 2.8 );
				return g;
			}

			void main() {
				vec2 p = vWorld.xz;
				float r = length( p );
				// distance from the waterline (the island slope meets the pond at ~83% of its radius)
				float sd = max( r - 0.83 * lkIslandRadius( atan( p.y, p.x ) ), 0.0 );
				vec2 g = waterGrad( p, sd );
				vec3 N = normalize( vec3( - g.x, 1.0, - g.y ) );
				vec3 V = normalize( cameraPosition - vWorld );
				float ndv = max( dot( N, V ), 0.0 );
				float fres = 0.02 + 0.98 * pow( 1.0 - ndv, 5.0 );
				vec3 R = reflect( - V, N );
				vec3 refl = lkSkyDisc( R, 0.12 ) * 0.95;

				vec3 L = uLanternPos - vWorld;
				float ld2 = dot( L, L );
				L *= inversesqrt( ld2 );
				vec3 H = normalize( L + V );
				vec3 lamp = uLanternColor * uLanternIntensity;
				float spec = pow( max( dot( N, H ), 0.0 ), 280.0 ) * 18.0 / ( 0.4 + ld2 );
				float sheen = pow( max( dot( R, L ), 0.0 ), 24.0 ) * 0.5 / ( 0.4 + ld2 );

				vec3 deep = vec3( 0.002, 0.006, 0.008 );
				vec3 murk = lamp * vec3( 0.45, 0.8, 0.7 ) * 0.05 / ( 0.3 + ld2 );
				vec3 col = mix( deep + murk, refl, fres ) + lamp * ( spec + sheen * fres * 4.0 );

				// island reflection: the shore darkens the water right next to it
				col *= mix( 0.45, 1.0, smoothstep( 0.0, 0.9, sd ) );

				float foam = ( 1.0 - smoothstep( 0.0, 0.07, sd ) ) * ( 0.4 + 0.6 * lkNoise2( p * 16.0 + uTime * 0.4 ) );
				col += foam * ( vec3( 0.01, 0.016, 0.018 ) + lamp * 0.08 / ( 0.3 + ld2 ) );

				// drifting ground mist over the pond
				float mist = lkNoise2( p * 0.32 + vec2( uTime * 0.035, uTime * 0.02 ) );
				mist *= lkNoise2( p * 0.85 - vec2( uTime * 0.03, - uTime * 0.01 ) );
				float far = smoothstep( 1.0, 5.0, distance( p, cameraPosition.xz ) );
				col = mix( col, uFogColor * 1.25 + lamp * 0.02, mist * 0.45 * far * ( 1.0 - 0.5 * uFinale ) );

				gl_FragColor = vec4( lkAtmosphere( col, vWorld ), 1.0 );
				${TONE}
			}
		`,
	} );
	const water = new Mesh( pondGeometry( 1.1, 85, 30, 72 ), material );
	water.position.y = WATER_Y;
	water.renderOrder = - 5;
	return water;

}

// Flat polar grid with exponentially spaced rings: small triangles around the
// keeper, large ones far away. (A single fan disc would put one vertex right
// under the viewer's eye, and clipping those huge sliver triangles at w≈0
// produces broken depth on some GPUs.) The centre is left open — the island
// covers it.
function pondGeometry( inner, outer, rings, segs ) {

	const pos = [], index = [];
	for ( let i = 0; i <= rings; i ++ ) {

		const r = inner * Math.pow( outer / inner, i / rings );
		for ( let j = 0; j <= segs; j ++ ) {

			const a = j / segs * Math.PI * 2;
			pos.push( Math.cos( a ) * r, 0, Math.sin( a ) * r );

		}

	}

	for ( let i = 0; i < rings; i ++ ) {

		for ( let j = 0; j < segs; j ++ ) {

			const a = i * ( segs + 1 ) + j, b = a + segs + 1;
			index.push( a, a + 1, b, b, a + 1, b + 1 );

		}

	}

	const g = new BufferGeometry();
	g.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
	g.setIndex( index );
	return g;

}

// Distant forest: three instanced draws, flat silhouettes that dissolve into
// the stylised depth fog.
export function createForest( seed = 3 ) {

	const rand = mulberry32( seed );
	const group = new Group();
	const material = new ShaderMaterial( {
		uniforms: { ...G },
		vertexShader: /* glsl */ `
			uniform float uTime;
			varying vec3 vWorld;
			varying vec3 vNormal;
			${INSTANCED_WORLD}
			void main() {
				vec4 w = lkWorldPos( position );
				// slow sway of the canopy tops
				float sway = sin( uTime * 0.35 + w.x * 0.2 + w.z * 0.13 ) * 0.04 * max( position.y, 0.0 );
				w.x += sway;
				vWorld = w.xyz;
				vNormal = lkWorldNormal( normal );
				gl_Position = projectionMatrix * viewMatrix * w;
			}
		`,
		fragmentShader: /* glsl */ `
			${GLSL_COMMON}
			varying vec3 vWorld;
			varying vec3 vNormal;
			void main() {
				vec3 n = normalize( vNormal );
				vec3 col = vec3( 0.006, 0.01, 0.011 ) * ( 0.7 + 0.5 * n.y );
				float moon = max( dot( n, normalize( LK_MOON_DIR ) ), 0.0 );
				col += vec3( 0.01, 0.016, 0.022 ) * moon;
				col += lkLanternLight( vWorld, n, 0.5 ) * 0.04;
				gl_FragColor = vec4( lkAtmosphere( col, vWorld ), 1.0 );
				${TONE}
			}
		`,
	} );

	const trunkGeo = new CylinderGeometry( 0.7, 1, 1, 7, 1, true );
	trunkGeo.translate( 0, 0.5, 0 );
	const coneGeo = new ConeGeometry( 1, 1, 7, 2 );
	coneGeo.translate( 0, 0.5, 0 );
	const blobGeo = new IcosahedronGeometry( 1, 1 );

	const count = 170;
	const trunks = new InstancedMesh( trunkGeo, material, count );
	const cones = new InstancedMesh( coneGeo, material, count );
	const blobs = new InstancedMesh( blobGeo, material, count );
	const dummy = new Object3D();
	let nc = 0, nb = 0;
	for ( let i = 0; i < count; i ++ ) {

		const a = rand() * Math.PI * 2;
		const r = 6.5 + Math.pow( rand(), 0.8 ) * 40;
		const x = Math.cos( a ) * r, z = Math.sin( a ) * r;
		const height = 9 + rand() * 12;
		const girth = 0.18 + rand() * 0.35 + r * 0.004;
		dummy.position.set( x, WATER_Y - 0.5, z );
		dummy.rotation.set( ( rand() - 0.5 ) * 0.08, rand() * 6.28, ( rand() - 0.5 ) * 0.08 );
		dummy.scale.set( girth, height, girth );
		dummy.updateMatrix();
		trunks.setMatrixAt( i, dummy.matrix );

		if ( rand() < 0.62 ) {

			const w = 1.6 + rand() * 1.6;
			const h = height * ( 0.55 + rand() * 0.25 );
			dummy.position.set( x, WATER_Y + height - h * 0.8, z );
			dummy.scale.set( w, h, w );
			dummy.updateMatrix();
			cones.setMatrixAt( nc ++, dummy.matrix );

		} else {

			const w = 2 + rand() * 2.2;
			dummy.position.set( x, WATER_Y + height * 0.85, z );
			dummy.scale.set( w, w * ( 0.7 + rand() * 0.4 ), w );
			dummy.updateMatrix();
			blobs.setMatrixAt( nb ++, dummy.matrix );

		}

	}

	cones.count = nc;
	blobs.count = nb;
	for ( const m of [ trunks, cones, blobs ] ) {

		m.frustumCulled = false;
		group.add( m );

	}

	return group;

}

// Reeds & cattails ringing the island; lit by the wisp, tinted by season.
export function createReeds( seed = 9 ) {

	const rand = mulberry32( seed );
	const blade = new PlaneGeometry( 0.014, 1, 1, 5 );
	blade.translate( 0, 0.5, 0 );
	const pos = blade.attributes.position;
	for ( let i = 0; i < pos.count; i ++ ) {

		const y = pos.getY( i );
		pos.setX( i, pos.getX( i ) * ( 1 - y * 0.85 ) );
		pos.setZ( i, y * y * 0.12 );

	}

	blade.computeVertexNormals();

	const count = 320;
	const material = new ShaderMaterial( {
		uniforms: { ...G },
		side: DoubleSide,
		vertexShader: /* glsl */ `
			${INSTANCED_WORLD}
			uniform float uTime;
			attribute float aSeed;
			varying vec3 vWorld;
			varying vec3 vNormal;
			varying float vH;
			varying float vSeed;
			void main() {
				vec4 w = lkWorldPos( position );
				vec3 o = lkInstanceOrigin();
				float k = position.y * position.y;
				w.x += sin( uTime * 0.9 + aSeed * 12.0 + o.z ) * 0.05 * k;
				w.z += cos( uTime * 0.7 + aSeed * 7.0 + o.x ) * 0.04 * k;
				vWorld = w.xyz;
				vNormal = lkWorldNormal( normal );
				vH = position.y;
				vSeed = aSeed;
				gl_Position = projectionMatrix * viewMatrix * w;
			}
		`,
		fragmentShader: /* glsl */ `
			${GLSL_COMMON}
			${SEASON_LOCAL}
			varying vec3 vWorld;
			varying vec3 vNormal;
			varying float vH;
			varying float vSeed;
			void main() {
				vec3 n = normalize( vNormal );
				float s = lkLocalSeason( vWorld );
				vec3 autumn = mix( vec3( 0.16, 0.08, 0.02 ), vec3( 0.45, 0.28, 0.06 ), vH );
				vec3 spring = mix( vec3( 0.02, 0.08, 0.04 ), vec3( 0.12, 0.35, 0.18 ), vH );
				vec3 alb = mix( autumn, spring, s ) * ( 0.45 + 0.4 * vSeed );
				vec3 light = vec3( 0.03, 0.045, 0.06 ) + lkLanternLight( vWorld, n, 1.0 ) * 0.7;
				vec3 col = alb * light;
				float m = lkMask( lkMaskDistance( vWorld ) );
				col += lkSeasonGlow() * m * 0.25 * vH;
				gl_FragColor = vec4( lkAtmosphere( col, vWorld ), 1.0 );
				${TONE}
			}
		`,
	} );

	const reeds = new InstancedMesh( blade, material, count );
	const seeds = new Float32Array( count );
	const dummy = new Object3D();
	// clumps around the shore
	const clumps = Array.from( { length: 16 }, () => rand() * Math.PI * 2 );
	for ( let i = 0; i < count; i ++ ) {

		const a = clumps[ i % clumps.length ] + ( rand() - 0.5 ) * 0.35;
		const r = islandRadius( a ) + 0.08 + Math.pow( rand(), 1.6 ) * 1.4;
		dummy.position.set( Math.cos( a ) * r, WATER_Y - 0.05, Math.sin( a ) * r );
		dummy.rotation.set( ( rand() - 0.5 ) * 0.3, rand() * Math.PI * 2, ( rand() - 0.5 ) * 0.3 );
		const h = 0.45 + rand() * 0.85;
		dummy.scale.set( 1 + rand(), h, 1 );
		dummy.updateMatrix();
		reeds.setMatrixAt( i, dummy.matrix );
		seeds[ i ] = rand();

	}

	blade.setAttribute( 'aSeed', new InstancedBufferAttribute( seeds, 1 ) );
	reeds.frustumCulled = false;
	return reeds;

}

export function createLilyPads( seed = 21 ) {

	const rand = mulberry32( seed );
	const pad = new CircleGeometry( 1, 18, 0.25, Math.PI * 2 - 0.5 );
	pad.rotateX( - Math.PI / 2 );
	const count = 48;
	const material = new ShaderMaterial( {
		uniforms: { ...G },
		vertexShader: /* glsl */ `
			${INSTANCED_WORLD}
			uniform float uTime;
			varying vec3 vWorld;
			varying vec2 vUv;
			void main() {
				vec4 w = lkWorldPos( position );
				vec3 o = lkInstanceOrigin();
				w.y += sin( uTime * 0.8 + o.x * 2.0 + o.z ) * 0.006;
				vWorld = w.xyz;
				vUv = uv;
				gl_Position = projectionMatrix * viewMatrix * w;
			}
		`,
		fragmentShader: /* glsl */ `
			${GLSL_COMMON}
			${SEASON_LOCAL}
			varying vec3 vWorld;
			varying vec2 vUv;
			void main() {
				vec2 c = vUv - 0.5;
				float a = atan( c.y, c.x );
				float veins = 1.0 - smoothstep( 0.0, 0.08, abs( sin( a * 9.0 ) ) ) * 0.3;
				float s = lkLocalSeason( vWorld );
				vec3 alb = mix( vec3( 0.12, 0.06, 0.015 ), vec3( 0.02, 0.07, 0.03 ), s ) * veins;
				alb *= 0.8 + 0.4 * smoothstep( 0.5, 0.0, length( c ) );
				vec3 col = alb * ( vec3( 0.04, 0.06, 0.08 ) + lkLanternLight( vWorld, vec3( 0.0, 1.0, 0.0 ), 0.2 ) );
				gl_FragColor = vec4( lkAtmosphere( col, vWorld ), 1.0 );
				${TONE}
			}
		`,
	} );
	const pads = new InstancedMesh( pad, material, count );
	const dummy = new Object3D();
	for ( let i = 0; i < count; i ++ ) {

		const a = rand() * Math.PI * 2;
		const r = islandRadius( a ) + 0.35 + Math.pow( rand(), 1.3 ) * 6;
		dummy.position.set( Math.cos( a ) * r, WATER_Y + 0.004, Math.sin( a ) * r );
		dummy.rotation.set( 0, rand() * Math.PI * 2, 0 );
		const s = 0.1 + rand() * 0.2;
		dummy.scale.set( s, 1, s );
		dummy.updateMatrix();
		pads.setMatrixAt( i, dummy.matrix );

	}

	pads.frustumCulled = false;
	return pads;

}

