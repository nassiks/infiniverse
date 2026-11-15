import { createPlanetLayout } from './world.js';
import { vs, fs } from './shaders.js';
(() => {
    'use strict';
    // DOM references and WebGL setup
    const app = document.getElementById('app'), art = document.getElementById('galaxy-art');
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
    const BOUNDS = { x: 170, y: 95, minZ: -170, maxZ: 240 };
    const menuButton = document.getElementById('menu');
    const settingsPanel = document.getElementById('settings-panel');
    const animationToggle = document.getElementById('animation-toggle');
    const labelsToggle = document.getElementById('labels-toggle');

    function readSetting(key) {
        try { return localStorage.getItem(key) !== 'false'; }
        catch { return true; }
    }
    function saveSetting(key, value) {
        try { localStorage.setItem(key, String(value)); }
        catch { /* Private browsing may disable storage. */ }
    }
    let animationsEnabled = readSetting('infiniverse.animations');
    let labelsEnabled = readSetting('infiniverse.labels');
    animationToggle.checked = animationsEnabled;
    labelsToggle.checked = labelsEnabled;
    app.classList.toggle('animations-off', !animationsEnabled);
    app.classList.toggle('labels-off', !labelsEnabled);
    function clampCamera(p) {
        return {
            x: Math.max(-BOUNDS.x, Math.min(BOUNDS.x, p.x)),
            y: Math.max(-BOUNDS.y, Math.min(BOUNDS.y, p.y)),
            z: Math.max(BOUNDS.minZ, Math.min(BOUNDS.maxZ, p.z))
        };
    }
    function closeSettings() {
        settingsPanel.hidden = true;
        menuButton.setAttribute('aria-expanded', 'false');
    }

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
        return { x, y, size, depth: dz };
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
        if (!inside || !labelsEnabled) {
            labels.forEach(label => { label.hidden = true; });
            return;
        }

        // The projection depth orders HTML usernames even though HTML itself
        // cannot participate in the WebGL depth buffer.
        const projected = planets.map(projection);
        const candidates = [];

        labels.forEach((label, index) => {
            const p = projected[index];
            if (!p || p.size < 3 ||
                p.x < -20 || p.x > w + 20 ||
                p.y < -20 || p.y > h + 20) {
                label.hidden = true;
                return;
            }

            // Use the actual label dimensions, not an estimated text width.
            const width = label.offsetWidth || Math.max(72, label.textContent.length * 8);
            const height = label.offsetHeight || 24;
            const bottom = p.y - p.size - 10;
            const bounds = {
                left: p.x - width / 2,
                right: p.x + width / 2,
                top: bottom - height,
                bottom
            };
            candidates.push({ index, p, label, bounds, bottom });
        });

        // Prefer nearer usernames; a distant username must never paint over
        // a closer one. Stable index ordering makes ties deterministic.
        candidates.sort((a, b) => a.p.depth - b.p.depth || a.index - b.index);
        const accepted = [];

        for (const item of candidates) {
            const { p, label, bounds, index, bottom } = item;

            // Hide behind the visible circular silhouette of a closer planet.
            const behindPlanet = projected.some((near, i) => {
                if (i === index || !near) return false;
                if (near.depth - planets[i].radius >= p.depth) return false;
                const cx = Math.max(bounds.left, Math.min(near.x, bounds.right));
                const cy = Math.max(bounds.top, Math.min(near.y, bounds.bottom));
                const dx = near.x - cx;
                const dy = near.y - cy;
                return dx * dx + dy * dy < (near.size + 2) ** 2;
            });

            // Also hide when a label intersects an already placed (nearer)
            // username. Both rules apply regardless of DOM insertion order.
            const behindLabel = accepted.some(front =>
                bounds.left < front.right &&
                bounds.right > front.left &&
                bounds.top < front.bottom &&
                bounds.bottom > front.top
            );

            const show = !behindPlanet && !behindLabel;
            label.hidden = !show;
            if (!show) continue;

            label.style.transform = 'translate3d(' + p.x + 'px,' +
                bottom + 'px,0) translate(-50%,-100%)';
            label.classList.toggle('selected', index === selection);
            accepted.push(bounds);
        }
    }

    // Both layers crossfade over the same duration. Keep rendering WebGL
    // throughout the transition so there is no frame where neither layer exists.
    const TRANSITION_MS = 1050;
    let transitionTimer = null;

    function updateGalaxyText() {
        document.getElementById('modeTitle').textContent = inside
            ? '100 планет · 3D-пространство'
            : 'GENESIS-01 · 100 уникальных планет';
    }

    function finishTransition() {
        app.classList.remove('entering', 'exiting', 'warping');
        transitioning = false;
        transitionTimer = null;
        updateGalaxyText();

        if (inside && pendingFocus !== null) {
            const index = pendingFocus;
            pendingFocus = null;
            focus(index);
        }
    }

    function enter() {
        if (inside || transitioning) return;

        closeSettings();
        detail.classList.remove('open');
        transitioning = true;
        const animated = animationsEnabled && !reducedMotion.matches;

        // The camera starts in a defined position before WebGL becomes visible.
        cam = { ...OVERVIEW };
        goal = { ...OVERVIEW };

        if (!animated) {
            inside = true;
            finishTransition();
            return;
        }

        app.classList.add('entering');
        transitionTimer = window.setTimeout(() => {
            inside = true;
            app.classList.add('inside');
            // The final inside state has the same opacity/scale as entering.
            finishTransition();
        }, TRANSITION_MS);
    }

    function exit() {
        if (!inside || transitioning) return;

        closeSettings();
        detail.classList.remove('open');
        selection = null;
        pendingFocus = null;
        labels.forEach(label => { label.hidden = true; });
        transitioning = true;

        const animated = animationsEnabled && !reducedMotion.matches;
        if (!animated) {
            inside = false;
            finishTransition();
            return;
        }

        // Start with the current 3D view; fade it under the outer galaxy.
        // The scene continues to render until the crossfade is finished.
        app.classList.add('exiting');
        transitionTimer = window.setTimeout(() => {
            inside = false;
            app.classList.remove('inside');
            finishTransition();
        }, TRANSITION_MS);
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
        goal = clampCamera({ x: p.world.x, y: p.world.y, z: p.world.z + distance });
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
        if (!inside && !transitioning) {
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            requestAnimationFrame(draw);
            return;
        }
        goal = clampCamera(goal);
        for (let k of ['x', 'y', 'z'])
            cam[k] += (goal[k] - cam[k]) * (animationsEnabled ? .055 : 1);
        cam = clampCamera(cam);
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
            gl.uniform1f(uniforms.uSpin, p.spin + (animationsEnabled ? ms * p.speed : 0));
            gl.uniform2f(uniforms.uTile, i % 10, Math.floor(i / 10));
            gl.uniform1f(uniforms.uActive, p.active ? 1 : 0);
            gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
        }
        // Labels appear only once the transition has completed.
        if (inside && !transitioning) updateLabels();
        requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);

    // Pointer Events unify mouse dragging and two-finger pinch zoom.
    function zoom(delta) {
        if (!inside) {
            if (delta > 0) enter();
            return;
        }
        if (delta < 0 && goal.z - delta >= 232) { exit(); return; }
        goal = clampCamera({ ...goal, z: goal.z - delta });
    }

    document.getElementById('plus').onclick = () => zoom(8);
    document.getElementById('minus').onclick = () => zoom(-8);
    menuButton.onclick = () => {
        const open = settingsPanel.hidden;
        settingsPanel.hidden = !open;
        menuButton.setAttribute('aria-expanded', String(open));
    };
    animationToggle.onchange = () => {
        animationsEnabled = animationToggle.checked;
        app.classList.toggle('animations-off', !animationsEnabled);
        saveSetting('infiniverse.animations', animationsEnabled);
    };
    labelsToggle.onchange = () => {
        labelsEnabled = labelsToggle.checked;
        app.classList.toggle('labels-off', !labelsEnabled);
        saveSetting('infiniverse.labels', labelsEnabled);
        if (!labelsEnabled) labels.forEach(label => { label.hidden = true; });
    };
    document.addEventListener('pointerdown', event => {
        if (!settingsPanel.hidden && !settingsPanel.contains(event.target) &&
            !menuButton.contains(event.target)) closeSettings();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeSettings();
    });
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
        goal = clampCamera({
            ...goal, x: goal.x - dx * speed, y: goal.y + dy * speed
        });
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

