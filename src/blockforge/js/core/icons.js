/**
 * BlockForge — original icon set, logo and ForgeCoin mark (inline SVG strings).
 */
(function (BF) {
  'use strict';

  const P = {
    home: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    gamepad: '<path d="M7 8h10a4 4 0 0 1 4 4v1.5a3.5 3.5 0 0 1-6.3 2.1L14 15h-4l-.7.6A3.5 3.5 0 0 1 3 13.5V12a4 4 0 0 1 4-4z"/><path d="M7.5 10.5v3M6 12h3"/><path d="M15.5 11h.01M17.5 13h.01"/>',
    bag: '<path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>',
    box: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    shirt: '<path d="M9 4L4 6.5l1.8 4 2.2-1V20h8V9.5l2.2 1 1.8-4L15 4a3 3 0 0 1-6 0z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4M18 14.3a6.5 6.5 0 0 1 3.5 5.7"/>',
    chat: '<path d="M4 5h16v11H10l-5 4v-4H4z"/><path d="M8 9.5h8M8 12.5h5"/>',
    bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    anvil: '<path d="M3 7h13.5a4.5 4.5 0 0 1-4.5 4.5h-.5V15h3v3.5H6.5V15h3v-3.5H8A5 5 0 0 1 3 7z"/><path d="M16.5 7H21l-2.5 2.5h-2"/>',
    hammer: '<path d="M4 20l8.5-8.5"/><path d="M11 6.5l4.5-4.5 5 5-4.5 4.5z"/><path d="M11 6.5l2 2"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M10.3 3h3.4l.5 2.4 1.9.8 2-1.4 2.4 2.4-1.4 2 .8 1.9 2.4.5v3.4l-2.4.5-.8 1.9 1.4 2-2.4 2.4-2-1.4-1.9.8-.5 2.4h-3.4l-.5-2.4-1.9-.8-2 1.4-2.4-2.4 1.4-2-.8-1.9L3 13.7v-3.4l2.4-.5.8-1.9-1.4-2 2.4-2.4 2 1.4 1.9-.8z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4.2-4.2"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    heart: '<path d="M12 20l-1.2-1.1C6 14.6 3 11.9 3 8.4 3 5.8 5 3.8 7.6 3.8c1.6 0 3.2.8 4.4 2.1 1.2-1.3 2.8-2.1 4.4-2.1 2.6 0 4.6 2 4.6 4.6 0 3.5-3 6.2-7.8 10.5z"/>',
    thumbUp: '<path d="M7 10v10H4V10z"/><path d="M7 10l4-7a2 2 0 0 1 2.6 2.3L12.8 9H19a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7"/>',
    thumbDown: '<g transform="rotate(180 12 12)"><path d="M7 10v10H4V10z"/><path d="M7 10l4-7a2 2 0 0 1 2.6 2.3L12.8 9H19a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7"/></g>',
    play: '<path d="M8 5l11 7-11 7z" fill="currentColor"/>',
    share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>',
    crown: '<path d="M4 17l-1-10 5 4 4-6 4 6 5-4-1 10z"/><path d="M4 20h16"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M9.5 17h5"/>',
    gift: '<path d="M4 11h16v9H4zM3 7.5h18V11H3zM12 7.5V20"/><path d="M12 7.5C10.5 4.5 7 4 7 6s3 1.5 5 1.5c2 0 5 .5 5-1.5s-3.5-1.5-5 1.5"/>',
    calendar: '<path d="M4 6h16v14H4zM4 10h16M8 3v5M16 3v5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
    fire: '<path d="M12 21c-4 0-7-2.7-7-6.5 0-3 2-5 3.5-6.5.4 2 1.5 3 2.5 3-.5-3 1-6 4-8 0 3 1.5 4.5 3 6.5 1 1.3 1.5 2.8 1.5 4.5C19.5 18.3 16 21 12 21z"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>',
    lock: '<path d="M6 11h12v9H6z"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3"/>',
    unlock: '<path d="M6 11h12v9H6z"/><path d="M8.5 11V8a3.5 3.5 0 0 1 6.8-1.2"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    edit: '<path d="M4 20l1-4.2L16 4.8l3.2 3.2L8.2 19z"/><path d="M14 7l3 3"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A9.9 9.9 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.8 3.6M6.4 6.5A16.5 16.5 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 4.4-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    sort: '<path d="M7 4v16M4 7l3-3 3 3M17 20V4M14 17l3 3 3-3"/>',
    grid: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    chevronDown: '<path d="M6 9l6 6 6-6"/>',
    chevronUp: '<path d="M6 15l6-6 6 6"/>',
    chevronRight: '<path d="M9 6l6 6-6 6"/>',
    chevronLeft: '<path d="M15 6l-6 6 6 6"/>',
    arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
    save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/>',
    sword: '<path d="M20 4L9.5 14.5M20 4h-4L7.5 12.5M20 4v4l-8.5 8.5M6 12l6 6M8.5 15.5L4 20"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    warning: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
    server: '<path d="M4 4.5h16v6H4zM4 13.5h16v6H4z"/><path d="M8 7.5h.01M8 16.5h.01M12 7.5h5M12 16.5h5"/>',
    signal: '<path d="M5 19v-3M10 19v-6M15 19v-9M20 19V7"/>',
    volume: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
    mute: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.5-1-2.6 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><path d="M7.5 11.5h.01M9.5 7.5h.01M14.5 7.5h.01M17 11h.01"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14.5 8.5l2 2"/>',
    terminal: '<path d="M3.5 5h17v14h-17z"/><path d="M7 9.5l3 2.5-3 2.5M12 15h5"/>',
    wallet: '<path d="M4 7h15a1 1 0 0 1 1 1v11H5a1 1 0 0 1-1-1V6a2 2 0 0 1 2-2h11v3"/><path d="M16 13.5h.01"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
    medal: '<circle cx="12" cy="15" r="5"/><path d="M8.5 11.5L6 3h4l2 5 2-5h4l-2.5 8.5"/>',
    podium: '<path d="M3 20h18M9 20V8h6v12M3 20v-7h6M15 20v-5h6v5"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    dots: '<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3.2"/>',
    send: '<path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14a5 5 0 0 0 8 0M9 9.5h.01M15 9.5h.01"/>',
    paw: '<circle cx="7" cy="9" r="1.8"/><circle cx="10.5" cy="5.8" r="1.8"/><circle cx="14.5" cy="5.8" r="1.8"/><circle cx="18" cy="9" r="1.8"/><path d="M12.5 11c-2.7 0-5.5 3.6-5.5 6a2.5 2.5 0 0 0 3.5 2.3c1.2-.5 2.8-.5 4 0A2.5 2.5 0 0 0 18 17c0-2.4-2.8-6-5.5-6z"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.1-.4-.4-2.1z"/>',
    gem: '<path d="M7 4h10l4 5-9 11L3 9z"/><path d="M3 9h18M12 20L8.5 9 10 4M12 20l3.5-11L14 4"/>',
    ticket: '<path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4z"/><path d="M14 6.5v2M14 11v2M14 15.5v2"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
    copy: '<path d="M9 9h11v11H9z"/><path d="M5 15H4V4h11v1"/>',
    image: '<path d="M4 5h16v14H4z"/><path d="M4 16l5-5 4 4 3-3 4 4"/><circle cx="15.5" cy="9" r="1.5"/>',
    door: '<path d="M13 4H6v16h7"/><path d="M10 12h10M17 9l3 3-3 3"/>',
    pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
    expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    userPlus: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6"/>',
    userCheck: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 11l2 2 4-4"/>',
    userX: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M17 9l4 4M21 9l-4 4"/>',
    block: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    mail: '<path d="M3 6h18v12H3z"/><path d="M3 6l9 7 9-7"/>',
    rocket: '<path d="M12 15l-3-3c1.2-4.2 4.5-8 10.5-9-1 6-4.8 9.3-9 10.5z"/><path d="M9 12l-4-.5 2.5-3.5 4 .2M12 15l.5 4 3.5-2.5-.2-4M6.5 17.5c-1 1-2 3.5-2 3.5s2.5-1 3.5-2"/>',
    crosshair: '<circle cx="12" cy="12" r="8"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
    timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2M10 2.5h4M18.5 6.5l1.5-1.5"/>',
    wave: '<path d="M2 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0M2 17c2-3 4-3 6 0s4 3 6 0 4-3 6 0M2 7c2-3 4-3 6 0s4 3 6 0 4-3 6 0"/>',
    skull: '<path d="M12 3a8 8 0 0 0-5 14.3V20h10v-2.7A8 8 0 0 0 12 3z"/><circle cx="9" cy="11.5" r="1.6"/><circle cx="15" cy="11.5" r="1.6"/><path d="M10.5 20v-2M13.5 20v-2"/>',
    ball: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5l3.8 2.8-1.4 4.4H9.6l-1.4-4.4zM12 3v4.5M3.6 9l4.6 1.3M20.4 9l-4.6 1.3M6.5 19.3l3.1-4.6M17.5 19.3l-3.1-4.6"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    cursor: '<path d="M5 3l14 7-6 2-2 6z"/>',
    mapPin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3 4v4.5h4.5M12 8v4.5l3 2"/>',
    keyboard: '<path d="M3 6h18v12H3z"/><path d="M7 10h.01M11 10h.01M15 10h.01M17 14H7"/>',
    bug: '<path d="M8 8a4 4 0 0 1 8 0v1H8z"/><path d="M7 9h10v5a5 5 0 0 1-10 0zM12 9v10M3 13h4M17 13h4M4 8l3 2M20 8l-3 2M4 19l3-2M20 19l-3-2"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    emote: '<circle cx="12" cy="12" r="9"/><path d="M8 14.5a5 5 0 0 0 8 0M8.5 9.5l1.5 1M15.5 9.5l-1.5 1"/>',
    run: '<circle cx="14" cy="4.5" r="2"/><path d="M8 21l3-6 3 2v4M6 11l3-3 4 1 2 3 3 1M11 15l-1-5"/>',
    hat: '<path d="M4 17c2-1 5-1.5 8-1.5s6 .5 8 1.5M6.5 16l1-7a4.5 4.5 0 0 1 9 0l1 7"/>',
    note: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h5"/>',
  };

  /**
   * Return an inline SVG icon.
   * @param {string} name icon key
   * @param {number} [size=18]
   * @param {string} [cls]
   */
  BF.icon = function (name, size, cls) {
    const s = size || 18;
    const body = P[name] || P.info;
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  };
  BF.icon.names = Object.keys(P);

  /** The ForgeCoin: a golden hexagonal coin stamped with an isometric block. */
  BF.coinIcon = function (size, cls) {
    const s = size || 16;
    return '<svg class="fc-icon' + (cls ? ' ' + cls : '') + '" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M12 1.2l9.35 5.4v10.8L12 22.8l-9.35-5.4V6.6z" fill="#f2a318" stroke="#9c5704" stroke-width="1.1" stroke-linejoin="round"/>' +
      '<path d="M12 1.2l9.35 5.4-2.35 1.35L12 3.9 5 7.95 2.65 6.6z" fill="#ffd66b"/>' +
      '<path d="M12 4.3l6.6 3.8v7.8L12 19.7l-6.6-3.8V8.1z" fill="#f8b928"/>' +
      '<path d="M12 7.5l3.9 2.25v4.5L12 16.5l-3.9-2.25v-4.5z" fill="#b8650a"/>' +
      '<path d="M12 7.5l3.9 2.25L12 12 8.1 9.75z" fill="#fff0b8"/>' +
      '<path d="M12 12l3.9-2.25v4.5L12 16.5z" fill="#e08a12"/>' +
      '</svg>';
  };

  /** The BlockForge mark: an isometric block with a molten seam. */
  BF.logoMark = function (size) {
    const s = size || 30;
    return '<svg class="logo-mark" width="' + s + '" height="' + s + '" viewBox="0 0 32 32" aria-hidden="true">' +
      '<path d="M16 2.5l12 6.9v13.2L16 29.5 4 22.6V9.4z" fill="#1f1510"/>' +
      '<path d="M16 4.2l10.5 6.05L16 16.3 5.5 10.25z" fill="#ffb454"/>' +
      '<path d="M5.5 10.25L16 16.3v11.5L5.5 21.75z" fill="#ff7a2e"/>' +
      '<path d="M26.5 10.25V21.75L16 27.8V16.3z" fill="#c9460e"/>' +
      '<path d="M9.2 12.4l4.1 2.4-1.1 3.6 3 1.9" fill="none" stroke="#fff4d6" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" opacity=".95"/>' +
      '<path d="M21 13.6l2.6-1.5M19.7 18.3l3.9-2.2" stroke="#ff9d5c" stroke-width="1.2" stroke-linecap="round" opacity=".8"/>' +
      '<path d="M16 4.2l10.5 6.05" stroke="#ffe2b3" stroke-width=".8" opacity=".7"/>' +
      '</svg>';
  };

  /** Full logo lockup (mark + wordmark). */
  BF.logo = function (size) {
    return '<span class="logo">' + BF.logoMark(size || 30) + '<span class="logo-word">Block<b>Forge</b></span></span>';
  };

  /** Favicon SVG source (also written to assets/favicon.svg). */
  BF.faviconSVG = function () {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
      '<path d="M16 1.5l13 7.5v14L16 30.5 3 23V9z" fill="#1f1510"/>' +
      '<path d="M16 3.4l11.3 6.5L16 16.4 4.7 9.9z" fill="#ffb454"/>' +
      '<path d="M4.7 9.9L16 16.4v12.3L4.7 22.2z" fill="#ff7a2e"/>' +
      '<path d="M27.3 9.9v12.3L16 28.7V16.4z" fill="#c9460e"/>' +
      '<path d="M8.6 12.4l4.4 2.5-1.2 3.9 3.2 2" fill="none" stroke="#fff4d6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
  };
})((window.BF = window.BF || {}));
