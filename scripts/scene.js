import { createPlanetLayout } from './world.js';
import { vs, fs } from './shaders.js';
(() => {
    'use strict';
    // DOM references and WebGL setup
    const app = document.getElementById('app'), art = document.getElementById('galaxy-art'), flash = document.getElementById('flash');
    art.addEventListener('error', () => { document.getElementById('error').classList.add('show'); document.getElementById('error').textContent = 'Не удалось загрузить изображение галактики: assets/galaxy/galaxy_core.png. Проверьте, что папка assets находится рядом с index.html.'; });
    const planets = window.PLANETS || [];
    const canvas = document.getElementById('webgl');
    let gl;
    try {
        gl = canvas.getContext('webgl', { alpha: true, antialias: true, depth: true, preserveDrawingBuffer: false });
        if (!gl)
            throw Error('WebGL не поддерживается браузером');
    }
    catch (err) {
        document.getElementById('error').classList.add('show');
        document.getElementById('error').textContent = 'Не удалось запустить WebGL. Попробуйте Chrome или Edge с аппаратным ускорением. ' + err.message;
        return;
    }
    // Stable spatial placement of all planets
    createPlanetLayout(planets);
    function compile(type, source) { let s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw Error(gl.getShaderInfoLog(s)); return s; }
    // Shader compilation and planet sphere geometry
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const lat = 20, lon = 36, verts = [], norms = [], uvs = [], indices = [];
    for (let a = 0; a <= lat; a++) {
        const th = a * Math.PI / lat;
        for (let b = 0; b <= lon; b++) {
            const ph = b * 2 * Math.PI / lon;
            let x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
            verts.push(x, y, z);
            norms.push(x, y, z);
            uvs.push(b / lon, 1 - a / lat);
        }
    }
    for (let a = 0; a < lat; a++)
        for (let b = 0; b < lon; b++) {
            let q = a * (lon + 1) + b, r = q + lon + 1;
            indices.push(q, r, q + 1, r, r + 1, q + 1);
        }
    function attrib(name, data, step) { let buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW); let loc = gl.getAttribLocation(program, name); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, step, gl.FLOAT, false, 0, 0); }
    attrib('aPosition', verts, 3);
    attrib('aNormal', norms, 3);
    attrib('aUv', uvs, 2);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    const uniforms = {};
    for (const key of ['uLocation', 'uCamera', 'uProjection', 'uSize', 'uSpin', 'uAtlas', 'uTile', 'uActive'])
        uniforms[key] = gl.getUniformLocation(program, key);
    // Texture atlas loading
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([145, 75, 212, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    let texImage = new Image();
    texImage.onload = () => { gl.bindTexture(gl.TEXTURE_2D, texture); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, texImage); };
    texImage.src = 'assets/planets/planet_texture_atlas.webp';

    const NEAR = 0.3;
    const FAR = 600;
    const FOCAL = 1.55;
    const OVERVIEW = { x: 0, y: 0, z: 210 };
    let w = 1, h = 1, inside = false, transitioning = false;
    let cam = { ...OVERVIEW }, goal = { ...OVERVIEW };
    let selection = null, pendingFocus = null;
    let projectionMatrix = new Float32Array(16);
    const detail = document.getElementById('detail');
    const artArea = document.getElementById('art-area');
    const labelLayer = document.getElementById('planet-labels');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        w = Math.max(1, canvas.clientWidth);
        h = Math.max(1, canvas.clientHeight);
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        gl.viewport(0, 0, canvas.width, canvas.height);
        const aspect = w / h;
        projectionMatrix = new Float32Array([
            FOCAL / aspect, 0, 0, 0,
            0, FOCAL, 0, 0,
            0, 0, (FAR + NEAR) / (NEAR - FAR), -1,
            0, 0, 2 * FAR * NEAR / (NEAR - FAR), 0
        ]);
    }
    window.addEventListener('resize', resize);
    resize();

    function projection(p) {
        const dz = cam.z - p.world.z;
        if (dz <= NEAR || dz >= FAR) return null;
        const x = w / 2 + (p.world.x - cam.x) * FOCAL / dz * h / 2;
        const y = h / 2 - (p.world.y - cam.y) * FOCAL / dz * h / 2;
        const size = p.radius * FOCAL / dz * h / 2;
        return { x, y, size };
    }

    const labels = planets.map((planet, index) => {
        const button = document.createElement('button');
        button.className = 'planet-label';
        button.type = 'button';
        button.textContent = planet.username;
        button.hidden = true;
        button.addEventListener('click', () => focus(index));
        labelLayer.appendChild(button);
        return button;
    });

    function updateLabels() {
        labels.forEach((label, index) => {
            const point = projection(planets[index]);
            const visible = inside && point && point.size >= 3 &&
                point.x > -20 && point.x < w + 20 &&
                point.y > -20 && point.y < h + 20;
            label.hidden = !visible;
            if (!visible) return;
            label.style.transform = 'translate3d(' + point.x + 'px,' +
                (point.y - point.size - 10) + 'px,0) translate(-50%,-100%)';
            label.classList.toggle('selected', index === selection);
        });
    }

    function enter() {
        if (inside || transitioning) return;
        transitioning = true;
        app.classList.add('warping');
        detail.classList.remove('open');
        artArea.style.transition = 'transform 1.65s cubic-bezier(.12,.68,.12,1), opacity 1.1s';
        artArea.style.transform = 'scale(8) rotate(22deg)';
        flash.classList.remove('go');
        void flash.offsetWidth;
        flash.classList.add('go');
        const duration = reducedMotion.matches ? 0 : 970;
        setTimeout(() => {
            inside = true;
            transitioning = false;
            app.classList.add('inside');
            cam = { ...OVERVIEW };
            goal = { ...OVERVIEW };
            document.getElementById('subtitle').textContent = 'Внутри галактики GENESIS-01';
            document.getElementById('modeTitle').textContent = '100 планет · 3D-пространство';
            if (pendingFocus !== null) {
                const index = pendingFocus;
                pendingFocus = null;
                focus(index);
            }
        }, duration);
        setTimeout(() => app.classList.remove('warping'), duration + 450);
    }

    function exit() {
        if (!inside || transitioning) return;
        inside = false;
        selection = null;
        pendingFocus = null;
        app.classList.remove('inside', 'warping');
        detail.classList.remove('open');
        labels.forEach(label => label.hidden = true);
        document.getElementById('subtitle').textContent = 'Стадия 3 — Появилась галактика';
        document.getElementById('modeTitle').textContent = 'GENESIS-01 · 100 уникальных планет';
        artArea.style.transition = 'none';
        artArea.style.transform = 'scale(1)';
        void artArea.offsetWidth;
        artArea.style.transition = '';
    }

    function focus(index) {
        if (!Number.isInteger(index) || !planets[index]) return;
        closeSearch();
        if (!inside || transitioning) {
            pendingFocus = index;
            if (!inside && !transitioning) enter();
            return;
        }
        const p = planets[index];
        selection = index;
        const distance = Math.max(38, p.radius * (w < 650 ? 9 : 7));
        goal = { x: p.world.x, y: p.world.y, z: p.world.z + distance };
        document.getElementById('planetId').textContent =
            'ПЛАНЕТА #' + String(p.id).padStart(3, '0') + ' · GENESIS-01';
        document.getElementById('planetName').textContent = p.name;
        document.getElementById('planetUser').textContent = p.username;
        document.getElementById('planetDescription').textContent = p.description;
        document.getElementById('planetStatus').textContent =
            p.active ? '● Подписка активна' : '○ Подписка неактивна — без цвета';
        document.getElementById('statusBtn').textContent =
            p.active ? 'Сделать бесцветной' : 'Вернуть цвет';
        detail.classList.add('open');
    }
    // Animated background and 3D frame render
    function draw(t) {
        let ms = t * .001;
        if (!inside) {
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            requestAnimationFrame(draw);
            return;
        }
        for (let k of ['x', 'y', 'z'])
            cam[k] += (goal[k] - cam[k]) * .055;
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(true);
        gl.disable(gl.CULL_FACE);
        gl.useProgram(program);
        gl.uniform1i(uniforms.uAtlas, 0);
        gl.uniformMatrix4fv(uniforms.uProjection, false, projectionMatrix);
        gl.uniform3f(uniforms.uCamera, cam.x, cam.y, cam.z);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        // Draw from back to front. They are independent 3D spheres with persistent randomly scattered locations.
        const sorted = planets.map((p, i) => ({ p, i }));
        for (const { p, i } of sorted) {
            let zDist = cam.z - p.world.z;
            if (zDist + p.radius < NEAR || zDist - p.radius > FAR)
                continue;
            gl.uniform3f(uniforms.uLocation, p.world.x, p.world.y, p.world.z);
            gl.uniform1f(uniforms.uSize, p.radius * (selection === i ? 1.15 : 1));
            gl.uniform1f(uniforms.uSpin, p.spin + ms * p.speed);
            gl.uniform2f(uniforms.uTile, i % 10, Math.floor(i / 10));
            gl.uniform1f(uniforms.uActive, p.active ? 1 : 0);
            gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
        }
        updateLabels();
        requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);

    // Pointer Events unify mouse dragging and two-finger pinch zoom.
    function zoom(delta) {
        if (!inside) {
            if (delta > 0) enter();
            return;
        }
        goal.z = Math.min(255, Math.max(-60, goal.z - delta));
        if (delta < 0 && goal.z >= 250) exit();
    }

    document.getElementById('plus').onclick = () => zoom(8);
    document.getElementById('minus').onclick = () => zoom(-8);
    document.getElementById('menu').onclick = () => inside ? exit() : enter();
    document.getElementById('goBack').onclick = () => {
        selection = null;
        detail.classList.remove('open');
        goal = { ...OVERVIEW };
    };

    app.addEventListener('wheel', event => {
        if (event.target.closest('button, input, .search, .detail')) return;
        event.preventDefault();
        zoom(event.deltaY < 0 ? 8 : -8);
    }, { passive: false });

    const pointers = new Map();
    let lastPoint = null;
    let lastPinch = null;
    let moved = false;

    function distanceBetweenFingers() {
        const [a, b] = [...pointers.values()];
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    app.addEventListener('pointerdown', event => {
        if (event.target.closest('button, input, .search, .detail, .hud, .footer, .planet-label')) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (event.pointerType !== 'mouse') app.setPointerCapture(event.pointerId);
        if (pointers.size === 1) {
            moved = false;
            lastPoint = { x: event.clientX, y: event.clientY };
        } else if (pointers.size === 2) {
            moved = true;
            lastPinch = distanceBetweenFingers();
            lastPoint = null;
        }
    });

    app.addEventListener('pointermove', event => {
        if (!pointers.has(event.pointerId)) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.size === 2) {
            const now = distanceBetweenFingers();
            if (lastPinch !== null) zoom((now - lastPinch) * 0.16);
            lastPinch = now;
            return;
        }
        if (!inside || !lastPoint) return;
        const dx = event.clientX - lastPoint.x;
        const dy = event.clientY - lastPoint.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        const speed = 0.023 * Math.max(20, Math.abs(cam.z)) / 42;
        goal.x -= dx * speed;
        goal.y += dy * speed;
        lastPoint = { x: event.clientX, y: event.clientY };
    });

    function release(event) {
        if (!pointers.has(event.pointerId)) return;
        const click = inside && !moved && pointers.size === 1 &&
            event.type === 'pointerup';
        pointers.delete(event.pointerId);
        lastPinch = null;
        lastPoint = pointers.size === 1 ? [...pointers.values()][0] : null;
        if (!click) return;

        const rect = canvas.getBoundingClientRect();
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;
        let best = -1;
        let nearest = 36;

        planets.forEach((p, i) => {
            const point = projection(p);
            if (!point) return;
            const d = Math.hypot(point.x - px, point.y - py);
            if (d < Math.max(16, point.size + 7) && d < nearest) {
                nearest = d;
                best = i;
            }
        });
        if (best !== -1) focus(best);
    }
    app.addEventListener('pointerup', release);
    app.addEventListener('pointercancel', release);
    // Search overlay and planet status controls
    const search = document.getElementById('search'), query = document.getElementById('query'), results = document.getElementById('results');
    function show(q) { results.innerHTML = ''; const s = q.toLowerCase().replace(/^@/, '').trim(); for (const p of planets.filter(p => p.username.toLowerCase().includes(s) || (s && String(p.id) === s)).slice(0, s ? 20 : 8)) {
        const b = document.createElement('button');
        b.className = 'result';
        const nm = document.createElement('span');
        nm.textContent = p.username;
        const meta = document.createElement('span');
        meta.textContent = '#' + String(p.id).padStart(3, '0');
        meta.style.color = '#bd98e0';
        b.append(nm, meta);
        b.onclick = () => focus(planets.indexOf(p));
        results.append(b);
    } if (!results.children.length)
        results.textContent = 'Совпадений нет'; }
    function openSearch() { search.classList.add('open'); query.value = ''; show(''); query.focus(); }
    function closeSearch() { search.classList.remove('open'); }
    document.getElementById('searchBtn').onclick = openSearch;
    document.getElementById('closeSearch').onclick = closeSearch;
    query.oninput = () => show(query.value);
    query.onkeydown = e => { if (e.key === 'Escape')
        closeSearch(); if (e.key === 'Enter') {
        const p = planets.find(p => p.username.toLowerCase().replace(/^@/, '') === query.value.trim().toLowerCase().replace(/^@/, ''));
        if (p)
            focus(planets.indexOf(p));
    } };
    document.getElementById('closeDetail').onclick = () => document.getElementById('detail').classList.remove('open');
    document.getElementById('statusBtn').onclick = () => { if (selection == null)
        return; planets[selection].active = !planets[selection].active; focus(selection); };
    window.YOUR_UNIVERSE = { planets, enter, exit, focus };
})();

