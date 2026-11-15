
/**
 * INFINIVERSE — WebGL Shaders
 *
 * vs — Vertex Shader
 * Отвечает за положение, размер, вращение и глубину планет.
 *
 * fs — Fragment Shader
 * Отвечает за текстуру, освещение, атмосферу и цвет планет.
 */

// ============================================================
// VERTEX SHADER
// ============================================================

export const vs = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute vec2 aUv;

    uniform vec3 uLocation;
    uniform vec3 uCamera;
    uniform vec2 uScreen;
    uniform float uSize;
    uniform float uSpin;

    varying vec3 vNormal;
    varying vec2 vUV;
    varying vec3 vView;

    void main() {
        // Вращение планеты вокруг вертикальной оси
        float c = cos(uSpin);
        float s = sin(uSpin);

        vec3 local = vec3(
            aPosition.x * c - aPosition.z * s,
            aPosition.y,
            aPosition.x * s + aPosition.z * c
        );

        // Положение вершины в мировом пространстве
        vec3 worldPosition = uLocation + local * uSize;

        // Положение относительно камеры
        vec3 viewPosition = worldPosition - uCamera;

        float depth = -viewPosition.z;

        // Перспективная проекция
        float focalLength = 1.55;

        vec2 screen = vec2(
            viewPosition.x / uScreen.x,
            viewPosition.y
        ) * focalLength / max(depth, 0.001);

        // Корректная глубина для WebGL DEPTH_TEST
        float nearPlane = 0.3;
        float farPlane = 245.0;

        float normalizedDepth = clamp(
            (depth - nearPlane) / (farPlane - nearPlane),
            0.0,
            1.0
        );

        float clipDepth = normalizedDepth * 2.0 - 1.0;

        gl_Position = vec4(
            screen,
            clipDepth,
            1.0
        );

        // Поворот нормали для правильного освещения
        vNormal = vec3(
            aNormal.x * c - aNormal.z * s,
            aNormal.y,
            aNormal.x * s + aNormal.z * c
        );

        vUV = aUv;

        // Направление взгляда (упрощённая модель)
        vView = vec3(0.0, 0.0, 1.0);
    }
`;

// ============================================================
// FRAGMENT SHADER
// ============================================================

export const fs = `
    precision mediump float;

    varying vec3 vNormal;
    varying vec2 vUV;
    varying vec3 vView;

    uniform sampler2D uAtlas;
    uniform vec2 uTile;
    uniform float uActive;

    void main() {
        // Координаты отдельной текстуры в атласе 10×10
        vec2 uv = vec2(
            (vUV.x + uTile.x) / 10.0,
            (vUV.y + uTile.y) / 10.0
        );

        // Получаем цвет поверхности планеты
        vec3 color = texture2D(uAtlas, uv).rgb;

        // Переводим цвет в оттенки серого
        float grayscale = dot(
            color,
            vec3(0.2126, 0.7152, 0.0722)
        );

        // Неактивная подписка = бесцветная планета
        color = mix(
            vec3(grayscale),
            color,
            uActive
        );

        // Направление основного освещения
        vec3 lightDirection = normalize(
            vec3(-0.55, 0.65, 1.2)
        );

        // Освещённость поверхности
        float light = max(
            dot(normalize(vNormal), lightDirection),
            0.0
        );

        // Лёгкое фиолетовое свечение по краям
        float rim = pow(
            1.0 - max(
                dot(
                    normalize(vNormal),
                    normalize(vView)
                ),
                0.0
            ),
            3.0
        );

        // Итоговый цвет
        color = color * (0.19 + 0.82 * light);

        color += vec3(0.25, 0.10, 0.49) * rim * 0.42;

        // Планета полностью непрозрачная
        gl_FragColor = vec4(color, 1.0);
    }
`;
