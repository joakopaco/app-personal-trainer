const $ = (s, root = document) => root.querySelector(s);
const paths = {
  trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  calendar:'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2ZM7 14h2m4 0h2m-8 4h2',
  users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m18 0v-2a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-7a4 4 0 0 1 0 8',
  routine:'M8 4h12v17H4V4h4Zm0-2h8v5H8ZM8 12h8m-8 4h5',
  chart:'M3 3v18h18M7 15l4-5 4 3 5-8',
  history:'M3 11a9 9 0 1 1 2 7M3 5v6h6m3-4v6l4 2',
  file:'M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 13h8m-8 4h6',
  plus:'M12 5v14M5 12h14',check:'m5 12 4 4L19 6',chevron:'m9 5 7 7-7 7',left:'m15 5-7 7 7 7',down:'m6 9 6 6 6-6',
  search:'M21 21l-6-6M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z',
  edit:'m16 3 5 5-12 12-6 1 1-6L16 3Zm-2 2 5 5',clock:'M12 8v5l3 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z',
  arrow:'M4 12h16m-6-6 6 6-6 6',download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',close:'m6 6 12 12M6 18 18 6',
  copy:'M8 8h13v13H8ZM16 8V3H3v13h5',move:'M12 2v20M2 12h20m-14-6 4-4 4 4m-8 12 4 4 4-4M6 8l-4 4 4 4m12-8 4 4-4 4',
  fire:'M12 2c1 6 7 7 7 13a7 7 0 0 1-14 0c0-3 2-6 4-8 0 4 2 4 3 5 2-2 1-6 0-10Z',
  dumbbell:'m6 5 13 13M3 8l5-5m8 18 5-5M2 6l4-4m12 20 4-4',info:'M12 11v6m0-10h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.routine}"/></svg>`;
const btn = (label, action, type='', glyph='') => `<button class="btn ${type}" data-action="${action}">${glyph ? icon(glyph) : ''}${label}</button>`;
const link = (label, route, type='', glyph='') => `<a class="btn ${type}" href="#${route}">${glyph ? icon(glyph) : ''}${label}</a>`;
const tag = (label, color='') => `<span class="tag ${color}"><span class="dot"></span>${label}</span>`;
const avatar = p => `<span class="avatar ${p.color||''}">${p.initials}</span>`;
const escapeHTML = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
