#!/usr/bin/env node
/**
 * crop-svgs.mjs — clean up the workout illustration SVGs.
 *
 *   1. Removes every <text> element (the "Created by ICONGALAXY" attribution).
 *   2. Recomputes the viewBox as a tight bounding box of the actual drawn
 *      geometry, so the canvas hugs the icon instead of the original padded art
 *      board (which also reserved space for the now-removed caption).
 *
 * Bounding boxes are exact: cubic béziers are evaluated at their derivative
 * extrema (not approximated by control points), polygons/ellipses/circles/rects/
 * lines are handled, and any element-level transform="matrix(...)" is applied.
 *
 * Usage:
 *   node scripts/crop-svgs.mjs            # rewrite files in place
 *   node scripts/crop-svgs.mjs --dry      # print computed viewBoxes, write nothing
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['static/exercise', 'static/yoga-poses'];
const PAD_RATIO = 0.02; // 2% breathing room around the content
const DRY = process.argv.includes('--dry');

// --- numeric/path tokenising --------------------------------------------------

const NUMBER = '-?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?';
const TOKEN_RE = new RegExp(`[MmLlHhVvCcSsQqTtAaZz]|${NUMBER}`, 'g');
const ARGS_PER_CMD = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/** A growable bounding box. */
function makeBox() {
	return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}
function addPoint(box, x, y) {
	if (x < box.minX) box.minX = x;
	if (y < box.minY) box.minY = y;
	if (x > box.maxX) box.maxX = x;
	if (y > box.maxY) box.maxY = y;
}

/** Parse a transform="matrix(a b c d e f)" attribute into a point mapper. */
function transformFromAttr(attrs) {
	const m = /transform\s*=\s*"matrix\(([^)]+)\)"/.exec(attrs);
	if (!m) return (x, y) => [x, y];
	const [a, b, c, d, e, f] = m[1].trim().split(/[\s,]+/).map(Number);
	return (x, y) => [a * x + c * y + e, b * x + d * y + f];
}

