'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { MessageSquare, Plus, Send, Download, PencilLine, Trash2, MoreHorizontal, ChevronDown } from 'lucide-react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useAuthStore } from '../../store/authStore';
import { createSupabaseBrowserClient } from '../../lib/supabase/browser';
import { apiFetch } from '../../lib/apiClient';
import { normalizeUserRow } from '../../utils/userMapper';
import { formatTimestamp } from '../../utils/timeUtils';
import { getUserRole, isManagerRole } from '../../utils/role';

type ChatRoom = {
  id: string;
  name: string;
  organizationId: string;
  createdAt: string;
};

type ChatMessage = {
  id: string;
  roomId: string;
  organizationId: string;
  authorAuthUserId: string;
  body: string;
  createdAt: string;
};

type UserLookup = {
  name: string;
  initials: string;
};

const mapRowToChatMessage = (row: Record<string, any>): ChatMessage => ({
  id: row.id,
  roomId: row.room_id,
  organizationId: row.organization_id,
  authorAuthUserId: row.author_auth_user_id,
  body: row.body,
  createdAt: row.created_at,
});

export default function ChatPage() {
  const router = useRouter();
  const { currentUser, activeRestaurantId, init, isInitialized } = useAuthStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);
  const headerRowRef = useRef<HTMLDivElement>(null);
  const composerRowRef = useRef<HTMLFormElement>(null);
  const roomTriggerRef = useRef<HTMLButtonElement | null>(null);
  const longPressTimeoutRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const messageIdsRef = useRef<Set<string>>(new Set());
  const isNearBottomRef = useRef(true);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [usersByAuthId, setUsersByAuthId] = useState<Record<string, UserLookup>>({});
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameRoomId, setRenameRoomId] = useState<string | null>(null);
  const [renameRoomName, setRenameRoomName] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showRoomsDropdown, setShowRoomsDropdown] = useState(false);
  const [isRoomsDropdownMounted, setIsRoomsDropdownMounted] = useState(false);
  const [isRoomsDropdownClosing, setIsRoomsDropdownClosing] = useState(false);
  const [roomsDropdownPosition, setRoomsDropdownPosition] = useState({ top: 0, left: 0, width: 320 });
  const [error, setError] = useState('');
  const role = getUserRole(currentUser?.role);
  const isManager = isManagerRole(role);
  const canManageRooms = role === 'ADMIN' || isManager;
  const isDev = process.env.NODE_ENV !== 'production';
  const DEBUG_CHAT_LAYOUT = false;
  const shouldDebugLayout = isDev && DEBUG_CHAT_LAYOUT;
  const supabaseClient = useMemo(() => createSupabaseBrowserClient(), []);
  const [debugSnapshot, setDebugSnapshot] = useState({
    windowScrollY: 0,
    messagesScrollTop: 0,
    shellOverflowY: 'n/a',
    contentOverflowY: 'n/a',
    panelOverflowY: 'n/a',
    messagesOverflowY: 'n/a',
    headerOverflowY: 'n/a',
    composerOverflowY: 'n/a',
  });

  const handleIncomingMessage = useCallback(
    (payload: RealtimePostgresChangesPayload<Record<string, any>>, roomId: string | null) => {
      const row = payload.new as Record<string, any>;
      if (!row?.id) return;
      if (messageIdsRef.current.has(row.id)) return;
      messageIdsRef.current.add(row.id);
      const incoming = mapRowToChatMessage(row);
      setMessages((prev) => {
        const next = [...prev, incoming];
        next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return next;
      });
      if (!isNearBottomRef.current) {
        setUnreadCount((count) => count + 1);
      }

      if (isDev) {
        console.debug(`[chat] room ${roomId ?? 'unknown'} realtime INSERT`, incoming);
      }
    },
    [isDev]
  );

  const loadRooms = async (organizationId: string) => {
    setLoadingRooms(true);
    const { data, error: roomsError } = (await supabaseClient
      .from('chat_rooms')
      .select('id,name,organization_id,created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true })) as {
        data: Array<Record<string, any>> | null;
        error: { message: string } | null;
      };

    if (roomsError) {
      setError(roomsError.message);
      setLoadingRooms(false);
      return;
    }

    const mapped = (data || []).map((room) => ({
      id: room.id,
      name: room.name,
      organizationId: room.organization_id,
      createdAt: room.created_at,
    }));

    setRooms(mapped);
    setLoadingRooms(false);
    if (!activeRoomId && mapped.length > 0) {
      setActiveRoomId(mapped[0].id);
    }
  };

  const loadMessages = useCallback(async (roomId: string) => {
    setLoadingMessages(true);
    const { data, error: messagesError } = (await supabaseClient
      .from('chat_messages')
      .select('id,room_id,organization_id,author_auth_user_id,body,created_at')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })) as {
        data: Array<Record<string, any>> | null;
        error: { message: string } | null;
      };

    if (messagesError) {
      setError(messagesError.message);
      setLoadingMessages(false);
      return;
    }

    const mapped = (data || []).map(mapRowToChatMessage);

    messageIdsRef.current = new Set(mapped.map((msg) => msg.id));
    setMessages(mapped);
    setUnreadCount(0);
    setLoadingMessages(false);
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    });
  }, [supabaseClient]);

  const loadUsers = async (organizationId: string) => {
    const { data, error: usersError } = (await supabaseClient
      .from('users')
      .select('*')
      .eq('organization_id', organizationId)) as {
        data: Array<Record<string, any>> | null;
        error: { message: string } | null;
      };

    if (usersError) return;

    const lookup: Record<string, UserLookup> = {};
    (data || []).forEach((row) => {
      const normalized = normalizeUserRow(row);
      const name = normalized.fullName || normalized.email || 'Team Member';
      const initials = name
        .split(' ')
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
      if (normalized.authUserId) {
        lookup[normalized.authUserId] = { name, initials };
      }
    });
    setUsersByAuthId(lookup);
  };

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (isInitialized && !currentUser) {
      router.push('/login');
    }
  }, [isInitialized, currentUser, router]);

  useEffect(() => {
    if (activeRestaurantId && currentUser) {
      loadRooms(activeRestaurantId);
      loadUsers(activeRestaurantId);
    }
  }, [activeRestaurantId, currentUser]);

  useEffect(() => {
    messageIdsRef.current = new Set();
    setMessages([]);
    setUnreadCount(0);
    isNearBottomRef.current = true;

    if (!activeRoomId) {
      setLoadingMessages(false);
      return;
    }

    loadMessages(activeRoomId);

    const channel = supabaseClient.channel(`chat-room-${activeRoomId}`);
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `room_id=eq.${activeRoomId}`,
      },
      (payload: RealtimePostgresChangesPayload<Record<string, any>>) => {
        handleIncomingMessage(payload, activeRoomId);
      }
    );

    channel.subscribe((status: string) => {
      if (isDev) {
        console.debug(`[chat] room ${activeRoomId} realtime status`, status);
        if (status === 'SUBSCRIBED') {
          console.debug(`[chat] room ${activeRoomId} realtime channel subscribed`);
        }
      }
    });

    // Realtime streaming must be enabled for `chat_messages` and the RLS policies
    // must allow org members to SELECT so events can flow through Supabase Realtime.
    return () => {
      void supabaseClient.removeChannel(channel);
    };
  }, [activeRoomId, handleIncomingMessage, isDev, loadMessages, supabaseClient]);

  useEffect(() => {
    if (!messageListRef.current) return;
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const updateRoomsDropdownPosition = useCallback(() => {
    const trigger = roomTriggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const desiredWidth = Math.min(Math.round(viewportWidth * 0.92), 260);
    const minLeft = 8;
    const maxLeft = Math.max(minLeft, viewportWidth - desiredWidth - 8);
    const nextLeft = Math.min(Math.max(rect.left, minLeft), maxLeft);
    setRoomsDropdownPosition({
      top: rect.bottom + 4,
      left: nextLeft,
      width: desiredWidth,
    });
  }, []);

  const openRoomsDropdown = useCallback(() => {
    updateRoomsDropdownPosition();
    setIsRoomsDropdownMounted(true);
    requestAnimationFrame(() => {
      setIsRoomsDropdownClosing(false);
      setShowRoomsDropdown(true);
    });
  }, [updateRoomsDropdownPosition]);

  const closeRoomsDropdown = useCallback(() => {
    setIsRoomsDropdownClosing(true);
    setShowRoomsDropdown(false);
  }, []);

  useEffect(() => {
    if (!showActionsMenu && !showRoomsDropdown) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowActionsMenu(false);
        closeRoomsDropdown();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showActionsMenu, showRoomsDropdown, closeRoomsDropdown]);

  useEffect(() => {
    if (!isRoomsDropdownClosing) return;
    const timeout = window.setTimeout(() => {
      setIsRoomsDropdownMounted(false);
      setIsRoomsDropdownClosing(false);
    }, 140);
    return () => window.clearTimeout(timeout);
  }, [isRoomsDropdownClosing]);

  useEffect(() => {
    if (!showRoomsDropdown) return;
    updateRoomsDropdownPosition();
    const handleResize = () => updateRoomsDropdownPosition();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [showRoomsDropdown, updateRoomsDropdownPosition]);

  useEffect(() => {
    if (!shouldDebugLayout) return;
    const html = document.documentElement;
    const body = document.body;
    const shell = document.querySelector('[data-chat-shell="true"]') as HTMLElement | null;
    const content = document.querySelector('[data-chat-content="true"]') as HTMLElement | null;
    const panel = chatPanelRef.current;
    const header = headerRowRef.current;
    const messages = messageListRef.current;
    const composer = composerRowRef.current;

    const styleEl = document.createElement('style');
    styleEl.textContent = `
      [data-chat-shell="true"],
      [data-chat-content="true"],
      [data-chat-debug] {
        outline: 2px dashed rgba(255, 99, 71, 0.7);
        outline-offset: -2px;
      }
      [data-chat-debug] {
        position: relative;
      }
      [data-chat-debug]::after {
        content: attr(data-chat-debug);
        position: absolute;
        top: 4px;
        left: 4px;
        font-size: 10px;
        line-height: 1;
        padding: 2px 6px;
        border-radius: 6px;
        background: rgba(0, 0, 0, 0.75);
        color: #fff;
        z-index: 9999;
        pointer-events: none;
      }
    `;
    document.head.appendChild(styleEl);
    html.style.outline = '2px solid rgba(0, 255, 255, 0.8)';
    body.style.outline = '2px dashed rgba(0, 255, 255, 0.8)';

    const updateSnapshot = () => {
      setDebugSnapshot({
        windowScrollY: window.scrollY,
        messagesScrollTop: messages?.scrollTop ?? 0,
        shellOverflowY: shell ? getComputedStyle(shell).overflowY : 'n/a',
        contentOverflowY: content ? getComputedStyle(content).overflowY : 'n/a',
        panelOverflowY: panel ? getComputedStyle(panel).overflowY : 'n/a',
        messagesOverflowY: messages ? getComputedStyle(messages).overflowY : 'n/a',
        headerOverflowY: header ? getComputedStyle(header).overflowY : 'n/a',
        composerOverflowY: composer ? getComputedStyle(composer).overflowY : 'n/a',
      });
    };

    const logScroll = (label: string) => () => {
      console.debug(`SCROLL: ${label}`);
      updateSnapshot();
    };

    const listeners: Array<{ el: EventTarget; handler: () => void }> = [];
    listeners.push({ el: window, handler: logScroll('window') });
    window.addEventListener('scroll', listeners[0].handler, { passive: true });

    if (messages) {
      const handler = logScroll('messagesList');
      messages.addEventListener('scroll', handler, { passive: true });
      listeners.push({ el: messages, handler });
    }

    if (messages) {
      let node: HTMLElement | null = messages.parentElement;
      while (node && node !== document.body) {
        const overflowY = getComputedStyle(node).overflowY;
        if (overflowY === 'auto' || overflowY === 'scroll') {
          const handler = logScroll(node.className || node.tagName.toLowerCase());
          node.addEventListener('scroll', handler, { passive: true });
          listeners.push({ el: node, handler });
        }
        node = node.parentElement;
      }
    }

    updateSnapshot();

    return () => {
      listeners.forEach(({ el, handler }) => el.removeEventListener('scroll', handler as EventListener));
      document.head.removeChild(styleEl);
      html.style.outline = '';
      body.style.outline = '';
    };
  }, [shouldDebugLayout]);

  const handleMessageScroll = () => {
    const el = messageListRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distance < 120;
    isNearBottomRef.current = nearBottom;
    if (nearBottom) {
      setUnreadCount(0);
    }
  };

  const activeRoom = rooms.find((room) => room.id === activeRoomId);

  const handleCreateRoom = async () => {
    if (!activeRestaurantId || !newRoomName.trim()) return;
    setError('');
    const result = await apiFetch<{ room: Record<string, any> }>('/api/chat/rooms/create', {
      method: 'POST',
      json: {
        organizationId: activeRestaurantId,
        name: newRoomName.trim(),
      },
    });

    if (!result.ok || !result.data?.room) {
      setError(result.error || 'Unable to create room.');
      return;
    }

    const room = result.data.room;
    const mapped: ChatRoom = {
      id: room.id,
      name: room.name,
      organizationId: room.organization_id,
      createdAt: room.created_at,
    };
    setRooms((prev) => [...prev, mapped]);
    setActiveRoomId(mapped.id);
    setNewRoomName('');
    setShowRoomModal(false);
  };

  const handleOpenRename = () => {
    if (!activeRoom || !canManageRooms) return;
    setRenameRoomId(activeRoom.id);
    setRenameRoomName(activeRoom.name);
    setShowRenameModal(true);
  };

  const handleOpenRenameForRoom = (room: ChatRoom) => {
    if (!canManageRooms) return;
    setRenameRoomId(room.id);
    setRenameRoomName(room.name);
    setShowRenameModal(true);
  };

  const cancelLongPress = () => {
    if (longPressTimeoutRef.current) {
      window.clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
    longPressStartRef.current = null;
  };

  const handleRoomPointerDown = (event: React.PointerEvent, room: ChatRoom) => {
    if (!canManageRooms) return;
    if (event.pointerType === 'mouse') return;
    longPressTriggeredRef.current = false;
    longPressStartRef.current = { x: event.clientX, y: event.clientY };
    cancelLongPress();
    longPressTimeoutRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      handleOpenRenameForRoom(room);
    }, 500);
  };

  const handleRoomPointerMove = (event: React.PointerEvent) => {
    if (!longPressStartRef.current) return;
    const dx = Math.abs(event.clientX - longPressStartRef.current.x);
    const dy = Math.abs(event.clientY - longPressStartRef.current.y);
    if (dx > 8 || dy > 8) {
      cancelLongPress();
    }
  };

  const handleRoomPointerEnd = () => {
    cancelLongPress();
  };

  const handleRenameRoom = async () => {
    const targetRoomId = renameRoomId ?? activeRoom?.id ?? null;
    if (!targetRoomId || !renameRoomName.trim()) return;
    setError('');
    const result = await apiFetch<{ room: Record<string, any> }>('/api/chat/rooms/update', {
      method: 'PATCH',
      json: {
        roomId: targetRoomId,
        name: renameRoomName.trim(),
      },
    });
    if (!result.ok || !result.data?.room) {
      setError(result.error || 'Unable to rename room.');
      return;
    }
    const updatedName = result.data.room.name ?? renameRoomName.trim();
    setRooms((prev) => prev.map((room) => (room.id === targetRoomId ? { ...room, name: updatedName } : room)));
    setShowRenameModal(false);
    setRenameRoomId(null);
  };

  const handleDeleteRoom = async () => {
    if (!activeRoom) return;
    setError('');
    const result = await apiFetch<{ success: boolean }>('/api/chat/rooms/delete', {
      method: 'DELETE',
      json: { roomId: activeRoom.id },
    });
    if (!result.ok) {
      setError(result.error || 'Unable to delete room.');
      return;
    }
    const remaining = rooms.filter((room) => room.id !== activeRoom.id);
    setRooms(remaining);
    setActiveRoomId(remaining[0]?.id ?? null);
    setShowDeleteModal(false);
  };

  const handleExport = async () => {
    if (!activeRoom) return;
    const response = await fetch(`/api/chat/rooms/export?roomId=${activeRoom.id}`, {
      credentials: 'include',
    });
    if (!response.ok) {
      setError('Unable to export CSV.');
      return;
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const filename = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '');
    link.download = filename || `chat-${activeRoom.name}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRestaurantId || !activeRoomId || !messageText.trim()) return;
    const result = await apiFetch<{ message: Record<string, any> }>('/api/chat/messages/send', {
      method: 'POST',
      json: {
        organizationId: activeRestaurantId,
        roomId: activeRoomId,
        body: messageText.trim(),
      },
    });
    if (!result.ok) {
      setError(result.error || 'Unable to send message.');
      return;
    }
    const message = result.data?.message;
    if (message?.id && !messageIdsRef.current.has(message.id)) {
      messageIdsRef.current.add(message.id);
      const mapped: ChatMessage = {
        id: message.id,
        roomId: message.room_id,
        organizationId: message.organization_id,
        authorAuthUserId: message.author_auth_user_id,
        body: message.body,
        createdAt: message.created_at,
      };
      setMessages((prev) => [...prev, mapped]);
      if (!isNearBottomRef.current) {
        setUnreadCount((count) => count + 1);
      }
    }
    setMessageText('');
  };

  const getUser = (authUserId: string) => usersByAuthId[authUserId] || { name: 'Team Member', initials: '?' };

  if (!isInitialized || !currentUser) {
    return (
      <div className="min-h-screen bg-theme-primary flex items-center justify-center">
        <p className="text-theme-secondary">Loading...</p>
      </div>
    );
  }

  const renderRoomsListItems = (compact: boolean) => (
    <>
      {loadingRooms ? (
        <p className="text-[11px] text-theme-muted">Loading rooms...</p>
      ) : rooms.length === 0 ? (
        <p className="text-[11px] text-theme-muted">No rooms yet.</p>
      ) : (
        rooms.map((room) => {
          const handleSelectRoom = () => {
            if (longPressTriggeredRef.current) {
              longPressTriggeredRef.current = false;
              return;
            }
            setActiveRoomId(room.id);
            closeRoomsDropdown();
          };

          return (
            <div
              key={room.id}
              role="button"
              tabIndex={0}
              onClick={handleSelectRoom}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleSelectRoom();
                }
              }}
              onPointerDown={(event) => handleRoomPointerDown(event, room)}
              onPointerMove={handleRoomPointerMove}
              onPointerUp={handleRoomPointerEnd}
              onPointerCancel={handleRoomPointerEnd}
              onPointerLeave={handleRoomPointerEnd}
              className={`group w-full text-left ${
                compact ? 'px-2 py-1 min-h-[32px] rounded-md text-sm' : 'px-2 py-1.5 min-h-[40px] rounded-lg text-[12px]'
              } transition-colors ${
                room.id === activeRoomId
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-theme-tertiary text-theme-secondary hover:bg-theme-hover'
              }`}
            >
            <div className={`flex items-center ${compact ? 'gap-1.5' : 'gap-2'}`}>
              <span className="flex-1 truncate">{room.name}</span>
              {canManageRooms && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleOpenRenameForRoom(room);
                  }}
                  className={`inline-flex items-center justify-center rounded-md ${
                    compact ? 'p-0.5' : 'p-1'
                  } text-theme-muted hover:text-theme-primary hover:bg-theme-hover md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100`}
                  aria-label="Rename room"
                >
                  <PencilLine className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            </div>
          );
        })
      )}
    </>
  );

  const roomsList = (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between sticky top-0 z-10 bg-theme-secondary/95 backdrop-blur pb-1">
        <div className="text-[11px] uppercase tracking-wide text-theme-muted">Rooms</div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto pt-1 space-y-1" onScroll={cancelLongPress}>
        {renderRoomsListItems(false)}
      </div>
    </div>
  );

  return (
    <div className="flex-1 h-full min-h-0 bg-theme-primary flex flex-col overflow-hidden" data-chat-debug="chat-page">
      <div className="flex flex-1 min-h-0 overflow-hidden" data-chat-debug="chat-shell">
        <aside className="hidden md:flex md:w-56 md:shrink-0 border-r border-theme-primary bg-theme-secondary p-2 overflow-hidden min-h-0">
          {roomsList}
        </aside>

        <main
          className="flex-1 min-h-0 flex flex-col h-full overflow-hidden relative"
          ref={chatPanelRef}
          data-chat-debug="chat-panel"
        >
          <div
            className="flex-none sticky top-0 z-20 bg-theme-secondary/95 backdrop-blur border-b border-white/5 px-4 py-3 flex items-center justify-between gap-2 relative"
            ref={headerRowRef}
            data-chat-debug="header-row"
          >
            <div className="flex items-center gap-2 text-theme-primary font-semibold min-w-0">
              <button
                type="button"
                onClick={() => {
                  if (showRoomsDropdown || isRoomsDropdownMounted) {
                    closeRoomsDropdown();
                  } else {
                    openRoomsDropdown();
                  }
                }}
                ref={roomTriggerRef}
                className="md:hidden inline-flex items-center gap-2 rounded-md border border-theme-primary bg-theme-secondary/90 px-2.5 py-1.5 text-left text-theme-primary shadow-sm hover:bg-theme-hover active:bg-theme-tertiary min-h-[32px] w-full max-w-[260px]"
                aria-haspopup="listbox"
                aria-expanded={showRoomsDropdown}
              >
                <MessageSquare className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {activeRoom?.name || 'Team Chat'}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-theme-muted shrink-0 transition-transform duration-150 ease-out ${
                    showRoomsDropdown && !isRoomsDropdownClosing ? 'rotate-180' : 'rotate-0'
                  }`}
                />
              </button>
              <span className="hidden md:inline truncate">{activeRoom?.name || 'Team Chat'}</span>
            </div>
            <div className="hidden md:flex items-center gap-2">
              {canManageRooms && (
                <button
                  onClick={() => setShowRoomModal(true)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors text-xs font-medium"
                >
                  <Plus className="w-4 h-4" />
                  New Room
                </button>
              )}
              {activeRoom && (
                <button
                  onClick={handleExport}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors text-xs font-medium"
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
              )}
              {canManageRooms && activeRoom && (
                <>
                  <button
                    onClick={handleOpenRename}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors text-xs font-medium"
                  >
                    <PencilLine className="w-4 h-4" />
                    Rename
                  </button>
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-xs font-medium"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </>
              )}
            </div>
            <div className="md:hidden flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowActionsMenu((prev) => !prev)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors text-xs font-medium"
                aria-expanded={showActionsMenu}
                aria-haspopup="menu"
              >
                <MoreHorizontal className="w-4 h-4" />
                Actions
              </button>
              {showActionsMenu && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-10"
                    onClick={() => setShowActionsMenu(false)}
                    aria-label="Close actions menu"
                  />
                  <div className="absolute right-4 top-full mt-2 z-20 w-48 rounded-xl border border-theme-primary bg-theme-secondary shadow-lg py-2">
                    {canManageRooms && (
                      <button
                        onClick={() => {
                          setShowRoomModal(true);
                          setShowActionsMenu(false);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-theme-secondary hover:bg-theme-hover"
                      >
                        <Plus className="w-4 h-4" />
                        New Room
                      </button>
                    )}
                    {activeRoom && (
                      <button
                        onClick={() => {
                          handleExport();
                          setShowActionsMenu(false);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-theme-secondary hover:bg-theme-hover"
                      >
                        <Download className="w-4 h-4" />
                        Export CSV
                      </button>
                    )}
                    {canManageRooms && activeRoom && (
                      <>
                        <button
                          onClick={() => {
                            handleOpenRename();
                            setShowActionsMenu(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-xs text-theme-secondary hover:bg-theme-hover"
                        >
                          <PencilLine className="w-4 h-4" />
                          Rename
                        </button>
                        <button
                          onClick={() => {
                            setShowDeleteModal(true);
                            setShowActionsMenu(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <div
            ref={messageListRef}
            onScroll={handleMessageScroll}
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-4"
            style={{ WebkitOverflowScrolling: 'touch' }}
            data-chat-debug="messages-list"
          >
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-3 text-sm">
                {error}
              </div>
            )}
            {!activeRoom && !loadingRooms ? (
              <div className="flex items-center justify-center h-full text-theme-muted">
                <p>Select or create a chat room.</p>
              </div>
            ) : loadingMessages ? (
              <div className="flex items-center justify-center h-full text-theme-muted">
                <p>Loading messages...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-theme-muted">
                <p>No messages yet. Start the conversation!</p>
              </div>
            ) : (
              messages.map((msg) => {
                const author = getUser(msg.authorAuthUserId);
                const isMe = msg.authorAuthUserId === currentUser.authUserId;
                const displayName = isMe ? 'You' : author.name;
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex items-end gap-2 max-w-[70%] ${isMe ? 'flex-row-reverse' : ''}`}>
                      <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-semibold">
                        {author.initials}
                      </div>
                      <div>
                        <p className={`text-xs text-theme-muted mb-1 ${isMe ? 'text-right mr-1' : 'ml-1'}`}>
                          {displayName}
                        </p>
                        <div
                          className={`px-4 py-2 rounded-2xl ${
                            isMe
                              ? 'bg-amber-500 text-zinc-900 rounded-br-md'
                              : 'bg-theme-secondary text-theme-primary rounded-bl-md'
                          }`}
                        >
                          <p className="text-sm">{msg.body}</p>
                        </div>
                        <p className={`text-xs text-theme-muted mt-1 ${isMe ? 'text-right mr-1' : 'ml-1'}`}>
                          {formatTimestamp(msg.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
          {unreadCount > 0 && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2">
              <button
                type="button"
                onClick={() => {
                  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                  setUnreadCount(0);
                }}
                className="px-3 py-1.5 rounded-full bg-amber-500/90 text-zinc-900 text-xs font-semibold shadow-lg"
              >
                Jump to latest{unreadCount > 0 ? ` (${unreadCount})` : ''}
              </button>
            </div>
          )}

          <form
            onSubmit={handleSend}
            className="flex-none sticky bottom-0 z-20 bg-theme-secondary/95 backdrop-blur border-t border-white/5 px-4 pt-4 pb-4"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            ref={composerRowRef}
            data-chat-debug="composer-row"
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                className="flex-1 px-4 py-3 bg-theme-tertiary border border-theme-primary rounded-xl text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                placeholder={activeRoom ? `Message #${activeRoom.name}` : 'Select a room'}
                disabled={!activeRoom}
              />
              <button
                type="submit"
                disabled={!messageText.trim() || !activeRoom}
                className="px-4 py-3 bg-amber-500 text-zinc-900 rounded-xl hover:bg-amber-400 transition-colors disabled:opacity-50"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </form>
        </main>
      </div>

      {shouldDebugLayout && (
        <div className="fixed bottom-20 right-4 z-[9999] rounded-lg bg-black/80 text-white text-xs p-3 space-y-1">
          <div>window.scrollY: {Math.round(debugSnapshot.windowScrollY)}</div>
          <div>messages.scrollTop: {Math.round(debugSnapshot.messagesScrollTop)}</div>
          <div>shell overflow-y: {debugSnapshot.shellOverflowY}</div>
          <div>content overflow-y: {debugSnapshot.contentOverflowY}</div>
          <div>panel overflow-y: {debugSnapshot.panelOverflowY}</div>
          <div>messages overflow-y: {debugSnapshot.messagesOverflowY}</div>
          <div>header overflow-y: {debugSnapshot.headerOverflowY}</div>
          <div>composer overflow-y: {debugSnapshot.composerOverflowY}</div>
        </div>
      )}

      {isRoomsDropdownMounted &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div
              className={`fixed inset-0 z-[99] md:hidden transition-opacity duration-150 ease-out ${
                showRoomsDropdown && !isRoomsDropdownClosing ? 'opacity-100' : 'opacity-0'
              }`}
              onClick={closeRoomsDropdown}
              aria-label="Close rooms dropdown"
            />
            <div
              className={`fixed z-[100] md:hidden transition-all ${
                showRoomsDropdown && !isRoomsDropdownClosing
                  ? 'opacity-100 translate-y-0 scale-100 duration-180 ease-out'
                  : 'opacity-0 -translate-y-1 scale-[0.98] duration-140 ease-in'
              }`}
              style={{
                top: `${roomsDropdownPosition.top}px`,
                left: `${roomsDropdownPosition.left}px`,
                width: `${roomsDropdownPosition.width}px`,
              }}
            >
              <div className="max-h-[40vh] overflow-y-auto rounded-md border border-theme-primary bg-theme-secondary/95 backdrop-blur p-1">
                <div className="space-y-1" onScroll={cancelLongPress}>
                  {renderRoomsListItems(true)}
                </div>
              </div>
            </div>
          </>,
          document.body
        )}

      {showRoomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowRoomModal(false)} />
          <div className="relative w-full max-w-md bg-theme-secondary border border-theme-primary rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-theme-primary">Create Chat Room</h2>
            <div>
              <label className="text-sm text-theme-secondary">Room name</label>
              <input
                type="text"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                className="w-full mt-2 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary"
                placeholder="e.g. Front of House"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowRoomModal(false)}
                className="px-4 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateRoom}
                disabled={!newRoomName.trim()}
                className="px-4 py-2 rounded-lg bg-amber-500 text-zinc-900 font-semibold hover:bg-amber-400 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {showRenameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowRenameModal(false)} />
          <div className="relative w-full max-w-md bg-theme-secondary border border-theme-primary rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-theme-primary">Rename Room</h2>
            <div>
              <label className="text-sm text-theme-secondary">Room name</label>
              <input
                type="text"
                value={renameRoomName}
                onChange={(e) => setRenameRoomName(e.target.value)}
                className="w-full mt-2 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary"
                placeholder="Room name"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowRenameModal(false);
                  setRenameRoomId(null);
                }}
                className="px-4 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRenameRoom}
                disabled={!renameRoomName.trim()}
                className="px-4 py-2 rounded-lg bg-amber-500 text-zinc-900 font-semibold hover:bg-amber-400 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowDeleteModal(false)} />
          <div className="relative w-full max-w-md bg-theme-secondary border border-theme-primary rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-theme-primary">Delete Room</h2>
            <p className="text-sm text-theme-tertiary">
              Deleting this room will permanently delete all message history. Continue?
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteRoom}
                className="px-4 py-2 rounded-lg bg-red-500 text-zinc-900 font-semibold hover:bg-red-400"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


