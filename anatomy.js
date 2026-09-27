/* Ilustración vectorial original. Cada zona conserva los datos y la selección del mapa. */
const MUSCLE_GROUPS=['Pecho','Espalda','Hombros','Trapecios','Bíceps','Tríceps','Antebrazos','Abdominales','Oblicuos','Lumbares','Glúteos','Abductores','Aductores','Cuádriceps','Isquios','Pantorrillas','Tibial anterior'];
function canonicalMuscleGroup(name){
  const key=normalize(name.trim());
  const aliases={abdomen:'Abdominales',abdominal:'Abdominales',gluteo:'Glúteos',gemelos:'Pantorrillas',gemelo:'Pantorrillas',soleo:'Pantorrillas',isquiotibiales:'Isquios',femorales:'Isquios',dorsales:'Espalda',deltoides:'Hombros',trapecio:'Trapecios',lumbar:'Lumbares',antebrazo:'Antebrazos',tibiales:'Tibial anterior'};
  return MUSCLE_GROUPS.find(group=>normalize(group)===key)||aliases[key]||name;
}
function anatomicalFigure({female,back,region,shadeId}) {
  const mirror = content => `${content}<g transform="translate(200 0) scale(-1 1)">${content}</g>`;
  const surface = (d,group=null) => group
    ? `${region(group,d)}<path class="anatomy-shading" d="${d}" fill="url(#${shadeId})"/>`
    : `<path class="body-neutral" d="${d}"/><path class="anatomy-shading" d="${d}" fill="url(#${shadeId})"/>`;
  const fibers = d => `<path class="anatomy-fibers" d="${d}"/>`;
  const shoulder = female?60:53, waist=female?77:72, hip=female?59:65;
  const outline=`M100 19 C86 19 79 29 80 46 L81 55 C75 48 76 65 83 68 Q86 79 91 82 L89 94 Q78 99 ${shoulder} 107 C${shoulder-13} 112 42 131 40 148 Q35 165 34 189 C30 207 25 226 24 244 L21 263 C17 272 11 280 13 285 Q16 288 23 279 L20 301 Q20 307 24 303 L28 284 L26 309 Q27 314 30 309 L34 285 L33 308 Q35 312 38 305 L41 283 L41 297 Q43 300 45 294 L48 275 Q48 268 43 258 L46 237 Q55 218 56 195 L65 162 Q65 184 ${waist} 210 Q${waist+2} 226 ${hip} 252 C${hip-5} 271 ${hip-4} 301 65 324 Q69 345 71 358 C67 376 66 392 72 415 L78 464 Q78 478 72 486 L64 496 Q60 504 69 506 L88 506 Q95 502 92 491 L89 475 L92 427 Q99 400 93 377 L94 356 Q100 330 100 294`;
  const silhouette=mirror(`<path class="anatomy-outline" style="stroke:none" d="${outline}Z"/><path class="anatomy-detail" d="${outline}"/>`);
  const head=back
    ? `<path class="anatomy-detail" d="M89 76Q100 81 111 76 M96 83L95 100 M104 83L105 100"/>`
    : `<path class="anatomy-detail face-detail" d="M85 46Q90 43 95 46 M105 46Q110 43 115 46 M86 49Q90 51 94 49 M106 49Q110 51 114 49 M100 49L97 61Q100 63 103 61 M94 69Q100 71 106 69 M96 74Q100 76 104 74 M84 57Q84 70 91 74 M116 57Q116 70 109 74"/>`;
  const deltoid=`M${shoulder+4} 109 C${shoulder-9} 107 43 123 42 146 Q46 153 55 151 Q62 133 72 125 Q71 114 ${shoulder+4} 109Z`;
  const shoulderFibers='M58 113Q47 126 46 144 M62 115Q53 132 50 147 M66 119L55 145';
  const forearm='M36 199Q30 216 27 242 L27 257Q36 249 40 231 L49 204L45 197Q41 209 36 199Z';
  const forearmLines='M40 209L29 247 M44 210L33 245 M37 218L29 238';
  const handLines='M26 269L39 266 M25 276L39 272 M27 262L35 257 M28 278L28 284 M34 278L34 285 M40 277L41 283';
  const lowerLeg=back
    ? 'M76 365Q66 382 73 405 Q77 418 82 423 L86 410Q90 386 85 370Z'
    : 'M76 368Q71 380 76 405 L83 452 L86 422Q90 393 84 373Z';
  const calfInner=back?'M88 366Q97 386 91 407 L86 421 Q81 403 83 384Z':'M88 376Q95 391 89 411L87 436L86 412Z';
  const legsDetail='M77 426L83 476 M88 431L86 477 M72 491Q80 493 88 489 M68 499L69 504 M73 498L74 505 M78 497L80 505 M84 497L85 504';
  const common=mirror(`${surface(`M${hip+1} 246Q${hip-6} 258 ${hip-3} 277L${hip+5} 269L${hip+7} 251Z`,'Abductores')}${surface(deltoid,'Hombros')}${fibers(shoulderFibers)}${surface(forearm,'Antebrazos')}${fibers(forearmLines)}${surface(lowerLeg,back?'Pantorrillas':'Tibial anterior')}${surface(calfInner,'Pantorrillas')}<path class="anatomy-detail" d="${handLines} ${legsDetail}"/>`);
  let torso,upperArm,thigh;
  if(back){
    torso=mirror(`${surface('M92 85L98 90L98 160Q88 148 78 130L65 111Q82 106 92 85Z','Trapecios')}
      ${surface('M74 132Q82 147 97 164L91 214Q76 202 69 181L65 151Z','Espalda')}
      ${surface('M72 130Q64 139 65 151L81 149Z','Espalda')}
      ${surface('M97 175L97 230L82 235Q87 206 97 175Z','Lumbares')}
      ${surface(`M${hip+3} 253Q75 234 97 241L97 283Q80 300 ${hip+1} 279Z`,'Glúteos')}
      ${fibers('M90 100L96 123 M83 107L95 139 M76 112L92 143 M69 145L80 144 M70 159L93 171 M72 169L92 182 M75 183L91 194 M79 198L89 205 M68 254Q82 244 94 251 M66 261Q80 252 94 258 M66 268Q82 261 94 266 M69 277Q83 269 94 275')}`);
    upperArm='M42 154Q37 169 38 192L43 199Q52 189 55 169L56 156Q49 160 42 154Z';
    thigh=mirror(`${surface('M65 291Q74 296 80 295L82 322L78 353Q67 337 65 314Z','Isquios')}
      ${surface('M83 296L96 287L93 329L85 356Q79 340 83 296Z','Isquios')}
      ${fibers('M70 300L75 337 M75 300L78 326 M88 300L87 334 M93 301L89 327')}`);
  }else{
    const chest=female?'M75 113Q84 108 97 115L98 135Q94 143 82 143Q72 137 68 127Z':'M73 113Q82 109 97 114L98 150Q86 157 68 147L63 132Z';
    torso=mirror(`${surface('M91 88L97 103L96 111L71 106Z','Trapecios')}${surface(chest,'Pecho')}
      ${female?'<path class="anatomy-outline" d="M80 141Q66 144 67 158Q69 174 84 174Q98 173 97 160Q95 145 80 141Z"/>':''}
      ${surface(`M69 ${female?174:155}L80 ${female?180:167}L81 212L88 238Q76 239 ${waist-1} 216Z`,'Oblicuos')}
      ${[0,1,2,3].map(i=>surface(`M85 ${178+i*15}Q91 ${174+i*15} 98 ${177+i*15}L98 ${188+i*15}Q91 ${191+i*15} 84 ${188+i*15}Z`,'Abdominales')).join('')}
      ${surface('M84 239L98 242L98 262Q88 257 84 239Z','Abdominales')}
      ${fibers(`M73 119Q84 120 94 118 M69 125Q81 129 94 125 M69 132Q80 136 94 133 ${female?'':'M73 142Q85 145 94 141'} M72 181L78 187 M73 191L79 197 M75 202L79 207 M78 214L83 223`)}
      <path class="anatomy-detail" d="M${hip+1} 251Q77 250 95 271 M99 233L99 236"/>`);
    upperArm='M44 156Q38 170 39 188Q41 201 47 191Q56 175 56 156Q50 162 44 156Z';
    thigh=mirror(`${surface(`M${hip+2} 264Q66 258 72 271L79 315Q80 331 75 342Q65 323 ${hip+2} 292Z`,'Cuádriceps')}
      ${surface('M76 271L87 278Q92 296 85 326L80 336Q84 310 76 271Z','Cuádriceps')}
      ${surface('M88 314Q93 329 89 346Q85 357 80 347Z','Cuádriceps')}
      ${surface('M91 276L98 284L94 315L89 330Q92 302 91 276Z','Aductores')}
      ${fibers('M67 274Q66 302 72 326 M71 277L76 325 M80 280Q87 301 83 317 M89 325L85 342')}
      <path class="anatomy-detail" d="M74 352Q80 348 88 355L85 364Q80 368 76 362Z"/>`);
  }
  const arms=mirror(`${surface(upperArm,back?'Tríceps':'Bíceps')}${fibers('M46 164Q41 178 43 188 M50 163L46 185')}`);
  return `${silhouette}${head}${torso}${common}${arms}${thigh}<path class="anatomy-detail" d="${back?'M100 95V231 M94 235L100 240L106 235':'M100 111V167'}"/>`;
}
