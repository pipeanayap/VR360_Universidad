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
  var bowser = window.bowser;
  var screenfull = window.screenfull;
  var data = window.APP_DATA;

  // Grab elements from DOM.
  var panoElement = document.querySelector('#pano');
  var sceneNameElement = document.querySelector('#titleBar .sceneName');
  var sceneListElement = document.querySelector('#sceneList');
  var sceneElements = document.querySelectorAll('#sceneList .scene');
  var sceneListToggleElement = document.querySelector('#sceneListToggle');
  var autorotateToggleElement = document.querySelector('#autorotateToggle');
  var fullscreenToggleElement = document.querySelector('#fullscreenToggle');

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

  // Detect whether we are on a touch device.
  document.body.classList.add('no-touch');
  window.addEventListener('touchstart', function() {
    document.body.classList.remove('no-touch');
    document.body.classList.add('touch');
  });

  // Use tooltip fallback mode on IE < 11.
  if (bowser.msie && parseFloat(bowser.version) < 11) {
    document.body.classList.add('tooltip-fallback');
  }

  // ─── Preparamos el canvas ANTES de que Marzipano lo cree ─────────────────
  //
  // Marzipano llama internamente a canvas.getContext('webgl').
  // Interceptamos HTMLCanvasElement.prototype.getContext para que
  // cualquier canvas que pida 'webgl' o 'webgl2' reciba automáticamente
  // el atributo xrCompatible: true. Así el contexto que Marzipano usa
  // ya es compatible con XR desde el principio — sin canvas separado,
  // sin blit, sin conflictos.
  //
  var _origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, attrs) {
    if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
      attrs = attrs || {};
      attrs.xrCompatible = true;
    }
    return _origGetContext.call(this, type, attrs);
  };

  // Viewer options.
  var viewerOpts = {
    controls: {
      mouseViewMode: data.settings.mouseViewMode
    }
  };

  // Initialize viewer — ahora su canvas WebGL ya tiene xrCompatible: true
  var viewer = new Marzipano.Viewer(panoElement, viewerOpts);

  // Restauramos getContext para no afectar otros elementos de la página
  HTMLCanvasElement.prototype.getContext = _origGetContext;

  // Create scenes.
  var scenes = data.scenes.map(function(data) {
    var urlPrefix = "tiles";
    var source = Marzipano.ImageUrlSource.fromString(
      urlPrefix + "/" + data.id + "/{z}/{f}/{y}/{x}.jpg",
      { cubeMapPreviewUrl: urlPrefix + "/" + data.id + "/preview.jpg" });
    var geometry = new Marzipano.CubeGeometry(data.levels);

    var limiter = Marzipano.RectilinearView.limit.traditional(data.faceSize, 100*Math.PI/180, 120*Math.PI/180);
    var view = new Marzipano.RectilinearView(data.initialViewParameters, limiter);

    var scene = viewer.createScene({
      source: source,
      geometry: geometry,
      view: view,
      pinFirstLevel: true
    });

    // Create link hotspots.
    data.linkHotspots.forEach(function(hotspot) {
      var element = createLinkHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });

    // Create info hotspots.
    data.infoHotspots.forEach(function(hotspot) {
      var element = createInfoHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });

    return {
      data: data,
      scene: scene,
      view: view
    };
  });

  // Set up autorotate, if enabled.
  var autorotate = Marzipano.autorotate({
    yawSpeed: 0.03,
    targetPitch: 0,
    targetFov: Math.PI/2
  });
  if (data.settings.autorotateEnabled) {
    autorotateToggleElement.classList.add('enabled');
  }

  autorotateToggleElement.addEventListener('click', toggleAutorotate);

  // Set up fullscreen mode, if supported.
  if (screenfull.enabled && data.settings.fullscreenButton) {
    document.body.classList.add('fullscreen-enabled');
    fullscreenToggleElement.addEventListener('click', function() {
      screenfull.toggle();
    });
    screenfull.on('change', function() {
      if (screenfull.isFullscreen) {
        fullscreenToggleElement.classList.add('enabled');
      } else {
        fullscreenToggleElement.classList.remove('enabled');
      }
    });
  } else {
    document.body.classList.add('fullscreen-disabled');
  }

  sceneListToggleElement.addEventListener('click', toggleSceneList);

  if (!document.body.classList.contains('mobile')) {
    showSceneList();
  }

  scenes.forEach(function(scene) {
    var el = document.querySelector('#sceneList .scene[data-id="' + scene.data.id + '"]');
    el.addEventListener('click', function() {
      switchScene(scene);
      if (document.body.classList.contains('mobile')) {
        hideSceneList();
      }
    });
  });

  // DOM elements for view controls.
  var viewUpElement = document.querySelector('#viewUp');
  var viewDownElement = document.querySelector('#viewDown');
  var viewLeftElement = document.querySelector('#viewLeft');
  var viewRightElement = document.querySelector('#viewRight');
  var viewInElement = document.querySelector('#viewIn');
  var viewOutElement = document.querySelector('#viewOut');

  var velocity = 0.7;
  var friction = 3;

  var controls = viewer.controls();
  controls.registerMethod('upElement',    new Marzipano.ElementPressControlMethod(viewUpElement,     'y', -velocity, friction), true);
  controls.registerMethod('downElement',  new Marzipano.ElementPressControlMethod(viewDownElement,   'y',  velocity, friction), true);
  controls.registerMethod('leftElement',  new Marzipano.ElementPressControlMethod(viewLeftElement,   'x', -velocity, friction), true);
  controls.registerMethod('rightElement', new Marzipano.ElementPressControlMethod(viewRightElement,  'x',  velocity, friction), true);
  controls.registerMethod('inElement',    new Marzipano.ElementPressControlMethod(viewInElement,  'zoom', -velocity, friction), true);
  controls.registerMethod('outElement',   new Marzipano.ElementPressControlMethod(viewOutElement, 'zoom',  velocity, friction), true);

  // ─── WebXR ────────────────────────────────────────────────────────────────
  var vrButton  = document.getElementById("vrToggle");
  var xrSession = null;
  var prevHeadYaw   = null;
  var prevHeadPitch = null;

  vrButton.addEventListener("click", function() {

    if (xrSession) { xrSession.end(); return; }

    if (!navigator.xr) {
      // Fallback original en dispositivos sin WebXR
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

      navigator.xr.requestSession('immersive-vr', {
        requiredFeatures: ['local']
      }).then(function(session) {

        xrSession = session;
        vrButton.textContent = "✕ VR";
        vrButton.classList.add('enabled');
        stopAutorotate();
        prevHeadYaw = null;
        prevHeadPitch = null;

        // Obtenemos el canvas y contexto GL que Marzipano ya creó
        // (ahora tiene xrCompatible: true gracias al patch de arriba)
        var marzCanvas = panoElement.querySelector('canvas');
        var gl = marzCanvas.getContext('webgl')
               || marzCanvas.getContext('webgl2');

        // Hacemos el contexto compatible con XR (por si acaso)
        var makeCompatible = gl.makeXRCompatible
          ? gl.makeXRCompatible()
          : Promise.resolve();

        makeCompatible.then(function() {
          var xrLayer = new XRWebGLLayer(session, gl);
          session.updateRenderState({ baseLayer: xrLayer });

          session.requestReferenceSpace('local').then(function(refSpace) {

            var SPEED    = 0.03;
            var DEADZONE = 0.15;

            function onXRFrame(time, frame) {
              session.requestAnimationFrame(onXRFrame);

              var pose = frame.getViewerPose(refSpace);
              if (!pose) return;

              // Bind al framebuffer de XR para que Marzipano pinte ahí
              gl.bindFramebuffer(gl.FRAMEBUFFER, xrLayer.framebuffer);

              // Forzamos un render de Marzipano en este frame
              try {
                viewer.stage().render();
              } catch(e) {
                // Si render() no existe en esta versión, Marzipano
                // renderiza solo en su propio rAF — igual funciona
                // porque comparte el mismo contexto GL
              }

              // Head tracking: movimiento de cabeza → vista Marzipano
              if (pose.views.length > 0) {
                var m = pose.views[0].transform.matrix;
                var pitch = Math.asin(Math.max(-1, Math.min(1, -m[9])));
                var yaw   = Math.atan2(m[8], m[10]);

                if (prevHeadYaw !== null) {
                  var activeScene = getActiveScene();
                  if (activeScene) {
                    var v = activeScene.view;
                    v.setYaw(v.yaw() + (yaw - prevHeadYaw));
                    v.setPitch(Math.max(-Math.PI/2,
                      Math.min(Math.PI/2, v.pitch() + (pitch - prevHeadPitch))));
                  }
                }
                prevHeadYaw   = yaw;
                prevHeadPitch = pitch;
              }

              // Joysticks → rotación manual
              session.inputSources.forEach(function(source) {
                if (!source.gamepad) return;
                var axes = source.gamepad.axes;
                var dx = (axes[2] != null) ? axes[2] : (axes[0] || 0);
                var dy = (axes[3] != null) ? axes[3] : (axes[1] || 0);
                if (Math.abs(dx) < DEADZONE) dx = 0;
                if (Math.abs(dy) < DEADZONE) dy = 0;
                if (dx === 0 && dy === 0) return;

                var activeScene = getActiveScene();
                if (!activeScene) return;
                var v = activeScene.view;
                v.setYaw(v.yaw() + dx * SPEED);
                v.setPitch(Math.max(-Math.PI/2,
                  Math.min(Math.PI/2, v.pitch() - dy * SPEED)));
              });
            }

            session.requestAnimationFrame(onXRFrame);
          });
        });

        session.addEventListener('end', function() {
          xrSession = null;
          vrButton.textContent = "VR";
          vrButton.classList.remove('enabled');
          prevHeadYaw = null;
          prevHeadPitch = null;
          // Restauramos el framebuffer normal de Marzipano
          var marzCanvas2 = panoElement.querySelector('canvas');
          var gl2 = marzCanvas2
            ? (marzCanvas2.getContext('webgl') || marzCanvas2.getContext('webgl2'))
            : null;
          if (gl2) gl2.bindFramebuffer(gl2.FRAMEBUFFER, null);
        });

      }).catch(function(err) {
        console.error('[WebXR] Error al iniciar sesión:', err);
        alert('Error VR: ' + err.message);
      });
    });
  });

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
    if (!autorotateToggleElement.classList.contains('enabled')) {
      return;
    }
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

    var transformProperties = [ '-ms-transform', '-webkit-transform', 'transform' ];
    for (var i = 0; i < transformProperties.length; i++) {
      var property = transformProperties[i];
      icon.style[property] = 'rotate(' + hotspot.rotation + 'rad)';
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
    var eventList = [ 'touchstart', 'touchmove', 'touchend', 'touchcancel',
                      'wheel', 'mousewheel' ];
    for (var i = 0; i < eventList.length; i++) {
      element.addEventListener(eventList[i], function(event) {
        event.stopPropagation();
      });
    }
  }

  function findSceneById(id) {
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].data.id === id) {
        return scenes[i];
      }
    }
    return null;
  }

  function findSceneDataById(id) {
    for (var i = 0; i < data.scenes.length; i++) {
      if (data.scenes[i].id === id) {
        return data.scenes[i];
      }
    }
    return null;
  }

  // Display the initial scene.
  switchScene(scenes[0]);

})();