/** Evaluate one axis of a cubic bézier at t. */
function cubicAt(p0, p1, p2, p3, t) {
	const u = 1 - t;
	return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** Derivative-root parameters in (0,1) where a cubic axis reaches an extreme. */
function cubicExtremaT(p0, p1, p2, p3) {
	const a = -p0 + 3 * p1 - 3 * p2 + p3;
	const b = 2 * (p0 - 2 * p1 + p2);
	const c = p1 - p0;
	const ts = [];
	const push = (t) => {
		if (t > 0 && t < 1) ts.push(t);
	};
	if (Math.abs(a) < 1e-9) {
		if (Math.abs(b) > 1e-9) push(-c / b);
	} else {
		const disc = b * b - 4 * a * c;
		if (disc >= 0) {
			const sq = Math.sqrt(disc);
			push((-b + sq) / (2 * a));
			push((-b - sq) / (2 * a));
		}
	}
	return ts;
}

function addCubic(box, tf, x0, y0, x1, y1, x2, y2, x3, y3) {
	addPoint(box, ...tf(x3, y3)); // endpoint (start already added)
	for (const t of cubicExtremaT(x0, x1, x2, x3)) {
		addPoint(box, ...tf(cubicAt(x0, x1, x2, x3, t), cubicAt(y0, y1, y2, y3, t)));
	}
	for (const t of cubicExtremaT(y0, y1, y2, y3)) {
		addPoint(box, ...tf(cubicAt(x0, x1, x2, x3, t), cubicAt(y0, y1, y2, y3, t)));
	}
}

/** Walk a path `d` string, expanding the box. */
function addPath(box, d, tf) {
	const tokens = d.match(TOKEN_RE);
	if (!tokens) return;

	let i = 0;
	let cx = 0;
	let cy = 0; // current point
	let sx = 0;
	let sy = 0; // subpath start
	let pcx = 0;
	let pcy = 0; // previous cubic 2nd control point (for S/s reflection)
	let prevCmd = '';
	const num = () => parseFloat(tokens[i++]);

	while (i < tokens.length) {
		let cmd = tokens[i];
		if (/[A-Za-z]/.test(cmd)) {
			i++;
		} else {
			// Implicit repeat of the previous command.
			cmd = prevCmd === 'M' ? 'L' : prevCmd === 'm' ? 'l' : prevCmd;
		}
		const rel = cmd === cmd.toLowerCase();
		const C = cmd.toUpperCase();

		switch (C) {
			case 'M': {
				let x = num();
				let y = num();
				if (rel) {
					x += cx;
					y += cy;
				}
				cx = x;
				cy = y;
				sx = x;
				sy = y;
				addPoint(box, ...tf(x, y));
				break;
			}
			case 'L': {
				let x = num();
				let y = num();
				if (rel) {
					x += cx;
					y += cy;
				}
				cx = x;
				cy = y;
				addPoint(box, ...tf(x, y));
				break;
			}
			case 'H': {
				let x = num();
				if (rel) x += cx;
				cx = x;
				addPoint(box, ...tf(x, cy));
				break;
			}
			case 'V': {
				let y = num();
				if (rel) y += cy;
				cy = y;
				addPoint(box, ...tf(cx, y));
				break;
			}
			case 'C': {
				let x1 = num();
				let y1 = num();
				let x2 = num();
				let y2 = num();
				let x = num();
				let y = num();
				if (rel) {
					x1 += cx; y1 += cy;
					x2 += cx; y2 += cy;
					x += cx; y += cy;
				}
				addCubic(box, tf, cx, cy, x1, y1, x2, y2, x, y);
				pcx = x2; pcy = y2;
				cx = x; cy = y;
				break;
			}
			case 'S': {
				let x2 = num();
				let y2 = num();
				let x = num();
				let y = num();
				if (rel) {
					x2 += cx; y2 += cy;
					x += cx; y += cy;
				}
				// First control = reflection of previous 2nd control, if last was a cubic.
				const reflect = /[CcSs]/.test(prevCmd);
				const x1 = reflect ? 2 * cx - pcx : cx;
				const y1 = reflect ? 2 * cy - pcy : cy;
				addCubic(box, tf, cx, cy, x1, y1, x2, y2, x, y);
				pcx = x2; pcy = y2;
				cx = x; cy = y;
				break;
			}
			case 'Q': {
				let x1 = num();
				let y1 = num();
				let x = num();
				let y = num();
				if (rel) {
					x1 += cx; y1 += cy;
					x += cx; y += cy;
				}
				// Quadratic → its control point bounds the curve; exact enough and none appear here.
				addPoint(box, ...tf(x1, y1));
				addPoint(box, ...tf(x, y));
				pcx = x1; pcy = y1;
				cx = x; cy = y;
				break;
			}
			case 'T': {
				let x = num();
				let y = num();
				if (rel) { x += cx; y += cy; }
				addPoint(box, ...tf(x, y));
				cx = x; cy = y;
				break;
			}
			case 'A': {
				num(); num(); num(); num(); num(); // rx ry rot large sweep
				let x = num();
				let y = num();
				if (rel) { x += cx; y += cy; }
				addPoint(box, ...tf(x, y)); // no arcs in this dataset; endpoint only
				cx = x; cy = y;
				break;
			}
			case 'Z': {
				cx = sx; cy = sy;
				break;
			}
		}
		prevCmd = cmd;
	}
}

function addPolyPoints(box, pointsStr, tf) {
	const nums = (pointsStr.match(new RegExp(NUMBER, 'g')) || []).map(Number);
	for (let i = 0; i + 1 < nums.length; i += 2) addPoint(box, ...tf(nums[i], nums[i + 1]));
}

function addEllipse(box, cx, cy, rx, ry, tf) {
	const STEPS = 72;
	for (let i = 0; i < STEPS; i++) {
		const a = (i / STEPS) * 2 * Math.PI;
		addPoint(box, ...tf(cx + rx * Math.cos(a), cy + ry * Math.sin(a)));
	}
}

const attr = (attrs, name) => {
	const m = new RegExp(`${name}\\s*=\\s*"(${NUMBER})"`).exec(attrs);
	return m ? parseFloat(m[1]) : 0;
};

/** Compute the bounding box of all geometry in an SVG string. */
function computeBox(svg) {
	const box = makeBox();

	for (const m of svg.matchAll(/<path\b([^>]*)\bd\s*=\s*"([^"]*)"([^>]*)>/g)) {
		addPath(box, m[2], transformFromAttr(m[1] + m[3]));
	}
	for (const m of svg.matchAll(/<(polygon|polyline)\b([^>]*)>/g)) {
		const pts = /points\s*=\s*"([^"]*)"/.exec(m[2]);
		if (pts) addPolyPoints(box, pts[1], transformFromAttr(m[2]));
	}
	for (const m of svg.matchAll(/<ellipse\b([^>]*)>/g)) {
		addEllipse(box, attr(m[1], 'cx'), attr(m[1], 'cy'), attr(m[1], 'rx'), attr(m[1], 'ry'), transformFromAttr(m[1]));
	}
	for (const m of svg.matchAll(/<circle\b([^>]*)>/g)) {
		const r = attr(m[1], 'r');
		addEllipse(box, attr(m[1], 'cx'), attr(m[1], 'cy'), r, r, transformFromAttr(m[1]));
	}
	for (const m of svg.matchAll(/<rect\b([^>]*)>/g)) {
		const tf = transformFromAttr(m[1]);
		const x = attr(m[1], 'x'), y = attr(m[1], 'y'), w = attr(m[1], 'width'), h = attr(m[1], 'height');
		addPoint(box, ...tf(x, y));
		addPoint(box, ...tf(x + w, y + h));
	}
	for (const m of svg.matchAll(/<line\b([^>]*)>/g)) {
		const tf = transformFromAttr(m[1]);
		addPoint(box, ...tf(attr(m[1], 'x1'), attr(m[1], 'y1')));
		addPoint(box, ...tf(attr(m[1], 'x2'), attr(m[1], 'y2')));
	}

	return box;
}

