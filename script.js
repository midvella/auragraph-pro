/**
 * Graphly Pro v4.5 - "The Completion Update"
 */

class Grapher {
    constructor() {
        this.canvas = document.getElementById('graph-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.coordDisplay = document.getElementById('coordinates');
        
        // State
        this.functions = [];
        this.colors = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
        this.zoom = 50;
        this.offset = { x: 0, y: 0 };
        this.isPanning = false;
        this.isExporting = false; // Flag to prevent interactions during export
        this.lastMousePos = { x: 0, y: 0 };
        this.mousePos = { x: 0, y: 0 };
        this.tracePoint = null;
        this.focusedInput = null;
        
        this.params = { a: 1.0, b: 0.0, c: 0.0 };
        this.settings = {
            gridDensity: 50,
            showAxes: true,
            mode: 'cartesian', // cartesian, polar, parametric
            showCritical: true,
            showIntegral: false,
            integralRange: { start: 0, end: 2 },
            theme: 'dark'
        };

        this.init();
    }

    init() {
        window.addEventListener('resize', () => this.resize());
        this.resize();

        // Mouse & Keyboard
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        window.addEventListener('mouseup', () => this.handleMouseUp());
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
        window.addEventListener('keydown', (e) => this.handleKeydown(e));

        // Core UI Events
        document.getElementById('add-function-btn').addEventListener('click', () => this.addFunction());
        document.getElementById('reset-view-btn').addEventListener('click', () => this.resetView());
        document.getElementById('theme-toggle').addEventListener('click', () => this.toggleTheme());
        document.getElementById('export-btn').addEventListener('click', () => this.exportImage('png'));
        
        // Advanced Toggles
        document.getElementById('graph-mode').addEventListener('change', (e) => {
            this.settings.mode = e.target.value;
            this.draw();
        });
        document.getElementById('show-critical-points').addEventListener('change', (e) => {
            this.settings.showCritical = e.target.checked;
            this.draw();
        });
        document.getElementById('show-integral').addEventListener('change', (e) => {
            this.settings.showIntegral = e.target.checked;
            this.draw();
        });

        // Parameters & Range
        ['a', 'b', 'c'].forEach(p => {
            const el = document.getElementById(`param-${p}`);
            el.addEventListener('input', (e) => {
                this.params[p] = parseFloat(e.target.value);
                document.getElementById(`val-${p}`).innerText = this.params[p].toFixed(1);
                this.draw();
                this.updateActiveStats();
            });
        });

        document.getElementById('xmin').addEventListener('change', () => this.syncRangeFromInputs());
        document.getElementById('xmax').addEventListener('change', () => this.syncRangeFromInputs());

        // Toolbar & Library
        document.querySelectorAll('.math-btn').forEach(btn =>btn.addEventListener('click', () => this.insertMath(btn.dataset.tool)));
        document.querySelectorAll('.lib-btn').forEach(btn => btn.addEventListener('click', () => this.loadFromLibrary(btn.dataset.expr)));
        
        // Zoom buttons
        document.getElementById('zoom-in').addEventListener('click', () => this.handleZoom(1.2));
        document.getElementById('zoom-out').addEventListener('click', () => this.handleZoom(0.8));

        // Initial Function
        this.addFunction('a * sin(b * x) + c');
        this.draw();
        lucide.createIcons();
    }

    // --- Core Methods ---

    resize() {
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;
        this.syncInputsFromRange();
        this.draw();
    }

    handleKeydown(e) {
        const step = 20 / this.zoom;
        switch(e.key.toLowerCase()) {
            case '+': case '=': this.handleZoom(1.1); break;
            case '-': this.handleZoom(0.9); break;
            case 'r': this.resetView(); break;
            case 'arrowleft': this.offset.x -= step; break;
            case 'arrowright': this.offset.x += step; break;
            case 'arrowup': this.offset.y += step; break;
            case 'arrowdown': this.offset.y -= step; break;
        }
        this.syncInputsFromRange();
        this.draw();
    }

    addFunction(initialValue = '') {
        const id = Date.now().toString();
        const color = this.colors[this.functions.length % this.colors.length];
        const func = { id, expression: initialValue, color, visible: true, error: null };
        this.functions.push(func);
        this.renderFunctionUI(func);
        this.draw();
    }

    updateActiveStats() {
        if (this.focusedInput) {
            const func = this.functions.find(f => f.id === this.focusedInput.closest('.function-item').dataset.id);
            if (func) this.updateAnalysis(func);
        }
    }

    // --- Advanced Analysis Engine ---

    updateAnalysis(func) {
        const statsEl = document.getElementById('function-stats');
        if (!func || !func.visible || !func.expression || func.error || this.settings.mode !== 'cartesian') {
            statsEl.style.display = 'none';
            return;
        }

        try {
            const compiled = math.compile(func.expression);
            const scope = { ...this.params };
            
            // 1. Y-Intercept
            const y0 = compiled.evaluate({ ...scope, x: 0 });
            document.getElementById('stat-y-intercept').innerText = isFinite(y0) ? `(0, ${y0.toFixed(2)})` : 'Tanımsız';
            
            // 2. Roots & Extremums (Numeric)
            const analysis = this.analyzeFunction(compiled);
            document.getElementById('stat-roots').innerText = analysis.roots.length > 0 ? analysis.roots.map(r => r.toFixed(2)).join(', ') : 'Yok';
            
            // 3. Derivative (Symbolic)
            try {
                const der = math.derivative(func.expression, 'x');
                document.getElementById('stat-derivative').innerText = `f'(x) = ${der.toString()}`;
            } catch (e) { document.getElementById('stat-derivative').innerText = 'Nümerik'; }

            // 4. Domain & Summary
            document.getElementById('stat-domain').innerText = this.detectDomain(compiled);
            document.getElementById('stat-summary').innerText = this.generateSummary(analysis);
            
            statsEl.style.display = 'block';
            func.analysis = analysis; // Store for drawing markers
        } catch (e) { statsEl.style.display = 'none'; }
    }

    analyzeFunction(compiled) {
        const roots = [];
        const extremums = [];
        const inflections = [];
        const step = 0.1;
        const left = this.toMathX(0) - 2;
        const right = this.toMathX(this.canvas.width) + 2;

        for (let x = left; x <= right; x += step) {
            const y1 = compiled.evaluate({ x, ...this.params });
            const y2 = compiled.evaluate({ x: x + step, ...this.params });
            const y3 = compiled.evaluate({ x: x + 2*step, ...this.params });

            if (isFinite(y1) && isFinite(y2)) {
                // Roots
                if (y1 * y2 <= 0) roots.push(x - y1 * (step / (y2 - y1)));
                
                // Extremums (1st Deriv = 0)
                const dy1 = (y2 - y1) / step;
                const dy2 = (y3 - y2) / step;
                if (dy1 * dy2 <= 0) extremums.push({ x: x + step, y: y2 });

                // Inflections (2nd Deriv = 0)
                const ddy1 = (dy2 - dy1) / step;
                // Simplified inflection detection
            }
        }
        return { roots: [...new Set(roots.map(r => Math.round(r*100)/100))], extremums };
    }

    detectDomain(compiled) {
        try {
            const val = compiled.evaluate({ x: -1000, ...this.params });
            if (isNaN(val)) return "Tanımsız Alanlar Var";
            return "ℝ (Tüm Gerçel Sayılar)";
        } catch(e) { return "Kısıtlı"; }
    }

    generateSummary(analysis) {
        let msg = `${analysis.roots.length} kök bulundu. `;
        if (analysis.extremums.length > 0) msg += `${analysis.extremums.length} yerel ekstremum tespit edildi. `;
        return msg;
    }

    // --- Professional Drawing Engine ---

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();
        
        this.drawGrid();
        if (this.settings.showAxes) this.drawAxes();
        
        this.functions.forEach(f => {
            if (this.settings.mode === 'cartesian') this.drawCartesian(f);
            else if (this.settings.mode === 'polar') this.drawPolar(f);
            else if (this.settings.mode === 'parametric') this.drawParametric();
        });

        if (this.tracePoint) this.drawTracePoint();
        this.ctx.restore();
    }

