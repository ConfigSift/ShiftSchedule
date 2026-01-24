'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, Plus, Send, Download, PencilLine, Trash2 } from 'lucide-react';
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
  const [renameRoomName, setRenameRoomName] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showNewIndicator, setShowNewIndicator] = useState(false);
  const [error, setError] = useState('');
  const isManager = isManagerRole(getUserRole(currentUser?.role));
  const isDev = process.env.NODE_ENV !== 'production';
  const supabaseClient = useMemo(() => createSupabaseBrowserClient(), []);

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
        setShowNewIndicator(true);
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
    setShowNewIndicator(false);
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
    setShowNewIndicator(false);
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

    channel.subscribe(({ status }) => {
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

  const handleMessageScroll = () => {
    const el = messageListRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distance < 80;
    isNearBottomRef.current = nearBottom;
    if (nearBottom) {
      setShowNewIndicator(false);
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
    if (!activeRoom) return;
    setRenameRoomName(activeRoom.name);
    setShowRenameModal(true);
  };

  const handleRenameRoom = async () => {
    if (!activeRoom || !renameRoomName.trim()) return;
    setError('');
    const result = await apiFetch<{ room: Record<string, any> }>('/api/chat/rooms/update', {
      method: 'PATCH',
      json: {
        roomId: activeRoom.id,
        name: renameRoomName.trim(),
      },
    });
    if (!result.ok || !result.data?.room) {
      setError(result.error || 'Unable to rename room.');
      return;
    }
    const updatedName = result.data.room.name ?? renameRoomName.trim();
    setRooms((prev) => prev.map((room) => (room.id === activeRoom.id ? { ...room, name: updatedName } : room)));
    setShowRenameModal(false);
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

  return (
    <div className="h-full bg-theme-primary flex flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-56 shrink-0 border-r border-theme-primary bg-theme-secondary p-4 space-y-3 overflow-y-auto">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wide text-theme-muted">Rooms</div>
            {isManager && (
              <button
                onClick={() => setShowRoomModal(true)}
                className="inline-flex items-center gap-1.5 text-xs text-amber-500 hover:text-amber-400"
              >
                <Plus className="w-3.5 h-3.5" />
                New
              </button>
            )}
          </div>
          {loadingRooms ? (
            <p className="text-sm text-theme-muted">Loading rooms...</p>
          ) : rooms.length === 0 ? (
            <p className="text-sm text-theme-muted">No rooms yet.</p>
          ) : (
            <div className="space-y-2">
              {rooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => setActiveRoomId(room.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors text-sm ${
                    room.id === activeRoomId
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-theme-tertiary text-theme-secondary hover:bg-theme-hover'
                  }`}
                >
                  {room.name}
                </button>
              ))}
            </div>
          )}
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden relative">
          <div className="shrink-0 border-b border-theme-primary bg-theme-secondary px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-theme-primary font-semibold">
              <MessageSquare className="w-4 h-4 text-amber-400" />
              <span>{activeRoom?.name || 'Team Chat'}</span>
            </div>
            <div className="flex items-center gap-2">
              {activeRoom && (
                <button
                  onClick={handleExport}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors text-xs font-medium"
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
              )}
              {isManager && activeRoom && (
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
          </div>

          <div
            ref={messageListRef}
            onScroll={handleMessageScroll}
            className="flex-1 overflow-y-auto p-4 space-y-4"
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
          {showNewIndicator && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2">
              <button
                type="button"
                onClick={() => {
                  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                  setShowNewIndicator(false);
                }}
                className="px-3 py-1.5 rounded-full bg-amber-500/90 text-zinc-900 text-xs font-semibold shadow-lg"
              >
                New messages
              </button>
            </div>
          )}

          <form onSubmit={handleSend} className="p-4 bg-theme-secondary border-t border-theme-primary">
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
                onClick={() => setShowRenameModal(false)}
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
