import * as THREE from 'three';

export const createTerrainMaterial = (minZ, maxZ, bounds, cellsize) => {
    const vertexShader = `
      attribute float aValid;
      attribute vec3 aSurfaceColor;
      varying float vZ;
      varying float vValid;
      varying vec2 vPlanePos;
      varying vec3 vSurfaceColor;
      void main() {
        vZ = position.z; 
        vValid = aValid;
        vPlanePos = position.xy;
        vSurfaceColor = aSurfaceColor;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      varying float vZ;
      varying float vValid;
      varying vec2 vPlanePos;
      varying vec3 vSurfaceColor;
      uniform float uMinZ;
      uniform float uMaxZ;
      uniform vec3 uColorLow;
      uniform vec3 uColorMid;
      uniform vec3 uColorHigh;
      uniform float uIs2D; 
      uniform float uShowSurface;
      uniform float uIsSolid;
      uniform float uIsWireframe;
      uniform float uIsContour;
      uniform vec2 uBounds;
      uniform float uCellSize;

      void main() {
        // Discard NODATA cells
        if (vValid < 0.5) discard;

        float range = uMaxZ - uMinZ;
        if(range < 0.1) range = 1.0;
        float h = vZ / range; 
        vec3 col;
        if (h < 0.2) col = mix(uColorLow, uColorMid, h / 0.2);
        else col = mix(uColorMid, uColorHigh, (h - 0.2) / 0.8);

        // Math for the true Calculation Grid Squares (no diagonals)
        float localX = vPlanePos.x + (uBounds.x * 0.5);
        float localY = vPlanePos.y + (uBounds.y * 0.5);
        vec2 normPos = vec2(localX, localY) / uCellSize;
        vec2 grid = min(fract(normPos), 1.0 - fract(normPos));
        float px = fwidth(localX) * 1.5;
        if(px < 0.02) px = 0.02; 
        float lineX = 1.0 - smoothstep(0.0, px/uCellSize, grid.x);
        float lineY = 1.0 - smoothstep(0.0, px/uCellSize, grid.y);
        float isGrid = max(lineX, lineY);

        if (uIsWireframe > 0.5) {
            // Discard the inner cell to create a true square wireframe!
            if (isGrid < 0.3) discard;
            // Slightly darken the grid lines for contrast but keep height colors
            col = mix(col, vec3(0.0), 0.3);
        } else if (uIsContour > 0.5) {
            col = vec3(1.0); // White background
            float fw = fwidth(vZ);
            // Distance to the nearest integer value (1m steps)
            float distToIso = abs(fract(vZ + 0.5) - 0.5);
            float lineIntensity = 1.0 - smoothstep(0.0, fw * 1.5, distToIso);
            col = mix(col, vec3(0.15), lineIntensity); // Dark gray contour lines
        } else {
            // Surface Material Overlay (Texture Pipeline)
            if (uShowSurface > 0.5) {
                vec3 surfCol = vSurfaceColor;
                float heightShade = 0.7 + 0.3 * h; 
                col = surfCol * heightShade;
            }

            // Solid Color Overlay
            if (uIsSolid > 0.5) {
                col = vec3(0.7); 
            }

            if (uIs2D > 0.5) {
                float gray = dot(col, vec3(0.299, 0.587, 0.114));
                col = mix(col, vec3(gray), 0.7) + 0.1;
                col = mix(col, vec3(0.35), isGrid * 0.6);
            }
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `;

    return new THREE.ShaderMaterial({
        uniforms: {
            uMinZ: { value: 0 }, 
            uMaxZ: { value: maxZ - minZ },
            uColorLow: { value: new THREE.Color(0x3b82f6) },
            uColorMid: { value: new THREE.Color(0x10b981) },
            uColorHigh: { value: new THREE.Color(0xffffff) },
            uIs2D: { value: 0.0 },
            uShowSurface: { value: 0.0 },
            uIsSolid: { value: 0.0 },
            uIsWireframe: { value: 0.0 },
            uIsContour: { value: 0.0 },
            uBounds: { value: new THREE.Vector2(bounds.width, bounds.height) },
            uCellSize: { value: cellsize || 1.0 }
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        side: THREE.DoubleSide
    });
};
