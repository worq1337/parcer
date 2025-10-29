import React from 'react';
import ChatHeader from './ChatHeader';
import FiltersBar from './FiltersBar';
import MessagesArea from './MessagesArea';
import BulkActionsBar from './BulkActionsBar';

/**
 * Chat panel (right side) - combines all chat elements
 */
const ChatPanel = ({
  bot,
  messages,
  hasMore,
  loadingMore,
  onLoadOlder,
  statusFilter,
  onChangeFilter,
  selectedMessages,
  onToggleSelection,
  onSelectAll,
  onClearSelection,
  onProcessMessage,
  onProcessSelected,
  onRetryMessage,
  onRefresh,
  refreshing,
  loading
}) => {
  return (
    <div className="chat-panel">
      <ChatHeader
        bot={bot}
        onRefresh={onRefresh}
        refreshing={refreshing}
      />

      <FiltersBar
        statusFilter={statusFilter}
        onChangeFilter={onChangeFilter}
        messages={messages}
      />

      <MessagesArea
        messages={messages}
        loading={loading}
        loadingMore={loadingMore}
        hasMore={hasMore}
        onLoadOlder={onLoadOlder}
        selectedMessages={selectedMessages}
        onToggleSelection={onToggleSelection}
        onProcess={onProcessMessage}
        onRetry={onRetryMessage}
      />

      <BulkActionsBar
        selectedCount={selectedMessages.size}
        onProcessSelected={onProcessSelected}
        onClearSelection={onClearSelection}
        onSelectAll={onSelectAll}
      />
    </div>
  );
};

export default ChatPanel;
