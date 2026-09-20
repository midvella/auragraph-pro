/* AuraGraph: bounded sampling, cached compilation and demand-driven rendering. */
class Grapher {
    constructor() {
        this.canvas = document.getElementById('graph-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.functions = [];
        this.colors = ['#8b85ff', '#38d6b0', '#f5ae62', '#f17eae', '#62baff'];
        this.params = { a: 1, b: 1, c: 0 };
        this.view = { xmin: -10, xmax: 10, ymin: -5, ymax: 5 };
        this.autoFit = true;
        this.mode = 'cartesian';
        this.theme = 'dark';
        this.dirty = true;
        this.base = document.createElement('canvas');
        this.init();
    }
    init() {
        const on = (id, event, callback) => document.getElementById(id).addEventListener(event, callback);
        on('add-function-btn', 'click', () => this.addFunction(''));
        on('fit-view-btn', 'click', () => { this.setAuto(true); this.fit(); });
        on('auto-fit', 'change', e => { this.setAuto(e.target.checked); if (this.autoFit) this.fit(); });
        on('reset-view-btn', 'click', () => this.reset());
        on('zoom-in', 'click', () => this.zoom(0.8));
        on('zoom-out', 'click', () => this.zoom(1.25));
        on('theme-toggle', 'click', () => {
            this.theme = this.theme === 'dark' ? 'light' : 'dark';
            document.body.classList.toggle('light-mode', this.theme === 'light');
            this.requestDraw();
        });
        on('export-btn', 'click', () => this.exportImage());
        on('graph-mode', 'change', e => {
            this.mode = e.target.value;
            this.functions.forEach(f => this.compile(f));
            this.updateLabels();
            this.changed();
        });
        ['show-critical-points', 'show-integral', 'grid-density'].forEach(id => on(id, 'input', () => this.requestDraw()));
        ['xmin', 'xmax', 'ymin', 'ymax'].forEach(id => on(id, 'change', () => { if (id.startsWith('y')) this.setAuto(false); this.readRange(); }));
        ['a', 'b', 'c'].forEach(p => {
            document.getElementById(`param-${p}`).value = this.params[p];
            document.getElementById(`val-${p}`).textContent = this.params[p].toFixed(1);
            on(`param-${p}`, 'input', e => {
                this.params[p] = Number(e.target.value);
                document.getElementById(`val-${p}`).textContent = this.params[p].toFixed(1);
                this.changed();
            });
        });
        document.querySelectorAll('.lib-btn').forEach(btn => btn.addEventListener('click', () => {
            const f = this.functions.find(f => f.id === this.active);
            if (f) { f.input.value = btn.dataset.expr; this.edit(f); } else this.addFunction(btn.dataset.expr);
        }));
        document.querySelectorAll('.math-btn').forEach(btn => {
            btn.addEventListener('mousedown', e => e.preventDefault());
            btn.addEventListener('click', () => {
                let f = this.functions.find(f => f.id === this.active);
                if (!f) f = this.addFunction('');
                const input = f.input, start = input.selectionStart, tool = btn.dataset.tool;
                input.setRangeText(tool, start, input.selectionEnd, 'end');
                if (tool.includes('()')) input.setSelectionRange(start + tool.indexOf('(') + 1, start + tool.indexOf('(') + 1);
                input.focus(); this.edit(f);
            });
        });
        this.canvas.addEventListener('pointerdown', e => {
            if (e.button !== 0) return;
            this.setAuto(false);
            this.drag = { x: e.clientX, y: e.clientY, view: { ...this.view } };
            this.canvas.setPointerCapture(e.pointerId);
            this.canvas.classList.add('dragging');
        });
        this.canvas.addEventListener('pointermove', e => this.pointerMove(e));
        const release = () => { this.drag = null; this.canvas.classList.remove('dragging'); };
        this.canvas.addEventListener('pointerup', release);
        this.canvas.addEventListener('pointercancel', release);
        this.canvas.addEventListener('pointerleave', () => { this.trace = null; this.requestDraw(false); });
        this.canvas.addEventListener('wheel', e => {
            e.preventDefault();
            const r = this.canvas.getBoundingClientRect();
            this.zoom(Math.exp(Math.max(-0.2, Math.min(0.2, e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.height : 1) * 0.001))), (e.clientX - r.left) / this.width, (e.clientY - r.top) / this.height);
        }, { passive: false });
        this.canvas.addEventListener('dblclick', () => { this.setAuto(true); this.fit(); });
        window.addEventListener('keydown', e => {
            if (e.target.matches('input, select, textarea, button') || e.target.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
            if (['+', '=', '-', 'r', 'f', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape'].includes(e.key)) e.preventDefault();
            if (e.key === '+' || e.key === '=') this.zoom(0.8);
            if (e.key === '-') this.zoom(1.25);
            if (e.key === 'r') this.reset();
            if (e.key === 'f') { this.setAuto(true); this.fit(); }
            if (e.key === 'Escape') { this.trace = null; this.requestDraw(false); }
            if (e.key.startsWith('Arrow')) {
                this.setAuto(false);
                const dx = (this.view.xmax - this.view.xmin) * 0.08 * (e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0);
                const dy = (this.view.ymax - this.view.ymin) * 0.08 * (e.key === 'ArrowDown' ? -1 : e.key === 'ArrowUp' ? 1 : 0);
                this.view.xmin += dx; this.view.xmax += dx; this.view.ymin += dy; this.view.ymax += dy;
                this.requestDraw();
            }
        });
        new ResizeObserver(() => this.resize()).observe(this.canvas.parentElement);
        this.resize();
        this.addFunction('a * sin(b * x) + c');
        this.icons();
    }
    icons() { window.lucide?.createIcons(); }
    addFunction(expression) {
        if (this.functions.length >= 12) { this.status('Akıcı çizim için en fazla 12 fonksiyon ekleyebilirsin.'); return this.functions[0]; }
        const f = { id: crypto.randomUUID(), expression, color: this.colors[this.functions.length % this.colors.length], visible: true };
        const item = document.createElement('div');
        item.className = 'function-item';
        item.innerHTML = `<div class="function-header"><input type="color" class="color-picker" aria-label="Eğri rengi"><span class="function-name"></span><button class="visibility-btn" title="Göster / gizle" aria-label="Göster / gizle" aria-pressed="true"><i data-lucide="eye"></i></button><button class="remove-btn" title="Fonksiyonu sil" aria-label="Fonksiyonu sil"><i data-lucide="trash-2"></i></button></div><div class="function-input-wrapper"><span class="function-input-prefix"></span><input type="text" spellcheck="false" maxlength="300" aria-label="Fonksiyon ifadesi" placeholder="Örn. sin(x)"></div><div class="error-msg" role="status"></div>`;
        f.item = item; f.input = item.querySelector('input[type=text]');
        f.input.value = expression;
        item.querySelector('input[type=color]').value = f.color;
        item.style.setProperty('--curve', f.color);
        f.input.addEventListener('input', () => {
            clearTimeout(f.timer);
            f.timer = setTimeout(() => this.edit(f), 160);
        });
        f.input.addEventListener('focus', () => { this.active = f.id; this.requestDraw(); });
        item.querySelector('input[type=color]').addEventListener('input', e => { f.color = e.target.value; item.style.setProperty('--curve', f.color); this.requestDraw(); });
        item.querySelector('.visibility-btn').addEventListener('click', e => {
            f.visible = !f.visible;
            e.currentTarget.setAttribute('aria-pressed', String(f.visible));
            item.classList.toggle('muted', !f.visible); this.changed();
        });
        item.querySelector('.remove-btn').addEventListener('click', () => {
            clearTimeout(f.timer); item.remove(); this.functions = this.functions.filter(v => v !== f);
            if (this.active === f.id) this.active = this.functions[0]?.id;
            this.updateLabels(); this.changed();
        });
        document.getElementById('function-list').append(item);
        this.functions.push(f); this.active = f.id;
        this.compile(f); this.updateLabels(); this.changed(); this.icons();
        return f;
    }
    edit(f) { clearTimeout(f.timer); f.expression = f.input.value.trim(); this.compile(f); this.changed(); }
    compile(f) {
        f.compiled = null; f.error = ''; f.derivative = null; f.analysis = null; f.phases = []; f.dense = false;
        if (f.expression) try {
            const node = math.parse(f.expression.replace(/\bln\(/g, 'log('));
            let count = 0;
            const variables = new Set(['a', 'b', 'c', 'pi', 'e', this.mode === 'parametric' ? 't' : 'x', ...(this.mode === 'polar' ? ['theta', 'θ'] : [])]);
            const calls = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh', 'sqrt', 'abs', 'exp', 'log', 'log10', 'floor', 'ceil', 'round', 'sign', 'min', 'max', 'pow']);
            node.traverse(n => {
                if (++count > 100) throw Error('İfade çok uzun; daha küçük parçalara ayır.');
                if (!['OperatorNode', 'ConstantNode', 'SymbolNode', 'FunctionNode', 'ParenthesisNode'].includes(n.type)) throw Error('Yalnızca sayısal fonksiyon ifadeleri kullanılabilir.');
                if (n.isSymbolNode && !variables.has(n.name) && !calls.has(n.name)) throw Error(`Bilinmeyen değişken: ${n.name}`);
                if (n.isFunctionNode && !calls.has(n.fn.name)) throw Error('Bu fonksiyon desteklenmiyor.');
                if (n.isOperatorNode && !['+', '-', '*', '/', '^', '%'].includes(n.op)) throw Error('Bu işlem desteklenmiyor.');
            });
            f.compiled = node.compile();
            node.traverse(n => {
                if (n.isFunctionNode && ['sin', 'cos', 'tan'].includes(n.fn.name)) f.phases.push({ compiled: n.args[0].compile() });
            });
        } catch (err) { f.error = `İfadeyi kontrol et: ${err.message}`; }
        const error = f.item.querySelector('.error-msg');
        error.textContent = f.error; error.style.display = f.error ? 'block' : 'none';
        f.input.setAttribute('aria-invalid', String(Boolean(f.error)));
    }
    evaluate(f, value) {
        if (!f?.compiled) return NaN;
        try {
            const y = f.compiled.evaluate({ ...this.params, x: value, t: value, theta: value, θ: value });
            return typeof y === 'number' && Number.isFinite(y) ? y : NaN;
        } catch { return NaN; }
    }
    updateLabels() {
        this.functions.forEach((f, i) => {
            f.item.querySelector('.function-name').textContent = `EĞRİ ${String(i + 1).padStart(2, '0')}`;
            f.item.querySelector('.function-input-prefix').textContent = this.mode === 'polar' ? 'r(θ) =' : this.mode === 'parametric' ? (i === 0 ? 'x(t) =' : i === 1 ? 'y(t) =' : '—') : 'f(x) =';
        });
        document.getElementById('mode-label').textContent = { cartesian: 'Kartezyen düzlem', polar: 'Polar düzlem · 0 ≤ θ ≤ 4π', parametric: 'Parametrik · −10 ≤ t ≤ 10 · İlk iki ifade' }[this.mode];
    }
    changed() {
        this.trace = null;
        cancelAnimationFrame(this.changeFrame);
        this.changeFrame = requestAnimationFrame(() => {
            if (this.autoFit) this.fit();
            this.requestDraw();
        });
    }
    setAuto(value) {
        this.autoFit = value;
        document.getElementById('auto-fit').checked = value;
        document.getElementById('view-badge').textContent = value ? 'OTOMATİK KADRAJ' : 'SERBEST GÖRÜNÜM';
    }
    fit() {
        const points = [];
        if (this.mode === 'cartesian') {
            // X is the user's exploration interval; Y adapts to the expressions within it.
            for (const f of this.functions.filter(f => f.visible && f.compiled)) {
                for (let i = 0; i <= 400; i++) {
                    const x = this.view.xmin + (this.view.xmax - this.view.xmin) * i / 400;
                    const y = this.evaluate(f, x);
                    if (Number.isFinite(y) && Math.abs(y) < 1e14) points.push({ x, y });
                }
            }
        } else points.push(...this.sampleCurves(600).flat().filter(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) < 1e14 && Math.abs(p.y) < 1e14));
        if (!points.length) { this.status('Bu aralıkta çizilebilir değer yok. İfadeyi veya X aralığını değiştir.'); this.requestDraw(); return; }
        const bounds = values => {
            values.sort((a, b) => a - b);
            // Trim only extreme tails, so poles do not collapse the useful curve.
            let lo = values[0], hi = values.at(-1);
            const q1 = values[Math.floor(values.length * 0.01)], q99 = values[Math.floor((values.length - 1) * 0.99)];
            const spread = Math.max(q99 - q1, 1e-6);
            lo = Math.max(lo, q1 - spread * 2); hi = Math.min(hi, q99 + spread * 2);
            const pad = Math.max((hi - lo) * 0.14, hi === lo ? Math.max(1, Math.abs(hi) * 0.1) : 1e-6);
            return [lo - pad, hi + pad];
        };
        [this.view.ymin, this.view.ymax] = bounds(points.map(p => p.y));
        if (this.mode !== 'cartesian') {
            [this.view.xmin, this.view.xmax] = bounds(points.map(p => p.x));
            const units = Math.max((this.view.xmax - this.view.xmin) / this.width, (this.view.ymax - this.view.ymin) / this.height);
            const cx = (this.view.xmin + this.view.xmax) / 2, cy = (this.view.ymin + this.view.ymax) / 2;
            this.view = { xmin: cx - units * this.width / 2, xmax: cx + units * this.width / 2, ymin: cy - units * this.height / 2, ymax: cy + units * this.height / 2 };
        }
        this.status(''); this.requestDraw();
    }
    resize() {
        this.width = this.canvas.clientWidth; this.height = this.canvas.clientHeight;
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = Math.round(this.width * this.dpr); this.canvas.height = Math.round(this.height * this.dpr);
        this.base.width = this.canvas.width; this.base.height = this.canvas.height;
        if (this.autoFit && this.functions.length) this.fit();
        this.requestDraw();
    }
    sx(x) { return (x - this.view.xmin) / (this.view.xmax - this.view.xmin) * this.width; }
    sy(y) { return (this.view.ymax - y) / (this.view.ymax - this.view.ymin) * this.height; }
    mx(x) { return this.view.xmin + x / this.width * (this.view.xmax - this.view.xmin); }
    my(y) { return this.view.ymax - y / this.height * (this.view.ymax - this.view.ymin); }
    requestDraw(dirty = true) {
        this.dirty ||= dirty;
        if (this.frame) return;
        this.frame = requestAnimationFrame(() => { this.frame = null; this.draw(); });
    }
    isDense(f) {
        if (this.mode !== 'cartesian' || !f.visible || !f.compiled) return false;
        return (f.phases || []).some(phase => {
            let previous = this.evaluate(phase, this.view.xmin);
            for (let i = 1; i <= 16; i++) {
                const value = this.evaluate(phase, this.view.xmin + (this.view.xmax - this.view.xmin) * i / 16);
                if (Number.isFinite(previous) && Number.isFinite(value) && Math.abs(value - previous) * 16 / this.width > Math.PI / 4) return true;
                previous = value;
            }
            return false;
        });
    }
    drawDensity(ctx, f) {
        // Bounded, nonuniform samples avoid phase-locking to the pixel grid.
        // This is an approximate density envelope, never a resolved curve.
        const columns = Math.min(480, Math.ceil(this.width / 2)), step = this.width / columns;
        ctx.fillStyle = f.color + '55';
        let finite = 0;
        const bands = [];
        for (let i = 0; i < columns; i++) {
            let lo = Infinity, hi = -Infinity;
            for (let j = 0; j < 12; j++) {
                let hash = Math.imul(i * 12 + j + 1, 0x45d9f3b);
                hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
                const fraction = (j + ((hash ^ (hash >>> 16)) >>> 0) / 4294967296) / 12;
                const y = this.evaluate(f, this.mx((i + fraction) * step));
                if (Number.isFinite(y)) { lo = Math.min(lo, y); hi = Math.max(hi, y); finite++; }
            }
            bands.push({ lo, hi });
        }
        for (let i = 0; i < columns; i++) {
            const neighbors = bands.slice(Math.max(0, i - 2), i + 3);
            const lo = Math.min(...neighbors.map(b => b.lo)), hi = Math.max(...neighbors.map(b => b.hi));
            if (lo <= hi) {
                const top = Math.max(0, this.sy(hi)), bottom = Math.min(this.height, this.sy(lo));
                if (bottom >= top) ctx.fillRect(Math.floor(i * step), top, Math.floor((i + 1) * step) - Math.floor(i * step), Math.max(1, bottom - top));
            }
        }
        return finite;
    }
    sampleCurves(count) {
        if (this.mode === 'parametric') {
            const [fx, fy] = this.functions;
            if (!fx?.visible || !fy?.visible || !fx.compiled || !fy.compiled) return [];
            return [Array.from({ length: count + 1 }, (_, i) => { const t = -10 + 20 * i / count; return { x: this.evaluate(fx, t), y: this.evaluate(fy, t) }; })];
        }
        return this.functions.map(f => !f.visible || !f.compiled || f.dense ? [] : Array.from({ length: count + 1 }, (_, i) => {
            if (this.mode === 'polar') { const t = 4 * Math.PI * i / count, r = this.evaluate(f, t); return { x: r * Math.cos(t), y: r * Math.sin(t) }; }
            const x = this.mx(this.width * i / count); return { x, y: this.evaluate(f, x) };
        }));
    }
    draw() {
        if (!this.width || !this.height) return;
        const ctx = this.ctx;
        if (this.dirty) {
            ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            ctx.clearRect(0, 0, this.width, this.height);
            this.drawGrid(ctx);
            this.functions.forEach(f => { f.dense = this.isDense(f); });
            const curves = this.sampleCurves(Math.min(1600, Math.max(500, Math.ceil(this.width))));
            let finite = 0;
            curves.forEach((points, i) => {
                const f = this.functions[i];
                if (f.dense) { finite += this.drawDensity(ctx, f); return; }
                ctx.strokeStyle = f.color; ctx.lineWidth = 2.2; ctx.lineJoin = 'round';
                ctx.beginPath(); let previous = null;
                for (const p of points) {
                    const x = this.sx(p.x), y = this.sy(p.y);
                    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(y) > this.height * 30 || Math.abs(x) > this.width * 30) { previous = null; continue; }
                    finite++;
                    if (!previous || Math.abs(y - previous.y) > this.height * 0.8) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                    previous = { x, y };
                }
                ctx.stroke();
                if (this.mode === 'cartesian' && document.getElementById('show-integral').checked) this.drawIntegral(ctx, f);
            });
            this.updateAnalysis();
            if (this.mode === 'cartesian' && document.getElementById('show-critical-points').checked) {
                const f = this.functions.find(f => f.id === this.active);
                for (const p of (f?.visible && f.compiled && !f.dense ? f.analysis?.points || [] : []).slice(0, 32)) {
                    ctx.beginPath(); ctx.arc(this.sx(p.x), this.sy(p.y), 3.5, 0, Math.PI * 2);
                    ctx.fillStyle = f.color; ctx.fill(); ctx.strokeStyle = this.theme === 'dark' ? '#10131e' : '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
                }
            }
            if (!finite) this.status(this.mode === 'parametric' ? 'Parametrik çizim için ilk iki alana x(t) ve y(t) gir. Örn. cos(t), sin(t).' : 'Çizime başlamak için geçerli bir fonksiyon gir.');
            else this.status(this.functions.some(f => f.dense) ? 'Sık salınımlar yaklaşık yoğunluk bandı olarak gösteriliyor. Ayrıntılar için yakınlaş.' : '');
            const b = this.base.getContext('2d'); b.clearRect(0, 0, this.base.width, this.base.height); b.drawImage(this.canvas, 0, 0);
            this.dirty = false;
            for (const key of ['xmin', 'xmax', 'ymin', 'ymax']) if (document.activeElement !== document.getElementById(key)) document.getElementById(key).value = this.view[key];
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); ctx.drawImage(this.base, 0, 0);
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        if (this.trace) {
            const { x, y, color } = this.trace;
            ctx.beginPath(); ctx.arc(this.sx(x), this.sy(y), 5, 0, 2 * Math.PI); ctx.fillStyle = color; ctx.fill();
            document.getElementById('coordinates').textContent = `Eğri · x: ${this.format(x)}  y: ${this.format(y)}`;
        }
    }
    format(n) { return Math.abs(n) >= 1e5 || (Math.abs(n) < 0.001 && n !== 0) ? n.toExponential(2) : Number(n.toFixed(3)).toString(); }
    formatTick(value, step) {
        const digits = Math.max(0, Math.min(15, -Math.floor(Math.log10(step))));
        if (Math.abs(value) >= 1e7 || step < 1e-5) {
            const precision = Math.max(0, Math.min(15, Math.floor(Math.log10(Math.abs(value) || step)) - Math.floor(Math.log10(step))));
            return value.toExponential(precision);
        }
        return value.toFixed(digits);
    }
    drawGrid(ctx) {
        const nice = raw => { const power = 10 ** Math.floor(Math.log10(raw)), n = raw / power; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * power; };
        const spacing = 130 - Number(document.getElementById('grid-density').value);
        const xs = nice((this.view.xmax - this.view.xmin) * spacing / this.width);
        const ys = nice((this.view.ymax - this.view.ymin) * spacing / this.height);
        ctx.lineWidth = 1; ctx.font = '11px Outfit, sans-serif';
        const dark = this.theme === 'dark';
        const axisX = Math.max(16, Math.min(this.width - 48, this.sx(0))), axisY = Math.max(18, Math.min(this.height - 34, this.sy(0)));
        for (const axis of ['x', 'y']) {
            const min = axis === 'x' ? this.view.xmin : this.view.ymin, max = axis === 'x' ? this.view.xmax : this.view.ymax, step = axis === 'x' ? xs : ys;
            const first = Math.ceil(min / step);
            let labelEnd = -Infinity;
            for (let i = 0; i < 250; i++) {
                const value = (first + i) * step; if (value > max) break;
                const pos = axis === 'x' ? this.sx(value) : this.sy(value);
                ctx.strokeStyle = dark ? '#ffffff0c' : '#18223c12'; ctx.beginPath();
                if (axis === 'x') { ctx.moveTo(pos, 0); ctx.lineTo(pos, this.height); } else { ctx.moveTo(0, pos); ctx.lineTo(this.width, pos); }
                ctx.stroke(); ctx.fillStyle = dark ? '#7c859d' : '#657087';
                if (Math.abs(value) > step * 1e-6) {
                    const label = this.formatTick(value, step), labelWidth = ctx.measureText(label).width;
                    if (axis === 'y' || pos > labelEnd + 12) {
                        ctx.fillText(label, axis === 'x' ? pos + 4 : axisX + 7, axis === 'x' ? axisY + 16 : pos - 6);
                        labelEnd = pos + labelWidth;
                    }
                }
            }
        }
        ctx.strokeStyle = dark ? '#7782a055' : '#34415c55'; ctx.beginPath(); ctx.moveTo(this.sx(0), 0); ctx.lineTo(this.sx(0), this.height); ctx.moveTo(0, this.sy(0)); ctx.lineTo(this.width, this.sy(0)); ctx.stroke();
    }
    drawIntegral(ctx, f) {
        ctx.fillStyle = f.color + '20';
        const lo = Math.max(0, this.view.xmin), hi = Math.min(2, this.view.xmax);
        if (lo >= hi) return;
        for (let i = 0; i < 160; i++) {
            const x1 = lo + (hi - lo) * i / 160, x2 = lo + (hi - lo) * (i + 1) / 160;
            const y1 = this.sy(this.evaluate(f, x1)), y2 = this.sy(this.evaluate(f, x2));
            if (![y1, y2].every(Number.isFinite) || Math.abs(y1 - y2) > this.height) continue;
            ctx.beginPath(); ctx.moveTo(this.sx(x1), this.sy(0)); ctx.lineTo(this.sx(x1), y1); ctx.lineTo(this.sx(x2), y2); ctx.lineTo(this.sx(x2), this.sy(0)); ctx.fill();
        }
    }
    updateAnalysis() {
        const f = this.functions.find(f => f.id === this.active), panel = document.getElementById('function-stats');
        panel.style.display = f?.compiled && f.visible && this.mode === 'cartesian' ? 'block' : 'none';
        if (panel.style.display === 'none') return;
        if (f.dense) {
            f.analysis = null;
            document.getElementById('stat-roots').textContent = 'Ayrıntı için yakınlaş';
            document.getElementById('stat-domain').textContent = `[${this.format(this.view.xmin)}, ${this.format(this.view.xmax)}]`;
            document.getElementById('stat-y-intercept').textContent = Number.isFinite(this.evaluate(f, 0)) ? `(0, ${this.format(this.evaluate(f, 0))})` : 'Tanımsız';
            document.getElementById('stat-derivative').textContent = f.derivative || '—';
            document.getElementById('stat-summary').textContent = 'Bu ölçekte salınımlar tek tek ayırt edilemiyor; kök ve kritik nokta tahminleri gizlendi.';
            return;
        }
        const key = JSON.stringify([f.expression, this.params, this.view.xmin, this.view.xmax]);
        if (f.analysis?.key !== key) {
            const roots = [], points = [], count = 400, step = (this.view.xmax - this.view.xmin) / count;
            let prev2 = null, prev = null, invalid = false;
            for (let i = 0; i <= count; i++) {
                const x = this.view.xmin + step * i, y = this.evaluate(f, x);
                if (!Number.isFinite(y)) { invalid = true; prev = prev2 = null; continue; }
                if (prev && prev.y * y < 0) {
                    let lo = prev.x, hi = x, yl = prev.y;
                    for (let j = 0; j < 24; j++) { const mid = (lo + hi) / 2, ym = this.evaluate(f, mid); if (!Number.isFinite(ym)) break; if (yl * ym <= 0) hi = mid; else { lo = mid; yl = ym; } }
                    const root = (lo + hi) / 2;
                    if (Math.abs(this.evaluate(f, root)) < 1e-5) roots.push(root);
                }
                if (y === 0 && prev && prev.y !== 0) roots.push(x);
                if (prev2 && (prev.y - prev2.y) * (y - prev.y) < 0) {
                    points.push(prev);
                    if (Math.abs(prev.y) < 1e-9) roots.push(prev.x);
                }
                prev2 = prev; prev = { x, y };
            }
            const unique = roots.filter((r, i) => !roots.slice(0, i).some(v => Math.abs(v - r) < step * 0.5));
            f.analysis = { key, roots: unique, points: [...points, ...unique.map(x => ({ x, y: 0 }))], invalid };
        }
        if (f.derivative === null) { try { f.derivative = math.derivative(f.expression.replace(/\bln\(/g, 'log('), 'x').toString(); } catch { f.derivative = 'Bu ifade için hesaplanamadı'; } }
        const y0 = this.evaluate(f, 0);
        document.getElementById('stat-y-intercept').textContent = Number.isFinite(y0) ? `(0, ${this.format(y0)})` : 'Tanımsız';
        document.getElementById('stat-domain').textContent = `[${this.format(this.view.xmin)}, ${this.format(this.view.xmax)}]`;
        document.getElementById('stat-roots').textContent = f.analysis.roots.length ? f.analysis.roots.slice(0, 12).map(r => this.format(r)).join(', ') : 'Bu aralıkta tespit edilmedi';
        document.getElementById('stat-derivative').textContent = f.derivative;
        document.getElementById('stat-summary').textContent = 'Görünür X aralığında sayısal tahmin. Bazı kökler veya dar detaylar örnekler arasında kalabilir.';
    }
    pointerMove(e) {
        const r = this.canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
        this.trace = null;
        if (this.drag) {
            const v = this.drag.view, dx = (e.clientX - this.drag.x) / this.width * (v.xmax - v.xmin), dy = (e.clientY - this.drag.y) / this.height * (v.ymax - v.ymin);
            this.view = { xmin: v.xmin - dx, xmax: v.xmax - dx, ymin: v.ymin + dy, ymax: v.ymax + dy }; this.requestDraw();
        } else if (this.mode === 'cartesian') {
            let distance = 22;
            for (const f of this.functions.filter(f => f.visible && f.compiled && !f.dense)) {
                const x = this.mx(px), y = this.evaluate(f, x), d = Math.abs(this.sy(y) - py);
                if (d < distance) { distance = d; this.trace = { x, y, color: f.color }; }
            }
            this.requestDraw(false);
        }
        document.getElementById('coordinates').textContent = `x: ${this.format(this.mx(px))}  y: ${this.format(this.my(py))}`;
    }
    zoom(factor, ax = 0.5, ay = 0.5) {
        if (![factor, ax, ay].every(Number.isFinite) || factor <= 0) return;
        const v = this.view, w = (v.xmax - v.xmin) * factor, h = (v.ymax - v.ymin) * factor;
        if (w < 1e-7 || h < 1e-7 || w > 1e14 || h > 1e14) return;
        const x = v.xmin + (v.xmax - v.xmin) * ax, y = v.ymax - (v.ymax - v.ymin) * ay;
        const next = { xmin: x - w * ax, xmax: x + w * (1 - ax), ymin: y - h * (1 - ay), ymax: y + h * ay };
        // Do not zoom beyond the representable precision at a large offset.
        if (!this.validView(next)) return;
        this.setAuto(false); this.trace = null;
        this.view = next; this.requestDraw();
    }
    validView(v) {
        return Object.values(v).every(n => Number.isFinite(n) && Math.abs(n) <= 1e14) &&
            ['x', 'y'].every(axis => {
                const lo = v[axis + 'min'], hi = v[axis + 'max'];
                return hi - lo >= Math.max(1e-7, Math.max(Math.abs(lo), Math.abs(hi)) * Number.EPSILON * 4096);
            });
    }
    readRange() {
        const v = Object.fromEntries(['xmin', 'xmax', 'ymin', 'ymax'].map(k => [k, Number(document.getElementById(k).value)]));
        if (!this.validView(v) || ['xmin', 'xmax', 'ymin', 'ymax'].some(k => document.getElementById(k).value === '')) {
            this.status('Geçerli bir aralık gir: minimum, maksimumdan küçük olmalı.'); return;
        }
        this.view = v; this.trace = null;
        if (this.autoFit) this.fit(); else this.requestDraw();
    }
    reset() { this.view = { xmin: -10, xmax: 10, ymin: -5, ymax: 5 }; this.setAuto(true); this.fit(); }
    status(text) { document.getElementById('graph-message').textContent = text; }
    exportImage() {
        this.draw();
        const output = document.createElement('canvas'); output.width = this.canvas.width; output.height = this.canvas.height;
        const ctx = output.getContext('2d'); ctx.fillStyle = this.theme === 'dark' ? '#10131e' : '#f8fafc'; ctx.fillRect(0, 0, output.width, output.height); ctx.drawImage(this.base, 0, 0);
        ctx.font = `${13 * this.dpr}px sans-serif`; ctx.fillStyle = '#858da8'; ctx.fillText('AURAGRAPH PRO', 22 * this.dpr, output.height - 20 * this.dpr);
        output.toBlob(blob => {
            if (!blob) return;
            const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `AuraGraph-${Date.now()}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
    }
}
window.addEventListener('load', () => {
    if (!window.math) { document.getElementById('graph-message').textContent = 'Matematik motoru yüklenemedi. İnternet bağlantını kontrol edip sayfayı yenile.'; return; }
    window.grapher = new Grapher();
});
