/*
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

(function() {
  var Marzipano = window.Marzipano;
  var bowser    = window.bowser;
  var screenfull = window.screenfull;
  var data      = window.APP_DATA;

  // Grab elements from DOM.
  var panoElement            = document.querySelector('#pano');
  var sceneNameElement       = document.querySelector('#titleBar .sceneName');
  var sceneListElement       = document.querySelector('#sceneList');
  var sceneElements          = document.querySelectorAll('#sceneList .scene');
  var sceneListToggleElement = document.querySelector('#sceneListToggle');
  var autorotateToggleElement= document.querySelector('#autorotateToggle');
  var fullscreenToggleElement= document.querySelector('#fullscreenToggle');

  // Detect desktop or mobile mode.
  if (window.matchMedia) {
    var setMode = function() {
      if (mql.matches) {
        document.body.classList.remove('desktop');
        document.body.classList.add('mobile');
      } else {
        document.body.classList.remove('mobile');
        document.body.classList.add('desktop');
      }
    };
    var mql = matchMedia("(max-width: 500px), (max-height: 500px)");
    setMode();
    mql.addListener(setMode);
  } else {
    document.body.classList.add('desktop');
  }

  document.body.classList.add('no-touch');
  window.addEventListener('touchstart', function() {
    document.body.classList.remove('no-touch');
    document.body.classList.add('touch');
  });

  if (bowser.msie && parseFloat(bowser.version) < 11) {
    document.body.classList.add('tooltip-fallback');
  }

  // Viewer options.
  var viewerOpts = {
    controls: { mouseViewMode: data.settings.mouseViewMode }
  };

  // Initialize Marzipano viewer (para desktop/móvil normal).
  var viewer = new Marzipano.Viewer(panoElement, viewerOpts);

  // Create scenes.
  var scenes = data.scenes.map(function(sceneData) {
    var urlPrefix = "tiles";
    var source = Marzipano.ImageUrlSource.fromString(
      urlPrefix + "/" + sceneData.id + "/{z}/{f}/{y}/{x}.jpg",
      { cubeMapPreviewUrl: urlPrefix + "/" + sceneData.id + "/preview.jpg" });
    var geometry = new Marzipano.CubeGeometry(sceneData.levels);
    var limiter  = Marzipano.RectilinearView.limit.traditional(
      sceneData.faceSize, 100*Math.PI/180, 120*Math.PI/180);
    var view     = new Marzipano.RectilinearView(sceneData.initialViewParameters, limiter);

    var scene = viewer.createScene({
      source: source, geometry: geometry, view: view, pinFirstLevel: true
    });

    sceneData.linkHotspots.forEach(function(hotspot) {
      var element = createLinkHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });
    sceneData.infoHotspots.forEach(function(hotspot) {
      var element = createInfoHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });

    return { data: sceneData, scene: scene, view: view };
  });

  var autorotate = Marzipano.autorotate({
    yawSpeed: 0.03, targetPitch: 0, targetFov: Math.PI/2
  });
  if (data.settings.autorotateEnabled) {
    autorotateToggleElement.classList.add('enabled');
  }

  autorotateToggleElement.addEventListener('click', toggleAutorotate);

  if (screenfull.enabled && data.settings.fullscreenButton) {
    document.body.classList.add('fullscreen-enabled');
    fullscreenToggleElement.addEventListener('click', function() { screenfull.toggle(); });
    screenfull.on('change', function() {
      if (screenfull.isFullscreen) fullscreenToggleElement.classList.add('enabled');
      else fullscreenToggleElement.classList.remove('enabled');
    });
  } else {
    document.body.classList.add('fullscreen-disabled');
  }

  sceneListToggleElement.addEventListener('click', toggleSceneList);
  if (!document.body.classList.contains('mobile')) showSceneList();

  scenes.forEach(function(scene) {
    var el = document.querySelector('#sceneList .scene[data-id="' + scene.data.id + '"]');
    el.addEventListener('click', function() {
      switchScene(scene);
      if (document.body.classList.contains('mobile')) hideSceneList();
    });
  });

  var viewUpElement    = document.querySelector('#viewUp');
  var viewDownElement  = document.querySelector('#viewDown');
  var viewLeftElement  = document.querySelector('#viewLeft');
  var viewRightElement = document.querySelector('#viewRight');
  var viewInElement    = document.querySelector('#viewIn');
  var viewOutElement   = document.querySelector('#viewOut');

  var velocity = 0.7, friction = 3;
  var controls = viewer.controls();
  controls.registerMethod('upElement',    new Marzipano.ElementPressControlMethod(viewUpElement,    'y', -velocity, friction), true);
  controls.registerMethod('downElement',  new Marzipano.ElementPressControlMethod(viewDownElement,  'y',  velocity, friction), true);
  controls.registerMethod('leftElement',  new Marzipano.ElementPressControlMethod(viewLeftElement,  'x', -velocity, friction), true);
  controls.registerMethod('rightElement', new Marzipano.ElementPressControlMethod(viewRightElement, 'x',  velocity, friction), true);
  controls.registerMethod('inElement',    new Marzipano.ElementPressControlMethod(viewInElement,  'zoom', -velocity, friction), true);
  controls.registerMethod('outElement',   new Marzipano.ElementPressControlMethod(viewOutElement, 'zoom',  velocity, friction), true);

  // ─── VR con Three.js WebXR ───────────────────────────────────────────────
  //
  // En modo VR no usamos Marzipano para renderizar.
  // Cargamos Three.js dinámicamente, creamos una esfera 360° con la imagen
  // de preview de la escena activa, y dejamos que Three.js + WebXR
  // manejen el render estéreo y el head tracking nativamente.
  //
  var vrButton  = document.getElementById("vrToggle");
  var vrOverlay = null; // canvas Three.js que cubre la pantalla en modo VR

  vrButton.addEventListener("click", function() {

    if (!navigator.xr) {
      // Sin WebXR: fallback original
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock("landscape");
      }
      panoElement.requestFullscreen();
      if (window.DeviceOrientationEvent) {
        viewer.controls().enableMethod('deviceOrientation');
      }
      return;
    }

    navigator.xr.isSessionSupported('immersive-vr').then(function(supported) {
      if (!supported) { panoElement.requestFullscreen(); return; }
      loadThreeAndStartVR();
    });
  });

  function loadThreeAndStartVR() {
    // Cargamos Three.js desde CDN si no está ya cargado
    if (window.THREE) { startVR(); return; }

    var script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    script.onload = function() { startVR(); };
    script.onerror = function() {
      alert('No se pudo cargar Three.js. Revisa tu conexión.');
    };
    document.head.appendChild(script);
  }

  function getActiveSceneImageUrl() {
    // Obtenemos la URL del preview de la escena activa para usarla en la esfera VR.
    // Marzipano Tool guarda previews en tiles/{id}/preview.jpg
    var activeScene = getActiveScene();
    if (!activeScene) return null;
    return "tiles/" + activeScene.data.id + "/preview.jpg";
  }

  function startVR() {
    var THREE = window.THREE;
    stopAutorotate();

    // Creamos el canvas de Three.js encima de todo
    vrOverlay = document.createElement('canvas');
    Object.assign(vrOverlay.style, {
      position: 'fixed',
      top: '0', left: '0',
      width: '100%', height: '100%',
      zIndex: '99999',
      background: '#000'
    });
    document.body.appendChild(vrOverlay);

    // Renderer Three.js con WebXR habilitado
    var renderer = new THREE.WebGLRenderer({
      canvas: vrOverlay,
      antialias: false,
      alpha: false
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;

    // Escena Three.js: esfera invertida con la textura 360°
    var threeScene  = new THREE.Scene();
    var threeCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);

    var imgUrl = getActiveSceneImageUrl();
    var texture = new THREE.TextureLoader().load(imgUrl);

    // Esfera grande con normales invertidas para ver desde adentro
    var geometry = new THREE.SphereGeometry(50, 64, 32);
    geometry.scale(-1, 1, 1); // invertir para ver desde adentro

    var material = new THREE.MeshBasicMaterial({ map: texture });
    var sphere   = new THREE.Mesh(geometry, material);
    threeScene.add(sphere);

    // Sincronizamos la rotación inicial con la vista actual de Marzipano
    var activeScene = getActiveScene();
    if (activeScene) {
      sphere.rotation.y = -activeScene.view.yaw();
    }

    // Iniciamos la sesión WebXR
    navigator.xr.requestSession('immersive-vr', {
      requiredFeatures: ['local']
    }).then(function(session) {

      vrButton.textContent = "✕ VR";
      vrButton.classList.add('enabled');

      renderer.xr.setSession(session);

      var SPEED    = 0.03;
      var DEADZONE = 0.15;

      // Loop de render — Three.js maneja el framebuffer XR automáticamente
      renderer.setAnimationLoop(function() {
        // Joystick input para rotar la esfera
        if (session.inputSources) {
          session.inputSources.forEach(function(source) {
            if (!source.gamepad) return;
            var axes = source.gamepad.axes;
            var dx = (axes[2] != null) ? axes[2] : (axes[0] || 0);
            if (Math.abs(dx) < DEADZONE) dx = 0;
            if (dx !== 0) sphere.rotation.y -= dx * SPEED;
          });
        }

        renderer.render(threeScene, threeCamera);
      });

      session.addEventListener('end', function() {
        renderer.setAnimationLoop(null);
        renderer.dispose();
        if (vrOverlay && vrOverlay.parentNode) {
          vrOverlay.parentNode.removeChild(vrOverlay);
        }
        vrOverlay = null;
        vrButton.textContent = "VR";
        vrButton.classList.remove('enabled');
      });

    }).catch(function(err) {
      // Limpiamos si falla
      if (vrOverlay && vrOverlay.parentNode) {
        vrOverlay.parentNode.removeChild(vrOverlay);
      }
      vrOverlay = null;
      console.error('[WebXR] Error:', err);
      alert('Error VR: ' + err.message);
    });
  }

  function getActiveScene() {
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].scene === viewer.scene()) return scenes[i];
    }
    return null;
  }
  // ──────────────────────────────────────────────────────────────────────────

  function sanitize(s) {
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;');
  }

  function switchScene(scene) {
    stopAutorotate();
    scene.view.setParameters(scene.data.initialViewParameters);
    scene.scene.switchTo();
    startAutorotate();
    updateSceneName(scene);
    updateSceneList(scene);
  }

  function updateSceneName(scene) {
    sceneNameElement.innerHTML = sanitize(scene.data.name);
  }

  function updateSceneList(scene) {
    for (var i = 0; i < sceneElements.length; i++) {
      var el = sceneElements[i];
      if (el.getAttribute('data-id') === scene.data.id) {
        el.classList.add('current');
      } else {
        el.classList.remove('current');
      }
    }
  }

  function showSceneList() {
    sceneListElement.classList.add('enabled');
    sceneListToggleElement.classList.add('enabled');
  }

  function hideSceneList() {
    sceneListElement.classList.remove('enabled');
    sceneListToggleElement.classList.remove('enabled');
  }

  function toggleSceneList() {
    sceneListElement.classList.toggle('enabled');
    sceneListToggleElement.classList.toggle('enabled');
  }

  function startAutorotate() {
    if (!autorotateToggleElement.classList.contains('enabled')) return;
    viewer.startMovement(autorotate);
    viewer.setIdleMovement(3000, autorotate);
  }

  function stopAutorotate() {
    viewer.stopMovement();
    viewer.setIdleMovement(Infinity);
  }

  function toggleAutorotate() {
    if (autorotateToggleElement.classList.contains('enabled')) {
      autorotateToggleElement.classList.remove('enabled');
      stopAutorotate();
    } else {
      autorotateToggleElement.classList.add('enabled');
      startAutorotate();
    }
  }

  function createLinkHotspotElement(hotspot) {
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('link-hotspot');

    var icon = document.createElement('img');
    icon.src = 'img/link.png';
    icon.classList.add('link-hotspot-icon');

    var transformProperties = ['-ms-transform', '-webkit-transform', 'transform'];
    for (var i = 0; i < transformProperties.length; i++) {
      icon.style[transformProperties[i]] = 'rotate(' + hotspot.rotation + 'rad)';
    }

    wrapper.addEventListener('click', function() {
      switchScene(findSceneById(hotspot.target));
    });

    stopTouchAndScrollEventPropagation(wrapper);

    var tooltip = document.createElement('div');
    tooltip.classList.add('hotspot-tooltip');
    tooltip.classList.add('link-hotspot-tooltip');
    tooltip.innerHTML = findSceneDataById(hotspot.target).name;

    wrapper.appendChild(icon);
    wrapper.appendChild(tooltip);
    return wrapper;
  }

  function createInfoHotspotElement(hotspot) {
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('info-hotspot');

    var header = document.createElement('div');
    header.classList.add('info-hotspot-header');

    var iconWrapper = document.createElement('div');
    iconWrapper.classList.add('info-hotspot-icon-wrapper');
    var icon = document.createElement('img');
    icon.src = 'img/info.png';
    icon.classList.add('info-hotspot-icon');
    iconWrapper.appendChild(icon);

    var titleWrapper = document.createElement('div');
    titleWrapper.classList.add('info-hotspot-title-wrapper');
    var title = document.createElement('div');
    title.classList.add('info-hotspot-title');
    title.innerHTML = hotspot.title;
    titleWrapper.appendChild(title);

    var closeWrapper = document.createElement('div');
    closeWrapper.classList.add('info-hotspot-close-wrapper');
    var closeIcon = document.createElement('img');
    closeIcon.src = 'img/close.png';
    closeIcon.classList.add('info-hotspot-close-icon');
    closeWrapper.appendChild(closeIcon);

    header.appendChild(iconWrapper);
    header.appendChild(titleWrapper);
    header.appendChild(closeWrapper);

    var text = document.createElement('div');
    text.classList.add('info-hotspot-text');
    text.innerHTML = hotspot.text;

    wrapper.appendChild(header);
    wrapper.appendChild(text);

    var modal = document.createElement('div');
    modal.innerHTML = wrapper.innerHTML;
    modal.classList.add('info-hotspot-modal');
    document.body.appendChild(modal);

    var toggle = function() {
      wrapper.classList.toggle('visible');
      modal.classList.toggle('visible');
    };

    wrapper.querySelector('.info-hotspot-header').addEventListener('click', toggle);
    modal.querySelector('.info-hotspot-close-wrapper').addEventListener('click', toggle);

    stopTouchAndScrollEventPropagation(wrapper);
    return wrapper;
  }

  function stopTouchAndScrollEventPropagation(element) {
    var eventList = ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'wheel', 'mousewheel'];
    for (var i = 0; i < eventList.length; i++) {
      element.addEventListener(eventList[i], function(event) {
        event.stopPropagation();
      });
    }
  }

  function findSceneById(id) {
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].data.id === id) return scenes[i];
    }
    return null;
  }

  function findSceneDataById(id) {
    for (var i = 0; i < data.scenes.length; i++) {
      if (data.scenes[i].id === id) return data.scenes[i];
    }
    return null;
  }

  // Display the initial scene.
  switchScene(scenes[0]);

})();