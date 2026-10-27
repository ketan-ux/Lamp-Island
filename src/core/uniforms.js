import { Color, Vector3 } from 'three';
import { MASK_RADIUS } from './config.js';

// Linear-space season colours of the wisp. Autumn = amber, Spring = cyan.
export const AUTUMN_LIGHT = new Color( 1.0, 0.5, 0.14 );
export const SPRING_LIGHT = new Color( 0.22, 0.82, 1.0 );

// Uniforms shared by every shader in the scene. Materials reference these
// objects directly, so writing `.value` once per frame updates everything.
export const G = {
	uTime: { value: 0 },
	uLanternPos: { value: new Vector3( 0, 1.1, - 0.4 ) },
	uLanternColor: { value: AUTUMN_LIGHT.clone() },
	uLanternIntensity: { value: 1 },
	uMaskRadius: { value: MASK_RADIUS },
	uSeason: { value: 0 },
	// lags behind uSeason so colour changes ripple outward from the lantern
	uSeasonFar: { value: 0 },
	uProgress: { value: 0 },
	uFinale: { value: 0 },
	uFogColor: { value: new Color( 0.011, 0.021, 0.026 ) },
	uFogDensity: { value: 0.085 },
};