    drawCartesian(func) {
        if (!func.expression || !func.visible || func.error) return;
        const compiled = math.compile(func.expression);
        
        // 1. Integral Filling
        if (this.settings.showIntegral) {
            this.ctx.fillStyle = func.color + '22';
            this.ctx.beginPath();
            const startX = this.settings.integralRange.start;
            const endX = this.settings.integralRange.end;
            for (let x = startX; x <= endX; x += 0.05) {
                const y = compiled.evaluate({ x, ...this.params });
                this.ctx.lineTo(this.toScreenX(x), this.toScreenY(y));
            }
            this.ctx.lineTo(this.toScreenX(endX), this.toScreenY(0));
            this.ctx.lineTo(this.toScreenX(startX), this.toScreenY(0));
            this.ctx.fill();
        }

        // 2. Curve
        this.ctx.strokeStyle = func.color;
        this.ctx.lineWidth = 2.5;
        this.ctx.beginPath();
        const left = this.toMathX(0);
        const right = this.toMathX(this.canvas.width);
        const step = (right - left) / 1200;
        
        let first = true;
        for (let x = left; x <= right; x += step) {
            const y = compiled.evaluate({ x, ...this.params });
            if (isFinite(y)) {
                const sx = this.toScreenX(x);
                const sy = this.toScreenY(y);
                if (first) { this.ctx.moveTo(sx, sy); first = false; }
                else { this.ctx.lineTo(sx, sy); }
            } else { first = true; }
        }
        this.ctx.stroke();

        // 3. Critical Points
        if (this.settings.showCritical && func.analysis) {
            func.analysis.extremums.forEach(p => this.drawMarker(p.x, p.y, '#f59e0b', 'Max/Min'));
            func.analysis.roots.forEach(r => this.drawMarker(r, 0, '#ec4899', 'Kök'));
        }
    }

