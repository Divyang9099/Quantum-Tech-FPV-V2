import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { API_ORIGIN, post, refresh, setOnLogout, setToken } from './api';
import { useToast } from './ui';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const qc = useQueryClient();
  const toast = useToast();
  const sock = useRef(null);

  const logout = async (call = true) => {
    if (call) await post('/auth/logout').catch(() => {});
    setToken(null); setUser(null); qc.clear();
  };
  useEffect(() => { setOnLogout(() => logout(false)); });

  useEffect(() => {
    refresh().then((d) => d && setUser(d.user)).finally(() => setReady(true));
  }, []);

  // One socket per login. Events refresh the relevant data and show a small toast.
  useEffect(() => {
    if (!user) return undefined;
    let dead = false;
    const recent = new Map();
    refresh().then((d) => {
      if (!d || dead) return;
      const s = io(API_ORIGIN, { auth: { token: d.token } });
      sock.current = s;
      s.on('connect', () => setConnected(true));
      s.on('disconnect', () => setConnected(false));
      const bump = (keys) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      // Ignore an identical event delivered twice within 2 s (e.g. after a reconnect).
      const on = (ev, fn) => s.on(ev, (p) => {
        const key = ev + JSON.stringify(p);
        if (Date.now() - (recent.get(key) || 0) < 2000) return;
        recent.set(key, Date.now());
        setLastEvent({ ev, p, at: Date.now() });
        fn(p);
      });
      const BK = ['bookings', 'dashboard', 'availability', 'notifications', 'booking-stats'];
      on('booking.created', (p) => { bump(BK); toast(`New booking ${p.bookingId} · ${p.pilotCode} · ${p.source === 'website' ? 'from the website' : p.source}`, 'live-t'); });
      on('booking.stageChanged', (p) => { bump(BK); toast(`${p.bookingId} moved to ${p.stage.replace(/_/g, ' ')}`, 'live-t'); });
      on('booking.cancelled', (p) => { bump(BK); toast(`${p.bookingId} was cancelled`, 'live-t'); });
      on('availability.changed', () => bump(['availability', 'dashboard']));
      on('enquiry.created', (p) => { bump(['enquiries', 'dashboard', 'notifications']); toast(`New enquiry ${p.refNo}`, 'live-t'); });
      on('notification.new', () => bump(['notifications']));
    });
    return () => { dead = true; sock.current?.disconnect(); sock.current = null; setConnected(false); };
  }, [user?.id]);

  const login = async (email, password) => {
    const d = await post('/auth/login', { email, password });
    setToken(d.token); setUser(d.user);
  };

  return <Ctx.Provider value={{ user, ready, login, logout, connected, lastEvent }}>{children}</Ctx.Provider>;
}
