'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useScheduleStore } from '../../store/scheduleStore';
import { useAuthStore } from '../../store/authStore';
import { Toast } from '../../components/Toast';
import { SECTIONS } from '../../types';
import { formatTimestamp, formatHour, formatDateLong } from '../../utils/timeUtils';
import { 
  ArrowLeft, 
  Send, 
  Calendar,
  Clock,
  Check,
  X,
  AlertTriangle,
} from 'lucide-react';

export default function ChatPage() {
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { 
    hydrate, 
    isHydrated, 
    employees, 
    shifts,
    chatMessages,
    dropRequests,
    sendChatMessage,
    acceptDropRequest,
    cancelDropRequest,
    getEmployeeById,
    showToast,
  } = useScheduleStore();
  
  const { currentUser, checkSession, isInitialized } = useAuthStore();

  const [message, setMessage] = useState('');
  const [showDropModal, setShowDropModal] = useState(false);
  const [selectedShiftId, setSelectedShiftId] = useState('');

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (isHydrated) {
      checkSession(employees);
    }
  }, [isHydrated, employees, checkSession]);

  useEffect(() => {
    if (isHydrated && isInitialized && !currentUser) {
      router.push('/login');
    }
  }, [isHydrated, isInitialized, currentUser, router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  if (!isHydrated || !isInitialized || !currentUser) {
    return (
      <div className="min-h-screen bg-theme-primary flex items-center justify-center">
        <p className="text-theme-secondary">Loading...</p>
      </div>
    );
  }

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    sendChatMessage(currentUser.id, message.trim());
    setMessage('');
  };

  const handleDropRequest = () => {
    if (!selectedShiftId) return;
    
    const { createDropRequest } = useScheduleStore.getState();
    createDropRequest(selectedShiftId, currentUser.id);
    setShowDropModal(false);
    setSelectedShiftId('');
    showToast('Drop request posted', 'success');
  };

  const handleAcceptDrop = (requestId: string) => {
    const result = acceptDropRequest(requestId, currentUser.id);
    if (result.success) {
      showToast('Shift accepted! It has been assigned to you.', 'success');
    } else {
      showToast(result.error || 'Could not accept shift', 'error');
    }
  };

  const handleCancelDrop = (requestId: string) => {
    cancelDropRequest(requestId);
    showToast('Drop request cancelled', 'success');
  };

  // Get user's upcoming shifts for drop modal
  const myUpcomingShifts = shifts.filter(s => 
    s.employeeId === currentUser.id && 
    new Date(s.date) >= new Date()
  ).sort((a, b) => a.date.localeCompare(b.date));

  // Check if shift already has open drop request
  const hasOpenDropRequest = (shiftId: string) => {
    return dropRequests.some(r => r.shiftId === shiftId && r.status === 'open');
  };

  return (
    <div className="min-h-screen bg-theme-primary flex flex-col">
      {/* Header */}
      <header className="h-16 bg-theme-secondary border-b border-theme-primary flex items-center justify-between px-6 shrink-0">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-theme-secondary hover:text-theme-primary transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </Link>
        <h1 className="text-lg font-semibold text-theme-primary">Team Chat</h1>
        <button
          onClick={() => setShowDropModal(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 text-amber-500 rounded-lg hover:bg-amber-500/20 transition-colors text-sm font-medium"
        >
          <Calendar className="w-4 h-4" />
          Drop Shift
        </button>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-theme-muted">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          chatMessages.map((msg) => {
            const sender = getEmployeeById(msg.senderId);
            const isMe = msg.senderId === currentUser.id;
            const isSystem = msg.type === 'system';
            const isDropRequest = msg.type === 'drop_request';
            const dropRequest = isDropRequest ? dropRequests.find(r => r.id === msg.dropRequestId) : null;
            
            if (isSystem) {
              return (
                <div key={msg.id} className="flex justify-center">
                  <p className="text-xs text-theme-muted bg-theme-tertiary px-3 py-1.5 rounded-full">
                    {msg.text}
                  </p>
                </div>
              );
            }

            if (isDropRequest && dropRequest) {
              const shift = shifts.find(s => s.id === dropRequest.shiftId);
              const fromEmployee = getEmployeeById(dropRequest.fromEmployeeId);
              const sectionConfig = fromEmployee ? SECTIONS[fromEmployee.section] : null;
              const isOpen = dropRequest.status === 'open';
              const isMyRequest = dropRequest.fromEmployeeId === currentUser.id;
              const acceptor = dropRequest.acceptedByEmployeeId ? getEmployeeById(dropRequest.acceptedByEmployeeId) : null;

              return (
                <div key={msg.id} className="flex justify-center">
                  <div className="bg-theme-secondary border border-theme-primary rounded-xl p-4 max-w-md w-full">
                    <div className="flex items-start gap-3 mb-3">
                      {sectionConfig && (
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                          style={{
                            backgroundColor: sectionConfig.bgColor,
                            color: sectionConfig.color,
                          }}
                        >
                          {fromEmployee?.name.split(' ').map(n => n[0]).join('')}
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-medium text-theme-primary">
                          {fromEmployee?.name} wants to drop a shift
                        </p>
                        <p className="text-xs text-theme-muted">
                          {formatTimestamp(msg.createdAt)}
                        </p>
                      </div>
                    </div>

                    {shift && (
                      <div className="bg-theme-tertiary rounded-lg p-3 mb-3">
                        <div className="flex items-center gap-2 text-theme-primary">
                          <Calendar className="w-4 h-4" />
                          <span className="font-medium">{formatDateLong(shift.date)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-theme-secondary mt-1">
                          <Clock className="w-4 h-4" />
                          <span>{formatHour(shift.startHour)} - {formatHour(shift.endHour)}</span>
                        </div>
                      </div>
                    )}

                    {isOpen ? (
                      <div className="flex gap-2">
                        {!isMyRequest && (
                          <button
                            onClick={() => handleAcceptDrop(dropRequest.id)}
                            className="flex-1 flex items-center justify-center gap-2 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-400 transition-colors text-sm font-medium"
                          >
                            <Check className="w-4 h-4" />
                            Accept Shift
                          </button>
                        )}
                        {isMyRequest && (
                          <button
                            onClick={() => handleCancelDrop(dropRequest.id)}
                            className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors text-sm font-medium"
                          >
                            <X className="w-4 h-4" />
                            Cancel Request
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-theme-muted">
                        {dropRequest.status === 'accepted' ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-500" />
                            Accepted by {acceptor?.name}
                          </>
                        ) : (
                          <>
                            <X className="w-4 h-4 text-red-400" />
                            Cancelled
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            const sectionConfig = sender ? SECTIONS[sender.section] : null;

            return (
              <div
                key={msg.id}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex items-end gap-2 max-w-[70%] ${isMe ? 'flex-row-reverse' : ''}`}>
                  {!isMe && sectionConfig && (
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{
                        backgroundColor: sectionConfig.bgColor,
                        color: sectionConfig.color,
                      }}
                    >
                      {sender?.name.split(' ').map(n => n[0]).join('')}
                    </div>
                  )}
                  <div>
                    {!isMe && (
                      <p className="text-xs text-theme-muted mb-1 ml-1">
                        {sender?.name}
                      </p>
                    )}
                    <div
                      className={`px-4 py-2 rounded-2xl ${
                        isMe
                          ? 'bg-amber-500 text-zinc-900 rounded-br-md'
                          : 'bg-theme-secondary text-theme-primary rounded-bl-md'
                      }`}
                    >
                      <p className="text-sm">{msg.text}</p>
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

      {/* Input */}
      <form onSubmit={handleSend} className="p-4 bg-theme-secondary border-t border-theme-primary">
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="flex-1 px-4 py-3 bg-theme-tertiary border border-theme-primary rounded-xl text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            placeholder="Type a message..."
          />
          <button
            type="submit"
            disabled={!message.trim()}
            className="px-4 py-3 bg-amber-500 text-zinc-900 rounded-xl hover:bg-amber-400 transition-colors disabled:opacity-50"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </form>

      {/* Drop Shift Modal */}
      {showDropModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowDropModal(false)}
          />
          <div className="relative w-full max-w-md mx-4 bg-theme-secondary rounded-2xl shadow-2xl border border-theme-primary">
            <div className="p-4 border-b border-theme-primary">
              <h2 className="text-lg font-semibold text-theme-primary">Drop a Shift</h2>
            </div>
            <div className="p-4">
              <p className="text-sm text-theme-tertiary mb-4">
                Select a shift you want to drop. Another team member can pick it up.
              </p>

              {myUpcomingShifts.length === 0 ? (
                <div className="text-center py-8 text-theme-muted">
                  <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
                  <p>You have no upcoming shifts to drop</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {myUpcomingShifts.map(shift => {
                    const alreadyDropping = hasOpenDropRequest(shift.id);
                    return (
                      <button
                        key={shift.id}
                        onClick={() => !alreadyDropping && setSelectedShiftId(shift.id)}
                        disabled={alreadyDropping}
                        className={`w-full p-3 rounded-lg border text-left transition-colors ${
                          selectedShiftId === shift.id
                            ? 'border-amber-500 bg-amber-500/10'
                            : alreadyDropping
                            ? 'border-theme-primary bg-theme-tertiary opacity-50 cursor-not-allowed'
                            : 'border-theme-primary hover:bg-theme-tertiary'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-theme-primary">
                            {formatDateLong(shift.date)}
                          </span>
                          {alreadyDropping && (
                            <span className="text-xs text-amber-500">Pending</span>
                          )}
                        </div>
                        <span className="text-sm text-theme-secondary">
                          {formatHour(shift.startHour)} - {formatHour(shift.endHour)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setShowDropModal(false)}
                  className="flex-1 py-2 bg-theme-tertiary text-theme-secondary rounded-lg hover:bg-theme-hover transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDropRequest}
                  disabled={!selectedShiftId}
                  className="flex-1 py-2 bg-amber-500 text-zinc-900 rounded-lg hover:bg-amber-400 transition-colors disabled:opacity-50"
                >
                  Request Drop
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Toast />
    </div>
  );
}
