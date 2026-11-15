/**
 * WebGL 1 GLSL shaders.
 * A true perspective clip-space transform enables correct depth testing,
 * near-plane clipping and perspective-correct texture interpolation.
 */
export const vs = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute vec2 aUv;

    uniform vec3 uLocation;
    uniform vec3 uCamera;
    uniform mat4 uProjection;
    uniform float uSize;
    uniform float uSpin;

    varying vec3 vNormal;
    varying vec2 vUV;
    varying vec3 vView;

    void main() {
        float c = cos(uSpin);
        float s = sin(uSpin);

        vec3 local = vec3(
            aPosition.x * c - aPosition.z * s,
            aPosition.y,
            aPosition.x * s + aPosition.z * c
        );

        vec3 worldPosition = uLocation + local * uSize;
        vec3 viewPosition = worldPosition - uCamera;

        gl_Position = uProjection * vec4(viewPosition, 1.0);

        vNormal = vec3(
            aNormal.x * c - aNormal.z * s,
            aNormal.y,
            aNormal.x * s + aNormal.z * c
        );
        vUV = aUv;
        vView = vec3(0.0, 0.0, 1.0);
    }
`;

export const fs = `
    precision mediump float;

    varying vec3 vNormal;
    varying vec2 vUV;
    varying vec3 vView;

    uniform sampler2D uAtlas;
    uniform vec2 uTile;
    uniform float uActive;

    void main() {
        // Texture atlas is a 10 x 10 grid.
        vec2 uv = (vUV + uTile) / 10.0;
        vec3 color = texture2D(uAtlas, uv).rgb;

        float gray = dot(color, vec3(0.2126, 0.7152, 0.0722));
        color = mix(vec3(gray), color, uActive);

        vec3 lightDirection = normalize(vec3(-0.55, 0.65, 1.2));
        float light = max(dot(normalize(vNormal), lightDirection), 0.0);

        float rim = pow(
            1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0),
            3.0
        );

        // Inactive planets also have a neutral (not purple) rim.
        vec3 rimColor = mix(
            vec3(0.25),
            vec3(0.25, 0.10, 0.49),
            uActive
        );

        color = color * (0.19 + 0.82 * light);
        color += rimColor * rim * 0.42;
        gl_FragColor = vec4(color, 1.0);
    }
`;
