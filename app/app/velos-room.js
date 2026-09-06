/**
 * Velos Room Universal
 * Zero-budget real-time collaboration for 9 seats: 1 Lead + 8 Peers.
 *
 * One file, two runtimes:
 *   Node  — authoritative signaling + shared-state server
 *   Browser — WebRTC mesh, chat, kudos, and synced collaborative board
 *
 * Model: authoritative server. Clients propose actions. The server
 * validates role, applies last-write-wins to room.state, then broadcasts
 * a versioned snapshot. Peers cannot mutate shared state; they can only
 * request that the Lead apply a change.
 *
 *   node velos-room-universal.js
 *   <script src="velos-room-universal.js"></script>
 */
(function VelosRoomUniversal(global) {
  'use strict';

  const IS_NODE =
    typeof window === 'undefined' && typeof require === 'function';

  const MAX_SEATS = 9;
  const LEAD_SEATS = 1;
  const PEER_SEATS = MAX_SEATS - LEAD_SEATS;

  const KUDOS = Object.freeze({
    idea: { label: 'Great Idea', emoji: '💡', points: 5 },
    helpful: { label: 'Helpful', emoji: '🤝', points: 4 },
    supportive: { label: 'Supportive', emoji: '❤️', points: 4 },
    solver: { label: 'Problem Solver', emoji: '🚀', points: 5 },
    execution: { label: 'Great Execution', emoji: '🎯', points: 5 },
    listener: { label: 'Great Listener', emoji: '👂', points: 3 }
  });

  const ALLOWED_REACTIONS = Object.freeze([
    '👍',
    '❤️',
    '👏',
    '🎉',
    '💡',
    '😂'
  ]);

  const STATE_ACTIONS = Object.freeze({
    SET_FLAG: 'SET_FLAG',
    SET_AGENDA: 'SET_AGENDA',
    SET_MOOD: 'SET_MOOD',
    SET_SPEAKER: 'SET_SPEAKER',
    SET_FOCUS: 'SET_FOCUS',
    RESET_BOARD: 'RESET_BOARD'
  });

  const MOODS = Object.freeze([
    'neutral',
    'focused',
    'energized',
    'blocked',
    'celebrating'
  ]);

  function defaultBoard() {
    return {
      version: 0,
      updatedAt: Date.now(),
      updatedBy: null,
      updatedByName: null,
      lastAction: null,
      flags: {
        recording: false,
        focusMode: false,
        whiteboardOpen: false,
        agendaLocked: false,
        doorsClosed: false
      },
      agenda: '',
      mood: 'neutral',
      currentSpeakerId: null
    };
  }

  /* ------------------------------------------------------------------ */
  /* Node: authoritative signaling + state server                       */
  /* ------------------------------------------------------------------ */
  if (IS_NODE) {
    const http = require('http');
    const crypto = require('crypto');
    const { WebSocketServer, WebSocket } = require('ws');

    const PORT = Number(process.env.VELOS_ROOM_PORT || 8787);
    const PATH = process.env.VELOS_ROOM_PATH || '/velos-room';
    const MAX_PARTICIPANTS = Math.max(
      2,
      Math.min(
        MAX_SEATS,
        Number(process.env.VELOS_ROOM_MAX_PARTICIPANTS || MAX_SEATS)
      )
    );

    const rooms = new Map();

    const id = (prefix = 'p') =>
      `${prefix}_${crypto.randomBytes(6).toString('hex')}`;

    const clean = (value, max = 160) =>
      String(value ?? '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);

    const roomCode = (value) =>
      clean(value, 48)
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || id('room');

    const normalizeSeat = (value, isFirst) => {
      if (isFirst) return 'lead';
      if (value === 'lead' || value === 'host' || value === 'manager') {
        return 'peer';
      }
      if (value === 'guest') return 'guest';
      return 'peer';
    };

    const send = (ws, data) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.send(JSON.stringify(data));
      } catch (_) {}
    };

    const serialize = (p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      seat: p.role,
      points: p.points,
      kudosReceived: p.kudosReceived,
      raised: p.raised,
      badges: [...p.badges],
      joinedAt: p.joinedAt
    });

    const ensureRoom = (code) => {
      if (!rooms.has(code)) {
        rooms.set(code, {
          id: code,
          leadId: null,
          createdAt: Date.now(),
          participants: new Map(),
          state: defaultBoard(),
          pendingRequests: [],
          stats: { kudos: 0, reactions: 0, chats: 0, actions: 0, requests: 0 }
        });
      }
      return rooms.get(code);
    };

    const snapshot = (room) => ({
      id: room.id,
      leadId: room.leadId,
      hostId: room.leadId,
      createdAt: room.createdAt,
      seats: {
        max: MAX_PARTICIPANTS,
        lead: LEAD_SEATS,
        peers: Math.max(0, MAX_PARTICIPANTS - LEAD_SEATS)
      },
      stats: { ...room.stats },
      state: JSON.parse(JSON.stringify(room.state)),
      pendingRequests: room.pendingRequests.slice(-12),
      participants: [...room.participants.values()].map(serialize)
    });

    const broadcast = (room, data, exceptId = null) => {
      for (const p of room.participants.values()) {
        if (p.id !== exceptId) send(p.ws, data);
      }
    };

    const updateBadges = (p) => {
      if (p.kudosReceived >= 3) p.badges.add('Connector');
      if (p.points >= 20) p.badges.add('Team Spark');
      if (p.points >= 45) p.badges.add('Culture Builder');
      if (p.points >= 80) p.badges.add('Culture Champion');
    };

    const promoteLead = (room, participant) => {
      room.leadId = participant?.id || null;
      if (participant) participant.role = 'lead';
    };

    const removeParticipant = (ws) => {
      const roomId = ws.__velosRoomId;
      const peerId = ws.__velosPeerId;
      if (!roomId || !peerId) return;

      const room = rooms.get(roomId);
      if (!room) return;

      const participant = room.participants.get(peerId) || null;
      room.participants.delete(peerId);

      room.pendingRequests = room.pendingRequests.filter(
        (req) => req.fromId !== peerId
      );

      if (room.state.currentSpeakerId === peerId) {
        room.state.currentSpeakerId = null;
        room.state.version += 1;
        room.state.updatedAt = Date.now();
        room.state.lastAction = 'SPEAKER_LEFT';
      }

      if (room.leadId === peerId) {
        const next = room.participants.values().next().value || null;
        promoteLead(room, next);
      }

      broadcast(room, {
        type: 'peer-left',
        peerId,
        participant: participant ? serialize(participant) : null,
        leadId: room.leadId,
        hostId: room.leadId,
        room: snapshot(room)
      });

      if (!room.participants.size) rooms.delete(roomId);

      ws.__velosRoomId = null;
      ws.__velosPeerId = null;
    };

    const applyStateAction = (room, sender, action, payload) => {
      const state = room.state;
      const data = payload && typeof payload === 'object' ? payload : {};

      switch (action) {
        case STATE_ACTIONS.SET_FLAG: {
          const key = clean(data.key, 32);
          if (!Object.prototype.hasOwnProperty.call(state.flags, key)) {
            return { ok: false, message: 'Unknown flag.' };
          }
          state.flags[key] = !!data.value;
          break;
        }
        case STATE_ACTIONS.SET_AGENDA: {
          if (state.flags.agendaLocked && sender.role !== 'lead') {
            return { ok: false, message: 'Agenda is locked.' };
          }
          state.agenda = clean(data.agenda, 240);
          break;
        }
        case STATE_ACTIONS.SET_MOOD: {
          const mood = clean(data.mood, 24);
          if (!MOODS.includes(mood)) {
            return { ok: false, message: 'Unknown mood.' };
          }
          state.mood = mood;
          break;
        }
        case STATE_ACTIONS.SET_SPEAKER: {
          const speakerId = String(data.speakerId || '');
          if (speakerId && !room.participants.has(speakerId)) {
            return { ok: false, message: 'Speaker is not in the room.' };
          }
          state.currentSpeakerId = speakerId || null;
          break;
        }
        case STATE_ACTIONS.SET_FOCUS: {
          const focusId = String(data.peerId || '');
          if (focusId && !room.participants.has(focusId)) {
            return { ok: false, message: 'Focus target missing.' };
          }
          state.flags.focusMode = !!data.value;
          if (data.value && focusId) {
            state.currentSpeakerId = focusId;
          } else if (!data.value) {
            state.currentSpeakerId = null;
          }
          break;
        }
        case STATE_ACTIONS.RESET_BOARD: {
          const preservedVersion = state.version;
          Object.assign(state, defaultBoard());
          state.version = preservedVersion;
          break;
        }
        default:
          return { ok: false, message: 'Unknown action.' };
      }

      state.version += 1;
      state.updatedAt = Date.now();
      state.updatedBy = sender.id;
      state.updatedByName = sender.name;
      state.lastAction = action;
      room.stats.actions += 1;
      return { ok: true };
    };

    const server = http.createServer((req, res) => {
      const origin = { 'access-control-allow-origin': '*' };

      if (req.url === '/health') {
        res.writeHead(200, {
          'content-type': 'application/json',
          ...origin
        });
        res.end(
          JSON.stringify({
            ok: true,
            service: 'velos-room',
            model: 'authoritative-server',
            rooms: rooms.size,
            maxParticipants: MAX_PARTICIPANTS,
            layout: { lead: LEAD_SEATS, peers: PEER_SEATS }
          })
        );
        return;
      }

      res.writeHead(200, {
        'content-type': 'text/plain; charset=utf-8',
        ...origin
      });
      res.end(
        `Velos Room signaling server\n` +
          `WebSocket: ${PATH}\n` +
          `Seats: ${LEAD_SEATS} lead + ${MAX_PARTICIPANTS - 1} peers\n` +
          `Model: authoritative shared state (LWW)\n`
      );
    });

    const wss = new WebSocketServer({
      server,
      path: PATH,
      perMessageDeflate: false,
      maxPayload: 64 * 1024
    });

    wss.on('connection', (ws) => {
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', (raw) => {
        let msg;
        try {
          msg = JSON.parse(
            Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw)
          );
        } catch (_) {
          send(ws, { type: 'error', message: 'Invalid message.' });
          return;
        }

        if (!msg || typeof msg !== 'object') return;

        if (msg.type === 'join') {
          removeParticipant(ws);

          const code = roomCode(msg.roomId);
          const room = ensureRoom(code);

          if (room.participants.size >= MAX_PARTICIPANTS) {
            send(ws, {
              type: 'room-full',
              maxParticipants: MAX_PARTICIPANTS
            });
            return;
          }

          const first = room.participants.size === 0;
          const peerId = id('peer');
          const participant = {
            id: peerId,
            ws,
            name: clean(msg.user?.name || 'Guest', 42) || 'Guest',
            role: normalizeSeat(msg.user?.role, first),
            points: 0,
            kudosReceived: 0,
            raised: false,
            badges: new Set(),
            joinedAt: Date.now()
          };

          room.participants.set(peerId, participant);
          if (first) promoteLead(room, participant);

          ws.__velosRoomId = code;
          ws.__velosPeerId = peerId;

          send(ws, {
            type: 'joined',
            selfId: peerId,
            room: snapshot(room)
          });

          broadcast(
            room,
            {
              type: 'peer-joined',
              participant: serialize(participant),
              leadId: room.leadId,
              hostId: room.leadId,
              room: snapshot(room)
            },
            peerId
          );
          return;
        }

        const room = rooms.get(ws.__velosRoomId);
        const sender = room?.participants.get(ws.__velosPeerId);

        if (!room || !sender) {
          send(ws, { type: 'error', message: 'Join a room first.' });
          return;
        }

        if (msg.type === 'signal') {
          const target = room.participants.get(String(msg.targetId || ''));
          if (target) {
            send(target.ws, {
              type: 'signal',
              fromId: sender.id,
              signal: msg.signal
            });
          }
          return;
        }

        if (msg.type === 'state-action') {
          if (sender.role !== 'lead') {
            send(ws, {
              type: 'error',
              code: 'RBAC_DENIED',
              message: 'Only the Lead can change shared state. Send a request instead.'
            });
            return;
          }

          const action = clean(msg.action, 32);
          const result = applyStateAction(room, sender, action, msg.payload);
          if (!result.ok) {
            send(ws, { type: 'error', message: result.message });
            return;
          }

          room.pendingRequests = [];

          broadcast(room, {
            type: 'state-sync',
            reason: 'action',
            action,
            actor: serialize(sender),
            room: snapshot(room)
          });
          return;
        }

        if (msg.type === 'state-request') {
          if (sender.role === 'lead') {
            send(ws, {
              type: 'error',
              message: 'Lead can apply the action directly.'
            });
            return;
          }

          const action = clean(msg.action, 32);
          if (!Object.values(STATE_ACTIONS).includes(action)) {
            send(ws, { type: 'error', message: 'Unknown request action.' });
            return;
          }

          const request = {
            id: id('req'),
            action,
            payload:
              msg.payload && typeof msg.payload === 'object' ? msg.payload : {},
            fromId: sender.id,
            fromName: sender.name,
            at: Date.now()
          };

          room.pendingRequests.push(request);
          if (room.pendingRequests.length > 20) {
            room.pendingRequests = room.pendingRequests.slice(-20);
          }
          room.stats.requests += 1;

          broadcast(room, {
            type: 'state-request',
            request,
            room: snapshot(room)
          });
          return;
        }

        if (msg.type === 'resolve-request') {
          if (sender.role !== 'lead') {
            send(ws, {
              type: 'error',
              code: 'RBAC_DENIED',
              message: 'Only the Lead can resolve requests.'
            });
            return;
          }

          const requestId = String(msg.requestId || '');
          const request = room.pendingRequests.find((r) => r.id === requestId);
          if (!request) return;

          room.pendingRequests = room.pendingRequests.filter(
            (r) => r.id !== requestId
          );

          if (msg.approve) {
            const result = applyStateAction(
              room,
              sender,
              request.action,
              request.payload
            );
            if (!result.ok) {
              send(ws, { type: 'error', message: result.message });
              return;
            }
          }

          broadcast(room, {
            type: 'state-sync',
            reason: msg.approve ? 'request-approved' : 'request-denied',
            action: request.action,
            requestId,
            actor: serialize(sender),
            requester: {
              id: request.fromId,
              name: request.fromName
            },
            room: snapshot(room)
          });
          return;
        }

        if (msg.type === 'room-event') {
          const eventType = clean(msg.eventType, 32);
          const data =
            msg.data && typeof msg.data === 'object' ? msg.data : {};

          if (eventType === 'chat') {
            const text = clean(data.text, 800);
            if (!text) return;
            room.stats.chats += 1;
            broadcast(room, {
              type: 'room-event',
              eventType: 'chat',
              data: {
                fromId: sender.id,
                fromName: sender.name,
                text,
                at: Date.now()
              },
              stats: { ...room.stats }
            });
            return;
          }

          if (eventType === 'reaction') {
            const reaction = clean(data.reaction, 8);
            if (!ALLOWED_REACTIONS.includes(reaction)) return;
            room.stats.reactions += 1;
            broadcast(room, {
              type: 'room-event',
              eventType: 'reaction',
              data: {
                fromId: sender.id,
                fromName: sender.name,
                reaction,
                at: Date.now()
              },
              stats: { ...room.stats }
            });
            return;
          }

          if (eventType === 'raise-hand') {
            sender.raised = !!data.raised;
            broadcast(room, {
              type: 'room-event',
              eventType: 'raise-hand',
              data: {
                fromId: sender.id,
                raised: sender.raised,
                at: Date.now()
              }
            });
            return;
          }

          if (eventType === 'kudos') {
            const targetId = String(data.targetId || '');
            const kind = clean(data.kind, 30);
            const target = room.participants.get(targetId);
            const kudos = KUDOS[kind];
            if (!target || !kudos || targetId === sender.id) return;

            target.points += kudos.points;
            target.kudosReceived += 1;
            room.stats.kudos += 1;
            updateBadges(target);

            broadcast(room, {
              type: 'room-event',
              eventType: 'kudos',
              data: {
                fromId: sender.id,
                fromName: sender.name,
                targetId: target.id,
                targetName: target.name,
                kind,
                label: kudos.label,
                emoji: kudos.emoji,
                pointsAdded: kudos.points,
                totalPoints: target.points,
                kudosReceived: target.kudosReceived,
                badges: [...target.badges],
                at: Date.now()
              },
              stats: { ...room.stats }
            });
            return;
          }
        }

        if (
          msg.type === 'host-action' &&
          room.leadId === sender.id &&
          msg.action === 'end-room'
        ) {
          broadcast(room, {
            type: 'room-ended',
            by: { id: sender.id, name: sender.name }
          });
          for (const p of room.participants.values()) {
            try {
              p.ws.close(4000, 'Room ended by lead');
            } catch (_) {}
          }
          rooms.delete(room.id);
          return;
        }

        if (msg.type === 'ping') {
          send(ws, { type: 'pong', at: Date.now() });
        }
      });

      ws.on('close', () => removeParticipant(ws));
      ws.on('error', () => removeParticipant(ws));
    });

    const heartbeat = setInterval(() => {
      for (const socket of wss.clients) {
        if (socket.isAlive === false) {
          try {
            socket.terminate();
          } catch (_) {}
          continue;
        }
        socket.isAlive = false;
        try {
          socket.ping();
        } catch (_) {}
      }
    }, 30000);

    wss.on('close', () => clearInterval(heartbeat));

    server.listen(PORT, () => {
      console.log(
        `Velos Room server: http://localhost:${PORT} | ws://localhost:${PORT}${PATH}`
      );
      console.log(
        `Authoritative board · ${LEAD_SEATS} lead + ${MAX_PARTICIPANTS - 1} peers`
      );
    });

    return;
  }

  /* ------------------------------------------------------------------ */
  /* Browser client                                                     */
  /* ------------------------------------------------------------------ */
  const CONFIG = Object.freeze({
    signalingUrl:
      global.VELOS_ROOM_CONFIG?.signalingUrl ||
      `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:8787/velos-room`,
    maxParticipants: Number(
      global.VELOS_ROOM_CONFIG?.maxParticipants || MAX_SEATS
    ),
    autoOpen: !!global.VELOS_ROOM_CONFIG?.autoOpen,
    rtcConfig: global.VELOS_ROOM_CONFIG?.rtcConfig || {
      iceServers: [
        {
          urls: [
            'stun:stun.l.google.com:19302',
            'stun:stun1.l.google.com:19302'
          ]
        }
      ]
    }
  });

  const CLIENT_KUDOS = Object.freeze({
    idea: { label: 'Great Idea', emoji: '💡' },
    helpful: { label: 'Helpful', emoji: '🤝' },
    supportive: { label: 'Supportive', emoji: '❤️' },
    solver: { label: 'Problem Solver', emoji: '🚀' },
    execution: { label: 'Great Execution', emoji: '🎯' },
    listener: { label: 'Great Listener', emoji: '👂' }
  });

  const S = {
    socket: null,
    joined: false,
    intentionalDisconnect: false,
    heartbeat: null,
    roomId: '',
    selfId: '',
    leadId: '',
    seatMax: CONFIG.maxParticipants,
    localUser: { name: '', role: 'peer' },
    localStream: null,
    cameraTrack: null,
    micTrack: null,
    screenTrack: null,
    screenStream: null,
    ownedTracks: new Set(),
    cameraSending: true,
    micEnabled: true,
    raised: false,
    peers: new Map(),
    participants: new Map(),
    state: defaultBoard(),
    pendingRequests: [],
    stats: { kudos: 0, reactions: 0, chats: 0, actions: 0, requests: 0 }
  };

  const E = {};
  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    global.CSS?.escape
      ? global.CSS.escape(String(s))
      : String(s).replace(/["\\]/g, '\\$&');

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  ready(init);

  function init() {
    injectStyles();
    injectUI();
    cache();
    bind();
    loadIdentity();

    const q = new URLSearchParams(location.search).get('room');
    if (q) E.room.value = q;

    renderPeople();
    renderKudosTargets();
    renderPulse();
    renderBoard();
    exposeAPI();

    if (CONFIG.autoOpen) open();
  }

  function injectStyles() {
    if ($('velos-room-style')) return;

    const style = document.createElement('style');
    style.id = 'velos-room-style';
    style.textContent = `
:root{
  --vr-bg:#0f151d;
  --vr-panel:#151d27;
  --vr-panel2:#1b2633;
  --vr-line:rgba(255,255,255,.09);
  --vr-text:#eef6ff;
  --vr-muted:#9fb0c2;
  --vr-accent:#66dfbd;
  --vr-danger:#ff7777;
  --vr-shadow:0 25px 90px rgba(0,0,0,.45);
}
#vr-launch{
  position:fixed;right:20px;bottom:20px;z-index:2147482000;
  border:1px solid var(--vr-line);background:var(--vr-panel);color:var(--vr-text);
  border-radius:15px;padding:12px 16px;font:700 14px system-ui;cursor:pointer;
  box-shadow:var(--vr-shadow);
}
#vr-shell{
  position:fixed;inset:12px;z-index:2147482500;display:none;
  grid-template-rows:auto 1fr;background:var(--vr-bg);color:var(--vr-text);
  border:1px solid var(--vr-line);border-radius:22px;overflow:hidden;
  box-shadow:var(--vr-shadow);font-family:system-ui,-apple-system,Segoe UI,sans-serif;
}
#vr-shell.show{display:grid;}
.vr-top{
  display:flex;align-items:center;gap:10px;padding:12px 15px;
  border-bottom:1px solid var(--vr-line);background:rgba(255,255,255,.025);
}
.vr-brand{font-weight:900;letter-spacing:.05em;}
.vr-meta{flex:1;min-width:0;}
.vr-title{font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.vr-sub{font-size:12px;color:var(--vr-muted);margin-top:2px;}
.vr-btn{
  border:1px solid var(--vr-line);background:var(--vr-panel2);color:var(--vr-text);
  border-radius:11px;padding:9px 11px;font:700 13px system-ui;cursor:pointer;
}
.vr-btn:hover{filter:brightness(1.12);}
.vr-btn.active{outline:2px solid rgba(102,223,189,.25);border-color:rgba(102,223,189,.55);}
.vr-btn.primary{background:#185347;}
.vr-btn.danger{background:#54252a;}
.vr-btn:disabled{opacity:.45;cursor:not-allowed;}
.vr-input,.vr-select,.vr-textarea{
  width:100%;box-sizing:border-box;border:1px solid var(--vr-line);
  background:#0c1219;color:var(--vr-text);border-radius:11px;padding:10px 11px;outline:none;
}
.vr-textarea{resize:none;height:42px;}
.vr-row{display:flex;gap:8px;align-items:center;}
.vr-grow{flex:1;min-width:0;}
#vr-join{height:100%;display:grid;place-items:center;padding:20px;}
.vr-card{
  width:min(560px,100%);background:var(--vr-panel);border:1px solid var(--vr-line);
  border-radius:20px;padding:22px;
}
.vr-card h2{margin:0 0 8px;}
.vr-card p{color:var(--vr-muted);line-height:1.5;}
.vr-field{display:grid;gap:6px;margin:12px 0;}
.vr-field label{
  font-size:11px;font-weight:800;color:var(--vr-muted);
  text-transform:uppercase;letter-spacing:.06em;
}
#vr-meeting{display:none;height:100%;min-height:0;grid-template-columns:minmax(0,1fr) 360px;}
#vr-meeting.show{display:grid;}
.vr-stage{min-width:0;min-height:0;display:grid;grid-template-rows:1fr auto;border-right:1px solid var(--vr-line);}
#vr-grid{
  min-height:0;overflow:auto;padding:12px;display:grid;
  grid-template-columns:repeat(auto-fit,minmax(210px,1fr));
  grid-auto-rows:minmax(160px,1fr);gap:10px;
}
.vr-tile{position:relative;min-height:160px;overflow:hidden;border:1px solid var(--vr-line);border-radius:15px;background:#05090e;}
.vr-tile video{width:100%;height:100%;display:block;object-fit:cover;background:#05090e;}
.vr-tile.local video{transform:scaleX(-1);}
.vr-tile.speaker{outline:2px solid rgba(102,223,189,.7);}
.vr-tilebar{position:absolute;left:8px;right:8px;bottom:8px;display:flex;justify-content:space-between;gap:8px;pointer-events:none;}
.vr-chip{padding:6px 8px;border-radius:9px;background:rgba(0,0,0,.62);font-size:12px;font-weight:800;backdrop-filter:blur(8px);}
.vr-controls{position:relative;display:flex;justify-content:center;flex-wrap:wrap;gap:7px;padding:11px;border-top:1px solid var(--vr-line);}
#vr-reaction-menu{display:none;position:absolute;bottom:58px;padding:7px;background:var(--vr-panel);border:1px solid var(--vr-line);border-radius:12px;box-shadow:var(--vr-shadow);}
#vr-reaction-menu.show{display:flex;}
#vr-reaction-menu button{border:0;background:transparent;font-size:21px;cursor:pointer;}
.vr-side{min-width:0;min-height:0;display:grid;grid-template-rows:auto auto auto minmax(120px,1fr) auto;overflow:hidden;background:var(--vr-panel);}
.vr-section{min-height:0;overflow:auto;padding:11px;border-bottom:1px solid var(--vr-line);}
.vr-heading{margin:0 0 8px;font-size:11px;color:var(--vr-muted);text-transform:uppercase;letter-spacing:.07em;}
#vr-people{display:grid;gap:6px;}
.vr-person{display:flex;gap:8px;align-items:center;padding:7px;border-radius:10px;background:rgba(255,255,255,.025);}
.vr-avatar{width:30px;height:30px;display:grid;place-items:center;border-radius:50%;background:#263344;font-weight:900;}
.vr-person-main{min-width:0;flex:1;}
.vr-person-name{font-size:13px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.vr-person-meta{font-size:11px;color:var(--vr-muted);}
.vr-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;}
.vr-metric{padding:8px;border:1px solid var(--vr-line);border-radius:11px;background:rgba(255,255,255,.025);}
.vr-metric strong{display:block;font-size:18px;}
.vr-metric span{font-size:9px;color:var(--vr-muted);text-transform:uppercase;}
.vr-progress{height:7px;margin-top:7px;border-radius:999px;background:#091018;overflow:hidden;}
.vr-progress>div{height:100%;width:0%;border-radius:inherit;background:linear-gradient(90deg,#66dfbd,#7ebcff);transition:width .25s;}
.vr-quest{margin-top:9px;padding:8px;border:1px solid var(--vr-line);border-radius:10px;font-size:12px;}
.vr-flags{display:grid;grid-template-columns:1fr 1fr;gap:6px;}
.vr-flag{
  display:flex;align-items:center;justify-content:space-between;gap:8px;
  padding:8px;border:1px solid var(--vr-line);border-radius:10px;background:rgba(255,255,255,.02);
  font-size:12px;font-weight:700;
}
.vr-flag button{padding:6px 8px;font-size:11px;}
#vr-chat{display:grid;gap:7px;max-height:180px;overflow:auto;margin-bottom:8px;}
.vr-msg{padding:7px 8px;border-radius:9px;background:rgba(255,255,255,.025);font-size:12px;line-height:1.4;}
.vr-who{color:var(--vr-accent);font-weight:900;}
.vr-kudos-feed{display:grid;gap:5px;max-height:110px;overflow:auto;margin-top:8px;}
.vr-kudos-item{padding:7px 8px;border-radius:9px;background:rgba(102,223,189,.06);font-size:12px;}
.vr-req{padding:7px 8px;border-radius:9px;background:rgba(255,201,107,.08);font-size:12px;margin-top:6px;}
.vr-req .vr-row{margin-top:6px;}
#vr-float{position:fixed;inset:0;z-index:2147483000;pointer-events:none;overflow:hidden;}
.vr-float-item{position:absolute;bottom:70px;font-size:44px;animation:vrFloat 2.2s ease-out forwards;filter:drop-shadow(0 8px 14px rgba(0,0,0,.4));}
@keyframes vrFloat{
  from{opacity:0;transform:translateY(8px) scale(.75);}
  15%{opacity:1;}
  to{opacity:0;transform:translate(var(--drift),-55vh) scale(1.25);}
}
.vr-good{color:#66dfbd;}
.vr-warn{color:#ffc96b;}
.vr-bad{color:#ff8585;}
@media(max-width:980px){
  #vr-shell{inset:5px;border-radius:14px;}
  #vr-meeting.show{grid-template-columns:1fr;grid-template-rows:minmax(0,1fr) 280px;}
  .vr-stage{border-right:0;border-bottom:1px solid var(--vr-line);}
  .vr-side{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;overflow:auto;}
}
    `;
    document.head.appendChild(style);
  }

  function injectUI() {
    if ($('vr-shell')) return;

    const wrap = document.createElement('div');
    wrap.innerHTML = `
<button id="vr-launch" type="button">👥 Velos Room</button>
<section id="vr-shell" role="dialog" aria-modal="true" aria-label="Velos Room">
  <header class="vr-top">
    <div class="vr-brand">VELOS ROOM</div>
    <div class="vr-meta">
      <div id="vr-title" class="vr-title">Lead + 8 peer collaboration room</div>
      <div class="vr-sub">
        <span id="vr-code-label">Not connected</span>
        ·
        <span id="vr-status">Ready</span>
      </div>
    </div>
    <button id="vr-invite" class="vr-btn" type="button" hidden>🔗 Invite</button>
    <button id="vr-close" class="vr-btn" type="button">✕</button>
  </header>
  <div>
    <div id="vr-join">
      <div class="vr-card">
        <h2>Nine seats. One lead. Shared truth.</h2>
        <p>
          Authoritative-server meetings for 1 Lead and 8 Peers.
          Video, chat, reactions, screen share, recognition — plus a
          synced board that only the Lead can mutate. Peers request changes.
        </p>
        <div class="vr-field">
          <label>Your name</label>
          <input id="vr-name" class="vr-input" maxlength="42" placeholder="Your name">
        </div>
        <div class="vr-field">
          <label>Room code</label>
          <input id="vr-room" class="vr-input" maxlength="48" placeholder="leadership-weekly">
        </div>
        <div class="vr-field">
          <label>Join as</label>
          <select id="vr-role" class="vr-select">
            <option value="peer">Peer</option>
            <option value="guest">Guest</option>
            <option value="lead">Lead (only if the room is empty)</option>
          </select>
        </div>
        <div class="vr-row" style="margin-top:14px">
          <button id="vr-create" class="vr-btn primary vr-grow">✨ Create Room</button>
          <button id="vr-join-btn" class="vr-btn vr-grow">Join Room</button>
        </div>
        <div class="vr-sub" style="margin-top:12px">
          Mesh WebRTC is intended for ${CONFIG.maxParticipants} people.
          First joiner becomes Lead. Use an SFU above that.
        </div>
      </div>
    </div>
    <div id="vr-meeting">
      <main class="vr-stage">
        <div id="vr-grid">
          <article class="vr-tile local" data-peer="local">
            <video id="vr-local-video" autoplay muted playsinline></video>
            <div class="vr-tilebar">
              <div class="vr-chip">You</div>
              <div class="vr-chip">● Local</div>
            </div>
          </article>
        </div>
        <div class="vr-controls">
          <button id="vr-mic" class="vr-btn active">🎤 Mic</button>
          <button id="vr-camera" class="vr-btn active">📹 Camera</button>
          <button id="vr-screen" class="vr-btn">🖥 Share</button>
          <button id="vr-raise" class="vr-btn">✋ Raise</button>
          <button id="vr-react" class="vr-btn">😊 React</button>
          <div id="vr-reaction-menu">
            <button data-r="👍">👍</button>
            <button data-r="❤️">❤️</button>
            <button data-r="👏">👏</button>
            <button data-r="🎉">🎉</button>
            <button data-r="💡">💡</button>
            <button data-r="😂">😂</button>
          </div>
          <button id="vr-leave" class="vr-btn danger">Leave</button>
          <button id="vr-end" class="vr-btn danger" hidden>End for all</button>
        </div>
      </main>
      <aside class="vr-side">
        <section class="vr-section">
          <h3 class="vr-heading">People</h3>
          <div id="vr-people"></div>
        </section>
        <section class="vr-section">
          <h3 class="vr-heading">Shared Board · v<span id="vr-state-version">0</span></h3>
          <div class="vr-sub" id="vr-state-meta">Waiting for server state</div>
          <div class="vr-field">
            <label>Agenda</label>
            <div class="vr-row">
              <input id="vr-agenda" class="vr-input vr-grow" maxlength="240" placeholder="What are we deciding?">
              <button id="vr-agenda-set" class="vr-btn">Set</button>
            </div>
          </div>
          <div class="vr-field">
            <label>Mood</label>
            <select id="vr-mood" class="vr-select">
              ${MOODS.map((m) => `<option value="${m}">${m}</option>`).join('')}
            </select>
          </div>
          <div class="vr-flags" id="vr-flags"></div>
          <div id="vr-requests"></div>
        </section>
        <section class="vr-section">
          <h3 class="vr-heading">Team Pulse</h3>
          <div class="vr-metrics">
            <div class="vr-metric"><strong id="vr-energy">35%</strong><span>Energy</span></div>
            <div class="vr-metric"><strong id="vr-recognized">0</strong><span>Recognized</span></div>
            <div class="vr-metric"><strong id="vr-kudos-count">0</strong><span>Kudos</span></div>
          </div>
          <div class="vr-progress"><div id="vr-energy-bar"></div></div>
          <div class="vr-quest">
            <b>🏆 Team Quest</b>
            <div>Give 10 meaningful kudos · <span id="vr-quest">0 / 10</span></div>
            <div class="vr-progress"><div id="vr-quest-bar"></div></div>
          </div>
        </section>
        <section class="vr-section">
          <h3 class="vr-heading">Chat</h3>
          <div id="vr-chat"></div>
          <div class="vr-row">
            <textarea id="vr-chat-input" class="vr-textarea vr-grow" maxlength="800" placeholder="Write something useful or kind…"></textarea>
            <button id="vr-chat-send" class="vr-btn">Send</button>
          </div>
        </section>
        <section class="vr-section">
          <h3 class="vr-heading">Warmth & Kudos</h3>
          <div class="vr-row">
            <select id="vr-kudos-target" class="vr-select vr-grow"></select>
            <select id="vr-kudos-kind" class="vr-select vr-grow">
              ${Object.entries(CLIENT_KUDOS)
                .map(
                  ([key, value]) =>
                    `<option value="${key}">${value.emoji} ${value.label}</option>`
                )
                .join('')}
            </select>
          </div>
          <button id="vr-kudos-send" class="vr-btn primary" style="width:100%;margin-top:7px">🎁 Give Kudos</button>
          <div id="vr-kudos-feed" class="vr-kudos-feed"></div>
        </section>
      </aside>
    </div>
  </div>
</section>
<div id="vr-float"></div>
    `;
    document.body.append(...wrap.children);
  }

  function cache() {
    Object.assign(E, {
      launch: $('vr-launch'),
      shell: $('vr-shell'),
      close: $('vr-close'),
      joinView: $('vr-join'),
      meeting: $('vr-meeting'),
      name: $('vr-name'),
      room: $('vr-room'),
      role: $('vr-role'),
      create: $('vr-create'),
      joinBtn: $('vr-join-btn'),
      title: $('vr-title'),
      codeLabel: $('vr-code-label'),
      status: $('vr-status'),
      invite: $('vr-invite'),
      grid: $('vr-grid'),
      localVideo: $('vr-local-video'),
      mic: $('vr-mic'),
      camera: $('vr-camera'),
      screen: $('vr-screen'),
      raise: $('vr-raise'),
      react: $('vr-react'),
      reactionMenu: $('vr-reaction-menu'),
      leave: $('vr-leave'),
      end: $('vr-end'),
      people: $('vr-people'),
      chat: $('vr-chat'),
      chatInput: $('vr-chat-input'),
      chatSend: $('vr-chat-send'),
      kudosTarget: $('vr-kudos-target'),
      kudosKind: $('vr-kudos-kind'),
      kudosSend: $('vr-kudos-send'),
      kudosFeed: $('vr-kudos-feed'),
      energy: $('vr-energy'),
      energyBar: $('vr-energy-bar'),
      recognized: $('vr-recognized'),
      kudosCount: $('vr-kudos-count'),
      quest: $('vr-quest'),
      questBar: $('vr-quest-bar'),
      float: $('vr-float'),
      agenda: $('vr-agenda'),
      agendaSet: $('vr-agenda-set'),
      mood: $('vr-mood'),
      flags: $('vr-flags'),
      requests: $('vr-requests'),
      stateVersion: $('vr-state-version'),
      stateMeta: $('vr-state-meta')
    });
  }

  function bind() {
    E.launch.onclick = open;
    E.close.onclick = close;
    E.create.onclick = () => {
      E.room.value = makeRoomCode();
      joinFromForm();
    };
    E.joinBtn.onclick = joinFromForm;
    E.invite.onclick = copyInvite;
    E.mic.onclick = toggleMic;
    E.camera.onclick = toggleCamera;
    E.screen.onclick = toggleScreen;
    E.raise.onclick = toggleRaise;
    E.react.onclick = () => E.reactionMenu.classList.toggle('show');
    E.reactionMenu.onclick = (ev) => {
      const button = ev.target.closest('[data-r]');
      if (!button) return;
      react(button.dataset.r);
      E.reactionMenu.classList.remove('show');
    };
    E.leave.onclick = () => leaveRoom();
    E.end.onclick = endRoom;
    E.chatSend.onclick = sendChat;
    E.chatInput.onkeydown = (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        sendChat();
      }
    };
    E.kudosSend.onclick = giveKudos;
    E.agendaSet.onclick = () =>
      propose(STATE_ACTIONS.SET_AGENDA, { agenda: E.agenda.value });
    E.mood.onchange = () =>
      propose(STATE_ACTIONS.SET_MOOD, { mood: E.mood.value });
    window.addEventListener('beforeunload', cleanup, { once: true });
  }

  function open() {
    E.shell.classList.add('show');
  }
  function close() {
    E.shell.classList.remove('show');
  }
  function showMeeting() {
    E.joinView.style.display = 'none';
    E.meeting.classList.add('show');
  }
  function showJoin() {
    E.joinView.style.display = '';
    E.meeting.classList.remove('show');
  }

  function isLead() {
    return S.selfId && S.selfId === S.leadId;
  }

  function status(text, mode = 'good') {
    E.status.textContent = text;
    E.status.className =
      mode === 'bad' ? 'vr-bad' : mode === 'warn' ? 'vr-warn' : 'vr-good';
  }

  function loadIdentity() {
    try {
      E.name.value = localStorage.getItem('velos-room-name') || '';
      E.role.value = localStorage.getItem('velos-room-role') || 'peer';
    } catch (_) {}
  }

  function saveIdentity() {
    try {
      localStorage.setItem('velos-room-name', S.localUser.name);
      localStorage.setItem('velos-room-role', S.localUser.role);
    } catch (_) {}
  }

  function normalizeRoom(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48);
  }

  function makeRoomCode() {
    const adjectives = ['bright', 'warm', 'swift', 'bold', 'calm', 'kind'];
    const nouns = ['team', 'spark', 'bridge', 'circle', 'studio', 'room'];
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const suffix = Math.random().toString(36).slice(2, 6);
    return `${adjective}-${noun}-${suffix}`;
  }

  async function joinFromForm() {
    const name = String(E.name.value || '').trim().slice(0, 42);
    const roomId = normalizeRoom(E.room.value);
    const role = ['lead', 'peer', 'guest', 'manager', 'employee'].includes(
      E.role.value
    )
      ? E.role.value
      : 'peer';

    if (!name) {
      status('Enter your name', 'warn');
      E.name.focus();
      return;
    }
    if (!roomId) {
      status('Enter or create a room code', 'warn');
      E.room.focus();
      return;
    }

    S.localUser = { name, role };
    S.roomId = roomId;
    saveIdentity();
    open();

    try {
      status('Preparing media…', 'warn');
      await acquireMedia();
      await connectSocket();
      send({ type: 'join', roomId, user: S.localUser });
      status('Joining…', 'warn');
    } catch (err) {
      console.error(err);
      status(err.message || 'Could not join room', 'bad');
    }
  }

  async function waitExistingCamera(timeout = 1600) {
    const start = performance.now();
    while (performance.now() - start < timeout) {
      const stream = document.getElementById('cam')?.srcObject;
      if (stream instanceof MediaStream && stream.getVideoTracks().length) {
        return stream;
      }
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    return null;
  }

  async function acquireMedia() {
    if (S.localStream && S.cameraTrack?.readyState === 'live') {
      return S.localStream;
    }

    const out = new MediaStream();
    const existing = await waitExistingCamera();

    if (existing) {
      const videoTrack = existing.getVideoTracks()[0];
      const audioTrack = existing.getAudioTracks()[0];
      if (videoTrack) {
        out.addTrack(videoTrack);
        S.cameraTrack = videoTrack;
      }
      if (audioTrack) {
        out.addTrack(audioTrack);
        S.micTrack = audioTrack;
      }
    }

    if (!S.cameraTrack) {
      const videoStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 960 },
          height: { ideal: 540 },
          frameRate: { ideal: 24, max: 30 }
        },
        audio: false
      });
      const videoTrack = videoStream.getVideoTracks()[0];
      if (videoTrack) {
        out.addTrack(videoTrack);
        S.cameraTrack = videoTrack;
        S.ownedTracks.add(videoTrack);
      }
    }

    if (!S.micTrack) {
      const audioStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      const audioTrack = audioStream.getAudioTracks()[0];
      if (audioTrack) {
        out.addTrack(audioTrack);
        S.micTrack = audioTrack;
        S.ownedTracks.add(audioTrack);
      }
    }

    S.localStream = out;
    S.cameraSending = true;
    S.micEnabled = true;
    E.localVideo.srcObject = out;
    try {
      await E.localVideo.play();
    } catch (_) {}
    syncMediaButtons();
    return out;
  }

  function syncMediaButtons() {
    E.mic.classList.toggle('active', S.micEnabled);
    E.camera.classList.toggle('active', S.cameraSending);
    E.screen.classList.toggle('active', !!S.screenTrack);
    E.mic.textContent = S.micEnabled ? '🎤 Mic' : '🔇 Mic';
    E.camera.textContent = S.cameraSending ? '📹 Camera' : '🚫 Camera';
    E.screen.textContent = S.screenTrack ? '⏹ Stop share' : '🖥 Share';
  }

  function toggleMic() {
    if (!S.micTrack) return;
    S.micEnabled = !S.micEnabled;
    S.micTrack.enabled = S.micEnabled;
    syncMediaButtons();
  }

  function currentOutgoingVideoTrack() {
    return S.screenTrack || (S.cameraSending ? S.cameraTrack : null);
  }

  async function replaceVideoTrack(track) {
    for (const peer of S.peers.values()) {
      const sender = peer.pc
        .getSenders()
        .find((item) => item.__velosVideo || item.track?.kind === 'video');
      if (!sender) continue;
      sender.__velosVideo = true;
      try {
        await sender.replaceTrack(track);
      } catch (_) {}
    }
  }

  async function toggleCamera() {
    S.cameraSending = !S.cameraSending;
    await replaceVideoTrack(currentOutgoingVideoTrack());
    syncMediaButtons();
  }

  async function toggleScreen() {
    if (S.screenTrack) {
      await stopScreen();
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      status('Screen sharing unsupported', 'warn');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 20, max: 30 } },
        audio: false
      });
      const track = stream.getVideoTracks()[0];
      if (!track) return;
      S.screenStream = stream;
      S.screenTrack = track;
      track.addEventListener('ended', () => void stopScreen(), { once: true });
      await replaceVideoTrack(currentOutgoingVideoTrack());
      syncMediaButtons();
      status('Sharing screen');
    } catch (err) {
      if (!['NotAllowedError', 'AbortError'].includes(err?.name)) {
        console.error(err);
        status('Screen share failed', 'bad');
      }
    }
  }

  async function stopScreen() {
    const track = S.screenTrack;
    const stream = S.screenStream;
    S.screenTrack = null;
    S.screenStream = null;
    try {
      track?.stop();
    } catch (_) {}
    if (stream) {
      for (const currentTrack of stream.getTracks()) {
        if (currentTrack !== track) {
          try {
            currentTrack.stop();
          } catch (_) {}
        }
      }
    }
    await replaceVideoTrack(currentOutgoingVideoTrack());
    syncMediaButtons();
  }

  function connectSocket() {
    return new Promise((resolve, reject) => {
      if (S.socket?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }
      S.intentionalDisconnect = false;
      const ws = new WebSocket(CONFIG.signalingUrl);
      S.socket = ws;
      const timer = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          try {
            ws.close();
          } catch (_) {}
          reject(new Error('Velos Room server is not reachable.'));
        }
      }, 7000);

      ws.addEventListener(
        'open',
        () => {
          clearTimeout(timer);
          startHeartbeat();
          resolve();
        },
        { once: true }
      );
      ws.addEventListener('message', onSocketMessage);
      ws.addEventListener('close', () => {
        clearTimeout(timer);
        stopHeartbeat();
        if (!S.intentionalDisconnect && S.joined) {
          status('Connection lost', 'bad');
        }
      });
      ws.addEventListener('error', () => {
        if (ws.readyState !== WebSocket.OPEN) status('Connection error', 'bad');
      });
    });
  }

  function send(data) {
    if (S.socket?.readyState !== WebSocket.OPEN) return false;
    try {
      S.socket.send(JSON.stringify(data));
      return true;
    } catch (_) {
      return false;
    }
  }

  function startHeartbeat() {
    stopHeartbeat();
    S.heartbeat = setInterval(
      () => send({ type: 'ping', at: Date.now() }),
      20000
    );
  }

  function stopHeartbeat() {
    if (S.heartbeat) clearInterval(S.heartbeat);
    S.heartbeat = null;
  }

  function applyRoomSnapshot(room) {
    if (!room) return;
    S.roomId = room.id || S.roomId;
    S.leadId = room.leadId || room.hostId || S.leadId;
    S.seatMax = Number.isFinite(room.seats?.max)
      ? room.seats.max
      : S.seatMax;
    S.stats = { ...S.stats, ...(room.stats || {}) };
    if (room.state) S.state = room.state;
    S.pendingRequests = room.pendingRequests || [];
    if (Array.isArray(room.participants)) {
      S.participants.clear();
      for (const participant of room.participants) {
        S.participants.set(participant.id, participant);
      }
    }
  }

  async function onSocketMessage(ev) {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch (_) {
      return;
    }

    if (msg.type === 'joined') {
      S.selfId = msg.selfId;
      applyRoomSnapshot(msg.room);
      S.joined = true;
      showMeeting();
      updateHeader();
      renderPeople();
      renderKudosTargets();
      renderPulse();
      renderBoard();
      status('Connected');
      return;
    }

    if (msg.type === 'peer-joined') {
      applyRoomSnapshot(msg.room);
      if (msg.participant) {
        S.participants.set(msg.participant.id, msg.participant);
      }
      S.leadId = msg.leadId || msg.hostId || S.leadId;
      renderPeople();
      renderKudosTargets();
      renderPulse();
      renderBoard();
      updateHeader();
      try {
        const peer = ensurePeer(msg.participant.id);
        const offer = await peer.pc.createOffer();
        await peer.pc.setLocalDescription(offer);
        signal(msg.participant.id, { description: peer.pc.localDescription });
      } catch (err) {
        console.error(err);
      }
      return;
    }

    if (msg.type === 'peer-left') {
      closePeer(msg.peerId);
      applyRoomSnapshot(msg.room);
      S.participants.delete(msg.peerId);
      S.leadId = msg.leadId || msg.hostId || '';
      renderPeople();
      renderKudosTargets();
      renderPulse();
      renderBoard();
      updateHeader();
      return;
    }

    if (msg.type === 'signal') {
      await handleSignal(msg.fromId, msg.signal);
      return;
    }

    if (msg.type === 'state-sync' || msg.type === 'state-request') {
      applyRoomSnapshot(msg.room);
      renderPeople();
      renderBoard();
      updateHeader();
      if (msg.type === 'state-sync') {
        status(
          msg.reason === 'request-denied'
            ? 'Lead declined a board request'
            : `Board v${S.state.version}`
        );
      } else if (!isLead()) {
        status('Board request sent to Lead', 'warn');
      }
      return;
    }

    if (msg.type === 'room-event') {
      if (msg.stats) S.stats = { ...S.stats, ...msg.stats };
      handleRoomEvent(msg.eventType, msg.data);
      return;
    }

    if (msg.type === 'room-full') {
      const cap = Number.isFinite(msg.maxParticipants)
        ? msg.maxParticipants
        : S.seatMax;
      status(`Room full (${cap})`, 'bad');
      return;
    }

    if (msg.type === 'room-ended') {
      status(`Ended by ${msg.by?.name || 'lead'}`, 'warn');
      leaveRoom({ preserveStatus: true });
      return;
    }

    if (msg.type === 'error') {
      status(msg.message || 'Room error', 'bad');
    }
  }

  function signal(targetId, signalData) {
    send({ type: 'signal', targetId, signal: signalData });
  }

  function ensurePeer(peerId) {
    if (S.peers.has(peerId)) return S.peers.get(peerId);

    const pc = new RTCPeerConnection(CONFIG.rtcConfig);
    const peer = {
      id: peerId,
      pc,
      remoteStream: new MediaStream(),
      queued: []
    };
    S.peers.set(peerId, peer);

    if (S.localStream) {
      const outgoingVideo = currentOutgoingVideoTrack();
      for (const track of S.localStream.getTracks()) {
        if (track.kind === 'video') {
          // Late-joining peers must see whatever is currently outgoing
          // (screen share or camera), never a stale/hidden camera track.
          const sender = pc.addTrack(outgoingVideo || track, S.localStream);
          sender.__velosVideo = true;
          if (!outgoingVideo) void sender.replaceTrack(null);
          else if (outgoingVideo !== track) void sender.replaceTrack(outgoingVideo);
        } else {
          pc.addTrack(track, S.localStream);
        }
      }
      // If screen-sharing and the camera track was never added above
      // (because we substituted it with the screen track), make sure a
      // dedicated video sender exists carrying the screen track too.
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) signal(peerId, { candidate: event.candidate });
    };

    pc.ontrack = (event) => {
      const source = event.streams?.[0];
      if (source) {
        for (const track of source.getTracks()) {
          if (!peer.remoteStream.getTracks().some((cur) => cur.id === track.id)) {
            peer.remoteStream.addTrack(track);
          }
        }
      } else if (
        !peer.remoteStream.getTracks().some((cur) => cur.id === event.track.id)
      ) {
        peer.remoteStream.addTrack(event.track);
      }
      attachRemote(peerId, peer.remoteStream);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected') {
        // Transient network blip: give ICE a chance to recover before
        // tearing the connection down (avoids flapping tiles).
        setTimeout(() => {
          if (pc.connectionState === 'disconnected') {
            try {
              pc.restartIce();
            } catch (_) {}
          }
        }, 2000);
        return;
      }
      if (['failed', 'closed'].includes(pc.connectionState)) closePeer(peerId);
    };

    return peer;
  }

  async function handleSignal(fromId, signalData) {
    if (!fromId || !signalData) return;
    const peer = ensurePeer(fromId);
    try {
      if (signalData.description) {
        const description = new RTCSessionDescription(signalData.description);
        await peer.pc.setRemoteDescription(description);
        for (const candidate of peer.queued.splice(0)) {
          try {
            await peer.pc.addIceCandidate(candidate);
          } catch (_) {}
        }
        if (description.type === 'offer') {
          const answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);
          signal(fromId, { description: peer.pc.localDescription });
        }
        return;
      }
      if (signalData.candidate) {
        const candidate = new RTCIceCandidate(signalData.candidate);
        if (peer.pc.remoteDescription) {
          await peer.pc.addIceCandidate(candidate);
        } else {
          peer.queued.push(candidate);
        }
      }
    } catch (err) {
      console.error('WebRTC error', err);
    }
  }

  function attachRemote(peerId, stream) {
    let tile = document.querySelector(`.vr-tile[data-peer="${esc(peerId)}"]`);
    if (!tile) {
      tile = document.createElement('article');
      tile.className = 'vr-tile';
      tile.dataset.peer = peerId;
      tile.innerHTML = `
<video autoplay playsinline></video>
<div class="vr-tilebar">
  <div class="vr-chip vr-peer-name">Participant</div>
  <div class="vr-chip vr-peer-state">● Live</div>
</div>`;
      E.grid.appendChild(tile);
    }

    const participant = S.participants.get(peerId);
    tile.querySelector('.vr-peer-name').textContent =
      participant?.name || 'Participant';
    tile.querySelector('.vr-peer-state').textContent = participant?.raised
      ? '✋ Raised'
      : participant?.role === 'lead'
        ? '★ Lead'
        : '● Live';
    tile.classList.toggle('speaker', S.state.currentSpeakerId === peerId);

    const video = tile.querySelector('video');
    if (video.srcObject !== stream) {
      video.srcObject = stream;
      void video.play().catch(() => {});
    }
  }

  function closePeer(peerId) {
    const peer = S.peers.get(peerId);
    if (peer) {
      try {
        peer.pc.close();
      } catch (_) {}
      for (const track of peer.remoteStream.getTracks()) {
        try {
          track.stop();
        } catch (_) {}
      }
      S.peers.delete(peerId);
    }
    document.querySelector(`.vr-tile[data-peer="${esc(peerId)}"]`)?.remove();
  }

  function closePeers() {
    for (const peerId of [...S.peers.keys()]) closePeer(peerId);
  }

  function sendChat() {
    const text = String(E.chatInput.value || '').trim().slice(0, 800);
    if (!S.joined || !text) return;
    send({ type: 'room-event', eventType: 'chat', data: { text } });
    E.chatInput.value = '';
  }

  function react(reaction) {
    if (!S.joined) return;
    send({ type: 'room-event', eventType: 'reaction', data: { reaction } });
  }

  function toggleRaise() {
    if (!S.joined) return;
    S.raised = !S.raised;
    E.raise.classList.toggle('active', S.raised);
    E.raise.textContent = S.raised ? '✋ Raised' : '✋ Raise';
    send({
      type: 'room-event',
      eventType: 'raise-hand',
      data: { raised: S.raised }
    });
  }

  function giveKudos() {
    const targetId = E.kudosTarget.value;
    const kind = E.kudosKind.value;
    if (!S.joined || !targetId || targetId === S.selfId || !CLIENT_KUDOS[kind]) {
      status('Choose another participant', 'warn');
      return;
    }
    send({
      type: 'room-event',
      eventType: 'kudos',
      data: { targetId, kind }
    });
  }

  function propose(action, payload) {
    if (!S.joined) return;
    if (isLead()) {
      send({ type: 'state-action', action, payload });
      return;
    }
    send({ type: 'state-request', action, payload });
    status('Request sent to Lead', 'warn');
  }

  function handleRoomEvent(type, data) {
    if (type === 'chat') {
      appendChat(data.fromName, data.text);
      renderPulse();
      return;
    }
    if (type === 'reaction') {
      floatReaction(data.reaction);
      renderPulse();
      return;
    }
    if (type === 'raise-hand') {
      const participant = S.participants.get(data.fromId);
      if (participant) {
        participant.raised = !!data.raised;
        S.participants.set(participant.id, participant);
      }
      if (data.fromId === S.selfId) S.raised = !!data.raised;
      const tile = document.querySelector(
        `.vr-tile[data-peer="${esc(data.fromId)}"]`
      );
      const chip = tile?.querySelector('.vr-peer-state');
      if (chip) chip.textContent = data.raised ? '✋ Raised' : '● Live';
      renderPeople();
      return;
    }
    if (type === 'kudos') {
      const participant = S.participants.get(data.targetId);
      if (participant) {
        participant.points = data.totalPoints;
        participant.kudosReceived = data.kudosReceived;
        participant.badges = data.badges || [];
        S.participants.set(participant.id, participant);
      }
      appendKudos(data);
      floatReaction(data.emoji || '🎁');
      renderPeople();
      renderKudosTargets();
      renderPulse();
    }
  }

  function appendChat(name, text) {
    const item = document.createElement('div');
    item.className = 'vr-msg';
    const who = document.createElement('span');
    who.className = 'vr-who';
    who.textContent = `${name}: `;
    item.append(who, document.createTextNode(text));
    E.chat.appendChild(item);
    while (E.chat.children.length > 80) E.chat.firstElementChild?.remove();
    E.chat.scrollTop = E.chat.scrollHeight;
  }

  function appendKudos(data) {
    const item = document.createElement('div');
    item.className = 'vr-kudos-item';
    item.textContent = `${data.emoji || '🎁'} ${data.fromName} → ${data.targetName}: ${data.label} (+${data.pointsAdded})`;
    E.kudosFeed.prepend(item);
    while (E.kudosFeed.children.length > 30) E.kudosFeed.lastElementChild?.remove();
  }

  function floatReaction(reaction) {
    const element = document.createElement('div');
    element.className = 'vr-float-item';
    element.textContent = reaction;
    element.style.left = `${20 + Math.random() * 60}%`;
    element.style.setProperty(
      '--drift',
      `${Math.round(-100 + Math.random() * 200)}px`
    );
    E.float.appendChild(element);
    setTimeout(() => element.remove(), 2400);
  }

  function renderPeople() {
    E.people.replaceChildren();
    const list = [...S.participants.values()];
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'vr-sub';
      empty.textContent = S.joined
        ? 'Waiting for teammates…'
        : 'Join a room to see participants.';
      E.people.appendChild(empty);
      return;
    }

    for (const participant of list) {
      const row = document.createElement('div');
      row.className = 'vr-person';
      const avatar = document.createElement('div');
      avatar.className = 'vr-avatar';
      avatar.textContent = (participant.name?.[0] || '?').toUpperCase();
      const main = document.createElement('div');
      main.className = 'vr-person-main';
      const name = document.createElement('div');
      name.className = 'vr-person-name';
      name.textContent = [
        participant.name,
        participant.id === S.selfId ? '(you)' : '',
        participant.role === 'lead' ? '★' : '',
        participant.raised ? '✋' : '',
        S.state.currentSpeakerId === participant.id ? '🎤' : ''
      ]
        .filter(Boolean)
        .join(' ');
      const meta = document.createElement('div');
      meta.className = 'vr-person-meta';
      const badge = Array.isArray(participant.badges)
        ? participant.badges[participant.badges.length - 1]
        : '';
      meta.textContent = `${participant.role || 'peer'} · ${participant.points || 0} warmth pts${badge ? ` · ${badge}` : ''}`;
      main.append(name, meta);
      row.append(avatar, main);

      if (isLead() && participant.id !== S.selfId) {
        const speak = document.createElement('button');
        speak.className = 'vr-btn';
        speak.textContent =
          S.state.currentSpeakerId === participant.id ? 'Clear' : 'Spot';
        speak.onclick = () =>
          propose(STATE_ACTIONS.SET_SPEAKER, {
            speakerId:
              S.state.currentSpeakerId === participant.id ? '' : participant.id
          });
        row.append(speak);
      }

      E.people.appendChild(row);
    }
  }

  function renderBoard() {
    const state = S.state || defaultBoard();
    E.stateVersion.textContent = String(state.version || 0);
    E.stateMeta.textContent = state.updatedByName
      ? `${state.lastAction || 'SYNC'} by ${state.updatedByName}`
      : isLead()
        ? 'You are Lead. Your actions update every client.'
        : 'Peer mode. Toggles send a request to the Lead.';

    if (document.activeElement !== E.agenda) {
      E.agenda.value = state.agenda || '';
    }
    if (document.activeElement !== E.mood) {
      E.mood.value = MOODS.includes(state.mood) ? state.mood : 'neutral';
    }

    E.flags.replaceChildren();
    const labels = {
      recording: 'Recording',
      focusMode: 'Focus mode',
      whiteboardOpen: 'Whiteboard',
      agendaLocked: 'Lock agenda',
      doorsClosed: 'Doors closed'
    };

    for (const [key, value] of Object.entries(state.flags || {})) {
      const row = document.createElement('div');
      row.className = 'vr-flag';
      const label = document.createElement('span');
      label.textContent = `${value ? '●' : '○'} ${labels[key] || key}`;
      const button = document.createElement('button');
      button.className = `vr-btn${value ? ' active' : ''}`;
      button.textContent = isLead() ? (value ? 'On' : 'Off') : 'Ask';
      button.onclick = () =>
        propose(STATE_ACTIONS.SET_FLAG, { key, value: !value });
      row.append(label, button);
      E.flags.appendChild(row);
    }

    const reset = document.createElement('button');
    reset.className = 'vr-btn danger';
    reset.style.gridColumn = '1 / -1';
    reset.textContent = isLead() ? 'Reset board' : 'Ask Lead to reset';
    reset.onclick = () => propose(STATE_ACTIONS.RESET_BOARD, {});
    E.flags.appendChild(reset);

    E.requests.replaceChildren();
    if (isLead() && S.pendingRequests.length) {
      const heading = document.createElement('div');
      heading.className = 'vr-heading';
      heading.textContent = 'Peer requests';
      E.requests.appendChild(heading);
      for (const request of S.pendingRequests) {
        const card = document.createElement('div');
        card.className = 'vr-req';
        card.textContent = `${request.fromName} asks ${request.action}`;
        const row = document.createElement('div');
        row.className = 'vr-row';
        const yes = document.createElement('button');
        yes.className = 'vr-btn primary vr-grow';
        yes.textContent = 'Approve';
        yes.onclick = () =>
          send({
            type: 'resolve-request',
            requestId: request.id,
            approve: true
          });
        const no = document.createElement('button');
        no.className = 'vr-btn vr-grow';
        no.textContent = 'Deny';
        no.onclick = () =>
          send({
            type: 'resolve-request',
            requestId: request.id,
            approve: false
          });
        row.append(yes, no);
        card.appendChild(row);
        E.requests.appendChild(card);
      }
    }

    document.querySelectorAll('.vr-tile').forEach((tile) => {
      tile.classList.toggle(
        'speaker',
        tile.dataset.peer === state.currentSpeakerId ||
          (tile.dataset.peer === 'local' && state.currentSpeakerId === S.selfId)
      );
    });
  }

  function renderKudosTargets() {
    const selected = E.kudosTarget.value;
    E.kudosTarget.replaceChildren();
    const first = document.createElement('option');
    first.value = '';
    first.textContent = 'Choose teammate';
    E.kudosTarget.appendChild(first);
    for (const participant of S.participants.values()) {
      if (participant.id === S.selfId) continue;
      const option = document.createElement('option');
      option.value = participant.id;
      option.textContent = participant.name;
      E.kudosTarget.appendChild(option);
    }
    if (selected && S.participants.has(selected)) {
      E.kudosTarget.value = selected;
    }
    E.kudosSend.disabled = E.kudosTarget.options.length <= 1;
  }

  // --- Team Pulse energy model -----------------------------------------
  // A bounded, monotonic composite of three normalized sub-scores so the
  // number never overshoots 100 and never depends on call order:
  //   base(35) + weighted, individually-capped contributions from
  //   kudos, reactions, and chat activity. Each term is capped BEFORE
  // summation so no single channel can dominate or overflow the metric.
  const PULSE = Object.freeze({
    base: 35,
    kudosWeight: 4,
    kudosCap: 40, // max +40 from kudos (10 kudos)
    reactionWeight: 1.4,
    reactionCap: 25, // max +25 from reactions
    chatWeight: 0.6,
    chatCap: 18 // max +18 from chat volume
  });

  function renderPulse() {
    const participants = [...S.participants.values()];
    const recognized = participants.filter(
      (participant) => Number(participant.kudosReceived || 0) > 0
    ).length;
    const kudos = Math.max(0, Number(S.stats.kudos || 0));
    const reactions = Math.max(0, Number(S.stats.reactions || 0));
    const chats = Math.max(0, Number(S.stats.chats || 0));

    const kudosScore = Math.min(PULSE.kudosCap, kudos * PULSE.kudosWeight);
    const reactionScore = Math.min(
      PULSE.reactionCap,
      reactions * PULSE.reactionWeight
    );
    const chatScore = Math.min(PULSE.chatCap, chats * PULSE.chatWeight);

    const energy = Math.max(
      0,
      Math.min(
        100,
        Math.round(PULSE.base + kudosScore + reactionScore + chatScore)
      )
    );

    E.energy.textContent = `${energy}%`;
    E.energyBar.style.width = `${energy}%`;
    E.recognized.textContent = participants.length
      ? `${recognized}/${participants.length}`
      : '0';
    E.kudosCount.textContent = String(kudos);
    const quest = Math.min(10, kudos);
    E.quest.textContent = `${quest} / 10`;
    E.questBar.style.width = `${(quest / 10) * 100}%`;
  }

  function updateHeader() {
    if (!S.joined) {
      E.title.textContent = 'Lead + 8 peer collaboration room';
      E.codeLabel.textContent = 'Not connected';
      E.invite.hidden = true;
      E.end.hidden = true;
      return;
    }
    E.title.textContent = `Velos Room · ${S.roomId}`;
    E.codeLabel.textContent = `Room ${S.roomId} · ${S.participants.size}/${S.seatMax} · ${isLead() ? 'You are Lead' : 'Peer'}`;
    E.invite.hidden = false;
    E.end.hidden = !isLead();
    const me = S.participants.get(S.selfId);
    if (me && isLead()) me.role = 'lead';
  }

  async function copyInvite() {
    if (!S.roomId) return;
    const url = new URL(location.href);
    url.searchParams.set('room', S.roomId);
    try {
      await navigator.clipboard.writeText(url.toString());
      status('Invite link copied');
    } catch (_) {
      prompt('Copy invitation link:', url.toString());
    }
  }

  function endRoom() {
    if (!S.joined || !isLead()) return;
    if (confirm('End this Velos Room for everyone?')) {
      send({ type: 'host-action', action: 'end-room' });
    }
  }

  function cleanupOwnedTracks() {
    for (const track of S.ownedTracks) {
      try {
        track.stop();
      } catch (_) {}
    }
    S.ownedTracks.clear();
    S.localStream = null;
    S.cameraTrack = null;
    S.micTrack = null;
    if (E.localVideo) E.localVideo.srcObject = null;
  }

  function leaveRoom({ preserveStatus = false } = {}) {
    S.intentionalDisconnect = true;
    stopHeartbeat();
    void stopScreen();
    closePeers();
    if (S.socket) {
      try {
        S.socket.close(1000, 'Left room');
      } catch (_) {}
    }
    S.socket = null;
    S.joined = false;
    S.selfId = '';
    S.leadId = '';
    S.raised = false;
    S.participants.clear();
    S.state = defaultBoard();
    S.pendingRequests = [];
    S.stats = { kudos: 0, reactions: 0, chats: 0, actions: 0, requests: 0 };
    cleanupOwnedTracks();
    E.chat.replaceChildren();
    E.kudosFeed.replaceChildren();
    renderPeople();
    renderKudosTargets();
    renderPulse();
    renderBoard();
    updateHeader();
    showJoin();
    if (!preserveStatus) status('Ready');
  }

  function cleanup() {
    S.intentionalDisconnect = true;
    stopHeartbeat();
    closePeers();
    if (S.socket) {
      try {
        S.socket.close();
      } catch (_) {}
    }
    try {
      S.screenTrack?.stop();
    } catch (_) {}
    cleanupOwnedTracks();
  }

  function exposeAPI() {
    global.VelosRoom = Object.freeze({
      open,
      close,
      join: async ({ name, roomId, role = 'peer' }) => {
        E.name.value = name || '';
        E.room.value = roomId || '';
        E.role.value = role;
        await joinFromForm();
      },
      leave: () => leaveRoom(),
      react,
      raiseHand: () => {
        if (!S.raised) toggleRaise();
      },
      lowerHand: () => {
        if (S.raised) toggleRaise();
      },
      giveKudos: (targetId, kind = 'helpful') => {
        if (!S.joined || !targetId || targetId === S.selfId || !CLIENT_KUDOS[kind]) {
          return false;
        }
        return send({
          type: 'room-event',
          eventType: 'kudos',
          data: { targetId, kind }
        });
      },
      propose,
      getState: () => ({
        joined: S.joined,
        roomId: S.roomId,
        selfId: S.selfId,
        leadId: S.leadId,
        isLead: isLead(),
        board: { ...S.state, flags: { ...S.state.flags } },
        pendingRequests: [...S.pendingRequests],
        participants: [...S.participants.values()].map((p) => ({ ...p })),
        stats: { ...S.stats }
      })
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);