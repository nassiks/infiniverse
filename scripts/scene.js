import { createPlanetLayout } from './world.js';
import { vs, fs } from './shaders.js';
(() => {
    'use strict';
    // DOM references and WebGL setup
    const app = document.getElementById('app');
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


    // World state, application preferences and accessible controls.
    const NEAR = 0.3, FAR = 600, FOCAL = 1.55;
    const OVERVIEW = { x:0, y:0, z:210 };
    const BOUNDS = { x:170, y:95, minZ:-170, maxZ:240 };
    const appState = { inside:false, transition:false, selected:null, pending:null };
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    function showToast(message){const toast=ui('toast');toast.textContent=message;toast.hidden=false;window.clearTimeout(showToast.timer);showToast.timer=window.setTimeout(()=>{toast.hidden=true;},2200);}
    const ui = id => document.getElementById(id);
    const detail = ui('detail'), search = ui('search'), help = ui('help'), stages = ui('stages');
    const query = ui('query'), results = ui('results');
    const menuButton = ui('menu'), settings = ui('settings-panel');
    const labelLayer = ui('planet-labels');
    let w=1,h=1,projectionMatrix=new Float32Array(16);
    let camera={...OVERVIEW},target={...OVERVIEW};
    let lastFocus=null,previousFocus=null,activeDialog=null;
    let animationFrame=0, transitionTimer=null;
    const saved = key => { try { return localStorage.getItem(key) !== 'false'; } catch { return true; } };
    const persist = (key,value) => { try { localStorage.setItem(key,String(value)); } catch {} };
    let animationsEnabled=saved('infiniverse.animations');
    let labelsEnabled=saved('infiniverse.labels');
    ui('animation-toggle').checked=animationsEnabled;
    ui('labels-toggle').checked=labelsEnabled;
    app.classList.toggle('animations-off',!animationsEnabled);
    app.classList.toggle('labels-off',!labelsEnabled);
    ui('planetCount').textContent=String(planets.length);

    const clamp = v => ({
        x:Math.max(-BOUNDS.x,Math.min(BOUNDS.x,v.x)),
        y:Math.max(-BOUNDS.y,Math.min(BOUNDS.y,v.y)),
        z:Math.max(BOUNDS.minZ,Math.min(BOUNDS.maxZ,v.z))
    });
    function resize() {
        const dpr=Math.min(window.devicePixelRatio||1,2);
        w=Math.max(1,canvas.clientWidth);h=Math.max(1,canvas.clientHeight);
        canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
        gl.viewport(0,0,canvas.width,canvas.height);
        projectionMatrix=new Float32Array([
            FOCAL/(w/h),0,0,0, 0,FOCAL,0,0,
            0,0,(FAR+NEAR)/(NEAR-FAR),-1,
            0,0,2*FAR*NEAR/(NEAR-FAR),0
        ]);
    }
    window.addEventListener('resize',resize);
    resize();

    function project(p) {
        const depth=camera.z-p.world.z;
        if(depth<=NEAR||depth>=FAR)return null;
        return { x:w/2+(p.world.x-camera.x)*FOCAL/depth*h/2,
            y:h/2-(p.world.y-camera.y)*FOCAL/depth*h/2,
            size:p.radius*FOCAL/depth*h/2,depth };
    }
    const labels=planets.map((p,i)=>{
        const b=document.createElement('button');
        b.type='button';b.className='planet-label';b.textContent=p.username;
        b.hidden=true;b.setAttribute('aria-label','Открыть '+p.username);
        b.addEventListener('click',()=>focusPlanet(i));
        labelLayer.append(b);return b;
    });
    const labelDimensions=labels.map(l=>({
        width:Math.max(72,l.textContent.length*8+24),height:32
    }));
    // Screen-space occlusion: closer spheres and closer labels take priority.
    function updateLabels(){
        if(!appState.inside||appState.transition||!labelsEnabled){
            labels.forEach(l=>{l.hidden=true;});return;
        }
        const projected=planets.map(project);
        const items=[];
        projected.forEach((p,i)=>{
            if(!p||p.size<6||p.x<0||p.x>w||p.y<0||p.y>h)return;
            if(p.size<11&&i!==appState.selected)return; // level-of-detail
            const width=labelDimensions[i].width,height=labelDimensions[i].height;
            const bottom=p.y-p.size-8;
            items.push({p,i,b:{left:p.x-width/2,right:p.x+width/2,top:bottom-height,bottom}});
        });
        items.sort((a,b)=>a.p.depth-b.p.depth||a.i-b.i);
        const accepted=[];
        labels.forEach(l=>{l.hidden=true;});
        for(const item of items){
            const {p,i,b}=item;
            const planetOcclusion=projected.some((near,j)=>{
                if(j===i||!near||near.depth-planets[j].radius>=p.depth)return false;
                const x=Math.max(b.left,Math.min(near.x,b.right));
                const y=Math.max(b.top,Math.min(near.y,b.bottom));
                return (near.x-x)**2+(near.y-y)**2<(near.size+2)**2;
            });
            const labelOcclusion=accepted.some(front=>
                b.left<front.right&&b.right>front.left&&b.top<front.bottom&&b.bottom>front.top);
            if(planetOcclusion||labelOcclusion)continue;
            const label=labels[i];label.hidden=false;
            label.style.transform='translate3d('+p.x+'px,'+b.bottom+'px,0) translate(-50%,-100%)';
            label.classList.toggle('selected',i===appState.selected);
            accepted.push(b);
        }
    }

    function setMode(inside) {
        ui('minus').disabled=!inside;
        appState.inside=inside;
        app.classList.toggle('inside',inside);
        ui('explore').disabled=inside;
        ui('sceneBack').disabled=!inside;
        if(!inside){appState.selected=null;detail.hidden=true;labels.forEach(l=>{l.hidden=true;});}
    }
    function finishTransition(inside) {
        setMode(inside);
        app.classList.remove('entering','exiting');
        appState.transition=false;transitionTimer=null;
        if(inside&&appState.pending!==null){
            const i=appState.pending;appState.pending=null;focusPlanet(i);
        }
    }
    function enter() {
        if(appState.inside||appState.transition)return;
        closeSettings();
        appState.transition=true;
        camera={...OVERVIEW};target={...OVERVIEW};
        const animated=animationsEnabled&&!reducedMotion.matches;
        if(!animated){finishTransition(true);return;}
        app.classList.add('entering');
        transitionTimer=setTimeout(()=>finishTransition(true),900);
    }
    function exit() {
        if(!appState.inside||appState.transition)return;
        closeSettings();
        appState.transition=true;appState.pending=null;detail.hidden=true;
        const animated=animationsEnabled&&!reducedMotion.matches;
        if(!animated){finishTransition(false);return;}
        app.classList.add('exiting');
        transitionTimer=setTimeout(()=>finishTransition(false),900);
    }
    function focusPlanet(i){
        if(!Number.isInteger(i)||!planets[i])return;
        closeDialog();
        if(!appState.inside||appState.transition){
            appState.pending=i;
            if(!appState.inside&&!appState.transition)enter();
            return;
        }
        const p=planets[i];appState.selected=i;
        const distance=Math.max(38,p.radius*(w<650?9:7));
        target=clamp({x:p.world.x,y:p.world.y,z:p.world.z+distance});
        ui('planetId').textContent='ПЛАНЕТА #'+String(p.id).padStart(3,'0')+' · GENESIS-01';
        ui('planetName').textContent=p.name;
        ui('planetUser').textContent=p.username;
        ui('planetDescription').textContent=p.description;
        ui('planetStatus').textContent=p.active?'● Планета цветная':'○ Планета без цвета';
        detail.hidden=false;
    }
    const resetCamera=()=>{appState.selected=null;detail.hidden=true;target={...OVERVIEW};};
    function zoom(delta){
        if(appState.transition)return;
        if(!appState.inside){if(delta>0)enter();return;}
        target=clamp({...target,z:target.z-delta});
    }
    ui('explore').addEventListener('click',enter);
    ui('sceneBack').addEventListener('click',exit);
    ui('plus').addEventListener('click',()=>zoom(9));
    ui('minus').addEventListener('click',()=>zoom(-9));
    ui('goBack').addEventListener('click',resetCamera);
    ui('minus').disabled=true;
    ui('closeDetail').addEventListener('click',()=>{detail.hidden=true;appState.selected=null;});

    const settingsBackdrop=ui('settings-backdrop');
    const closeSettingsButton=ui('closeSettings');
    let menuOpen=false;
    function closeSettings({restoreFocus=false}={}){
        if(!menuOpen)return;
        menuOpen=false;settings.classList.remove('open');
        settings.setAttribute('aria-hidden','true');
        settings.inert=true;settingsBackdrop.hidden=true;
        menuButton.setAttribute('aria-expanded','false');
        if(restoreFocus)menuButton.focus();
    }
    function openSettings(){
        if(menuOpen)return;
        menuOpen=true;settings.inert=false;
        settings.setAttribute('aria-hidden','false');
        settingsBackdrop.hidden=false;
        settings.classList.add('open');
        menuButton.setAttribute('aria-expanded','true');
        closeSettingsButton.focus();
    }
    menuButton.addEventListener('click',()=>{
        if(menuOpen)closeSettings({restoreFocus:true});
        else openSettings();
    });
    closeSettingsButton.addEventListener('click',()=>closeSettings({restoreFocus:true}));
    settingsBackdrop.addEventListener('click',()=>closeSettings({restoreFocus:true}));
    ui('animation-toggle').addEventListener('change',event=>{
        animationsEnabled=event.target.checked;
        app.classList.toggle('animations-off',!animationsEnabled);
        persist('infiniverse.animations',animationsEnabled);
    });
    ui('labels-toggle').addEventListener('change',event=>{
        labelsEnabled=event.target.checked;
        app.classList.toggle('labels-off',!labelsEnabled);
        persist('infiniverse.labels',labelsEnabled);
        if(!labelsEnabled)labels.forEach(l=>{l.hidden=true;});
    });


    // Accessible dialogs: keyboard focus, escape and focus restoration.
    function openDialog(dialog,focusTarget){
        closeSettings();
        previousFocus=document.activeElement;
        activeDialog=dialog;dialog.hidden=false;
        if(focusTarget)focusTarget.focus();
        else dialog.querySelector('button').focus();
    }
    function closeDialog(){
        if(!activeDialog)return;
        activeDialog.hidden=true;activeDialog=null;
        const toRestore=previousFocus;previousFocus=null;
        if(toRestore&&typeof toRestore.focus==='function')toRestore.focus();
    }

    function openSearch(){closeSettings();openDialog(search,query);query.value='';showResults('');}
    function openHelp(){closeSettings();openDialog(help,ui('closeHelp'));}
    function openStages(){closeSettings();openDialog(stages,ui('closeStages'));}
    document.querySelectorAll('[data-menu-action]').forEach(button=>{
        button.addEventListener('click',async()=>{
            const action=button.dataset.menuAction;
            closeSettings();
            if(action==='home'){if(appState.inside)exit();else target={...OVERVIEW};}
            if(action==='search')openSearch();
            if(action==='help')openHelp();
            if(action==='stages')openStages();
            if(action==='share'){
                const shareData={title:'INFINIVERSE',text:'Исследуй галактику INFINIVERSE',url:window.location.href};
                try{
                    if(navigator.share)await navigator.share(shareData);
                    else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(window.location.href);showToast('Ссылка скопирована');}
                    else showToast('Скопируй адрес страницы, чтобы поделиться');
                }catch(error){if(error.name!=='AbortError')showToast('Не удалось открыть меню отправки');}
            }
        });
    });
    ui('searchBtn').addEventListener('click',openSearch);
    ui('closeSearch').addEventListener('click',closeDialog);
    ui('createHelp').addEventListener('click',openHelp);
    ui('closeHelp').addEventListener('click',closeDialog);
    ui('closeStages').addEventListener('click',closeDialog);
    document.addEventListener('keydown',event=>{
        if(event.key==='Escape'){
            if(activeDialog){event.preventDefault();closeDialog();}
            else if(menuOpen)closeSettings({restoreFocus:true});
            else if(!detail.hidden){detail.hidden=true;appState.selected=null;}
            return;
        }
        if(menuOpen&&event.key==='Tab'){
            const elements=[...settings.querySelectorAll('button:not([disabled]),input:not([disabled])')];
            const first=elements[0],last=elements[elements.length-1];
            if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
            else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
            return;
        }
        if(activeDialog&&event.key==='Tab'){
            const focusable=[...activeDialog.querySelectorAll('button:not([disabled]),input:not([disabled])')]
                .filter(el=>!el.hidden);
            if(focusable.length){
                const first=focusable[0],last=focusable[focusable.length-1];
                if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
                else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
            }
            return;
        }
        if(menuOpen||activeDialog||event.target.closest('input,button')||!appState.inside)return;
        if(event.key==='+'||event.key==='='){event.preventDefault();zoom(9);}
        if(event.key==='-'){event.preventDefault();zoom(-9);}
        if(event.key==='ArrowLeft'){event.preventDefault();target=clamp({...target,x:target.x-8});}
        if(event.key==='ArrowRight'){event.preventDefault();target=clamp({...target,x:target.x+8});}
        if(event.key==='ArrowUp'){event.preventDefault();target=clamp({...target,y:target.y+8});}
        if(event.key==='ArrowDown'){event.preventDefault();target=clamp({...target,y:target.y-8});}
    });

    function showResults(text){
        results.replaceChildren();
        const q=text.toLocaleLowerCase('ru').trim().replace(/^@/,'');
        const matches=planets.map((p,i)=>({p,i})).filter(({p})=>
            p.username.toLocaleLowerCase('ru').replace(/^@/,'').includes(q)||
            p.name.toLocaleLowerCase('ru').includes(q)||
            (q&&String(p.id)===q));
        ui('searchCount').textContent=q?matches.length+' найдено':'Выбери планету из списка или введи запрос';
        matches.slice(0,q?30:8).forEach(({p,i})=>{
            const b=document.createElement('button');b.type='button';b.className='result';
            const name=document.createElement('strong');name.textContent=p.username;
            const meta=document.createElement('small');meta.textContent=p.name+' · #'+String(p.id).padStart(3,'0');
            b.append(name,meta);b.addEventListener('click',()=>focusPlanet(i));results.append(b);
        });
        if(!matches.length){const p=document.createElement('p');p.textContent='Совпадений нет. Проверь ник или название.';results.append(p);}
    }
    query.addEventListener('input',()=>showResults(query.value));
    query.addEventListener('keydown',event=>{
        if(event.key!=='Enter')return;
        const first=results.querySelector('button');if(first){event.preventDefault();first.click();}
    });

    // Input only over WebGL canvas; page-level touch zoom remains available in dialogs.
    const pointers=new Map();
    let startPoint=null,lastPoint=null,lastPinch=null,moved=false;
    function twoFingerDistance(){
        const [a,b]=[...pointers.values()];
        return Math.hypot(a.x-b.x,a.y-b.y);
    }
    canvas.addEventListener('wheel',e=>{
        if(!appState.inside)return;
        e.preventDefault();zoom(e.deltaY<0?9:-9);
    },{passive:false});
    canvas.addEventListener('pointerdown',e=>{
        if(!appState.inside||appState.transition)return;
        if(e.pointerType==='mouse'&&e.button!==0)return;
        pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
        canvas.setPointerCapture(e.pointerId);
        if(pointers.size===1){
            startPoint={x:e.clientX,y:e.clientY};
            lastPoint={...startPoint};moved=false;
        } else if(pointers.size===2){
            lastPinch=twoFingerDistance();moved=true;lastPoint=null;
        }
    });
    canvas.addEventListener('pointermove',e=>{
        if(!pointers.has(e.pointerId))return;
        pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
        if(pointers.size===2){
            const current=twoFingerDistance();
            if(lastPinch!==null)zoom((current-lastPinch)*.17);
            lastPinch=current;return;
        }
        if(!lastPoint||!appState.inside)return;
        const dx=e.clientX-lastPoint.x,dy=e.clientY-lastPoint.y;
        if(Math.hypot(e.clientX-startPoint.x,e.clientY-startPoint.y)>7)moved=true;
        if(moved){
            const speed=.023*Math.max(20,Math.abs(camera.z))/42;
            target=clamp({...target,x:target.x-dx*speed,y:target.y+dy*speed});
        }
        lastPoint={x:e.clientX,y:e.clientY};
    });
    function release(e){
        if(!pointers.has(e.pointerId))return;
        const click=pointers.size===1&&!moved&&e.type==='pointerup';
        pointers.delete(e.pointerId);
        if(pointers.size===1)lastPoint={...[...pointers.values()][0]};
        else lastPoint=null;
        lastPinch=null;
        if(!click||!appState.inside)return;
        const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
        let best=-1,shortest=40,bestDepth=Infinity;
        planets.forEach((p,i)=>{
            const point=project(p);if(!point)return;
            const d=Math.hypot(point.x-x,point.y-y);
            if(d<Math.max(18,point.size+7)&&
                (d<shortest||point.depth<bestDepth&&d<shortest+8)){
                best=i;shortest=d;bestDepth=point.depth;
            }
        });
        if(best>=0)focusPlanet(best);
    }
    canvas.addEventListener('pointerup',release);
    canvas.addEventListener('pointercancel',release);

    // Atlas loading failures are visible instead of silently using a blank planet.
    texImage.onerror=()=>{
        const error=ui('error');error.textContent='Не удалось загрузить текстуры планет. Обнови страницу.';
        error.hidden=false;
    };
    canvas.addEventListener('webglcontextlost',e=>{
        e.preventDefault();const error=ui('error');
        error.textContent='3D-контекст потерян. Обнови страницу, чтобы восстановить галактику.';
        error.hidden=false;
    });

    // Stable geometry and a single RAF loop.
    const drawList=planets.map((p,i)=>({p,i}));
    function draw(time){
        gl.clearColor(0,0,0,0);
        gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
        if(appState.inside||appState.transition){
            target=clamp(target);
            const smoothing=animationsEnabled&&!reducedMotion.matches?.055:1;
            for(const axis of ['x','y','z'])camera[axis]+=(target[axis]-camera[axis])*smoothing;
            camera=clamp(camera);
            gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);
            gl.disable(gl.CULL_FACE);gl.useProgram(program);
            gl.uniform1i(uniforms.uAtlas,0);
            gl.uniformMatrix4fv(uniforms.uProjection,false,projectionMatrix);
            gl.uniform3f(uniforms.uCamera,camera.x,camera.y,camera.z);
            gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
            const seconds=time*.001;
            for(const {p,i} of drawList){
                const dz=camera.z-p.world.z;
                if(dz+p.radius<NEAR||dz-p.radius>FAR)continue;
                gl.uniform3f(uniforms.uLocation,p.world.x,p.world.y,p.world.z);
                gl.uniform1f(uniforms.uSize,p.radius);
                gl.uniform1f(uniforms.uSpin,p.spin+
                    (animationsEnabled&&!reducedMotion.matches?seconds*p.speed:0));
                gl.uniform2f(uniforms.uTile,i%10,Math.floor(i/10));
                gl.uniform1f(uniforms.uActive,p.active?1:0);
                gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);
            }
            updateLabels();
        }
        animationFrame=requestAnimationFrame(draw);
    }
    animationFrame=requestAnimationFrame(draw);
    window.INFINIVERSE={planets,enter,exit,focus:focusPlanet};
})();
