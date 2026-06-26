(function () {
  'use strict';

  // ── CONFIG ──────────────────────────────────────────────────────────────────
  var CFG = Object.assign({
    n8nBase:        'https://n8n-jcg4epwgyztosnmbxghhwvdv.136.116.88.204.sslip.io',
    chatPath:       '/webhook/ecomangos-agent',
    leadsPath:      '/webhook/ecomangos-leads',
    reservaPath:    '/webhook/ecomangos-registrar-reserva',
    primaryColor:   '#F5A21C',
    secondaryColor: '#2D6B27',
    welcomeMessage: 'Hola, soy el asistente de Glamping Eco Mangos. Puedo ayudarte con precios, opciones de glamping y reservas. Para empezar: ¿qué fecha tienes en mente para tu experiencia?',
    timeoutMs:      60000,
    maxRetries:     2,
    sessionTtlMs:   30 * 60 * 1000,
    privacyUrl:     '/politica-privacidad.html',
    whatsappUrl:    'https://wa.me/51929790568',
  }, window.ecomangosAgentConfig || {});

  var N8N         = CFG.n8nBase + CFG.chatPath;
  var N8N_LEADS   = CFG.n8nBase + CFG.leadsPath;
  var N8N_RESERVA = CFG.n8nBase + CFG.reservaPath;
  var PRIMARY     = CFG.primaryColor;
  var SECONDARY   = CFG.secondaryColor;

  // ── SESSION ─────────────────────────────────────────────────────────────────
  function getSessionId() {
    var KEY = 'eco_session_id';
    var KEY_TS = 'eco_session_last';
    var now = Date.now();
    var last = Number(sessionStorage.getItem(KEY_TS) || 0);
    if (!sessionStorage.getItem(KEY) || (now - last) > CFG.sessionTtlMs) {
      sessionStorage.setItem(KEY, 'web_' + Math.random().toString(36).slice(2) + Date.now().toString(36));
      sessionStorage.removeItem('eco_msgs');
    }
    sessionStorage.setItem(KEY_TS, now);
    return sessionStorage.getItem(KEY);
  }

  // ── MARKDOWN RENDERER ────────────────────────────────────────────────────────
  function renderMd(text) {
    if (!text) return '';
    var imgs = [];
    var s = text.replace(/\[IMG:(https?:\/\/[^\]]+)\]/g, function(_, url) {
      imgs.push(url);
      return '\x00IMG' + (imgs.length - 1) + '\x00';
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
    '#eco-bubble{position:fixed;bottom:24px;right:24px;width:56px;height:56px;border-radius:50%;background:' + PRIMARY + ';cursor:pointer;z-index:99999;box-shadow:0 4px 16px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;transition:transform .2s}',
    '#eco-bubble:hover{transform:scale(1.08)}',
    '#eco-bubble svg{width:28px;height:28px;fill:#fff}',
    '#eco-panel{position:fixed;bottom:90px;right:24px;width:360px;max-width:calc(100vw - 32px);height:560px;max-height:calc(100vh - 110px);background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.2);z-index:99998;display:flex;flex-direction:column;overflow:hidden;transition:opacity .2s,transform .2s}',
    '#eco-panel.eco-hidden{opacity:0;pointer-events:none;transform:translateY(16px)}',
    '#eco-header{background:' + SECONDARY + ';padding:14px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0}',
    '#eco-header-logo{width:36px;height:36px;border-radius:50%;background:' + PRIMARY + ';display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:14px;flex-shrink:0}',
    '#eco-header-info{flex:1;min-width:0}',
    '#eco-header-name{color:#fff;font-weight:700;font-size:14px;margin:0}',
    '#eco-header-sub{color:rgba(255,255,255,.85);font-size:12px;margin:0}',
    '#eco-header-actions{display:flex;align-items:center;gap:2px;flex-shrink:0}',
    '#eco-reset{background:none;border:none;cursor:pointer;padding:4px;color:rgba(255,255,255,.75);font-size:16px;line-height:1;transition:color .15s}',
    '#eco-reset:hover{color:#fff}',
    '#eco-close{background:none;border:none;cursor:pointer;padding:4px;color:#fff;font-size:20px;line-height:1;flex-shrink:0}',
    '#eco-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px}',
    '.eco-msg{max-width:82%;word-wrap:break-word;font-size:14px;line-height:1.5}',
    '.eco-msg p{margin:0 0 6px 0}.eco-msg p:last-child{margin:0}',
    '.eco-msg ul{margin:4px 0 4px 16px;padding:0}.eco-msg li{margin:2px 0}',
    '.eco-msg-user{align-self:flex-end;background:' + PRIMARY + ';color:#fff;border-radius:16px 16px 4px 16px;padding:10px 14px}',
    '.eco-msg-bot{align-self:flex-start;background:#f1f5f9;color:#1e293b;border-radius:16px 16px 16px 4px;padding:10px 14px}',
    '.eco-msg-bot img:not(.eco-photo){max-width:1.2em!important;max-height:1.2em!important;display:inline-block!important;vertical-align:text-bottom!important}',
    '.eco-msg-bot img.eco-photo{max-width:100%;border-radius:8px;margin:6px 0;display:block}',
    '.eco-action-btn{align-self:flex-start;margin-top:-4px;background:' + SECONDARY + ';color:#fff;border:none;border-radius:20px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;transition:background .2s}',
    '.eco-action-btn:hover{background:#1e5218}',
    '#eco-typing{display:none;align-self:flex-start;padding:10px 14px;background:#f1f5f9;border-radius:16px 16px 16px 4px}',
    '.eco-dot{width:7px;height:7px;background:#94a3b8;border-radius:50%;display:inline-block;animation:eco-bounce .9s infinite}',
    '.eco-dot:nth-child(2){animation-delay:.15s}.eco-dot:nth-child(3){animation-delay:.3s}',
    '@keyframes eco-bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-6px)}}',
    /* ── Lead form ── */
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
    /* ── Booking form — ocupa toda el área cuando está activo ── */
    '#eco-booking-form{flex:1;overflow-y:auto;padding:14px 16px 16px;background:#fff;display:none;flex-direction:column;gap:0}',
    '#eco-booking-header{display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-shrink:0}',
    '#eco-booking-back{background:none;border:none;cursor:pointer;color:' + SECONDARY + ';font-size:13px;font-weight:600;padding:0;display:flex;align-items:center;gap:4px}',
    '#eco-booking-back:hover{color:#1e5218}',
    '#eco-booking-form h4{margin:0;font-size:13px;color:#374151;flex:1}',
    '#eco-booking-form input,#eco-booking-form select{width:100%;padding:9px 12px;margin-bottom:8px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;outline:none;background:#fff;color:#1e293b}',
    '#eco-booking-form input:focus,#eco-booking-form select:focus{border-color:' + PRIMARY + ';box-shadow:0 0 0 2px rgba(245,162,28,.15)}',
    '.eco-select-wrap{position:relative;margin-bottom:8px}',
    '.eco-select-wrap select{width:100%;padding:9px 32px 9px 12px;margin-bottom:0;appearance:none;-webkit-appearance:none;cursor:pointer}',
    '.eco-select-arrow{position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;color:#6b7280;font-size:14px;line-height:1}',
    '.eco-date-row{display:flex;gap:8px;margin-bottom:8px}',
    '.eco-date-col{flex:1;display:flex;flex-direction:column;gap:3px}',
    '.eco-date-label{font-size:11px;color:#6b7280;font-weight:500}',
    '.eco-date-col input{margin-bottom:0;width:100%}',
    '#eco-booking-submit{width:100%;margin-top:4px;padding:10px;background:' + PRIMARY + ';color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:background .2s;flex-shrink:0}',
    '#eco-booking-submit:hover{background:#d9900f}',
    '#eco-booking-to-lead{display:block;text-align:center;margin-top:8px;font-size:12px;color:#6b7280;background:none;border:none;cursor:pointer;text-decoration:underline;width:100%;padding-bottom:4px;flex-shrink:0}',
    '#eco-booking-to-lead:hover{color:' + SECONDARY + '}',
    /* ── WhatsApp CTA ── */
    '#eco-wa-cta{padding:14px 16px;background:linear-gradient(135deg,' + SECONDARY + ',' + PRIMARY + ');text-align:center;flex-shrink:0;display:none}',
    '#eco-wa-cta p{color:#fff;font-size:13px;margin:0 0 10px;line-height:1.4}',
    '#eco-wa-cta a{display:inline-block;background:#fff;color:' + SECONDARY + ';font-weight:700;font-size:14px;padding:10px 20px;border-radius:8px;text-decoration:none}',
    '#eco-footer{padding:8px 16px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;justify-content:center;gap:12px;flex-shrink:0}',
    '#eco-footer a{font-size:11px;color:#9ca3af;text-decoration:none}#eco-footer a:hover{color:' + PRIMARY + '}',
    '#eco-input-area{padding:12px 16px;border-top:1px solid #e2e8f0;display:flex;gap:8px;flex-shrink:0}',
    '#eco-input{flex:1;padding:10px 14px;border:1px solid #d1d5db;border-radius:24px;font-size:14px;outline:none;resize:none;min-height:40px;max-height:100px}',
    '#eco-input:focus{border-color:' + PRIMARY + ';box-shadow:0 0 0 2px rgba(245,162,28,.15)}',
    '#eco-send{width:40px;height:40px;border-radius:50%;background:' + PRIMARY + ';border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .2s}',
    '#eco-send:hover{background:#d9900f}',
    '#eco-send svg{width:18px;height:18px;fill:#fff}',
  ].join('');
  document.head.appendChild(style);

  // ── HTML ─────────────────────────────────────────────────────────────────────
  var wrap = document.createElement('div');
  wrap.id = 'eco-widget';
  wrap.innerHTML = [
    '<div id="eco-bubble" role="button" aria-label="Abrir chat">',
      '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>',
    '</div>',
    '<div id="eco-panel" class="eco-hidden" role="dialog" aria-label="Chat Eco Mangos">',
      '<div id="eco-header">',
        '<div id="eco-header-logo">EM</div>',
        '<div id="eco-header-info">',
          '<p id="eco-header-name">Glamping Eco Mangos</p>',
          '<p id="eco-header-sub">Asistente virtual</p>',
        '</div>',
        '<div id="eco-header-actions">',
          '<button id="eco-reset" aria-label="Reiniciar chat" title="Reiniciar conversación">',
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>',
          '</button>',
          '<button id="eco-close" aria-label="Cerrar">&times;</button>',
        '</div>',
      '</div>',
      /* ── Chat area ── */
      '<div id="eco-msgs" aria-live="polite"></div>',
      '<div id="eco-typing"><span class="eco-dot"></span><span class="eco-dot"></span><span class="eco-dot"></span></div>',
      /* ── Lead form (starts hidden) ── */
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
      /* ── Booking form (ocupa panel completo mientras está activo) ── */
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
  var $bubble     = document.getElementById('eco-bubble');
  var $panel      = document.getElementById('eco-panel');
  var $close      = document.getElementById('eco-close');
  var $reset      = document.getElementById('eco-reset');
  var $msgs       = document.getElementById('eco-msgs');
  var $typing     = document.getElementById('eco-typing');
  var $form       = document.getElementById('eco-lead-form');
  var $waCta      = document.getElementById('eco-wa-cta');
  var $input      = document.getElementById('eco-input');
  var $send       = document.getElementById('eco-send');
  var $inputArea  = document.getElementById('eco-input-area');
  var $footer     = document.getElementById('eco-footer');
  var $submit     = document.getElementById('eco-lead-submit');
  var $nombre     = document.getElementById('eco-nombre');
  var $tel        = document.getElementById('eco-telefono');
  var $fecha      = document.getElementById('eco-fecha');
  var $personas   = document.getElementById('eco-personas');
  var $hp         = document.getElementById('eco-hp');
  var $leadHeader = document.getElementById('eco-lead-header');
  var $leadBody   = document.getElementById('eco-lead-body');
  var $leadToggle = document.getElementById('eco-lead-toggle');
  var $leadToBook = document.getElementById('eco-lead-to-booking');
  var $bookForm   = document.getElementById('eco-booking-form');
  var $bookBack   = document.getElementById('eco-booking-back');
  var $bookToLead = document.getElementById('eco-booking-to-lead');
  var $bookSubmit = document.getElementById('eco-booking-submit');
  var $bNombre    = document.getElementById('eco-b-nombre');
  var $bDni       = document.getElementById('eco-b-dni');
  var $bTel       = document.getElementById('eco-b-tel');
  var $bEmail     = document.getElementById('eco-b-email');
  var $bCarpa     = document.getElementById('eco-b-carpa');
  var $bLlegada   = document.getElementById('eco-b-llegada');
  var $bSalida    = document.getElementById('eco-b-salida');
  var $bPax       = document.getElementById('eco-b-pax');
  var $bOcasion   = document.getElementById('eco-b-ocasion');

  var isOpen            = false;
  var isLoading         = false;
  var leadShown         = false;
  var turnCount         = 0;
  var carpaTipoDetected = 'all'; // se fija cuando showLeadForm() es llamado

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

  // ── PANEL TOGGLE ─────────────────────────────────────────────────────────────
  function openPanel() {
    isOpen = true;
    $panel.classList.remove('eco-hidden');
    $input.focus();
    if ($msgs.childElementCount === 0) addMessage('bot', renderMd(CFG.welcomeMessage));
    scrollToBottom();
  }

  function closePanel() { isOpen = false; $panel.classList.add('eco-hidden'); }

  function resetChat() {
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
    $bookSubmit.disabled = false; $bookSubmit.textContent = 'Enviar solicitud de reserva';
    // Restaurar vista de chat
    exitBookingMode();
    isLoading = false; leadShown = false; turnCount = 0; carpaTipoDetected = 'all';
    addMessage('bot', renderMd(CFG.welcomeMessage));
  }

  $bubble.addEventListener('click', function () { isOpen ? closePanel() : openPanel(); });
  $close.addEventListener('click', closePanel);
  $reset.addEventListener('click', resetChat);

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

  // Detecta el tipo de carpa escaneando los mensajes del bot en el momento en que
  // se activa el formulario (typewriter ya terminó, todos los mensajes están en DOM).
  function detectGrupoCarpa() {
    var msgs = $msgs.querySelectorAll('.eco-msg-bot');
    var text = '';
    var desde = Math.max(0, msgs.length - 10);
    for (var i = desde; i < msgs.length; i++) {
      text += msgs[i].textContent.toLowerCase() + ' ';
    }
    var tieneMatrimonial = text.indexOf('matrimonial') !== -1;
    var tieneFamiliar    = text.indexOf('familiar') !== -1;
    if (tieneMatrimonial && !tieneFamiliar) return 'matrimonial';
    if (tieneFamiliar && !tieneMatrimonial) return 'familiar';
    return 'all';
  }

  function poblarDropdownCarpas(grupo) {
    $bCarpa.innerHTML = '<option value="">Tipo de carpa *</option>';
    CARPAS_ALL.forEach(function(c) {
      if (grupo === 'all' || c.grupo === grupo) {
        var opt = document.createElement('option');
        opt.value = c.v;
        opt.textContent = c.l;
        $bCarpa.appendChild(opt);
      }
    });
  }

  // ── MODO BOOKING (ocupa el panel completo) ────────────────────────────────────
  function enterBookingMode() {
    $msgs.style.display = 'none';
    $typing.style.display = 'none';
    $form.style.display = 'none';
    $waCta.style.display = 'none';
    $inputArea.style.display = 'none';
    $footer.style.display = 'none';
    $bookForm.style.display = 'flex';
  }

  function exitBookingMode() {
    $bookForm.style.display = 'none';
    $msgs.style.display = '';
    $inputArea.style.display = '';
    $footer.style.display = '';
  }

  // ── NAVEGACIÓN ENTRE FORMULARIOS ─────────────────────────────────────────────
  function showBookingForm() {
    poblarDropdownCarpas(carpaTipoDetected);
    enterBookingMode();
  }

  // ← Volver: cierra booking, regresa a chat con lead form minimizado
  $bookBack.addEventListener('click', function () {
    exitBookingMode();
    $form.style.display = 'block';
    $leadBody.style.display = 'none';
    $leadToggle.innerHTML = '&#9656;';
    scrollToBottom();
  });

  // ← Prefiero dejar mis datos: abre lead form expandido
  $bookToLead.addEventListener('click', function () {
    exitBookingMode();
    $form.style.display = 'block';
    $leadBody.style.display = '';
    $leadToggle.innerHTML = '&#9662;';
    scrollToBottom();
  });

  $leadToBook.addEventListener('click', showBookingForm);

  // ── SEND MESSAGE ─────────────────────────────────────────────────────────────
  function sendMessage(text) {
    if (!text.trim() || isLoading) return;
    turnCount++;
    addMessage('user', escXSS(text));
    $input.value = '';
    $input.style.height = 'auto';
    showTyping();
    isLoading = true;

    var sessionId = getSessionId();
    var attempts  = 0;

    function attempt() {
      attempts++;
      var ctrl = window.AbortController ? new AbortController() : null;
      var tid  = setTimeout(function () { if (ctrl) ctrl.abort(); }, CFG.timeoutMs);
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
          hideTyping();
          isLoading = false;
          var reply = data.response || '';
          var el = document.createElement('div');
          el.className = 'eco-msg eco-msg-bot';
          $msgs.appendChild(el);
          typewriter(el, reply, function () {
            if (data.showLeadForm && !leadShown) showLeadForm();
            else if (turnCount >= 12) showWaCta();
          });
          scrollToBottom();
        })
        .catch(function (err) {
          clearTimeout(tid);
          if (attempts < CFG.maxRetries && err && err.name !== 'AbortError') {
            setTimeout(attempt, 1000);
            return;
          }
          hideTyping();
          isLoading = false;
          var errDiv = addMessage('bot',
            '<p style="margin:0 0 8px 0">Tardé un poco en responder. ¿Lo intentamos de nuevo?</p>' +
            '<button class="eco-retry-btn" style="background:' + PRIMARY + ';color:#fff;border:none;border-radius:8px;padding:6px 14px;font-size:13px;cursor:pointer;font-weight:600;margin-right:8px">Reintentar</button>' +
            '<a href="' + CFG.whatsappUrl + '" target="_blank" rel="noopener" style="font-size:12px;color:#64748b;text-decoration:none">O escribe al WhatsApp</a>'
          );
          errDiv.querySelector('.eco-retry-btn').addEventListener('click', function () {
            errDiv.remove();
            attempts = 0;
            isLoading = true;
            showTyping();
            attempt();
          });
        });
    }
    attempt();
  }

  function escXSS(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
  function showLeadForm() {
    if (leadShown) return;
    leadShown = true;
    // Detectar tipo en este momento (typewriter terminó, mensajes completos en DOM)
    carpaTipoDetected = detectGrupoCarpa();
    $form.style.display = 'block';
    $leadBody.style.display = 'none';
    $leadToggle.innerHTML = '&#9656;';
    var btn = document.createElement('button');
    btn.className = 'eco-action-btn';
    btn.innerHTML = 'Completar mi reserva &#8594;';
    btn.addEventListener('click', showBookingForm);
    $msgs.appendChild(btn);
    scrollToBottom();
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

  // ── BOOKING FORM ──────────────────────────────────────────────────────────────
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
    if (!valid) return;

    $bookSubmit.disabled = true; $bookSubmit.textContent = 'Enviando...';

    var payload = {
      nombre:        $bNombre.value.trim(),
      dni:           $bDni.value.trim(),
      telefono:      $bTel.value.trim(),
      correo:        $bEmail.value.trim(),
      tipo_carpa:    $bCarpa.value,
      fecha_llegada: $bLlegada.value,
      fecha_salida:  $bSalida.value,
      pax:           Number($bPax.value.trim()),
      ocasion:       $bOcasion.value.trim(),
    };

    (window.fetch ? window.fetch(N8N_RESERVA, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }) : xhrFetch(N8N_RESERVA, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        exitBookingMode();
        var codigo   = data.codigo   ? ' Código: <strong>' + escXSS(data.codigo) + '</strong>.' : '';
        var adelanto = data.adelanto ? ' Adelanto: <strong>S/ ' + data.adelanto + '</strong>.' : '';
        addMessage('bot', '¡Reserva registrada, ' + escXSS($bNombre.value.trim()) + '!' + codigo + adelanto + ' Te contactaremos al ' + escXSS($bTel.value.trim()) + ' para coordinar el pago.');
        $waCta.style.display = 'block'; scrollToBottom();
      })
      .catch(function () {
        $bookSubmit.disabled = false; $bookSubmit.textContent = 'Enviar solicitud de reserva';
        exitBookingMode();
        addMessage('bot', 'No pude procesar tu reserva. Escríbenos al <a href="' + CFG.whatsappUrl + '" target="_blank">WhatsApp 929 790 568</a>.');
      });
  });

  function showWaCta() { $waCta.style.display = 'block'; scrollToBottom(); }

})();
