(function () {
  'use strict';

  // ── CONFIG ──────────────────────────────────────────────────────────────────
  var CFG = Object.assign({
    n8nBase:        'https://n8n-jcg4epwgyztosnmbxghhwvdv.136.116.88.204.sslip.io',
    chatPath:       '/webhook/ecomangos-agent',
    leadsPath:      '/webhook/ecomangos-leads',
    reservaPath:    '/webhook/ecomangos-registrar-reserva',
    extendPath:     '/webhook/ecomangos-extender-reserva',
    buscarPath:     '/webhook/ecomangos-buscar-reserva',
    registradoresPath: '/webhook/ecomangos-registradores',
    staffKey:       'EMstaff2026',
    primaryColor:   '#F5A21C',
    secondaryColor: '#2D6B27',
    welcomeMessage: 'Hola, soy el asistente de Glamping Eco Mangos. Puedo ayudarte con precios, opciones de glamping y reservas. Para empezar: ¿qué fecha tienes en mente para tu experiencia?',
    timeoutMs:      60000,
    maxRetries:     2,
    sessionTtlMs:   30 * 60 * 1000,
    privacyUrl:     '/politica-privacidad.html',
    whatsappUrl:    'https://wa.me/51929790568',
  }, window.ecomangosAgentConfig || {});

  var N8N          = CFG.n8nBase + CFG.chatPath;
  var N8N_LEADS    = CFG.n8nBase + CFG.leadsPath;
  var N8N_RESERVA  = CFG.n8nBase + CFG.reservaPath;
  var N8N_EXTENDER = CFG.n8nBase + CFG.extendPath;
  var N8N_BUSCAR   = CFG.n8nBase + CFG.buscarPath;
  var N8N_REGISTRADORES = CFG.n8nBase + CFG.registradoresPath;
  var PRIMARY      = CFG.primaryColor;
  var SECONDARY    = CFG.secondaryColor;

  // Modo staff: se activa escribiendo la contraseña en el chat (Obs 4)
  var staffModeActive = false;

  // ── SESSION ─────────────────────────────────────────────────────────────────
  function getSessionId() {
    var KEY = 'eco_session_id', KEY_TS = 'eco_session_last';
    var now = Date.now();
    var last = Number(sessionStorage.getItem(KEY_TS) || 0);
    if (!sessionStorage.getItem(KEY) || (now - last) > CFG.sessionTtlMs) {
      sessionStorage.setItem(KEY, 'web_' + Math.random().toString(36).slice(2) + Date.now().toString(36));
      sessionStorage.removeItem('eco_msgs');
    }
    sessionStorage.setItem(KEY_TS, now);
    return sessionStorage.getItem(KEY);
  }

  // ── UTILS ────────────────────────────────────────────────────────────────────
  function escXSS(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    var meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    var parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return parts[2] + ' ' + (meses[parseInt(parts[1], 10) - 1] || '?') + ' ' + parts[0];
  }

  function addDays(dateStr, days) {
    var d = new Date(dateStr + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function getTodayStr() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function isExtensionBlocked(llegadaStr) {
    return getTodayStr() >= llegadaStr;
  }

  var CARPAS_LABEL = {
    'matrimonial-2p':      'Matrimonial Premium 2p',
    'matrimonial-3p':      'Matrimonial Premium 3p',
    'familiar-4p':         'Familiar Estándar 4p',
    'familiar-premium-5p': 'Familiar Premium 4-5p',
    'familiar-plus-5p':    'Familiar Plus 5p',
  };

  // ── MARKDOWN RENDERER ────────────────────────────────────────────────────────
  function renderMd(text) {
    if (!text) return '';
    var imgs = [];
    var s = text.replace(/\[IMG:(https?:\/\/[^\]]+)\]/g, function(_, url) {
      imgs.push(url); return '\x00IMG' + (imgs.length - 1) + '\x00';
    });
    s = s
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
    s = s.replace(/(<li>.*<\/li>)/s, function(m) { return '<ul>' + m + '</ul>'; });
    s = s.split(/\n{2,}/).map(function(p) {
      p = p.trim();
      if (!p || p.startsWith('<ul>') || p.startsWith('<li>')) return p;
      return '<p>' + p.replace(/\n/g, '<br>') + '</p>';
    }).join('');
    s = s.replace(/\x00IMG(\d+)\x00/g, function(_, i) {
      return '<img src="' + imgs[+i] + '" class="eco-photo" alt="Eco Mangos" style="max-width:100%;border-radius:8px;margin:6px 0;display:block;">';
    });
    return s;
  }

  // ── CSS ──────────────────────────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = [
    '#eco-widget *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif,"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji"}',
    '#eco-bubble{position:fixed;bottom:24px;right:24px;width:56px;height:56px;border-radius:50%;background:' + SECONDARY + ';cursor:pointer;z-index:99999;box-shadow:0 4px 16px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;transition:transform .2s;overflow:hidden}',
    '#eco-bubble:hover{transform:scale(1.08)}',
    '#eco-bubble svg{display:none}',
    '#eco-panel{position:fixed;bottom:90px;right:24px;width:360px;max-width:calc(100vw - 32px);height:560px;max-height:calc(100vh - 110px);background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.2);z-index:99998;display:flex;flex-direction:column;overflow:hidden;transition:opacity .2s,transform .2s}',
    '#eco-panel.eco-hidden{opacity:0;pointer-events:none;transform:translateY(16px)}',
    '#eco-header{background:' + SECONDARY + ';padding:14px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0}',
    '#eco-header-logo{width:36px;height:36px;border-radius:50%;background:' + PRIMARY + ';display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:14px;flex-shrink:0;overflow:hidden;padding:0}',
    '#eco-header-info{flex:1;min-width:0}',
    '#eco-header-name{color:#fff;font-weight:700;font-size:14px;margin:0}',
    '#eco-header-sub{color:rgba(255,255,255,.85);font-size:12px;margin:0}',
    '#eco-header-actions{display:flex;align-items:center;gap:2px;flex-shrink:0}',
    '#eco-staff-btn{background:none;border:none;cursor:pointer;padding:4px;color:rgba(255,255,255,.7);font-size:14px;line-height:1;transition:color .15s;display:none}',
    '#eco-staff-btn:hover{color:#fff}',
    '#eco-reset{background:none;border:none;cursor:pointer;padding:4px;color:rgba(255,255,255,.75);font-size:16px;line-height:1;transition:color .15s}',
    '#eco-reset:hover{color:#fff}',
    '#eco-close{background:none;border:none;cursor:pointer;padding:4px;color:#fff;font-size:20px;line-height:1;flex-shrink:0}',
    /* Staff dropdown */
    '#eco-staff-menu{position:absolute;top:58px;right:16px;background:#fff;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.18);z-index:100000;min-width:200px;overflow:hidden;display:none}',
    '#eco-staff-menu button{display:block;width:100%;text-align:left;padding:12px 16px;background:none;border:none;border-bottom:1px solid #f1f5f9;cursor:pointer;font-size:13px;color:#1e293b;transition:background .15s}',
    '#eco-staff-menu button:last-child{border-bottom:none}',
    '#eco-staff-menu button:hover{background:#f8fafc}',
    '#eco-staff-menu .eco-staff-label{display:block;font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:.5px;padding:8px 16px 0;pointer-events:none}',
    /* Messages */
    '#eco-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px}',
    '.eco-msg{max-width:82%;word-wrap:break-word;font-size:14px;line-height:1.5}',
    '.eco-msg p{margin:0 0 6px 0}.eco-msg p:last-child{margin:0}',
    '.eco-msg ul{margin:4px 0 4px 16px;padding:0}.eco-msg li{margin:2px 0}',
    '.eco-msg-user{align-self:flex-end;background:#3a7a32;color:#fff;border-radius:16px 16px 4px 16px;padding:10px 14px}',
    '.eco-msg-bot{align-self:flex-start;background:#f1f5f9;color:#1e293b;border-radius:16px 16px 16px 4px;padding:10px 14px}',
    '.eco-msg-bot img:not(.eco-photo){max-width:1.2em!important;max-height:1.2em!important;display:inline-block!important;vertical-align:text-bottom!important}',
    '.eco-msg-bot img.eco-photo{max-width:100%;border-radius:8px;margin:6px 0;display:block}',
    '.eco-action-btn{align-self:flex-start;margin-top:-4px;background:' + SECONDARY + ';color:#fff;border:none;border-radius:20px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;transition:background .2s}',
    '.eco-action-btn:hover{background:#1e5218}',
    '.eco-action-btn:disabled{background:#9ca3af;cursor:default;opacity:.7}',
    /* Quick reply buttons */
    '#eco-quick-btns{align-self:flex-start;display:flex;gap:8px;flex-wrap:wrap;margin-top:2px}',
    '.eco-qbtn{background:#fff;color:' + SECONDARY + ';border:1.5px solid ' + SECONDARY + ';border-radius:20px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;transition:all .2s;white-space:nowrap}',
    '.eco-qbtn:hover{background:' + SECONDARY + ';color:#fff}',
    /* Typing */
    '#eco-typing{display:none;align-self:flex-start;padding:10px 14px;background:#f1f5f9;border-radius:16px 16px 16px 4px}',
    '.eco-dot{width:7px;height:7px;background:#94a3b8;border-radius:50%;display:inline-block;animation:eco-bounce .9s infinite}',
    '.eco-dot:nth-child(2){animation-delay:.15s}.eco-dot:nth-child(3){animation-delay:.3s}',
    '@keyframes eco-bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-6px)}}',
    /* Lead form */
    '#eco-lead-form{padding:10px 16px 12px;background:#f8fafc;border-top:1px solid #e2e8f0;flex-shrink:0}',
    '#eco-lead-header{display:flex;justify-content:space-between;align-items:center;cursor:pointer;padding:4px 0}',
    '#eco-lead-form h4{margin:0;font-size:13px;color:#374151;flex:1}',
    '#eco-lead-toggle{background:none;border:none;cursor:pointer;color:#6b7280;font-size:18px;padding:0 2px;line-height:1;flex-shrink:0}',
    '#eco-lead-body{margin-top:10px}',
    '#eco-lead-form input{width:100%;padding:9px 12px;margin-bottom:8px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;outline:none}',
    '#eco-lead-form input:focus{border-color:' + PRIMARY + ';box-shadow:0 0 0 2px rgba(245,162,28,.15)}',
    '#eco-lead-form .eco-row{display:flex;gap:8px}',
    '#eco-lead-form .eco-row input{margin-bottom:0}',
    '#eco-lead-submit{width:100%;margin-top:8px;padding:10px;background:' + SECONDARY + ';color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:background .2s}',
    '#eco-lead-submit:hover{background:#235a20}',
    '#eco-lead-to-booking{display:block;text-align:center;margin-top:8px;font-size:12px;color:#6b7280;background:none;border:none;cursor:pointer;text-decoration:underline;width:100%}',
    '#eco-lead-to-booking:hover{color:' + SECONDARY + '}',
    /* Booking form (full panel) */
    '#eco-booking-form{flex:1;overflow-y:auto;padding:14px 16px 16px;background:#fff;display:none;flex-direction:column;gap:0}',
    '#eco-booking-header{display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-shrink:0}',
    '#eco-booking-back{background:none;border:none;cursor:pointer;color:' + SECONDARY + ';font-size:13px;font-weight:600;padding:0;display:flex;align-items:center;gap:4px}',
    '#eco-booking-back:hover{color:#1e5218}',
    '#eco-booking-form h4{margin:0;font-size:13px;color:#374151;flex:1}',
    '#eco-booking-form input,#eco-booking-form select{width:100%;padding:9px 12px;margin-bottom:8px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;outline:none;background:#fff;color:#1e293b}',
    '#eco-booking-form input:focus,#eco-booking-form select:focus{border-color:' + PRIMARY + ';box-shadow:0 0 0 2px rgba(245,162,28,.15)}',
    '.eco-select-wrap{position:relative;margin-bottom:8px}',
    '.eco-select-wrap select{width:100%;padding:9px 32px 9px 12px;margin-bottom:0;appearance:none;-webkit-appearance:none;cursor:pointer}',
    '.eco-select-arrow{position:absolute;right:11px;top:50%;transform:translateY(-52%);pointer-events:none;color:#6b7280;font-size:18px;line-height:1}',
    '.eco-date-row{display:flex;gap:8px;margin-bottom:8px}',
    '.eco-date-col{flex:1;display:flex;flex-direction:column;gap:3px}',
    '.eco-date-label{font-size:11px;color:#6b7280;font-weight:500}',
    '.eco-date-col input{margin-bottom:0;width:100%}',
    '#eco-booking-submit{width:100%;margin-top:4px;padding:10px;background:' + SECONDARY + ';color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:background .2s;flex-shrink:0}',
    '#eco-booking-submit:hover{background:#235a20}',
    '#eco-booking-submit:disabled{background:#9ca3af;cursor:default}',
    '#eco-booking-to-lead{display:block;text-align:center;margin-top:8px;font-size:12px;color:#6b7280;background:none;border:none;cursor:pointer;text-decoration:underline;width:100%;padding-bottom:4px;flex-shrink:0}',
    '#eco-booking-to-lead:hover{color:' + SECONDARY + '}',
    /* Extension form (full panel) */
    '#eco-ext-form{flex:1;overflow-y:auto;padding:14px 16px 16px;background:#fff;display:none;flex-direction:column;gap:0}',
    '#eco-ext-header{display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-shrink:0}',
    '#eco-ext-back{background:none;border:none;cursor:pointer;color:' + SECONDARY + ';font-size:13px;font-weight:600;padding:0;display:flex;align-items:center;gap:4px}',
    '#eco-ext-back:hover{color:#1e5218}',
    '#eco-ext-form h4{margin:0;font-size:13px;color:#374151;flex:1}',
    '#eco-ext-form p{font-size:13px;color:#4b5563;margin:0 0 12px;line-height:1.5}',
    '#eco-ext-form input{width:100%;padding:9px 12px;margin-bottom:8px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;outline:none}',
    '#eco-ext-form input:focus{border-color:' + PRIMARY + ';box-shadow:0 0 0 2px rgba(245,162,28,.15)}',
    '.eco-ext-search-row{display:flex;gap:8px}',
    '.eco-ext-search-row input{flex:1;margin-bottom:0}',
    '#eco-ext-search{padding:9px 14px;background:' + SECONDARY + ';color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0;transition:background .2s}',
    '#eco-ext-search:hover{background:#235a20}',
    '#eco-ext-search:disabled{background:#9ca3af;cursor:default}',
    '#eco-ext-error{font-size:13px;color:#dc2626;margin:0 0 12px;display:none}',
    '.eco-ext-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-bottom:14px}',
    '.eco-ext-card-name{font-size:14px;font-weight:700;color:#1e293b;margin:0 0 8px}',
    '.eco-ext-card-row{display:flex;justify-content:space-between;font-size:13px;color:#4b5563;margin-bottom:4px}',
    '.eco-ext-card-row span{font-weight:600;color:#1e293b}',
    '.eco-ext-date-label{font-size:11px;color:#6b7280;font-weight:500;margin-bottom:3px;display:block}',
    /* Obs 2: botón CTA "Extender mi estadía" */
    '#eco-ext-extend-cta{width:100%;padding:10px;background:' + SECONDARY + ';color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:background .2s;margin-bottom:8px}',
    '#eco-ext-extend-cta:hover{background:#235a20}',
    '#eco-ext-submit{width:100%;padding:10px;background:' + SECONDARY + ';color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:background .2s;margin-top:4px}',
    '#eco-ext-submit:hover{background:#235a20}',
    '#eco-ext-submit:disabled{background:#9ca3af;cursor:default}',
    '.eco-ext-blocked-box{background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px;margin-bottom:14px}',
    '.eco-ext-blocked-box p{color:#dc2626;font-size:13px;margin:0 0 10px;line-height:1.5}',
    '.eco-ext-wa-btn{display:block;text-align:center;background:#25D366;color:#fff;border:none;border-radius:8px;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer;text-decoration:none;width:100%;transition:background .2s}',
    '.eco-ext-wa-btn:hover{background:#1ebe5d}',
    '.eco-ext-note{font-size:11px;color:#9ca3af;margin-top:8px;text-align:center;display:block}',
    /* WhatsApp CTA */
    '#eco-wa-cta{padding:14px 16px;background:linear-gradient(135deg,' + SECONDARY + ',' + PRIMARY + ');text-align:center;flex-shrink:0;display:none}',
    '#eco-wa-cta p{color:#fff;font-size:13px;margin:0 0 10px;line-height:1.4}',
    '#eco-wa-cta a{display:inline-block;background:#fff;color:' + SECONDARY + ';font-weight:700;font-size:14px;padding:10px 20px;border-radius:8px;text-decoration:none}',
    '#eco-footer{padding:8px 16px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;justify-content:center;gap:12px;flex-shrink:0}',
    '#eco-footer a{font-size:11px;color:#9ca3af;text-decoration:none}#eco-footer a:hover{color:' + PRIMARY + '}',
    '#eco-input-area{padding:12px 16px;border-top:1px solid #e2e8f0;display:flex;gap:8px;flex-shrink:0}',
    '#eco-input{flex:1;padding:10px 14px;border:1px solid #d1d5db;border-radius:24px;font-size:14px;outline:none;resize:none;min-height:40px;max-height:100px}',
    '#eco-input:focus{border-color:' + PRIMARY + ';box-shadow:0 0 0 2px rgba(245,162,28,.15)}',
    '#eco-send{width:40px;height:40px;border-radius:50%;background:' + SECONDARY + ';border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .2s}',
    '#eco-send:hover{background:#1e5218}',
    '#eco-send svg{width:18px;height:18px;fill:#fff}',
    /* Tooltip de bienvenida */
    '#eco-tooltip{position:fixed;bottom:90px;right:24px;background:#fff;border-radius:14px;padding:14px 40px 14px 16px;box-shadow:0 4px 24px rgba(0,0,0,.18);z-index:99997;max-width:260px;display:none}',
    '#eco-tooltip::after{content:"";position:absolute;bottom:-7px;right:19px;width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:8px solid #fff}',
    '#eco-tooltip-close{position:absolute;top:8px;right:10px;background:none;border:none;cursor:pointer;font-size:17px;color:#9ca3af;padding:0;line-height:1;transition:color .15s}',
    '#eco-tooltip-close:hover{color:#374151}',
    '#eco-tooltip p{font-size:13px;color:#374151;line-height:1.5;margin:0}',
    '@keyframes eco-fadein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}',
    '#eco-tooltip.eco-visible{display:block;animation:eco-fadein .3s ease}',
    /* Pulso en la burbuja */
    '@keyframes eco-ripple{0%{box-shadow:0 0 0 0 rgba(45,107,39,.5)}70%{box-shadow:0 0 0 14px rgba(45,107,39,0)}100%{box-shadow:0 0 0 0 rgba(45,107,39,0)}}',
    '#eco-bubble.eco-pulse{animation:eco-ripple 2s infinite}',
  ].join('');
  document.head.appendChild(style);

  // ── HTML ─────────────────────────────────────────────────────────────────────
  var wrap = document.createElement('div');
  wrap.id = 'eco-widget';
  wrap.innerHTML = [
    '<div id="eco-bubble" role="button" aria-label="Abrir chat">',
      '<img src="https://cdn.jsdelivr.net/gh/nachojr2003/eco-mangos-widget@main/images/logo.jpg" alt="Eco Mangos" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block">',
    '</div>',
    '<div id="eco-tooltip">',
      '<button id="eco-tooltip-close" aria-label="Cerrar">&times;</button>',
      '<p id="eco-tooltip-body">&#128075; &#161;Hola! Soy el asistente de Glamping Eco Mangos.<br>Puedo ayudarte con precios, opciones y reservas.</p>',
    '</div>',
    '<div id="eco-panel" class="eco-hidden" role="dialog" aria-label="Chat Eco Mangos">',
      '<div id="eco-header">',
        '<div id="eco-header-logo"><img src="https://cdn.jsdelivr.net/gh/nachojr2003/eco-mangos-widget@main/images/logo.jpg" alt="Eco Mangos" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block"></div>',
        '<div id="eco-header-info">',
          '<p id="eco-header-name">Glamping Eco Mangos</p>',
          '<p id="eco-header-sub">Asistente virtual</p>',
        '</div>',
        '<div id="eco-header-actions">',
          '<button id="eco-staff-btn" aria-label="Menú staff" title="Staff">&#9881;</button>',
          '<button id="eco-reset" aria-label="Reiniciar chat" title="Reiniciar conversación">',
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>',
          '</button>',
          '<button id="eco-close" aria-label="Cerrar">&times;</button>',
        '</div>',
      '</div>',
      /* Staff dropdown menu */
      '<div id="eco-staff-menu">',
        '<span class="eco-staff-label">Panel Staff</span>',
        '<button id="eco-staff-new-reserva">&#x1F4CB; Nueva reserva manual</button>',
        '<button id="eco-staff-ext">&#x1F4C5; Modificar estadía</button>',
      '</div>',
      '<div id="eco-msgs" aria-live="polite"></div>',
      '<div id="eco-typing"><span class="eco-dot"></span><span class="eco-dot"></span><span class="eco-dot"></span></div>',
      '<div id="eco-lead-form" style="display:none">',
        '<div id="eco-lead-header">',
          '<h4>Deja tus datos y te contactamos hoy</h4>',
          '<button id="eco-lead-toggle" aria-label="Expandir formulario">&#9656;</button>',
        '</div>',
        '<div id="eco-lead-body" style="display:none">',
          '<input type="text" id="eco-nombre" placeholder="Tu nombre *" autocomplete="name">',
          '<input type="tel" id="eco-telefono" placeholder="Tu celular *" autocomplete="tel">',
          '<div class="eco-row">',
            '<input type="text" id="eco-fecha" placeholder="Fecha tentativa">',
            '<input type="text" id="eco-personas" placeholder="N.° personas">',
          '</div>',
          '<input type="text" id="eco-hp" style="display:none" tabindex="-1" autocomplete="off">',
          '<button id="eco-lead-submit">Enviar mis datos</button>',
          '<button id="eco-lead-to-booking">Completar reserva completa &#8594;</button>',
        '</div>',
      '</div>',
      /* Booking form (full panel) */
      '<div id="eco-booking-form">',
        '<div id="eco-booking-header">',
          '<button id="eco-booking-back">&#8592; Volver</button>',
          '<h4>Completa tu reserva</h4>',
        '</div>',
        '<input type="text" id="eco-b-nombre" placeholder="Nombre completo *" autocomplete="name">',
        '<input type="text" id="eco-b-dni" placeholder="DNI o Carnet de Extranjería *">',
        '<input type="tel" id="eco-b-tel" placeholder="Celular *" autocomplete="tel">',
        '<input type="email" id="eco-b-email" placeholder="Correo electrónico *" autocomplete="email">',
        '<div class="eco-select-wrap">',
          '<select id="eco-b-carpa"><option value="">Tipo de carpa *</option></select>',
          '<span class="eco-select-arrow">&#9662;</span>',
        '</div>',
        /* Obs 5: Registrado por — visible solo en booking de staff */
        '<div class="eco-select-wrap" id="eco-b-registrado-wrap" style="display:none">',
          '<select id="eco-b-registrado"><option value="">Registrado por *</option><option value="Camila">Camila</option></select>',
          '<span class="eco-select-arrow">&#9662;</span>',
        '</div>',
        '<div class="eco-date-row">',
          '<div class="eco-date-col">',
            '<span class="eco-date-label">Fecha de llegada *</span>',
            '<input type="date" id="eco-b-llegada">',
          '</div>',
          '<div class="eco-date-col">',
            '<span class="eco-date-label">Fecha de salida *</span>',
            '<input type="date" id="eco-b-salida">',
          '</div>',
        '</div>',
        '<input type="number" id="eco-b-pax" placeholder="N.° personas *" min="1" max="5">',
        '<input type="text" id="eco-b-ocasion" placeholder="Ocasión especial (opcional)">',
        '<button id="eco-booking-submit">Enviar solicitud de reserva</button>',
        '<button id="eco-booking-to-lead">&#8592; Prefiero dejar mis datos de contacto</button>',
      '</div>',
      /* Extension form (full panel) */
      '<div id="eco-ext-form">',
        '<div id="eco-ext-header">',
          '<button id="eco-ext-back">&#8592; Volver</button>',
          '<h4 id="eco-ext-title">Extender mi estadía</h4>',
        '</div>',
        /* Step 1: Buscar por DNI */
        '<div id="eco-ext-step1">',
          '<p>Ingresa tu DNI o Carnet de Extranjería para encontrar tu reserva.</p>',
          '<div class="eco-ext-search-row">',
            '<input type="text" id="eco-ext-dni" placeholder="DNI o CE *" autocomplete="off">',
            '<button id="eco-ext-search">Buscar</button>',
          '</div>',
          '<p id="eco-ext-error"></p>',
        '</div>',
        /* Step 2: Reserva encontrada — primero card + CTA, luego fecha (Obs 2) */
        '<div id="eco-ext-step2" style="display:none">',
          '<div class="eco-ext-card">',
            '<p class="eco-ext-card-name" id="eco-ext-card-name"></p>',
            '<div class="eco-ext-card-row">Reserva <span id="eco-ext-card-codigo"></span></div>',
            '<div class="eco-ext-card-row">Carpa <span id="eco-ext-card-carpa"></span></div>',
            '<div class="eco-ext-card-row">Llegada <span id="eco-ext-card-llegada"></span></div>',
            '<div class="eco-ext-card-row">Salida actual <span id="eco-ext-card-salida"></span></div>',
          '</div>',
          /* Step 2a: CTA para extender (visible primero) */
          '<div id="eco-ext-step2a">',
            '<button id="eco-ext-extend-cta">Extender mi estad&#237;a &#8594;</button>',
          '</div>',
          /* Step 2b: picker de fecha (oculto hasta que se clickea CTA) */
          '<div id="eco-ext-step2b" style="display:none">',
            '<span class="eco-ext-date-label">Nueva fecha de salida *</span>',
            '<input type="date" id="eco-ext-nueva-salida">',
            '<button id="eco-ext-submit">Confirmar extensi&#243;n</button>',
            '<span class="eco-ext-note">Nuestro equipo te contactar&#225; para coordinar el pago de las noches adicionales.</span>',
          '</div>',
        '</div>',
        /* Step 2c: Bloqueado */
        '<div id="eco-ext-blocked" style="display:none">',
          '<div class="eco-ext-card">',
            '<p class="eco-ext-card-name" id="eco-ext-b-name"></p>',
            '<div class="eco-ext-card-row">Llegada <span id="eco-ext-b-llegada"></span></div>',
          '</div>',
          '<div class="eco-ext-blocked-box">',
            '<p>Tu reserva ya inició o inicia hoy. Para ampliar tu estadía, comunícate directamente con nuestro equipo:</p>',
            '<a href="' + CFG.whatsappUrl + '" target="_blank" rel="noopener" class="eco-ext-wa-btn">&#128241; WhatsApp 929 790 568</a>',
          '</div>',
        '</div>',
      '</div>',
      '<div id="eco-wa-cta">',
        '<p>Si prefieres, coordina directamente por WhatsApp:</p>',
        '<a href="' + CFG.whatsappUrl + '" target="_blank" rel="noopener">Escribir por WhatsApp</a>',
      '</div>',
      '<div id="eco-input-area">',
        '<textarea id="eco-input" placeholder="Escribe tu mensaje..." rows="1" aria-label="Mensaje"></textarea>',
        '<button id="eco-send" aria-label="Enviar">',
          '<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
        '</button>',
      '</div>',
      '<div id="eco-footer">',
        '<a href="' + CFG.privacyUrl + '" target="_blank">Privacidad</a>',
        '<a href="https://ijvagency.com/" target="_blank" rel="noopener">Powered by IJV</a>',
      '</div>',
    '</div>',
  ].join('');
  document.body.appendChild(wrap);

  // ── REFS ─────────────────────────────────────────────────────────────────────
  var $bubble           = document.getElementById('eco-bubble');
  var $tooltip          = document.getElementById('eco-tooltip');
  var $tooltipClose     = document.getElementById('eco-tooltip-close');
  var $panel            = document.getElementById('eco-panel');
  var $close            = document.getElementById('eco-close');
  var $reset            = document.getElementById('eco-reset');
  var $staffBtn         = document.getElementById('eco-staff-btn');
  var $staffMenu        = document.getElementById('eco-staff-menu');
  var $staffNewRes      = document.getElementById('eco-staff-new-reserva');
  var $staffExt         = document.getElementById('eco-staff-ext');
  var $msgs             = document.getElementById('eco-msgs');
  var $typing           = document.getElementById('eco-typing');
  var $form             = document.getElementById('eco-lead-form');
  var $waCta            = document.getElementById('eco-wa-cta');
  var $input            = document.getElementById('eco-input');
  var $send             = document.getElementById('eco-send');
  var $inputArea        = document.getElementById('eco-input-area');
  var $footer           = document.getElementById('eco-footer');
  var $submit           = document.getElementById('eco-lead-submit');
  var $nombre           = document.getElementById('eco-nombre');
  var $tel              = document.getElementById('eco-telefono');
  var $fecha            = document.getElementById('eco-fecha');
  var $personas         = document.getElementById('eco-personas');
  var $hp               = document.getElementById('eco-hp');
  var $leadHeader       = document.getElementById('eco-lead-header');
  var $leadBody         = document.getElementById('eco-lead-body');
  var $leadToggle       = document.getElementById('eco-lead-toggle');
  var $leadToBook       = document.getElementById('eco-lead-to-booking');
  var $bookForm         = document.getElementById('eco-booking-form');
  var $bookBack         = document.getElementById('eco-booking-back');
  var $bookToLead       = document.getElementById('eco-booking-to-lead');
  var $bookSubmit       = document.getElementById('eco-booking-submit');
  var $bNombre          = document.getElementById('eco-b-nombre');
  var $bDni             = document.getElementById('eco-b-dni');
  var $bTel             = document.getElementById('eco-b-tel');
  var $bEmail           = document.getElementById('eco-b-email');
  var $bCarpa           = document.getElementById('eco-b-carpa');
  var $bRegistradoWrap  = document.getElementById('eco-b-registrado-wrap');
  var $bRegistrado      = document.getElementById('eco-b-registrado');
  var $bLlegada         = document.getElementById('eco-b-llegada');
  var $bSalida          = document.getElementById('eco-b-salida');
  var $bPax             = document.getElementById('eco-b-pax');
  var $bOcasion         = document.getElementById('eco-b-ocasion');
  // Extension form refs
  var $extForm          = document.getElementById('eco-ext-form');
  var $extBack          = document.getElementById('eco-ext-back');
  var $extTitle         = document.getElementById('eco-ext-title');
  var $extStep1         = document.getElementById('eco-ext-step1');
  var $extStep2         = document.getElementById('eco-ext-step2');
  var $extStep2a        = document.getElementById('eco-ext-step2a');
  var $extStep2b        = document.getElementById('eco-ext-step2b');
  var $extExtendCta     = document.getElementById('eco-ext-extend-cta');
  var $extBlocked       = document.getElementById('eco-ext-blocked');
  var $extDni           = document.getElementById('eco-ext-dni');
  var $extSearch        = document.getElementById('eco-ext-search');
  var $extError         = document.getElementById('eco-ext-error');
  var $extCardName      = document.getElementById('eco-ext-card-name');
  var $extCardCod       = document.getElementById('eco-ext-card-codigo');
  var $extCardCarpa     = document.getElementById('eco-ext-card-carpa');
  var $extCardLleg      = document.getElementById('eco-ext-card-llegada');
  var $extCardSal       = document.getElementById('eco-ext-card-salida');
  var $extNuevaSal      = document.getElementById('eco-ext-nueva-salida');
  var $extSubmit        = document.getElementById('eco-ext-submit');
  var $extBName         = document.getElementById('eco-ext-b-name');
  var $extBLleg         = document.getElementById('eco-ext-b-llegada');

  // ── STATE ────────────────────────────────────────────────────────────────────
  var isOpen            = false;
  var isLoading         = false;
  var leadShown         = false;
  var bookingDone       = false;
  var turnCount         = 0;
  var carpaTipoDetected = 'all';
  var waCtaWasVisible   = false;
  var staffBooking      = false;
  var extStaffMode      = false;
  var extFoundData      = null;
  var registradoresCache = null;   // Obs 4: nombres del dropdown col N (Sheet)
  var lastDetectedGrupo = null;    // Obs 1: último grupo de carpa recomendado por el agente

  // ── SCROLL ───────────────────────────────────────────────────────────────────
  function scrollToBottom() {
    $msgs.scrollTop = $msgs.scrollHeight;
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function () { $msgs.scrollTop = $msgs.scrollHeight; });
    }
  }

  // ── MESSAGES ─────────────────────────────────────────────────────────────────
  function addMessage(role, html) {
    var div = document.createElement('div');
    div.className = 'eco-msg eco-msg-' + role;
    div.innerHTML = html;
    $msgs.appendChild(div);
    scrollToBottom();
    return div;
  }

  function typewriter(el, text, done) {
    var i = 0;
    var words = text.split(' ');
    el.innerHTML = '';
    function tick() {
      if (i < words.length) {
        el.innerHTML = renderMd(words.slice(0, i + 1).join(' '));
        i++;
        scrollToBottom();
        setTimeout(tick, 28);
      } else {
        el.innerHTML = renderMd(text);
        scrollToBottom();
        if (done) done();
      }
    }
    tick();
  }

  function showTyping() { $typing.style.display = 'flex'; scrollToBottom(); }
  function hideTyping() { $typing.style.display = 'none'; }

  // ── QUICK REPLIES (Obs 1: solo "Ya tengo reserva") ────────────────────────────
  function showQuickReplies() {
    if ($msgs.querySelector('#eco-quick-btns')) return;
    var container = document.createElement('div');
    container.id = 'eco-quick-btns';

    var btnReserva = document.createElement('button');
    btnReserva.className = 'eco-qbtn';
    btnReserva.textContent = 'Ya tengo reserva';
    btnReserva.addEventListener('click', function () {
      removeQuickReplies();
      extStaffMode = false;
      openExtForm();
    });

    container.appendChild(btnReserva);
    $msgs.appendChild(container);
    scrollToBottom();
  }

  function removeQuickReplies() {
    var qb = $msgs.querySelector('#eco-quick-btns');
    if (qb) qb.remove();
  }

  // ── PANEL TOGGLE ─────────────────────────────────────────────────────────────
  // ── TOOLTIP ──────────────────────────────────────────────────────────────────
  function hideTooltip() {
    $tooltip.classList.remove('eco-visible');
    $bubble.classList.remove('eco-pulse');
    try { sessionStorage.setItem('eco_tooltip_seen', '1'); } catch(e) {}
  }

  $tooltipClose.addEventListener('click', function(e) {
    e.stopPropagation();
    hideTooltip();
  });

  // Mostrar tooltip + pulso tras 1.5s si el panel no está abierto
  (function() {
    try { if (sessionStorage.getItem('eco_tooltip_seen')) return; } catch(e) {}
    setTimeout(function() {
      if (!isOpen) {
        $tooltip.classList.add('eco-visible');
        $bubble.classList.add('eco-pulse');
      }
    }, 1500);
  })();

  // ── SCROLL TOOLTIP (mensaje contextual según hora del día) ──────────────────
  var $tooltipBody = document.getElementById('eco-tooltip-body');
  var scrollTooltipTimer = null;

  function getScrollMsg() {
    var h = new Date().getHours();
    if (h >= 6 && h < 12)  return '&#127748; &#161;Buenos d&#237;as! &#191;Ya pensaste en tu pr&#243;xima escapada al glamping?';
    if (h >= 12 && h < 19) return '&#127955; &#161;Buenas tardes! &#191;Te ayudo a encontrar la carpa ideal para tu viaje?';
    return '&#10024; &#161;Buenas noches! Una escapada al glamping suena perfecta para este fin de semana.';
  }

  window.addEventListener('scroll', function() {
    if (isOpen || $tooltip.classList.contains('eco-visible')) return;
    clearTimeout(scrollTooltipTimer);
    scrollTooltipTimer = setTimeout(function() {
      try { if (sessionStorage.getItem('eco_scroll_seen')) return; } catch(e) {}
      try { sessionStorage.setItem('eco_scroll_seen', '1'); } catch(e) {}
      if ($tooltipBody) $tooltipBody.innerHTML = getScrollMsg();
      $tooltip.classList.add('eco-visible');
      $bubble.classList.add('eco-pulse');
      setTimeout(function() { if (!isOpen) hideTooltip(); }, 8000);
    }, 600);
  }, { passive: true });

  function openPanel() {
    isOpen = true;
    hideTooltip();
    $panel.classList.remove('eco-hidden');
    $input.focus();
    if ($msgs.childElementCount === 0) {
      addMessage('bot', renderMd(CFG.welcomeMessage));
      showQuickReplies();
    }
    scrollToBottom();
  }

  function closePanel() { isOpen = false; $panel.classList.add('eco-hidden'); closeStaffMenu(); }

  function resetChat() {
    // 1) Cerrar paneles primero (exitExtMode puede inyectar quick replies; se limpian luego)
    exitBookingMode();
    exitExtMode();
    resetExtForm();
    // Obs 3: salir del modo staff al reiniciar
    staffModeActive = false;
    $staffBtn.style.display = 'none';
    closeStaffMenu();
    // 2) Limpiar almacenamiento y mensajes
    sessionStorage.removeItem('eco_session_id');
    sessionStorage.removeItem('eco_session_last');
    sessionStorage.removeItem('eco_msgs');
    $msgs.innerHTML = '';
    $typing.style.display = 'none';
    $form.style.display = 'none';
    $waCta.style.display = 'none';
    $nombre.value = ''; $tel.value = ''; $fecha.value = ''; $personas.value = '';
    $submit.disabled = false; $submit.textContent = 'Enviar mis datos';
    $leadBody.style.display = 'none'; $leadToggle.innerHTML = '&#9656;';
    [$bNombre, $bDni, $bTel, $bEmail, $bLlegada, $bSalida, $bPax, $bOcasion].forEach(function(el) { el.value = ''; el.style.borderColor = ''; });
    $bCarpa.value = ''; $bCarpa.style.borderColor = '';
    $bRegistrado.value = ''; $bRegistrado.style.borderColor = '';
    $bookSubmit.disabled = false; $bookSubmit.textContent = 'Enviar solicitud de reserva';
    isLoading = false; leadShown = false; bookingDone = false; turnCount = 0;
    carpaTipoDetected = 'all'; waCtaWasVisible = false; staffBooking = false;
    lastDetectedGrupo = null;
    // 3) Obs 1: mensaje de bienvenida SIEMPRE antes del quick reply
    addMessage('bot', renderMd(CFG.welcomeMessage));
    showQuickReplies();
  }

  $bubble.addEventListener('click', function () { isOpen ? closePanel() : openPanel(); });
  $close.addEventListener('click', closePanel);
  $reset.addEventListener('click', resetChat);

  // ── STAFF MENU ────────────────────────────────────────────────────────────────
  function closeStaffMenu() { $staffMenu.style.display = 'none'; }

  $staffBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    $staffMenu.style.display = $staffMenu.style.display === 'block' ? 'none' : 'block';
  });

  document.addEventListener('click', function (e) {
    if (!$staffMenu.contains(e.target) && e.target !== $staffBtn) closeStaffMenu();
  });

  $staffNewRes.addEventListener('click', function () {
    closeStaffMenu();
    staffBooking = true;
    poblarDropdownCarpas('all');
    poblarRegistradores();
    enterBookingMode();
  });

  $staffExt.addEventListener('click', function () {
    closeStaffMenu();
    extStaffMode = true;
    openExtForm();
  });

  // ── LEAD FORM TOGGLE ─────────────────────────────────────────────────────────
  $leadHeader.addEventListener('click', function () {
    var isCollapsed = $leadBody.style.display === 'none';
    $leadBody.style.display = isCollapsed ? '' : 'none';
    $leadToggle.innerHTML = isCollapsed ? '&#9662;' : '&#9656;';
    if (isCollapsed) scrollToBottom();
  });

  // ── CARPA DROPDOWN ───────────────────────────────────────────────────────────
  var CARPAS_ALL = [
    { v: 'matrimonial-2p',      l: 'Matrimonial Premium 2p — 1 cama Queen',           grupo: 'matrimonial' },
    { v: 'matrimonial-3p',      l: 'Matrimonial Premium 3p — 1 Queen + 1 plaza',       grupo: 'matrimonial' },
    { v: 'familiar-4p',         l: 'Familiar Estándar 4p — 2 camas 2 plazas',          grupo: 'familiar'    },
    { v: 'familiar-premium-5p', l: 'Familiar Premium 4-5p — 1 Queen + 1 de 2 plazas',  grupo: 'familiar'    },
    { v: 'familiar-plus-5p',    l: 'Familiar Plus 5p — 2 de 2 plazas + 1 de 1.5 pl.',  grupo: 'familiar'    },
  ];

  function detectGrupoCarpaDesde(texto) {
    var t = texto.toLowerCase();
    var tieneMatrimonial = t.indexOf('matrimonial') !== -1;
    var tieneFamiliar = (
      t.indexOf('familiar est') !== -1 || t.indexOf('familiar pre') !== -1 ||
      t.indexOf('familiar plu') !== -1 || t.indexOf('opciones familiares') !== -1 ||
      t.indexOf('carpas familiares') !== -1 || t.indexOf('tipo familiar') !== -1
    );
    if (tieneMatrimonial && !tieneFamiliar) return 'matrimonial';
    if (tieneFamiliar && !tieneMatrimonial) return 'familiar';
    return 'all';
  }

  function poblarDropdownCarpas(grupo) {
    $bCarpa.innerHTML = '<option value="">Tipo de carpa *</option>';
    CARPAS_ALL.forEach(function(c) {
      if (grupo === 'all' || c.grupo === grupo) {
        var opt = document.createElement('option');
        opt.value = c.v; opt.textContent = c.l;
        $bCarpa.appendChild(opt);
      }
    });
  }

  // Obs 4: cargar los nombres de "Registrado por" desde el dropdown (col N) del Sheet
  function poblarRegistradores() {
    function fill(names) {
      var prev = $bRegistrado.value;
      $bRegistrado.innerHTML = '<option value="">Registrado por *</option>';
      names.forEach(function (n) {
        var o = document.createElement('option');
        o.value = n; o.textContent = n;
        $bRegistrado.appendChild(o);
      });
      if (prev && names.indexOf(prev) !== -1) $bRegistrado.value = prev;
    }
    if (registradoresCache) { fill(registradoresCache); return; }
    fill(['Camila']); // fallback mientras carga
    xhrFetch(N8N_REGISTRADORES, { method: 'GET', headers: {} })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.registradores && d.registradores.length) {
          registradoresCache = d.registradores;
          fill(d.registradores);
        }
      })
      .catch(function () { /* mantiene fallback */ });
  }

  // ── BOOKING MODE (full panel) ─────────────────────────────────────────────────
  function enterBookingMode() {
    waCtaWasVisible = $waCta.style.display === 'block';
    $msgs.style.display = 'none'; $typing.style.display = 'none';
    $form.style.display = 'none'; $waCta.style.display = 'none';
    $inputArea.style.display = 'none'; $footer.style.display = 'none';
    $extForm.style.display = 'none';
    // Obs 5: mostrar "Registrado por" solo en booking de staff
    $bRegistradoWrap.style.display = staffBooking ? '' : 'none';
    // Obs 6: ocultar "Prefiero dejar mis datos de contacto" en booking de staff
    $bookToLead.style.display = staffBooking ? 'none' : '';
    $bookForm.style.display = 'flex';
  }

  function exitBookingMode() {
    $bookForm.style.display = 'none';
    $bRegistradoWrap.style.display = 'none';
    $bookToLead.style.display = '';
    $msgs.style.display = ''; $inputArea.style.display = ''; $footer.style.display = '';
    if (waCtaWasVisible) $waCta.style.display = 'block';
    staffBooking = false;
  }

  // ── EXTENSION MODE (full panel) ───────────────────────────────────────────────
  // Obs 2: título según el paso — "Mi reserva" al buscar, "Extender..." solo al extender
  function setExtTitle(extending) {
    if (extending) {
      $extTitle.textContent = extStaffMode ? 'Modificar estadía (Staff)' : 'Extender mi estadía';
    } else {
      $extTitle.textContent = extStaffMode ? 'Reserva (Staff)' : 'Mi reserva';
    }
  }

  function openExtForm() {
    setExtTitle(false);
    waCtaWasVisible = $waCta.style.display === 'block';
    $msgs.style.display = 'none'; $typing.style.display = 'none';
    $form.style.display = 'none'; $waCta.style.display = 'none';
    $inputArea.style.display = 'none'; $footer.style.display = 'none';
    $bookForm.style.display = 'none';
    $extForm.style.display = 'flex';
    resetExtForm();
    $extDni.focus();
  }

  // Obs 3: al salir del form de extensión, restaurar botón "Ya tengo reserva" si no hay mensajes del usuario
  function exitExtMode() {
    $extForm.style.display = 'none';
    $msgs.style.display = ''; $inputArea.style.display = ''; $footer.style.display = '';
    if (waCtaWasVisible) $waCta.style.display = 'block';
    extStaffMode = false;
    extFoundData = null;
    var hasUserMsg = $msgs.querySelector('.eco-msg-user');
    if (!hasUserMsg && !$msgs.querySelector('#eco-quick-btns')) {
      showQuickReplies();
    }
  }

  function resetExtForm() {
    $extDni.value = ''; $extDni.style.borderColor = '';
    $extSearch.disabled = false; $extSearch.textContent = 'Buscar';
    $extError.style.display = 'none'; $extError.textContent = '';
    $extStep1.style.display = ''; $extStep2.style.display = 'none'; $extBlocked.style.display = 'none';
    $extStep2a.style.display = ''; $extStep2b.style.display = 'none';
    $extNuevaSal.value = ''; $extSubmit.disabled = false; $extSubmit.textContent = 'Confirmar extensión';
    extFoundData = null;
  }

  // Obs 2: botón CTA para mostrar el picker de fecha
  $extExtendCta.addEventListener('click', function () {
    $extStep2a.style.display = 'none';
    $extStep2b.style.display = '';
    setExtTitle(true);
    $extNuevaSal.focus();
  });

  $extBack.addEventListener('click', function () {
    if ($extStep2b.style.display !== 'none') {
      // Desde picker de fecha → volver a card + CTA
      $extStep2b.style.display = 'none';
      $extStep2a.style.display = '';
      setExtTitle(false);
    } else if ($extStep2.style.display !== 'none' || $extBlocked.style.display !== 'none') {
      // Desde card+CTA o bloqueado → volver a step1
      $extStep2.style.display = 'none'; $extBlocked.style.display = 'none';
      $extStep1.style.display = '';
      $extError.style.display = 'none'; $extDni.value = ''; extFoundData = null;
      $extDni.focus();
    } else {
      // Desde step1 → salir al chat
      exitExtMode();
    }
  });

  // ── NAVEGACIÓN BOOKING <-> LEAD ───────────────────────────────────────────────
  function showBookingForm() {
    if (bookingDone) return;
    poblarDropdownCarpas(carpaTipoDetected);
    staffBooking = false;
    enterBookingMode();
  }

  $bookBack.addEventListener('click', function () {
    var wasStaff = staffBooking;
    exitBookingMode();
    // Obs 5: el staff no debe ver el lead form al volver
    if (!wasStaff) {
      $form.style.display = 'block';
      $leadBody.style.display = 'none'; $leadToggle.innerHTML = '&#9656;';
    }
    scrollToBottom();
  });

  $bookToLead.addEventListener('click', function () {
    exitBookingMode();
    $form.style.display = 'block';
    $leadBody.style.display = ''; $leadToggle.innerHTML = '&#9662;';
    scrollToBottom();
  });

  $leadToBook.addEventListener('click', showBookingForm);

  // ── EXTENSION SEARCH ──────────────────────────────────────────────────────────
  $extSearch.addEventListener('click', function () {
    var dni = $extDni.value.trim();
    if (!dni) { $extDni.style.borderColor = '#ef4444'; return; }
    $extDni.style.borderColor = '#d1d5db';
    $extSearch.disabled = true; $extSearch.textContent = 'Buscando...';
    $extError.style.display = 'none';

    xhrFetch(N8N_BUSCAR, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dni: dni }),
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      $extSearch.disabled = false; $extSearch.textContent = 'Buscar';
      if (!data.encontrado) {
        $extError.textContent = data.mensaje || 'No encontramos ninguna reserva con ese DNI.';
        $extError.style.display = 'block';
        return;
      }
      extFoundData = data;
      $extStep1.style.display = 'none';

      var carpaNombre = CARPAS_LABEL[data.tipo_carpa] || data.tipo_carpa;
      $extCardName.textContent = 'Hola, ' + data.huesped;
      $extCardCod.textContent = data.codigo;
      $extCardCarpa.textContent = carpaNombre;
      $extCardLleg.textContent = formatDate(data.llegada);
      $extCardSal.textContent = formatDate(data.salida);

      // Verificar bloqueo (cliente solo; staff siempre puede)
      if (!extStaffMode && isExtensionBlocked(data.llegada)) {
        $extBName.textContent = 'Hola, ' + data.huesped;
        $extBLleg.textContent = formatDate(data.llegada);
        $extBlocked.style.display = '';
      } else {
        // Obs 5: el staff puede acortar o extender (min = llegada); el cliente solo extiende (min = salida+1)
        if (extStaffMode) {
          $extNuevaSal.min = data.llegada;
          $extNuevaSal.value = data.salida;
          $extExtendCta.innerHTML = 'Modificar estadía →';
        } else {
          var minDate = addDays(data.salida, 1);
          $extNuevaSal.min = minDate;
          $extNuevaSal.value = minDate;
          $extExtendCta.innerHTML = 'Extender mi estadía →';
        }
        var nota = $extStep2b.querySelector('.eco-ext-note');
        if (nota) nota.textContent = extStaffMode
          ? 'Como staff puedes adelantar o extender la salida (nunca antes de la llegada).'
          : 'Nuestro equipo te contactará para coordinar el pago de las noches adicionales.';
        // Obs 2: mostrar card + CTA (no el picker todavía)
        $extStep2a.style.display = '';
        $extStep2b.style.display = 'none';
        $extStep2.style.display = '';
      }
    })
    .catch(function () {
      $extSearch.disabled = false; $extSearch.textContent = 'Buscar';
      $extError.textContent = 'Error de conexión. Intenta nuevamente.';
      $extError.style.display = 'block';
    });
  });

  $extDni.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); $extSearch.click(); }
  });

  // ── EXTENSION SUBMIT ──────────────────────────────────────────────────────────
  $extSubmit.addEventListener('click', function () {
    if (!extFoundData) return;
    var nueva = $extNuevaSal.value;
    // Obs 5: staff puede acortar (>= llegada); cliente solo extiende (> salida actual)
    var invalido = extStaffMode
      ? (!nueva || nueva < extFoundData.llegada)
      : (!nueva || nueva <= extFoundData.salida);
    if (invalido) {
      $extNuevaSal.style.borderColor = '#ef4444'; return;
    }
    $extNuevaSal.style.borderColor = '#d1d5db';
    $extSubmit.disabled = true; $extSubmit.textContent = 'Enviando...';

    var payload = {
      dni:             extFoundData.dni,
      fila_num:        extFoundData.fila_num,
      nueva_salida:    nueva,
      codigo:          extFoundData.codigo,
      huesped:         extFoundData.huesped,
      llegada:         extFoundData.llegada,
      salida_anterior: extFoundData.salida,
      tipo_carpa:      extFoundData.tipo_carpa,
      telefono:        extFoundData.telefono,
      fuente:          extStaffMode ? 'staff' : 'cliente',
    };

    xhrFetch(N8N_EXTENDER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    .then(function (r) { return r.json(); })
    .then(function () {
      // Obs 4: capturar datos ANTES de exitExtMode() (que pone extFoundData y extStaffMode en null/false)
      var wasStaff   = extStaffMode;
      var huespedNom = extFoundData.huesped;
      var salidaAnt  = extFoundData.salida;
      var esReduccion = wasStaff && nueva < salidaAnt;
      exitExtMode();
      var msg;
      if (wasStaff) {
        msg = (esReduccion ? 'Estadía reducida' : 'Estadía extendida') +
          ' para <strong>' + escXSS(huespedNom) + '</strong>. Nueva fecha de salida: <strong>' + escXSS(formatDate(nueva)) + '</strong>.';
      } else {
        msg = '¡Listo, <strong>' + escXSS(huespedNom) + '</strong>! ✅ Tu nueva fecha de salida es el <strong>' + escXSS(formatDate(nueva)) + '</strong>. Te contactaremos para coordinar el pago de las noches adicionales.';
      }
      addMessage('bot', msg);
      $waCta.style.display = 'block';
      scrollToBottom();
    })
    .catch(function () {
      $extSubmit.disabled = false; $extSubmit.textContent = 'Confirmar extensión';
      $extNuevaSal.style.borderColor = '#ef4444';
      $extError.textContent = 'Error al procesar. Intenta nuevamente o escríbenos al WhatsApp.';
      $extError.style.display = 'block';
    });
  });

  // ── SEND MESSAGE (Obs 4: interceptar contraseña staff) ───────────────────────
  function sendMessage(text) {
    if (!text.trim() || isLoading) return;

    // Obs 4: interceptar contraseña sin enviarla al agente
    if (text.trim() === CFG.staffKey) {
      $input.value = ''; $input.style.height = 'auto';
      if (!staffModeActive) {
        staffModeActive = true;
        $staffBtn.style.display = 'block';
      }
      addMessage('bot', '&#9881; Modo staff activado. Usa el men&#250; &#9881; en la esquina superior para registrar reservas o modificar estadías.');
      scrollToBottom();
      return;
    }

    removeQuickReplies();
    turnCount++;
    addMessage('user', escXSS(text));
    $input.value = ''; $input.style.height = 'auto';
    showTyping(); isLoading = true;

    var sessionId = getSessionId();
    var attempts = 0;

    function attempt() {
      attempts++;
      var ctrl = window.AbortController ? new AbortController() : null;
      var tid = setTimeout(function () { if (ctrl) ctrl.abort(); }, CFG.timeoutMs);
      var fetchOpts = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId: sessionId, channel: 'web' }),
      };
      if (ctrl) fetchOpts.signal = ctrl.signal;

      (window.fetch ? window.fetch(N8N, fetchOpts) : xhrFetch(N8N, fetchOpts))
        .then(function (r) {
          clearTimeout(tid);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (data) {
          hideTyping(); isLoading = false;
          var reply = data.response || '';
          // Obs 1: recordar el último grupo de carpa que el agente recomendó (acumula entre mensajes)
          var gg = detectGrupoCarpaDesde(reply);
          if (gg !== 'all') lastDetectedGrupo = gg;
          var el = document.createElement('div');
          el.className = 'eco-msg eco-msg-bot';
          $msgs.appendChild(el);
          typewriter(el, reply, function () {
            if (data.showLeadForm) showLeadForm(reply);
            else if (turnCount >= 12) showWaCta();
          });
          scrollToBottom();
        })
        .catch(function (err) {
          clearTimeout(tid);
          if (attempts < CFG.maxRetries && err && err.name !== 'AbortError') {
            setTimeout(attempt, 1000); return;
          }
          hideTyping(); isLoading = false;
          var errDiv = addMessage('bot',
            '<p style="margin:0 0 8px 0">Tardé un poco en responder. ¿Lo intentamos de nuevo?</p>' +
            '<button class="eco-retry-btn" style="background:' + PRIMARY + ';color:#fff;border:none;border-radius:8px;padding:6px 14px;font-size:13px;cursor:pointer;font-weight:600;margin-right:8px">Reintentar</button>' +
            '<a href="' + CFG.whatsappUrl + '" target="_blank" rel="noopener" style="font-size:12px;color:#64748b;text-decoration:none">O escribe al WhatsApp</a>'
          );
          errDiv.querySelector('.eco-retry-btn').addEventListener('click', function () {
            errDiv.remove(); attempts = 0; isLoading = true; showTyping(); attempt();
          });
        });
    }
    attempt();
  }

  function xhrFetch(url, opts) {
    return new Promise(function (res, rej) {
      var x = new XMLHttpRequest();
      x.open(opts.method || 'GET', url);
      Object.keys(opts.headers || {}).forEach(function (k) { x.setRequestHeader(k, opts.headers[k]); });
      x.onload = function () { res({ ok: x.status >= 200 && x.status < 300, status: x.status, json: function () { return Promise.resolve(JSON.parse(x.responseText)); } }); };
      x.onerror = function () { rej(new Error('Network error')); };
      x.send(opts.body);
    });
  }

  // ── INPUT EVENTS ─────────────────────────────────────────────────────────────
  $send.addEventListener('click', function () { sendMessage($input.value); });
  $input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage($input.value); }
  });
  $input.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 100) + 'px';
  });

  // ── LEAD FORM ─────────────────────────────────────────────────────────────────
  function showLeadForm(triggerText) {
    // Obs 1: detectar del mensaje disparador; si es genérico, usar el último grupo recomendado
    var g = detectGrupoCarpaDesde(triggerText || '');
    if (g === 'all' && lastDetectedGrupo) g = lastDetectedGrupo;
    carpaTipoDetected = g;
    if (!leadShown) {
      leadShown = true;
      $form.style.display = 'block';
      $leadBody.style.display = 'none'; $leadToggle.innerHTML = '&#9656;';
    }
    if (!bookingDone) {
      var old = $msgs.querySelector('.eco-action-btn');
      if (old) old.remove();
      var btn = document.createElement('button');
      btn.className = 'eco-action-btn';
      btn.innerHTML = 'Completar mi reserva &#8594;';
      btn.addEventListener('click', showBookingForm);
      $msgs.appendChild(btn);
      scrollToBottom();
    }
  }

  $submit.addEventListener('click', function () {
    var n = $nombre.value.trim(), t = $tel.value.trim();
    if (!n || !t) {
      $nombre.style.borderColor = n ? '#d1d5db' : '#ef4444';
      $tel.style.borderColor    = t ? '#d1d5db' : '#ef4444';
      return;
    }
    $submit.disabled = true; $submit.textContent = 'Enviando...';
    var payload = { nombre: n, telefono: t, email: '', fecha_visita: $fecha.value.trim(), num_personas: $personas.value.trim(), mensaje: 'Lead desde widget web', hp: $hp.value };
    (window.fetch ? window.fetch(N8N_LEADS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }) : xhrFetch(N8N_LEADS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }))
      .then(function () {
        $form.style.display = 'none';
        addMessage('bot', 'Perfecto, ' + escXSS(n) + '. Te contactamos hoy al ' + escXSS(t) + '.');
        $waCta.style.display = 'block'; scrollToBottom();
      })
      .catch(function () {
        $submit.disabled = false; $submit.textContent = 'Enviar mis datos';
        addMessage('bot', 'No pude enviar tu info. Escríbenos al <a href="' + CFG.whatsappUrl + '" target="_blank">WhatsApp 929 790 568</a>.');
      });
  });

  // ── BOOKING FORM (Obs 5: incluir registrado_por) ──────────────────────────────
  $bookSubmit.addEventListener('click', function () {
    var camposReq = [$bNombre, $bDni, $bTel, $bEmail, $bLlegada, $bSalida, $bPax];
    var valid = true;
    camposReq.forEach(function (el) {
      var ok = el.value.trim() !== '';
      el.style.borderColor = ok ? '#d1d5db' : '#ef4444';
      if (!ok) valid = false;
    });
    var carpaOk = $bCarpa.value !== '';
    $bCarpa.style.borderColor = carpaOk ? '#d1d5db' : '#ef4444';
    if (!carpaOk) valid = false;

    // Obs 5: validar "Registrado por" solo en booking de staff
    if (staffBooking) {
      var regOk = $bRegistrado.value !== '';
      $bRegistrado.style.borderColor = regOk ? '#d1d5db' : '#ef4444';
      if (!regOk) valid = false;
    }

    if (!valid) return;

    $bookSubmit.disabled = true; $bookSubmit.textContent = 'Enviando...';

    var payload = {
      nombre:          $bNombre.value.trim(),
      dni:             $bDni.value.trim(),
      telefono:        $bTel.value.trim(),
      correo:          $bEmail.value.trim(),
      tipo_carpa:      $bCarpa.value,
      fecha_llegada:   $bLlegada.value,
      fecha_salida:    $bSalida.value,
      pax:             Number($bPax.value.trim()),
      ocasion:         $bOcasion.value.trim(),
      fuente:          staffBooking ? 'Staff' : undefined,
      registrado_por:  staffBooking ? $bRegistrado.value : undefined,
    };

    (window.fetch ? window.fetch(N8N_RESERVA, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }) : xhrFetch(N8N_RESERVA, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var wasStaff = staffBooking;
        bookingDone = !wasStaff;
        var actionBtn = $msgs.querySelector('.eco-action-btn');
        if (actionBtn && !wasStaff) {
          actionBtn.disabled = true; actionBtn.style.opacity = '0.45';
          actionBtn.style.cursor = 'default'; actionBtn.textContent = 'Reserva enviada ✓';
        }
        exitBookingMode();
        var codigo   = data.codigo   ? ' Código: <strong>' + escXSS(data.codigo) + '</strong>.' : '';
        var adelanto = data.adelanto ? ' Adelanto: <strong>S/ ' + data.adelanto + '</strong>.' : '';
        if (wasStaff) {
          addMessage('bot', 'Reserva registrada por staff.' + codigo + adelanto + ' Anota los datos de pago para coordinarlos con el huésped.');
        } else {
          addMessage('bot', '¡Reserva registrada, ' + escXSS($bNombre.value.trim()) + '!' + codigo + adelanto + ' Te contactaremos al ' + escXSS($bTel.value.trim()) + ' para coordinar el pago.');
          $waCta.style.display = 'block';
        }
        [$bNombre, $bDni, $bTel, $bEmail, $bLlegada, $bSalida, $bPax, $bOcasion].forEach(function(el) { el.value = ''; });
        $bCarpa.value = ''; $bRegistrado.value = '';
        $bookSubmit.disabled = false; $bookSubmit.textContent = 'Enviar solicitud de reserva';
        scrollToBottom();
      })
      .catch(function () {
        $bookSubmit.disabled = false; $bookSubmit.textContent = 'Enviar solicitud de reserva';
        exitBookingMode();
        addMessage('bot', 'No pude procesar la reserva. Escríbenos al <a href="' + CFG.whatsappUrl + '" target="_blank">WhatsApp 929 790 568</a>.');
      });
  });

  function showWaCta() { $waCta.style.display = 'block'; scrollToBottom(); }

})();