    drawPolar(func) {
        if (!func.expression || !func.visible) return;
        const compiled = math.compile(func.expression);
        this.ctx.strokeStyle = func.color;
        this.ctx.beginPath();
        for (let theta = 0; theta <= Math.PI * 4; theta += 0.05) {
            const r = compiled.evaluate({ theta, x: theta, θ: theta, ...this.params });
            const x = r * Math.cos(theta);
            const y = r * Math.sin(theta);
            this.ctx.lineTo(this.toScreenX(x), this.toScreenY(y));
        }
        this.ctx.stroke();
    }

    drawParametric() {
        if (this.functions.length < 2) return;
        const fX = math.compile(this.functions[0].expression);
        const fY = math.compile(this.functions[1].expression);
        this.ctx.strokeStyle = this.functions[0].color;
        this.ctx.beginPath();
        for (let t = -10; t <= 10; t += 0.05) {
            const x = fX.evaluate({ t, ...this.params });
            const y = fY.evaluate({ t, ...this.params });
            this.ctx.lineTo(this.toScreenX(x), this.toScreenY(y));
        }
        this.ctx.stroke();
    }

    drawMarker(x, y, color, label) {
        const sx = this.toScreenX(x);
        const sy = this.toScreenY(y);
        
        // Scale size based on zoom (between 4 and 10 pixels for dot)
        const dotSize = Math.max(4, Math.min(10, this.zoom / 10));
        const fontSize = Math.max(10, Math.min(16, this.zoom / 5));

        this.ctx.fillStyle = color;
        this.ctx.beginPath(); 
        this.ctx.arc(sx, sy, dotSize, 0, Math.PI*2); 
        this.ctx.fill();
        
        // Marker border
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();

        this.ctx.font = `600 ${fontSize}px Outfit`;
        this.ctx.fillStyle = color;
        
        // Add minimal shadow for text legibility
        this.ctx.shadowBlur = 4;
        this.ctx.shadowColor = 'rgba(0,0,0,0.3)';
        this.ctx.fillText(label, sx + dotSize + 2, sy - dotSize - 2);
        this.ctx.shadowBlur = 0;
    }

    // --- Helpers & UI ---

    drawGrid() {
        const step = this.calculateGridStep();
        const color = this.settings.theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0,0,0,0.05)';
        this.ctx.strokeStyle = color;
        
        const left = this.toMathX(0), right = this.toMathX(this.canvas.width);
        const bottom = this.toMathY(this.canvas.height), top = this.toMathY(0);

