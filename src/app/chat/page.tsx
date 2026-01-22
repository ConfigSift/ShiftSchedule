'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MessageSquare, Plus, Send } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase/client';
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

export default function ChatPage() {
  const router = useRouter();
  const { currentUser, activeRestaurantId, init, isInitialized } = useAuthStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [usersByAuthId, setUsersByAuthId] = useState<Record<string, UserLookup>>({});
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [error, setError] = useState('');

  const isManager = isManagerRole(getUserRole(currentUser?.role));

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
    if (activeRoomId) {
      loadMessages(activeRoomId);
    }
  }, [activeRoomId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadRooms = async (organizationId: string) => {
    setLoadingRooms(true);
    const { data, error } = (await supabase
      .from('chat_rooms')
      .select('id,name,organization_id,created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true })) as {
        data: Array<Record<string, any>> | null;
        error: { message: string } | null;
      };

    if (error) {
      setError(error.message);
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

  const loadMessages = async (roomId: string) => {
    setLoadingMessages(true);
    const { data, error } = (await supabase
      .from('chat_messages')
      .select('id,room_id,organization_id,author_auth_user_id,body,created_at')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })) as {
        data: Array<Record<string, any>> | null;
        error: { message: string } | null;
      };

    if (error) {
      setError(error.message);
      setLoadingMessages(false);
      return;
    }

    const mapped = (data || []).map((row) => ({
      id: row.id,
      roomId: row.room_id,
      organizationId: row.organization_id,
      authorAuthUserId: row.author_auth_user_id,
      body: row.body,
      createdAt: row.created_at,
    }));

    setMessages(mapped);
    setLoadingMessages(false);
  };

  const loadUsers = async (organizationId: string) => {
    const { data, error } = (await supabase
      .from('users')
      .select('*')
      .eq('organization_id', organizationId)) as {
        data: Array<Record<string, any>> | null;
        error: { message: string } | null;
      };

    if (error) return;

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
    setMessageText('');
    await loadMessages(activeRoomId);
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
    <div className="min-h-screen bg-theme-primary flex flex-col">
      <header className="h-16 bg-theme-secondary border-b border-theme-primary flex items-center justify-between px-6 shrink-0">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-theme-secondary hover:text-theme-primary transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </Link>
        <h1 className="text-lg font-semibold text-theme-primary flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-amber-400" />
          Team Chat
        </h1>
        {isManager && (
          <button
            onClick={() => setShowRoomModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 text-amber-500 rounded-lg hover:bg-amber-500/20 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            New Room
          </button>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-56 shrink-0 border-r border-theme-primary bg-theme-secondary p-4 space-y-3">
          <div className="text-xs uppercase tracking-wide text-theme-muted">Rooms</div>
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

        <main className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
    </div>
  );
}
