import { describe, it, expect } from 'vitest';
import {
	typeMultiplier,
	singleTypeMultiplier,
	formatMultiplier,
	effectivenessLabel
} from '../../../src/utils/pokemon/type-chart';

describe('type-chart', () => {
	describe('singleTypeMultiplier', () => {
		it('returns 2 for a super-effective pairing', () => {
			expect(singleTypeMultiplier('Water', 'Fire')).toBe(2);
		});

		it('returns 0.5 for a resisted pairing', () => {
			expect(singleTypeMultiplier('Fire', 'Water')).toBe(0.5);
		});

		it('returns 0 for an immune pairing', () => {
			expect(singleTypeMultiplier('Normal', 'Ghost')).toBe(0);
		});

		it('returns 1 for a neutral pairing', () => {
			expect(singleTypeMultiplier('Normal', 'Water')).toBe(1);
		});

		it('is case-insensitive on both types', () => {
			expect(singleTypeMultiplier('water', 'FIRE')).toBe(2);
		});

		it('returns 1 for an unknown attacking type', () => {
			expect(singleTypeMultiplier('Magic', 'Fire')).toBe(1);
		});
	});

	describe('typeMultiplier (attacker main type vs defender types)', () => {
		it('stacks both defender types: Fire vs Grass/Poison is ×2', () => {
			// Fire→Grass ×2, Fire→Poison ×1
			expect(typeMultiplier('Fire', ['Grass', 'Poison'])).toBe(2);
		});

		it('compounds two weaknesses into ×4: Fire vs Bug/Steel', () => {
			expect(typeMultiplier('Fire', ['Bug', 'Steel'])).toBe(4);
		});

		it('compounds two resistances into ×0.25: Grass vs Fire/Steel', () => {
			// Grass→Fire ×0.5, Grass→Steel ×0.5
			expect(typeMultiplier('Grass', ['Fire', 'Steel'])).toBe(0.25);
		});

		it('zeroes out when any defender type is immune: Ground vs Fire/Flying', () => {
			// Ground→Fire ×2, Ground→Flying ×0 → 0
			expect(typeMultiplier('Ground', ['Fire', 'Flying'])).toBe(0);
		});

		it('a weakness and a resistance cancel to ×1: Water vs Water/Ground', () => {
			// Water→Water ×0.5, Water→Ground ×2 → 1
			expect(typeMultiplier('Water', ['Water', 'Ground'])).toBe(1);
		});

		it('returns 1 for an untyped or unknown attacker', () => {
			expect(typeMultiplier(undefined, ['Fire'])).toBe(1);
			expect(typeMultiplier('Magic', ['Fire'])).toBe(1);
		});

		it('returns 1 against a defender with no types', () => {
			expect(typeMultiplier('Fire', [])).toBe(1);
		});
	});

	describe('formatMultiplier', () => {
		it('renders the canon values cleanly', () => {
			expect(formatMultiplier(0)).toBe('×0');
			expect(formatMultiplier(0.25)).toBe('×0.25');
			expect(formatMultiplier(0.5)).toBe('×0.5');
			expect(formatMultiplier(2)).toBe('×2');
			expect(formatMultiplier(4)).toBe('×4');
		});
	});

	describe('effectivenessLabel', () => {
		it('labels each band, neutral being empty', () => {
			expect(effectivenessLabel(0)).toBe('No effect');
			expect(effectivenessLabel(0.5)).toBe('Not very effective');
			expect(effectivenessLabel(1)).toBe('');
			expect(effectivenessLabel(2)).toBe('Super effective');
			expect(effectivenessLabel(4)).toBe('Super effective');
		});
	});
});
