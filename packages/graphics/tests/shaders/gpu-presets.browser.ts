import {it,expect} from 'vitest';
import {ShaderCompiler} from '../../src/lib/shaders/shader-compiler.js';
import {createGlitchEffect} from '../../src/lib/shaders/presets/effects.js';
import {createRippleEffect} from '../../src/lib/shaders/presets/ripple.js';
const vertex='precision mediump float; attribute vec2 aPosition; varying vec2 vTexCoord; void main() { vTexCoord=(aPosition+1.0)*0.5; gl_Position=vec4(aPosition,0.0,1.0); }';
function pixel(fragment:string){
 const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;
 const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:false,preserveDrawingBuffer:true});expect(gl).not.toBeNull();if(!gl)throw Error('WebGL unavailable');
 const compiler=new ShaderCompiler(gl);const result=compiler.compileProgram(vertex,fragment);
 if(!('program'in result))throw result;
 const buffer=gl.createBuffer(),texture=gl.createTexture();
 try {
 gl.useProgram(result.program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
 const pos=gl.getAttribLocation(result.program,'aPosition');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
 gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([64,128,192,64]));
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 gl.uniform1i(gl.getUniformLocation(result.program,'uTexture'),0);gl.uniform2f(gl.getUniformLocation(result.program,'uCenter'),0.5,0.5);
 for(const [name,value] of Object.entries({uTime:1,uSpeed:2,uAmplitude:0.03,uDecay:0.5,uFrequency:20,uIntensity:0.3}))gl.uniform1f(gl.getUniformLocation(result.program,name),value);
 gl.viewport(0,0,1,1);gl.drawArrays(gl.TRIANGLES,0,3);const out=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,out);expect(gl.getError()).toBe(gl.NO_ERROR);return Array.from(out);
 } finally {gl.deleteBuffer(buffer);gl.deleteTexture(texture);gl.deleteProgram(result.program);gl.getExtension('WEBGL_lose_context')?.loseContext();}
}
it('glitch retains texture transparency',()=>{expect(pixel(createGlitchEffect().fragment)).toEqual([64,128,192,64]);});
it('ripple center produces a finite sample of the source texture',()=>{expect(pixel(createRippleEffect().fragment)).toEqual([64,128,192,64]);});
