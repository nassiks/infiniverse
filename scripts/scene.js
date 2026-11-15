import { createPlanetLayout } from './world.js';
import { vs, fs } from './shaders.js';
(() => {
    'use strict';
    // DOM references and WebGL setup
    const app = document.getElementById('app'), art = document.getElementById('galaxy-art'), flash = document.getElementById('flash');
    art.addEventListener('error', () => { document.getElementById('error').classList.add('show'); document.getElementById('error').textContent = 'Не удалось загрузить изображение галактики: assets/galaxy/galaxy_core.png. Проверьте, что папка assets находится рядом с index.html.'; });
    const planets = window.PLANETS || [];
    const canvas = document.getElementById('webgl'), sky = document.getElementById('space'), ctx = sky.getContext('2d');
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
    const random = createPlanetLayout(planets);
    const stars = Array.from({ length: 800 }, () => ({ x: random(), y: random(), r: random() * 1.4 + .25, l: random() * 2 * Math.PI, c: random() > .68 ? '166,121,252' : '153,179,255' }));
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
    for (const key of ['uLocation', 'uCamera', 'uScreen', 'uSize', 'uSpin', 'uAtlas', 'uTile', 'uActive'])
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
    let w = 1, h = 1, dpr = 1, inside = false, transitioning = false, cam = { x: 0, y: 0, z: 132 }, goal = { x: 0, y: 0, z: 132 }, selection = null, drag = false, dragged = false, lastX = 0, lastY = 0, pinchDist = 0, timeout = null;
    // Screen scaling and scene lifecycle
    function resize() { dpr = Math.min(window.devicePixelRatio || 1, 2); w = canvas.clientWidth; h = canvas.clientHeight; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); sky.width = Math.round(w * dpr); sky.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); gl.viewport(0, 0, canvas.width, canvas.height); }
    window.addEventListener('resize', resize);
    resize();
    function enter() { if (inside || transitioning)
        return; transitioning = true; document.getElementById('detail').classList.remove('open'); art.style.transition = 'transform 1.8s cubic-bezier(.16,.74,.18,1),opacity .95s'; art.style.transform = 'scale(7) rotate(18deg)'; flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go'); window.setTimeout(() => { inside = true; app.classList.add('inside'); document.getElementById('subtitle').textContent = 'Внутри галактики GENESIS-01'; document.getElementById('modeTitle').textContent = '100 планет · расширенное 3D-пространство'; goal = { x: 0, y: 0, z: 132 }; cam = { x: 0, y: 0, z: 132 }; transitioning = false; }, 970); }
    function exit() { if (!inside || transitioning)
        return; inside = false; selection = null; app.classList.remove('inside'); document.getElementById('detail').classList.remove('open'); document.getElementById('subtitle').textContent = 'Стадия 3 — Появилась галактика'; document.getElementById('modeTitle').textContent = 'GENESIS-01 · 100 уникальных планет'; art.style.transition = 'none'; art.style.transform = 'scale(1)'; void art.offsetWidth; art.style.transition = 'transform 1.8s,opacity .9s'; }
    // Search-to-camera navigation and selected planet details
    function focus(i) { if (!Number.isInteger(i) || !planets[i])
        return; if (!inside) {
        enter();
        window.setTimeout(() => focus(i), 1350);
        return;
    } const p = planets[i]; selection = i; goal = { x: p.world.x, y: p.world.y, z: p.world.z + 10 }; document.getElementById('planetId').textContent = 'ПЛАНЕТА #' + String(p.id).padStart(3, '0') + ' · GENESIS-01'; document.getElementById('planetName').textContent = p.name; document.getElementById('planetUser').textContent = p.username; document.getElementById('planetDescription').textContent = p.description; document.getElementById('planetStatus').textContent = p.active ? '● Подписка активна' : '○ Подписка неактивна — без цвета'; document.getElementById('statusBtn').textContent = p.active ? 'Сделать бесцветной' : 'Вернуть цвет'; document.getElementById('detail').classList.add('open'); closeSearch(); }
    function projection(p) { let dx = p.world.x - cam.x, dy = p.world.y - cam.y, dz = cam.z - p.world.z; if (dz <= .2)
        return null; return { x: w / 2 + (dx / (w / h) / dz * 1.55) * w / 2, y: h / 2 - (dy / dz * 1.55) * h / 2, size: p.radius / dz * h * .77 }; }
    // Animated background and 3D frame render
    function drawSky(t) { ctx.clearRect(0, 0, w, h); let inner = inside ? 1 : 0; for (let s of stars) {
        let opacity = .18 + .7 * (.5 + .5 * Math.sin(t * (.35 + s.r * .17) + s.l));
        let xx = s.x * w, yy = s.y * h;
        if (inner) {
            xx = (xx + (t * 5 * s.r)) % w;
            yy = (yy + t * 2 * s.r) % h;
        }
        ctx.fillStyle = `rgba(${s.c},${opacity.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(xx, yy, s.r * (inside ? 1.05 : .67), 0, 6.283);
        ctx.fill();
    } if (inside) {
        let haze = ctx.createRadialGradient(w * .52, h * .53, 4, w * .52, h * .53, Math.max(w, h) * .65);
        haze.addColorStop(0, 'rgba(52,28,92,.18)');
        haze.addColorStop(1, 'rgba(15,7,44,0)');
        ctx.fillStyle = haze;
        ctx.fillRect(0, 0, w, h);
    } }
    function draw(t) {
        let ms = t * .001;
        drawSky(ms);
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
        gl.disable(gl.CULL_FACE);
        gl.useProgram(program);
        gl.uniform1i(uniforms.uAtlas, 0);
        gl.uniform2f(uniforms.uScreen, w / h, 1);
        gl.uniform3f(uniforms.uCamera, cam.x, cam.y, cam.z);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        // Draw from back to front. They are independent 3D spheres with persistent randomly scattered locations.
        const sorted = planets.map((p, i) => ({ p, i })).sort((a, b) => a.p.world.z - b.p.world.z);
        for (const { p, i } of sorted) {
            let zDist = cam.z - p.world.z;
            if (zDist < .1 || zDist > 245)
                continue;
            gl.uniform3f(uniforms.uLocation, p.world.x, p.world.y, p.world.z);
            gl.uniform1f(uniforms.uSize, p.radius * (selection === i ? 1.15 : 1));
            gl.uniform1f(uniforms.uSpin, p.spin + ms * p.speed);
            gl.uniform2f(uniforms.uTile, i % 10, Math.floor(i / 10));
            gl.uniform1f(uniforms.uActive, p.active ? 1 : 0);
            gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
        }
        requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
    // Input handlers: zoom, drag and click
    function zoom(dir) { if (!inside) {
        if (dir > 0)
            enter();
        return;
    } let delta = dir > 0 ? -8 : 8; goal.z = Math.max(-60, Math.min(185, goal.z + delta)); if (dir < 0 && goal.z > 176) {
        exit();
    } }
    ;
    document.getElementById('plus').onclick = () => zoom(1);
    document.getElementById('minus').onclick = () => zoom(-1);
    document.getElementById('back').onclick = exit;
    document.getElementById('menu').onclick = () => { if (inside)
        exit();
    else
        enter(); };
    document.getElementById('goBack').onclick = () => { document.getElementById('detail').classList.remove('open'); selection = null; goal = { x: 0, y: 0, z: 132 }; };
    canvas.addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY < 0 ? 1 : -1); }, { passive: false });
    app.addEventListener('wheel', e => { if (e.target.closest('button, input, .search, .detail'))
        return; e.preventDefault(); zoom(e.deltaY < 0 ? 1 : -1); }, { passive: false });
    canvas.addEventListener('pointerdown', e => { drag = true; dragged = false; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (!drag || !inside)
        return; let dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY; if (Math.abs(dx) + Math.abs(dy) > 3)
        dragged = true; let factor = .023 * Math.max(20, Math.abs(cam.z)) / 42; goal.x -= dx * factor; goal.y += dy * factor; });
    canvas.addEventListener('pointerup', e => { drag = false; if (dragged)
        return; let best = -1, dist = 35; planets.forEach((p, i) => { let a = projection(p); if (!a)
        return; let d = Math.hypot(a.x - e.clientX, a.y - e.clientY); if (d < Math.max(16, a.size + 7) && d < dist) {
        best = i;
        dist = d;
    } }); if (best >= 0)
        focus(best); });
    let startTouch = 0;
    app.addEventListener('touchstart', e => { if (e.touches.length === 2)
        startTouch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }, { passive: true });
    app.addEventListener('touchend', e => { if (startTouch && e.touches.length === 0)
        startTouch = 0; }, { passive: true });
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
        b.onclick = () => focus(p.id - 1);
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
            focus(p.id - 1);
    } };
    document.getElementById('closeDetail').onclick = () => document.getElementById('detail').classList.remove('open');
    document.getElementById('statusBtn').onclick = () => { if (selection == null)
        return; planets[selection].active = !planets[selection].active; focus(selection); };
    window.YOUR_UNIVERSE = { planets, enter, exit, focus };
})();

