(()=>{function t(t){return function(t){if(Array.isArray(t))return e(t)}(t)||function(t){if("undefined"!=typeof Symbol&&null!=t[Symbol.iterator]||null!=t["@@iterator"])return Array.from(t)}(t)||function(t,n){if(t){if("string"==typeof t)return e(t,n);var i={}.toString.call(t).slice(8,-1);return"Object"===i&&t.constructor&&(i=t.constructor.name),"Map"===i||"Set"===i?Array.from(t):"Arguments"===i||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(i)?e(t,n):void 0}}(t)||function(){throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}()}function e(t,e){(null==e||e>t.length)&&(e=t.length);for(var n=0,i=Array(e);n<e;n++)i[n]=t[n];return i}var n,i,r,a,h,l,o,g="rgb(16,7,25)",f=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];function u(t){return t.map((function(t){return t%12}))}function c(){if(i&&l){for(var t=function(t,e,n,i){var r=arguments.length>4&&void 0!==arguments[4]?arguments[4]:2;return t.map((function(t){return e*Math.pow((t-n)/(i-n),r)}))}([0,1,2,3,4,5,6,7,8,9,10,11],i.height,-.5,11.5,1),e=0;e<t.length;e++)l.fillStyle="rgba(208, 215, 222, 0.5)",l.fillRect(35,i.height-t[e],n.width,1);for(var r=0;r<t.length;r++)l.fillStyle="rgba(208, 215, 222, 1)",l.fillText("".concat(f[r]),10,i.height-t[r]+7)}}var d=0;self.onmessage=function(e){var s=e.data,y=s.type,m=s.data;switch(y){case"init":e.data.isFFTDetail?(r=e.data.mainCanvas,a=e.data.bgCanvas,o=r.getContext("2d"),a.getContext("2d"),o.font="12px Signika"):(n=e.data.mainCanvas,i=e.data.bgCanvas,h=n.getContext("2d"),(l=i.getContext("2d")).font="20px Signika",h.font="20px Signika",c());break;case"render":m.isFFTDetail?function(e){if(r&&o&&e.currentFs&&0!==e.currentRawFs.length){o.fillStyle=g,o.fillRect(0,0,r.width,r.height);var n=t(e.currentRawFs).sort((function(t,e){return e.magnitude-t.magnitude})).slice(0,1e3),i=n.length>0?n[.1*n.length].magnitude:1e9;if(d=Math.max(.99995*d,n[0].magnitude),0!==(n=t(n).sort((function(t,e){return t.frequency-e.frequency}))).length){o.strokeStyle="rgba(255, 255, 255, 0.7)",o.lineWidth=2,o.beginPath();for(var a=Math.log2(20),h=Math.log2(2e4)-a,l=1;l<n.length-1;l++){var u=(Math.log2(n[l].frequency)-a)/h*r.width,c=r.height-n[l].magnitude/d*r.height*.9;if(o.beginPath(),o.arc(u,c,2,0,2*Math.PI),o.fillStyle="rgba(255, 255, 255, 0.7)",o.fill(),n[l].magnitude>i&&c<.9*r.height&&n[l].magnitude>n[l-1].magnitude&&n[l].magnitude>n[l+1].magnitude){o.fillStyle="white",o.font="12px Signika";var s=12*Math.log2(n[l].frequency/440)+69,y=f[Math.round(s)%12];o.fillText("".concat(n[l].frequency.toFixed(1)," Hz (").concat(y,")"),u,c-10)}}}}}(m.state):function(t){if(n&&h&&0!=t.fHistory.length){var e=Math.round(.3*t.fHistory.length);h.drawImage(n,e,0,n.width-e,n.height,0,0,n.width-e,n.height),h.fillStyle=g,h.fillRect(n.width-e,0,e,n.height);for(var i=0;i<t.fHistory.length;i++)if(null!==t.fHistory[i]&&0!=t.fHistory[i].length)for(var r=t.fHistory[i].slice(0,30),a=r.map((function(t){return t.frequency>31?12*Math.log2(t.frequency/440)+69:0})),l=u(a),o=l.map((function(t){return 30*(t+3)})),f=0;f<a.length;f++){var c=o[f],d=l[f];h.beginPath(),h.fillStyle="hsla(".concat(c,", 100%, 70%, ").concat(r[f].magnitude,")"),h.arc(n.width-i,n.height-(d+.5)%12/12*n.height,1,0,2*Math.PI),h.fill()}}}(m.state);break;case"resize":m.isFFTDetail?(r.width=m.width,r.height=m.height,a.width=m.width,a.height=m.height):(n.width=m.width,n.height=m.height,i.width=m.width,i.height=m.height,c())}}})();
//# sourceMappingURL=674.bundle.js.map