const round = (n) => Number(n.toFixed(3));

function processFile(file) {
	const original = readFileSync(file, 'utf8');

	// 1. Strip text (and any tspans) before measuring so captions never count.
	let svg = original
		.replace(/\s*<text\b[^>]*>[\s\S]*?<\/text>/g, '')
		.replace(/\s*<text\b[^>]*\/>/g, '');

	// 2. Measure remaining geometry.
	const box = computeBox(svg);
	if (!isFinite(box.minX)) {
		console.warn(`! ${file}: no geometry found, skipping`);
		return null;
	}

	const w = box.maxX - box.minX;
	const h = box.maxY - box.minY;
	const pad = Math.max(w, h) * PAD_RATIO;
	const vb = [round(box.minX - pad), round(box.minY - pad), round(w + 2 * pad), round(h + 2 * pad)];
	const viewBox = vb.join(' ');

	// 3. Rewrite the viewBox on the root <svg>.
	const next = svg.replace(/(<svg\b[^>]*?)\sviewBox\s*=\s*"[^"]*"/, `$1 viewBox="${viewBox}"`);

	if (!DRY) writeFileSync(file, next);
	return { file, viewBox };
}

let count = 0;
for (const dir of DIRS) {
	const abs = join(ROOT, dir);
	for (const name of readdirSync(abs).filter((f) => f.endsWith('.svg')).sort()) {
		const res = processFile(join(abs, name));
		if (res) {
			count++;
			if (DRY) console.log(`${dir}/${name}  ->  viewBox="${res.viewBox}"`);
		}
	}
}
console.log(`\n${DRY ? '[dry] would process' : 'Processed'} ${count} SVGs.`);
