'use client';

import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { Modal } from './Modal';
import { formatDateLong, formatTimestamp } from '../utils/timeUtils';
import { Check, X, Clock, Calendar } from 'lucide-react';

export function TimeOffReviewModal() {
  const { 
    modalType, 
    closeModal, 
    timeOffRequests,
    reviewTimeOffRequest,
    getEmployeeById,
    showToast,
  } = useScheduleStore();

  const { currentUser, isManager } = useAuthStore();
  
  const isOpen = modalType === 'timeOffReview';

  if (!isOpen || !isManager) return null;

  const pendingRequests = timeOffRequests.filter(r => r.status === 'pending');
  const recentRequests = timeOffRequests
    .filter(r => r.status !== 'pending')
    .sort((a, b) => (b.reviewedAt || b.createdAt).localeCompare(a.reviewedAt || a.createdAt))
    .slice(0, 5);

  const handleApprove = (requestId: string) => {
    if (!currentUser) return;
    reviewTimeOffRequest(requestId, 'approved', currentUser.id);
    showToast('Time off approved', 'success');
  };

  const handleReject = (requestId: string) => {
    if (!currentUser) return;
    reviewTimeOffRequest(requestId, 'rejected', currentUser.id);
    showToast('Time off rejected', 'success');
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={closeModal} 
      title="Time Off Requests"
      size="xl"
    >
      <div className="space-y-6">
        {/* Pending Requests */}
        <div>
          <h3 className="text-sm font-semibold text-theme-primary mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            Pending Requests ({pendingRequests.length})
          </h3>
          
          {pendingRequests.length === 0 ? (
            <p className="text-sm text-theme-muted text-center py-8 bg-theme-tertiary rounded-lg">
              No pending requests
            </p>
          ) : (
            <div className="space-y-3">
              {pendingRequests.map(request => {
                const employee = getEmployeeById(request.employeeId);
                return (
                  <div
                    key={request.id}
                    className="p-4 bg-theme-tertiary rounded-lg border border-amber-500/30"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-theme-primary">
                          {employee?.name || 'Unknown'}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Calendar className="w-4 h-4 text-theme-muted" />
                          <p className="text-sm text-theme-secondary">
                            {formatDateLong(request.startDate)}
                            {request.startDate !== request.endDate && (
                              <> - {formatDateLong(request.endDate)}</>
                            )}
                          </p>
                        </div>
                        {request.reason && (
                          <p className="text-sm text-theme-tertiary mt-2">
                            "{request.reason}"
                          </p>
                        )}
                        <p className="text-xs text-theme-muted mt-2">
                          Submitted {formatTimestamp(request.createdAt)}
                        </p>
                      </div>
                      
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReject(request.id)}
                          className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                          title="Reject"
                        >
                          <X className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleApprove(request.id)}
                          className="p-2 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
                          title="Approve"
                        >
                          <Check className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Decisions */}
        {recentRequests.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-theme-primary mb-3">
              Recent Decisions
            </h3>
            <div className="space-y-2">
              {recentRequests.map(request => {
                const employee = getEmployeeById(request.employeeId);
                const reviewer = request.reviewedBy ? getEmployeeById(request.reviewedBy) : null;
                
                return (
                  <div
                    key={request.id}
                    className={`p-3 rounded-lg ${
                      request.status === 'approved' 
                        ? 'bg-green-500/10 border border-green-500/30' 
                        : 'bg-red-500/10 border border-red-500/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-theme-primary">
                          {employee?.name}: {formatDateLong(request.startDate)}
                          {request.startDate !== request.endDate && (
                            <> - {formatDateLong(request.endDate)}</>
                          )}
                        </p>
                        <p className="text-xs text-theme-muted mt-1">
                          {request.status === 'approved' ? 'Approved' : 'Rejected'} by {reviewer?.name || 'Unknown'}
                        </p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-1 rounded ${
                        request.status === 'approved' 
                          ? 'bg-green-500/20 text-green-400' 
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {request.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
