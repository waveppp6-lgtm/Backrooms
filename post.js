/* BACKROOMS — post-processing: bloom on the fluorescent tubes, colour grade + lens fringe, FXAA.
   Returns null when the example scripts did not load, so the game falls back to a plain render. */
window.BR = window.BR || {};

(function (BR) {
  const GradeShader = {
    uniforms: {
      tDiffuse: { value: null },
      time: { value: 0 },
      danger: { value: 0 },
      tint: { value: null },
      sat: { value: 1.06 },
      con: { value: 1.08 },
      vig: { value: 0.3 }
    },
    vertexShader: [
      'varying vec2 vUv;',
      'void main() {',
      '  vUv = uv;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D tDiffuse;',
      'uniform float time;',
      'uniform float danger;',
      'uniform vec3 tint;',
      'uniform float sat;',
      'uniform float con;',
      'uniform float vig;',
      'varying vec2 vUv;',
      'float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
      'void main() {',
      '  vec2 c = vUv - 0.5;',
      '  float r2 = dot(c, c);',
      '  vec2 uv = 0.5 + c * (1.0 + 0.03 * r2);',
      '  float ca = 0.0008 + r2 * 0.006 + danger * 0.003;',
      '  vec3 col;',
      '  col.r = texture2D(tDiffuse, 0.5 + (uv - 0.5) * (1.0 + ca)).r;',
      '  col.g = texture2D(tDiffuse, uv).g;',
      '  col.b = texture2D(tDiffuse, 0.5 + (uv - 0.5) * (1.0 - ca)).b;',
      '  float l = dot(col, vec3(0.299, 0.587, 0.114));',
      '  col = mix(vec3(l), col, sat);',
      '  col *= tint;',
      '  col = pow(max(col, vec3(0.0)), vec3(0.94));',
      '  col = (col - 0.5) * con + 0.5;',
      '  col *= 1.0 - vig * smoothstep(0.28, 0.9, length(c) * 1.25);',
      '  col += (hash(vUv * vec2(1731.0, 977.0) + time) - 0.5) * 0.01;',
      '  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);',
      '}'
    ].join('\n')
  };

  BR.makePost = function (renderer, camera) {
    const T = window.THREE;
    if (!T.EffectComposer || !T.RenderPass || !T.ShaderPass || !T.UnrealBloomPass || !T.CopyShader || !T.FXAAShader) return null;
    const size = renderer.getSize(new T.Vector2());
    const composer = new T.EffectComposer(renderer);
    const rp = new T.RenderPass(new T.Scene(), camera);
    composer.addPass(rp);
    const bloom = new T.UnrealBloomPass(new T.Vector2(size.x, size.y), 0.5, 0.7, 0.88);
    composer.addPass(bloom);
    const grade = new T.ShaderPass(GradeShader);
    grade.uniforms.tint.value = new T.Vector3(1.05, 1.0, 0.86);
    composer.addPass(grade);
    const fxaa = new T.ShaderPass(T.FXAAShader);
    fxaa.renderToScreen = true;
    composer.addPass(fxaa);

    return {
      setScene(sc) { rp.scene = sc; },
      // every map gets its own colour grade: tint, saturation, contrast, vignette and how much the lights bloom
      setGrade(th) {
        const g = (th && th.grade) || { tint: [1.05, 1.0, 0.86], sat: 1.06, con: 1.08, vig: 0.3, bloom: 0.5 };
        grade.uniforms.tint.value.set(g.tint[0], g.tint[1], g.tint[2]);
        grade.uniforms.sat.value = g.sat; grade.uniforms.con.value = g.con; grade.uniforms.vig.value = g.vig;
        bloom.strength = g.bloom;
      },
      setSize(w, h) {
        const pr = renderer.getPixelRatio();
        if (composer.setPixelRatio) composer.setPixelRatio(pr);
        composer.setSize(w, h);
        fxaa.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
      },
      render(t, danger) {
        grade.uniforms.time.value = t % 100;
        grade.uniforms.danger.value = danger;
        composer.render();
      }
    };
  };
})(window.BR);
