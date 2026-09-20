const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const elements = new Map();
const context = vm.createContext({ window: { addEventListener() {} }, document: { getElementById(id) { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); } } });
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../script.js'), 'utf8') + '\nthis.Grapher = Grapher;', context);
function graph(fn = Math.sin) {
    const g = Object.create(context.Grapher.prototype);
    Object.assign(g, { mode: 'cartesian', width: 1000, height: 600, autoFit: true, view: { xmin: -10, xmax: 10, ymin: -5, ymax: 5 }, functions: [{ visible: true, compiled: true }], evaluate: (_, x) => fn(x), requestDraw() {}, status() {} });
    return g;
}
test('auto fit expands and contracts Y without changing exploration interval', () => {
    const g = graph(x => 1000 * Math.sin(x)); g.fit();
    assert(g.view.ymax > 1000 && g.view.ymin < -1000);
    g.evaluate = (_, x) => 0.001 * Math.sin(x); g.fit();
    assert(g.view.ymax < 0.002 && g.view.ymin > -0.002);
    assert.equal(g.view.xmin, -10); assert.equal(g.view.xmax, 10);
});
test('constant and nonfinite functions preserve a finite nonzero viewport', () => {
    for (const fn of [() => 0, () => 500, () => NaN, x => 1 / x]) {
        const g = graph(fn); g.fit();
        assert(Object.values(g.view).every(Number.isFinite));
        assert(g.view.ymax > g.view.ymin);
    }
});
test('zoom keeps cursor anchor fixed and switches to manual view', () => {
    const g = graph(); const x = g.mx(250), y = g.my(150);
    g.zoom(0.5, 0.25, 0.25);
    assert.equal(g.mx(250), x); assert.equal(g.my(150), y); assert.equal(g.autoFit, false);
});
test('invalid and empty input ranges never corrupt the viewport', () => {
    const g = graph(), original = JSON.stringify(g.view);
    for (const [id, value] of Object.entries({ xmin: '2', xmax: '1', ymin: '-5', ymax: '5' })) context.document.getElementById(id).value = value;
    g.readRange(); assert.equal(JSON.stringify(g.view), original);
    context.document.getElementById('xmin').value = ''; g.readRange(); assert.equal(JSON.stringify(g.view), original);
});
test('polar fit preserves equal units on both axes', () => {
    const g = graph(); g.mode = 'polar'; g.sampleCurves = () => [[{ x: -2, y: -2 }, { x: 2, y: 2 }]]; g.fit();
    assert(Math.abs((g.view.xmax - g.view.xmin) / g.width - (g.view.ymax - g.view.ymin) / g.height) < 1e-10);
});
test('zoom round trips keep both spans and the cursor anchor stable', () => {
    const g = graph(), original = { ...g.view };
    for (let i = 0; i < 30; i++) g.zoom(1.25, 0.31, 0.64);
    for (let i = 0; i < 30; i++) g.zoom(0.8, 0.31, 0.64);
    for (const key of Object.keys(original)) assert(Math.abs(g.view[key] - original[key]) < 1e-9);
});
test('deep zoom axis labels remain distinct around a nonzero center', () => {
    const g = graph();
    for (const step of [0.0001, 1e-7, 1e-9]) {
        const labels = Array.from({ length: 5 }, (_, i) => g.formatTick(1 + step * i, step));
        assert.equal(new Set(labels).size, 5);
    }
});
test('zoom rejects invalid factors and precision loss at large offsets', () => {
    const g = graph(); const original = JSON.stringify(g.view);
    for (const factor of [NaN, Infinity, -1, 0]) g.zoom(factor);
    assert.equal(JSON.stringify(g.view), original);
    g.view = { xmin: 1e12, xmax: 1e12 + 100, ymin: -1, ymax: 1 };
    for (let i = 0; i < 100; i++) g.zoom(0.8);
    assert(g.validView(g.view));
    assert(g.view.xmax > g.view.xmin);
});
test('dense oscillations use bounded envelope sampling and recover when zoomed in', () => {
    const g = graph(); g.params = {};
    g.evaluate = context.Grapher.prototype.evaluate;
    const f = { visible: true, compiled: { evaluate: ({x}) => Math.sin(x) }, phases: [{ compiled: { evaluate: ({x}) => x } }] };
    g.view.xmin = -5e7; g.view.xmax = 5e7;
    assert.equal(g.isDense(f), true);
    let calls = 0;
    const ctx = { fillRect() { calls++; } };
    assert(g.drawDensity(ctx, f) <= 480 * 12);
    assert(calls > 0 && calls <= 480);
    g.view.xmin = -10; g.view.xmax = 10;
    assert.equal(g.isDense(f), false);
});