        for (let x = Math.floor(left/step)*step; x <= right; x += step) {
            const sx = this.toScreenX(x);
            this.ctx.beginPath(); this.ctx.moveTo(sx, 0); this.ctx.lineTo(sx, this.canvas.height); this.ctx.stroke();
        }
        for (let y = Math.floor(bottom/step)*step; y <= top; y += step) {
            const sy = this.toScreenY(y);
            this.ctx.beginPath(); this.ctx.moveTo(0, sy); this.ctx.lineTo(this.canvas.width, sy); this.ctx.stroke();
        }
    }

    drawAxes() {
        this.ctx.strokeStyle = this.settings.theme === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)';
        const sx0 = this.toScreenX(0), sy0 = this.toScreenY(0);
        this.ctx.beginPath(); this.ctx.moveTo(sx0, 0); this.ctx.lineTo(sx0, this.canvas.height); this.ctx.stroke();
        this.ctx.beginPath(); this.ctx.moveTo(0, sy0); this.ctx.lineTo(this.canvas.width, sy0); this.ctx.stroke();
    }

    toMathX(sx) { return (sx - this.canvas.width / 2) / this.zoom + this.offset.x; }
    toMathY(sy) { return (this.canvas.height / 2 - sy) / this.zoom + this.offset.y; }
    toScreenX(mx) { return (mx - this.offset.x) * this.zoom + this.canvas.width / 2; }
    toScreenY(my) { return this.canvas.height / 2 - (my - this.offset.y) * this.zoom; }

    calculateGridStep() {
        // Higher density = smaller steps = more lines
        const rawStep = (110 - this.settings.gridDensity) / this.zoom;
        const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
        const norm = rawStep / mag;
        
        let step;
        if (norm < 1.5) step = 1 * mag;
        else if (norm < 3.5) step = 2 * mag;
        else if (norm < 7.5) step = 5 * mag;
        else step = 10 * mag;
        
        return Math.max(step, 0.0001); // Prevent zero steps
    }

    renderFunctionUI(func) {
        const container = document.getElementById('function-list');
        const item = document.createElement('div');
        item.className = 'function-item';
        item.dataset.id = func.id;
        item.innerHTML = `
            <div class="function-header">
                <input type="color" class="color-picker" value="${func.color}">
                <button class="visibility-btn"><i data-lucide="eye"></i></button>
                <button class="remove-btn"><i data-lucide="trash-2"></i></button>
            </div>
            <div class="function-input-wrapper">
                <span class="function-input-prefix">f(x) =</span>
                <input type="text" value="${func.expression}" spellcheck="false">
            </div>
            <div class="error-msg"></div>
        `;
        
        const input = item.querySelector('input[type="text"]');
        const colorPicker = item.querySelector('.color-picker');

        input.addEventListener('input', (e) => {
            func.expression = e.target.value;
            this.updateAnalysis(func);
            this.draw();
        });

        colorPicker.addEventListener('change', (e) => {
            func.color = e.target.value;
            this.draw();
        });
        input.addEventListener('focus', () => { this.focusedInput = input; this.updateAnalysis(func); });
        item.querySelector('.remove-btn').addEventListener('click', () => this.removeFunction(func.id));
        item.querySelector('.visibility-btn').addEventListener('click', () => this.toggleVisibility(func.id));
        container.appendChild(item);
        lucide.createIcons();
    }

    handleMouseDown(e) { this.isPanning = true; this.lastMousePos = { x: e.clientX, y: e.clientY }; }
    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        this.mousePos = { x: this.toMathX(mx), y: this.toMathY(my) };
        this.coordDisplay.innerText = `x: ${this.mousePos.x.toFixed(2)}, y: ${this.mousePos.y.toFixed(2)}`;
        if (this.isPanning) {
            this.offset.x -= (e.clientX - this.lastMousePos.x) / this.zoom;
            this.offset.y += (e.clientY - this.lastMousePos.y) / this.zoom;
            this.lastMousePos = { x: e.clientX, y: e.clientY };
            this.syncInputsFromRange();
        } else {
            this.findTracePoint();
        }
        this.draw();
    }
    handleMouseUp() { this.isPanning = false; }

    findTracePoint() {
        this.tracePoint = null;
        let minPixelDist = 30; // Max pixels away to snap

        if (this.settings.mode !== 'cartesian') return;

        const mx = this.toScreenX(this.mousePos.x);
        const my = this.toScreenY(this.mousePos.y);

        for (const func of this.functions) {
            if (!func.visible || !func.expression || func.error) continue;

            try {
                const compiled = math.compile(func.expression);
                
                // Search in a small pixel range around the mouse for the best snap
                for (let dx = -10; dx <= 10; dx += 1) {
                    const testX = this.toMathX(mx + dx);
                    const valY = compiled.evaluate({ x: testX, ...this.params });
                    
                    if (typeof valY === 'number' && isFinite(valY)) {
                        const sx = mx + dx;
                        const sy = this.toScreenY(valY);
                        
                        const pixelDist = Math.sqrt((sx - mx) ** 2 + (sy - my) ** 2);
                        
                        if (pixelDist < minPixelDist) {
                            minPixelDist = pixelDist;
                            this.tracePoint = { x: testX, y: valY, color: func.color };
                        }
                    }
                }
            } catch (e) {}
        }
    }

    drawTracePoint() {
        if (!this.tracePoint) return;
        const sx = this.toScreenX(this.tracePoint.x);
        const sy = this.toScreenY(this.tracePoint.y);

        this.ctx.save();
        
        // Draw glow/shadow
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = 'rgba(0,0,0,0.5)';
        
        // Main dot
        this.ctx.beginPath();
        this.ctx.arc(sx, sy, 7, 0, Math.PI * 2);
        this.ctx.fillStyle = this.tracePoint.color;
        this.ctx.fill();
        
        // Border
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // Label background
        const label = `(${this.tracePoint.x.toFixed(2)}, ${this.tracePoint.y.toFixed(2)})`;
        const textWidth = this.ctx.measureText(label).width;
        
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.roundRect(sx + 10, sy - 30, textWidth + 10, 20, 5);
        this.ctx.fill();
        
        // Label text
        this.ctx.font = '600 13px Outfit';
        this.ctx.fillStyle = '#fff';
        this.ctx.fillText(label, sx + 15, sy - 16);
        
        this.ctx.restore();
    }
    handleWheel(e) { e.preventDefault(); this.handleZoom(e.deltaY > 0 ? 0.9 : 1.1); }
    handleZoom(f) { this.zoom = Math.max(1, Math.min(10000, this.zoom * f)); this.draw(); this.syncInputsFromRange(); }
    syncInputsFromRange() {
        document.getElementById('xmin').value = this.toMathX(0).toFixed(1);
        document.getElementById('xmax').value = this.toMathX(this.canvas.width).toFixed(1);
    }
    syncRangeFromInputs() {
        const xmin = parseFloat(document.getElementById('xmin').value);
        const xmax = parseFloat(document.getElementById('xmax').value);
        this.zoom = this.canvas.width / (xmax - xmin);
        this.offset.x = (xmin + xmax) / 2;
        this.draw();
    }
    resetView() { this.zoom = 50; this.offset = { x: 0, y: 0 }; this.draw(); this.syncInputsFromRange(); }
    toggleVisibility(id) { const f = this.functions.find(f => f.id === id); if(f) { f.visible = !f.visible; this.draw(); } }
    removeFunction(id) { this.functions = this.functions.filter(f => f.id !== id); document.querySelector(`[data-id="${id}"]`).remove(); this.draw(); }
    toggleTheme() {
        this.settings.theme = this.settings.theme === 'dark' ? 'light' : 'dark';
        document.body.classList.toggle('light-mode');
        this.draw();
    }

    insertMath(tool) {
        if (!this.focusedInput) return;
        const input = this.focusedInput;
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const text = input.value;
        const before = text.substring(0, start);
        const after = text.substring(end);
        
        input.value = before + tool + after;
        input.focus();
        
        // Position cursor inside parentheses if they exist
        if (tool.includes('()')) {
            const pos = start + tool.indexOf('(') + 1;
            input.setSelectionRange(pos, pos);
        } else {
            const pos = start + tool.length;
            input.setSelectionRange(pos, pos);
        }
        
        // Trigger update
        input.dispatchEvent(new Event('input'));
    }

    loadFromLibrary(expr) {
        if (this.focusedInput) {
            this.focusedInput.value = expr;
            this.focusedInput.dispatchEvent(new Event('input'));
        } else {
            this.addFunction(expr);
        }
    }

    async exportImage() {
        if (this.isExporting) return;
        this.isExporting = true;
        this.showToast("Görsel hazırlanıyor, lütfen bekleyin...", "info");

        try {
            await this.generateProfessionalImage();
            this.showToast("Görsel başarıyla kaydedildi!", "success");
        } catch (err) {
            console.error(err);
            this.showToast("Kayıt sırasında hata oluştu.", "error");
        } finally {
            this.isExporting = false;
        }
    }

    async generateProfessionalImage() {
        // Create high-res offscreen canvas
        const exportCanvas = document.createElement('canvas');
        const scale = 2; // 2x Resolution
        exportCanvas.width = this.canvas.width * scale;
        exportCanvas.height = this.canvas.height * scale;
        const eCtx = exportCanvas.getContext('2d');

        // Draw background
        eCtx.fillStyle = this.settings.theme === 'dark' ? '#0f172a' : '#ffffff';
        eCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

        // Simple approach: Scale current canvas bits
        eCtx.drawImage(this.canvas, 0, 0, exportCanvas.width, exportCanvas.height);

        // Add Watermark
        eCtx.save();
        eCtx.fillStyle = 'rgba(128, 128, 128, 0.5)';
        eCtx.font = 'bold 30px Outfit';
        eCtx.fillText("AURAGRAPH PRO", 40, exportCanvas.height - 40);
        
        const timestamp = new Date().toLocaleDateString();
        eCtx.font = '20px Outfit';
        eCtx.fillText(timestamp, exportCanvas.width - 150, exportCanvas.height - 40);
        eCtx.restore();

        const link = document.createElement('a');
        link.download = `AuraGraph-Snapshot-${Date.now()}.png`;
        link.href = exportCanvas.toDataURL("image/png");
        link.click();
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <span class="message">${message}</span>
            </div>
        `;
        container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 100);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

window.onload = () => new Grapher();
